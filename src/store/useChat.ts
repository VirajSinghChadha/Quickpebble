import { create } from "zustand";
import { runAgent, type AgentIO, type Mode } from "../lib/agent";
import { runScreenAgent } from "../lib/screenAgent";
import { ipc, type ChatMsg, type PageSnapshot } from "../lib/ipc";
import { answerPrompt, parseAnswer, sourceFromSnapshot, type AnswerSource, type AnswerBlock } from "../lib/answers";
import { selectActive, useStore } from "./useStore";

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
  approval: { description: string; resolve: (ok: boolean) => void } | null;
  setMode: (m: "ask" | "act" | "screen") => void;
  setApprovalMode: (m: Mode) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

let nextId = 1;
let signal = { aborted: false };

const add = (kind: ChatKind, text: string, ok?: boolean) =>
  useChat.setState((s) => ({ items: [...s.items, { id: nextId++, kind, text, ok }] }));

/** Plain conversation turns only (no step logs), for model context. */
function history(items: ChatItem[]): ChatMsg[] {
  return items
    .filter((i) => i.kind === "user" || i.kind === "assistant")
    .map((i) => ({ role: i.kind === "user" ? ("user" as const) : ("assistant" as const), content: i.text }));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
    approve: (description) =>
      new Promise<boolean>((resolve) => {
        useChat.setState({
          approval: {
            description,
            resolve: (ok) => {
              useChat.setState({ approval: null });
              resolve(ok);
            },
          },
        });
      }),
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
  approval: null,
  setMode: (mode) => set({ mode }),
  setApprovalMode: (approvalMode) => set({ approvalMode }),
  clear: () => set({ items: [] }),

  stop: () => {
    signal.aborted = true;
    get().approval?.resolve(false);
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
        const io = makeIO();
        await runScreenAgent(goal, { propose: ipc.screenPropose, act: ipc.screenAct, approve: io.approve, sleep, onEvent: io.onEvent }, runSignal);
      } else {
        await runAgent(goal, prior, makeIO(), { mode: get().approvalMode, signal });
      }
    } catch (e) {
      if (!runSignal.aborted) add("error", String(e));
    } finally {
      get().approval?.resolve(false);
      set({ busy: false });
    }
  },
}));
