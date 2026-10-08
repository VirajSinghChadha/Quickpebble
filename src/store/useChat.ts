import { create } from "zustand";
import { ASK_PROMPT, runAgent, type AgentIO, type Mode } from "../lib/agent";
import { ipc, type ChatMsg, type PageSnapshot } from "../lib/ipc";
import { selectActive, useStore } from "./useStore";

export type ChatKind = "user" | "assistant" | "say" | "step" | "error" | "question";
export interface ChatItem {
  id: number;
  kind: ChatKind;
  text: string;
  ok?: boolean;
}

interface ChatState {
  items: ChatItem[];
  busy: boolean;
  /** "ask" answers questions about the page; "act" operates the browser. */
  mode: "ask" | "act";
  approvalMode: Mode;
  approval: { description: string; resolve: (ok: boolean) => void } | null;
  setMode: (m: "ask" | "act") => void;
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
  mode: "act",
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
    set({ busy: true });
    try {
      if (get().mode === "ask") {
        const tab = selectActive(useStore.getState());
        let page = "";
        if (tab.url) {
          try {
            const snap = await ipc.agentExec<PageSnapshot>(tab.id, "snapshot");
            page = `\n\n<<<PAGE\nurl: ${snap.url}\ntitle: ${snap.title}\n${snap.text}\n>>>PAGE`;
          } catch {
            /* answer without page context */
          }
        }
        const reply = await ipc.aiChat(ASK_PROMPT + page, [...prior.slice(-10), { role: "user", content: goal }]);
        add("assistant", reply || "(no answer)");
      } else {
        await runAgent(goal, prior, makeIO(), { mode: get().approvalMode, signal });
      }
    } catch (e) {
      add("error", String(e));
    } finally {
      get().approval?.resolve(false);
      set({ busy: false });
    }
  },
}));
