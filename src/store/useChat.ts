import { create } from "zustand";
import { runAgent, type AgentIO, type Mode } from "../lib/agent";
import { runScreenAgent, type Choice, type ScreenMode } from "../lib/screenAgent";
import { ipc, type ChatMsg, type PageSnapshot } from "../lib/ipc";
import { answerPrompt, parseAnswer, sourceFromSnapshot, type AnswerSource, type AnswerBlock } from "../lib/answers";
import { selectActive, useStore } from "./useStore";
import { fallbackSite, hostOf, loadSite, parseGenerated, PERMISSION_PROMPT, saveSite, type Scope, type SitePerms } from "../lib/permissions";

export type ChatKind = "user" | "assistant" | "say" | "step" | "error" | "question";
export interface ChatItem {
  id: number;
  kind: ChatKind;
  text: string;
  ok?: boolean;
  sources?: AnswerSource[];
  blocks?: AnswerBlock[];
}

interface ChatState {
  items: ChatItem[];
  busy: boolean;
  /** "ask" answers questions about the page; "act" operates the browser. */
  mode: "ask" | "act" | "screen";
  approvalMode: Mode;
  sourceTabIds: string[];
  webResearch: boolean;
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
  editPermissions: () => Promise<void>;
  approval: { description: string; risky: boolean; options: { choice: Choice; label: string }[]; resolve: (c: Choice) => void } | null;
  setMode: (m: "ask" | "act" | "screen") => void;
  setApprovalMode: (m: Mode) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

let nextId = 1;
let signal = { aborted: false };
/** Actions the screen agent has taken this session; survives across messages, reset by Clear. */
const screenHistory: string[] = [];
/** Per-site permissions chosen for this session only. */
const sessionPerms = new Map<string, SitePerms>();
let activePerms: SitePerms = fallbackSite();

async function savedSite(host: string): Promise<SitePerms | null> {
  const s = await ipc.settingsGet().catch(() => ({}) as Record<string, string>);
  return loadSite(s.screen_permissions, host);
}

/** Asks Gemini which sensitive things matter on this website; falls back to a generic list. */
async function curateSite(host: string): Promise<SitePerms> {
  try {
    const tab = selectActive(useStore.getState());
    let text = "";
    if (tab.url) {
      const snap = await ipc.agentExec<PageSnapshot>(tab.id, "snapshot").catch(() => null);
      text = (snap?.text ?? "").slice(0, 1500);
    }
    const reply = await ipc.aiChat(PERMISSION_PROMPT, [{ role: "user", content: `Website: ${host}\nPage title: ${tab.title ?? ""}\nURL: ${tab.url ?? ""}\n<<<PAGE\n${text}\n>>>PAGE` }], true);
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

/** Plain conversation turns only (no step logs), for model context. */
function history(items: ChatItem[]): ChatMsg[] {
  return items
    .filter((i) => i.kind === "user" || i.kind === "assistant" || i.kind === "question")
    .map((i) => ({ role: i.kind === "user" ? ("user" as const) : ("assistant" as const), content: i.text }));
}

/** Screen mode starts a fresh run per message, so earlier turns (including its own questions) go into the goal. */
function screenGoal(prior: ChatMsg[], latest: string): string {
  if (!prior.length) return latest;
  const lines = prior.slice(-8).map((m) => `${m.role === "user" ? "Person" : "You"}: ${m.content.slice(0, 400)}`).join("\n");
  const goal = `Conversation so far:\n${lines}\n\nLatest message from the person: ${latest}\n\nContinue the task using everything above. Do not ask again for anything the person already told you.`;
  return goal.length > 3800 ? goal.slice(-3800) : goal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

export const useChat = create<ChatState>((set, get) => ({
  items: [],
  busy: false,
  mode: "ask",
  sourceTabIds: [],
  webResearch: false,
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
  editPermissions: async () => {
    const host = hostOf(selectActive(useStore.getState()).url);
    let start = sessionPerms.get(host) ?? (await savedSite(host));
    if (!start) {
      set({ preparingPermissions: true });
      start = await curateSite(host);
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
    set({ items: [] });
  },

  stop: () => {
    signal.aborted = true;
    get().approval?.resolve("stop");
    get().permissionRequest?.resolve(null);
  },

  send: async (text) => {
    const goal = text.trim();
    if (!goal || get().busy) return;
    const prior = history(get().items);
    add("user", goal);
    signal = { aborted: false };
    const runSignal = signal;
    const mode = get().mode;
    const sourceIds = [...get().sourceTabIds];
    const webResearch = get().webResearch;
    const includeCurrentPage = get().includeCurrentPage;
    set({ busy: true });
    try {
      if (mode === "ask") {
        const tab = selectActive(useStore.getState());
        const ids = sourceIds.length ? sourceIds : tab.url && includeCurrentPage ? [tab.id] : [];
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
        if (ids.length && !sources.length) throw new Error("Couldn't read your selected page sources. Reload the pages and try again, or remove them to ask without sources.");
        const reply = await ipc.aiChat(answerPrompt(sources), [...prior.slice(-10), { role: "user", content: goal }], true);
        if (runSignal.aborted) return;
        const answer = parseAnswer(reply, sources);
        set(s => ({ items: [...s.items, { id: nextId++, kind: "assistant", ...answer }] }));
      } else if (mode === "screen") {
        // First time on this site: ask what I may do. Remembered for the session, or saved if the person chose "always".
        const host = hostOf(selectActive(useStore.getState()).url);
        let perms = sessionPerms.get(host) ?? (await savedSite(host));
        if (!perms) {
          set({ preparingPermissions: true });
          const curated = await curateSite(host);
          set({ preparingPermissions: false });
          if (runSignal.aborted) return;
          perms = await askPermissions(host, curated);
        }
        if (!perms) return void add("say", "Okay, I won't do anything without permissions. Send the task again when you're ready.");
        sessionPerms.set(host, perms);
        activePerms = perms;
        if (runSignal.aborted) return;
        const io = makeIO();
        await runScreenAgent(screenGoal(prior, goal), {
          propose: (g, h) => ipc.screenPropose(g, h, activePerms.items),
          act: ipc.screenAct,
          choose: (description, risky) => askChoice(description, risky, get().screenApprovalMode === "ask"),
          mode: () => get().screenApprovalMode,
          permissions: () => activePerms,
          setMode: (m) => set({ screenApprovalMode: m }),
          sleep,
          onEvent: io.onEvent,
        }, runSignal, undefined, screenHistory);
      } else {
        await runAgent(goal, prior, makeIO(), { mode: get().approvalMode, signal });
      }
    } catch (e) {
      if (!runSignal.aborted) add("error", String(e));
    } finally {
      get().approval?.resolve("stop");
    get().permissionRequest?.resolve(null);
      set({ busy: false });
    }
  },
}));
