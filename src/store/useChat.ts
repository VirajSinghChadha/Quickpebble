import { create } from "zustand";
import { runAgent, type AgentIO, type Mode } from "../lib/agent";
import { runScreenAgent, type Choice, type ScreenMode } from "../lib/screenAgent";
import { ipc, isPrivateWindow, type ChatMsg, type ChatSummary, type PageSnapshot, type Project } from "../lib/ipc";
import { chatTitle, projectContext } from "../lib/context";
import { approvedPlanNote, normalizeSetting, parsePlan, PLAN_PROMPT, planText, shouldPreview, type Plan } from "../lib/plan";
import { answerPrompt, parseAnswer, sourceFromRecall, sourceFromSnapshot, type AnswerSource, type AnswerBlock } from "../lib/answers";
import { selectActive, useStore } from "./useStore";
import { parseSlash } from "../lib/slash";
import { rankUpgrades, wantsUpgrade, type ModelChoice } from "../lib/models";
import { fallbackSite, hostOf, loadSite, parseGenerated, PERMISSION_PROMPT, saveSite, type Scope, type SitePerms } from "../lib/permissions";

export type ChatKind = "user" | "assistant" | "say" | "step" | "error" | "question";
export interface ChatItem {
  id: number;
  kind: ChatKind;
  text: string;
  ok?: boolean;
  sources?: AnswerSource[];
  blocks?: AnswerBlock[];
  followups?: string[];
}

interface ChatState {
  items: ChatItem[];
  busy: boolean;
  /** "ask" answers questions about the page; "act" operates the browser. */
  mode: "ask" | "act" | "screen";
  approvalMode: Mode;
  sourceTabIds: string[];
  webResearch: boolean;
  /** Also search the on-device Recall index of pages the person has read. */
  recall: boolean;
  setRecall: (value: boolean) => void;
  includeCurrentPage: boolean;
  setIncludeCurrentPage: (value: boolean) => void;
  setWebResearch: (value: boolean) => void;
  setSourceTabIds: (ids: string[]) => void;
  /** Screen mode: "auto" asks only for risky steps, "ask" confirms every step. */
  screenApprovalMode: ScreenMode;
  setScreenApprovalMode: (m: ScreenMode) => void;
  /** Asked before a Screen task: which sensitive things may I do on this site, and for how long? */
  permissionRequest: { host: string; site: SitePerms; resolve: (r: { site: SitePerms; scope: Scope } | null) => void } | null;
  /** True while Gemini is writing the permission list for a site. */
  preparingPermissions: boolean;
  /** Offered when the person asks for something detailed: switch to a stronger model? */
  modelOffer: { current: string; models: ModelChoice[]; resolve: (model: string | null) => void } | null;
  editPermissions: () => Promise<void>;
  approval: { title?: string; description: string; risky: boolean; options: { choice: Choice; label: string }[]; resolve: (c: Choice) => void } | null;
  /** Saved chat this conversation is stored in (null until the first message), the active project, and the lists for the pickers. */
  chatId: number | null;
  projectId: number | null;
  projects: Project[];
  chats: ChatSummary[];
  initContext: () => Promise<void>;
  refreshContext: () => Promise<void>;
  openChat: (id: number, quiet?: boolean) => Promise<void>;
  newChat: () => void;
  setProject: (id: number | null) => Promise<void>;
  setMode: (m: "ask" | "act" | "screen") => void;
  setApprovalMode: (m: Mode) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  /** Pause/resume a running screen task so the person can take over for a step. */
  paused: boolean;
  togglePause: () => void;
  clear: () => void;
}

let nextId = 1;
let signal = { aborted: false };
let resumeGate: (() => void) | null = null;
/** Actions the screen agent has taken this session; survives across messages, reset by Clear. */
const screenHistory: string[] = [];
/** Text of the page in the active tab, so the agent reads all of it and not just what is on screen. */
async function activePageText(): Promise<string | undefined> {
  const tab = selectActive(useStore.getState());
  if (!tab.url) return undefined;
  const snap = await ipc.agentExec<PageSnapshot>(tab.id, "snapshot").catch(() => null);
  return snap?.text ? snap.text.slice(0, 6000) : undefined;
}

/** Per-site permissions chosen for this session only. */
const sessionPerms = new Map<string, SitePerms>();
let upgradeOffered = false;
let activePerms: SitePerms = fallbackSite();

async function savedSite(host: string): Promise<SitePerms | null> {
  const s = await ipc.settingsGet().catch(() => ({}) as Record<string, string>);
  return loadSite(s.screen_permissions, host);
}

/** Asks Gemini which sensitive things matter on this website; falls back to a generic list. */
async function curateSite(host: string, task: string): Promise<SitePerms> {
  try {
    const tab = selectActive(useStore.getState());
    let text = "";
    if (tab.url) {
      const snap = await ipc.agentExec<PageSnapshot>(tab.id, "snapshot").catch(() => null);
      text = (snap?.text ?? "").slice(0, 1500);
    }
    const reply = await ipc.aiChat(PERMISSION_PROMPT, [{ role: "user", content: `The person's task: ${task.slice(0, 500)}\nWebsite: ${host}\nPage title: ${tab.title ?? ""}\nURL: ${tab.url ?? ""}\n<<<PAGE\n${text}\n>>>PAGE` }], true);
    return parseGenerated(reply) ?? fallbackSite();
  } catch {
    return fallbackSite();
  }
}

/** Shows the permission dialog; applies and (if asked) saves the result. Null = cancelled. */
async function askPermissions(host: string, start: SitePerms): Promise<SitePerms | null> {
  const r = await new Promise<{ site: SitePerms; scope: Scope } | null>((resolve) => {
    useChat.setState({ permissionRequest: { host, site: start, resolve: (v) => { useChat.setState({ permissionRequest: null }); resolve(v); } } });
  });
  if (!r) return null;
  sessionPerms.set(host, r.site);
  if (r.scope === "always") {
    const s = await ipc.settingsGet().catch(() => ({}) as Record<string, string>);
    await ipc.settingsSet("screen_permissions", saveSite(s.screen_permissions, host, r.site)).catch(() => {});
  }
  return r.site;
}

const add = (kind: ChatKind, text: string, ok?: boolean) =>
  useChat.setState((s) => ({ items: [...s.items, { id: nextId++, kind, text, ok }] }));

/** Asks (once) whether to switch to a stronger Gemini model, listing only models this key can really use. */
async function offerUpgrade(): Promise<void> {
  try {
    const settings = await ipc.settingsGet().catch(() => ({}) as Record<string, string>);
    if ((settings.ai_provider ?? "ollama") !== "gemini") return;
    const status = await ipc.aiStatus().catch(() => null);
    const current = settings.ai_model || status?.model || "";
    const models = rankUpgrades(await ipc.geminiModels().catch(() => []), current);
    if (!models.length) return;
    const pick = await new Promise<string | null>((resolve) => {
      useChat.setState({ modelOffer: { current, models, resolve: (m) => { useChat.setState({ modelOffer: null }); resolve(m); } } });
    });
    if (pick) {
      await ipc.settingsSet("ai_model", pick);
      add("say", `Switched to ${pick}.`);
    }
  } catch {
    /* never block the request because the offer failed */
  }
}

/** Plain conversation turns only (no step logs), for model context. */
function history(items: ChatItem[]): ChatMsg[] {
  return items
    .filter((i) => i.kind === "user" || i.kind === "assistant" || i.kind === "question")
    .map((i) => ({ role: i.kind === "user" ? ("user" as const) : ("assistant" as const), content: i.text }));
}

/** Screen mode starts a fresh run per message, so earlier turns (including its own questions) go into the goal. */
function screenGoal(prior: ChatMsg[], latest: string, context = ""): string {
  const withContext = (body: string) => (context ? `${context}\n\n${body.length > 3800 - context.length ? body.slice(-(3800 - context.length)) : body}` : body);
  if (!prior.length) return withContext(latest);
  const lines = prior.slice(-8).map((m) => `${m.role === "user" ? "Person" : "You"}: ${m.content.slice(0, 400)}`).join("\n");
  const goal = `Conversation so far:\n${lines}\n\nLatest message from the person: ${latest}\n\nContinue the task using everything above. Do not ask again for anything the person already told you.`;
  return context ? withContext(goal) : goal.length > 3800 ? goal.slice(-3800) : goal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Asks the model for a short step list (one cheap text call, no screenshot). Never blocks the task: any failure means "no preview". */
async function makePlan(goal: string): Promise<Plan | null> {
  try {
    return parsePlan(await ipc.aiChat(PLAN_PROMPT, [{ role: "user", content: goal.slice(0, 1500) }], true));
  } catch {
    return null;
  }
}

/** Shows the plan with numbered choices. Resolves "allow" (run it), "skip" (run without a fixed plan) or "stop" (cancel). */
function askPlan(plan: Plan): Promise<Choice> {
  return new Promise<Choice>((resolve) => {
    useChat.setState({
      approval: {
        title: "Here's my plan",
        description: planText(plan),
        risky: false,
        options: [{ choice: "allow", label: "Run this plan" }, { choice: "skip", label: "Run it without a fixed plan" }, { choice: "stop", label: "Cancel" }],
        resolve: (c) => { useChat.setState({ approval: null }); resolve(c); },
      },
    });
  });
}

/** Numbered choices shown in the chat panel; resolves with the one the person picks. */
function askChoice(description: string, risky: boolean, offerAuto: boolean): Promise<Choice> {
  const options: { choice: Choice; label: string }[] = [{ choice: "allow", label: "Allow this step" }];
  if (offerAuto && !risky) options.push({ choice: "auto", label: "Allow, and auto-run routine steps from now on" });
  options.push({ choice: "skip", label: "Skip this step and try another way" }, { choice: "stop", label: "Stop" });
  return new Promise<Choice>((resolve) => {
    useChat.setState({
      approval: { description, risky, options, resolve: (c) => { useChat.setState({ approval: null }); resolve(c); } },
    });
  });
}

function makeIO(): AgentIO {
  const st = () => useStore.getState();
  return {
    tabs: () => st().tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.id === st().activeId })),
    activeTabId: () => st().activeId,
    snapshot: async (tabId) => (st().tabs.find((t) => t.id === tabId)?.url ? ipc.agentExec<PageSnapshot>(tabId, "snapshot") : null),
    exec: (tabId, op, args) => ipc.agentExec(tabId, op, args),
    chat: (system, messages) => ipc.aiChat(system, messages, true),
    navigate: (tabId, url) => st().navigate(tabId, url),
    newTab: async (url) => st().newTab(url),
    switchTab: (id) => st().activate(id),
    approve: async (description) => {
      const c = await askChoice(description, false, true);
      if (c === "auto") useChat.setState({ approvalMode: "auto" });
      return c === "allow" || c === "auto";
    },
    sleep,
    onEvent: (e) => {
      if (e.kind === "say") add("say", e.text);
      else if (e.kind === "step") add("step", e.text, e.ok);
      else if (e.kind === "final") add("assistant", e.text);
      else if (e.kind === "question") add("question", e.text);
      else add("error", e.text);
    },
  };
}

/** Only these are worth keeping between sessions; steps and thinking are bulky and not needed to continue a conversation. */
const KEPT: ChatKind[] = ["user", "assistant", "question", "error"];
let lastPersistedId = 0;
let persisting: Promise<void> = Promise.resolve();
function persistNew(): void {
  if (isPrivateWindow()) return;
  const fresh = useChat.getState().items.filter((i) => i.id > lastPersistedId);
  if (!fresh.length) return;
  lastPersistedId = fresh[fresh.length - 1].id;
  const keep = fresh.filter((i) => KEPT.includes(i.kind) && i.text.trim());
  if (!keep.length) return;
  persisting = persisting.then(async () => {
    let id = useChat.getState().chatId;
    if (!id) {
      id = await ipc.ctxChatNew(chatTitle(keep.find((i) => i.kind === "user")?.text ?? ""), useChat.getState().projectId);
      if (!id) return; // not running inside the app
      useChat.setState({ chatId: id });
      void ipc.settingsSet("active_chat", String(id)).catch(() => {});
    }
    await ipc.ctxChatAppend(id, keep.map((i) => ({ kind: i.kind, text: i.text })));
  }).catch(() => {});
}

function activeContext(): string {
  const { projects, projectId } = useChat.getState();
  return projectContext(projects.find((p) => p.id === projectId));
}

export const useChat = create<ChatState>((set, get) => ({
  items: [],
  chatId: null,
  projectId: null,
  projects: [],
  chats: [],
  busy: false,
  mode: "ask",
  sourceTabIds: [],
  webResearch: false,
  recall: false,
  setRecall: (recall) => set({ recall }),
  refreshContext: async () => {
    const [projects, chats] = await Promise.all([ipc.ctxProjects().catch(() => []), ipc.ctxChats().catch(() => [])]);
    set((s) => ({ projects, chats, projectId: projects.some((p) => p.id === s.projectId) ? s.projectId : null }));
  },
  initContext: async () => {
    if (isPrivateWindow()) return;
    const settings = await ipc.settingsGet().catch(() => ({}) as Record<string, string>);
    set({ projectId: Number(settings.active_project) || null });
    await get().refreshContext();
    const chatId = Number(settings.active_chat) || 0;
    if (chatId && get().chats.some((c) => c.id === chatId) && get().items.length === 0) await get().openChat(chatId, true);
  },
  openChat: async (id, quiet) => {
    if (get().busy) return;
    try {
      const chat = await ipc.ctxChatLoad(id);
      const items = chat.items.map((i) => ({ id: nextId++, kind: i.kind as ChatKind, text: i.text }));
      lastPersistedId = nextId - 1; // already stored: don't write them again
      screenHistory.length = 0;
      set({ items, chatId: chat.id, ...(chat.project_id && get().projects.some((p) => p.id === chat.project_id) ? { projectId: chat.project_id } : {}) });
      void ipc.settingsSet("active_chat", String(chat.id)).catch(() => {});
    } catch (e) {
      if (!quiet) add("error", String(e));
    }
  },
  newChat: () => {
    if (get().busy) return;
    screenHistory.length = 0;
    sessionPerms.clear();
    lastPersistedId = nextId - 1;
    set({ items: [], chatId: null });
    void ipc.settingsSet("active_chat", "").catch(() => {});
  },
  setProject: async (id) => {
    set({ projectId: id });
    void ipc.settingsSet("active_project", id ? String(id) : "").catch(() => {});
    if (id) void ipc.ctxProjectTouch(id).catch(() => {});
    const chatId = get().chatId;
    if (chatId) void ipc.ctxChatProject(chatId, id).catch(() => {});
  },
  includeCurrentPage: true,
  setIncludeCurrentPage: (includeCurrentPage) => set({ includeCurrentPage }),
  setWebResearch: (webResearch) => set({ webResearch }),
  setSourceTabIds: (sourceTabIds) => set({ sourceTabIds: sourceTabIds.slice(0, 4) }),
  approvalMode: "ask",
  screenApprovalMode: "auto",
  setScreenApprovalMode: (screenApprovalMode) => set({ screenApprovalMode }),
  approval: null,
  permissionRequest: null,
  preparingPermissions: false,
  modelOffer: null,
  editPermissions: async () => {
    const host = hostOf(selectActive(useStore.getState()).url);
    let start = sessionPerms.get(host) ?? (await savedSite(host));
    if (!start) {
      set({ preparingPermissions: true });
      start = await curateSite(host, "(not stated yet)");
      set({ preparingPermissions: false });
    }
    const site = await askPermissions(host, start);
    if (site) activePerms = site;
  },
  setMode: (mode) => set({ mode }),
  setApprovalMode: (approvalMode) => set({ approvalMode }),
  clear: () => {
    screenHistory.length = 0;
    sessionPerms.clear();
    upgradeOffered = false;
    lastPersistedId = nextId - 1;
    set({ items: [], chatId: null });
    void ipc.settingsSet("active_chat", "").catch(() => {});
  },

  paused: false,
  togglePause: () => {
    const { busy, paused, mode } = get();
    if (!busy || mode !== "screen") return;
    if (paused) {
      set({ paused: false });
      const release = resumeGate; resumeGate = null; release?.();
    } else {
      set({ paused: true });
      void ipc.screenOverlay({ phase: "paused" }).catch(() => {});
    }
  },
  stop: () => {
    signal.aborted = true;
    set({ paused: false });
    { const release = resumeGate; resumeGate = null; release?.(); }
    get().approval?.resolve("stop");
    get().permissionRequest?.resolve(null);
    get().modelOffer?.resolve(null);
  },

  send: async (text) => {
    let goal = text.trim();
    if (!goal || get().busy) return;
    // Slash commands are Ask-mode shortcuts; in the other modes they are sent as typed.
    const slash = get().mode === "ask" ? parseSlash(goal) : null;
    let slashTabs: string[] | null = null;
    let slashRecall = false;
    if (slash) {
      goal = slash.prompt;
      slashRecall = !!slash.recall;
      if (slash.allTabs) {
        slashTabs = useStore.getState().tabs.filter((t) => t.url && !t.suspended && !t.needsLoad).map((t) => t.id).slice(0, 4);
        if (slashTabs.length < 2) return void add("error", "Open at least two loaded pages to compare them.");
      }
    }
    if (!upgradeOffered && wantsUpgrade(goal)) {
      upgradeOffered = true; // ask once per session so it never nags
      await offerUpgrade();
    }
    const prior = history(get().items);
    add("user", slash ? text.trim() : goal);
    signal = { aborted: false };
    const runSignal = signal;
    const mode = get().mode;
    const sourceIds = slashTabs ?? [...get().sourceTabIds];
    const webResearch = get().webResearch;
    const recall = get().recall || slashRecall;
    const includeCurrentPage = get().includeCurrentPage;
    set({ busy: true });
    try {
      if (mode === "ask") {
        const tab = selectActive(useStore.getState());
        const ids = sourceIds.length ? sourceIds : tab.url && includeCurrentPage && !slashRecall ? [tab.id] : [];
        const results = await Promise.allSettled(ids.map(async (id, index) => {
          const snapshot = await ipc.agentExec<PageSnapshot>(id, "snapshot");
          return sourceFromSnapshot(snapshot, index + 1);
        }));
        if (runSignal.aborted) return;
        const sources = results.flatMap(r => r.status === "fulfilled" && r.value ? [r.value] : []);
        if (webResearch) {
          const results = await ipc.researchSearch(goal);
          for (const result of results) {
            const source = sourceFromSnapshot({ ...result } as PageSnapshot, Math.max(0, ...sources.map(s => s.id)) + 1);
            if (source && !sources.some(s => s.url === source.url)) sources.push({ ...source, kind: "search" });
          }
          if (runSignal.aborted) return;
        }
        if (recall) {
          const hits = await ipc.recallSearch(goal, 5).catch(() => []);
          for (const hit of hits) {
            const source = sourceFromRecall(hit, Math.max(0, ...sources.map(s => s.id)) + 1);
            if (source && !sources.some(s => s.url === source.url)) sources.push(source);
          }
          if (runSignal.aborted) return;
          if (!hits.length && !sources.length) throw new Error("Nothing in your browsing memory matches that. Recall only remembers pages read after it was switched on in Settings.");
        }
        if (ids.length && !sources.length) throw new Error("Couldn't read your selected page sources. Reload the pages and try again, or remove them to ask without sources.");
        const ctx = activeContext();
        const reply = await ipc.aiChat(ctx ? `${answerPrompt(sources)}\n\n${ctx}` : answerPrompt(sources), [...prior.slice(-10), { role: "user", content: goal }], true);
        if (runSignal.aborted) return;
        const answer = parseAnswer(reply, sources);
        set(s => ({ items: [...s.items, { id: nextId++, kind: "assistant", ...answer }] }));
      } else if (mode === "screen") {
        // First time on this site: ask what I may do. Remembered for the session, or saved if the person chose "always".
        const host = hostOf(selectActive(useStore.getState()).url);
        let perms = sessionPerms.get(host) ?? (await savedSite(host));
        if (!perms) {
          set({ preparingPermissions: true });
          const curated = await curateSite(host, goal);
          set({ preparingPermissions: false });
          if (runSignal.aborted) return;
          perms = await askPermissions(host, curated);
        }
        if (!perms) return void add("say", "Okay, I won't do anything without permissions. Send the task again when you're ready.");
        // Preview the plan: for big tasks (or always, or never, per Settings) the person approves the whole plan before anything runs.
        let goalWithPlan = goal;
        const previewSetting = normalizeSetting((await ipc.settingsGet().catch(() => ({}) as Record<string, string>)).screen_plan);
        if (previewSetting !== "never") {
          void ipc.screenOverlay({ phase: "thinking", thinking: "Working out a plan…" }).catch(() => {});
          const plan = await makePlan(goal);
          void ipc.screenOverlay({ phase: "idle" }).catch(() => {});
          if (runSignal.aborted) return;
          if (plan && shouldPreview(previewSetting, plan)) {
            const choice = await askPlan(plan);
            if (runSignal.aborted || choice === "stop") return void add("say", "Okay, I cancelled that. Nothing was done.");
            if (choice === "allow") goalWithPlan = `${goal}\n\n${approvedPlanNote(plan)}`;
          }
        }
        sessionPerms.set(host, perms);
        activePerms = perms;
        if (runSignal.aborted) return;
        const io = makeIO();
        await runScreenAgent(screenGoal(prior, goalWithPlan, activeContext()), {
          propose: async (g, h) => ipc.screenPropose(g, h, activePerms.items, await activePageText()),
          verify: async (g, h, pending) => ipc.screenVerify(g, h, pending, await activePageText()),
          act: ipc.screenAct,
          // Bring the browser back if it was minimized while the task is about the page it shows.
          prepare: async () => { if (selectActive(useStore.getState()).url) await ipc.windowControl("restore"); },
          choose: (description, risky) => askChoice(description, risky, get().screenApprovalMode === "ask"),
          mode: () => get().screenApprovalMode,
          permissions: () => activePerms,
          setMode: (m) => set({ screenApprovalMode: m }),
          sleep,
          onEvent: io.onEvent,
          onStatus: (st) => void ipc.screenOverlay(st).catch(() => {}),
          isPaused: () => get().paused,
          waitForResume: () => new Promise<void>((resolve) => { resumeGate = resolve; }),
        }, runSignal, undefined, screenHistory);
      } else {
        const ctx = activeContext();
        await runAgent(ctx ? `${ctx}\n\nTask: ${goal}` : goal, prior, makeIO(), { mode: get().approvalMode, signal });
      }
    } catch (e) {
      if (!runSignal.aborted) add("error", String(e));
    } finally {
      get().approval?.resolve("stop");
      void ipc.screenOverlay({ phase: "idle" }).catch(() => {});
    get().permissionRequest?.resolve(null);
      set({ busy: false, paused: false });
    }
  },
}));

useChat.subscribe(persistNew);
