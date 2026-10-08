import { create } from "zustand";
import { ipc, isPrivateWindow, type TabEvent } from "../lib/ipc";

export type GroupName = "School" | "Work" | "Personal" | "Entertainment" | "Shopping";
export const GROUPS: GroupName[] = ["School", "Work", "Personal", "Entertainment", "Shopping"];
export type Sidebar = null | "assistant" | "therapist";
export const SIDEBAR_WIDTH = 380;
export type Overlay = null | "palette" | "tabsearch" | "privacy" | "settings" | "summary" | "extensions" | "library";
export type Theme = "light" | "dark" | "system";
export type Layout = "classic" | "minimal" | "productivity";

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon: string;
  pinned: boolean;
  group: GroupName | null;
  audible: boolean;
  recording: boolean;
  loading: boolean;
  suspended: boolean;
  muted: boolean;
  bookmarked: boolean;
  /** Restored from a previous session; the page loads on first activation. */
  needsLoad: boolean;
}

export const NEW_TAB_URL = "";
const SESSION_KEY = "qp.session.v1";

export const makeTab = (over: Partial<Tab> = {}): Tab => ({
  id: crypto.randomUUID(),
  url: NEW_TAB_URL,
  title: "",
  favicon: "",
  pinned: false,
  group: null,
  audible: false,
  recording: false,
  loading: false,
  suspended: false,
  muted: false,
  bookmarked: false,
  needsLoad: false,
  ...over,
});

/** Pinned tabs always sort first; otherwise order is preserved. */
export function sortTabs(tabs: Tab[]): Tab[] {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

/** Which tab to focus after closing `id`: the neighbour to the right, else left. */
export function nextActiveAfterClose(tabs: Tab[], id: string): string | null {
  const i = tabs.findIndex((t) => t.id === id);
  const rest = tabs.filter((t) => t.id !== id);
  if (!rest.length) return null;
  return (rest[Math.min(i, rest.length - 1)] ?? rest[rest.length - 1]).id;
}

interface State {
  tabs: Tab[];
  activeId: string;
  overlay: Overlay;
  menuOpen: boolean;
  suggestOpen: boolean;
  theme: Theme;
  layout: Layout;
  aiAutocomplete: boolean;
  summary: { tabId: string; text: string | null; error: string | null; loading: boolean } | null;
  focusAddressNonce: number;
  sidebar: Sidebar;
  closedTabs: { url: string; title: string; group: GroupName | null; pinned: boolean }[];

  setSidebar: (s: Sidebar) => void;
  toggleSidebar: (s: Exclude<Sidebar, null>) => void;
  reopenTab: () => void;
  init: () => Promise<void>;
  newTab: (url?: string, opts?: Partial<Tab>) => string;
  closeTab: (id: string) => void;
  activate: (id: string) => void;
  navigate: (id: string, input: string) => Promise<void>;
  applyEvent: (e: TabEvent) => void;
  togglePin: (id: string) => void;
  toggleMute: (id: string) => void;
  setGroup: (id: string, g: GroupName | null) => void;
  duplicate: (id: string) => void;
  toggleBookmark: (id: string) => Promise<void>;
  setOverlay: (o: Overlay) => void;
  setMenuOpen: (v: boolean) => void;
  setSuggestOpen: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  setLayout: (l: Layout) => void;
  setAiAutocomplete: (v: boolean) => void;
  focusAddress: () => void;
  summarize: (id: string) => Promise<void>;
  classify: (id: string) => Promise<void>;
}

const safeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

function persist(tabs: Tab[], activeId: string) {
  if (isPrivateWindow()) return; // private windows never write a session
  const slim = tabs.map(({ id, url, title, favicon, pinned, group }) => ({ id, url, title, favicon, pinned, group }));
  safeSet(SESSION_KEY, JSON.stringify({ tabs: slim, activeId }));
}

function loadSession(): { tabs: Tab[]; activeId: string } | null {
  if (isPrivateWindow()) return null;
  try {
    const raw = safeGet(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { tabs: Partial<Tab>[]; activeId: string };
    const tabs = (data.tabs ?? []).filter((t) => typeof t.id === "string").map((t) => makeTab({ ...t, needsLoad: !!t.url }));
    if (!tabs.length) return null;
    return { tabs, activeId: tabs.some((t) => t.id === data.activeId) ? data.activeId : tabs[0].id };
  } catch {
    return null;
  }
}

const first = makeTab();

export const useStore = create<State>((set, get) => ({
  tabs: [first],
  activeId: first.id,
  overlay: null,
  menuOpen: false,
  suggestOpen: false,
  theme: (safeGet("qp.theme") as Theme) || "system",
  layout: (safeGet("qp.layout") as Layout) || "classic",
  aiAutocomplete: safeGet("qp.aiAutocomplete") === "1",
  summary: null,
  focusAddressNonce: 0,
  sidebar: null,
  closedTabs: [],

  setSidebar: (sidebar) => {
    set({ sidebar });
    void ipc.sidebarSet(sidebar ? SIDEBAR_WIDTH : 0);
  },
  toggleSidebar: (s) => get().setSidebar(get().sidebar === s ? null : s),
  reopenTab: () => {
    const [last, ...rest] = get().closedTabs;
    if (!last) return;
    set({ closedTabs: rest });
    get().newTab(last.url, { group: last.group, pinned: last.pinned });
  },

  init: async () => {
    const saved = loadSession();
    if (saved) set({ tabs: saved.tabs, activeId: saved.activeId });
    const { tabs, activeId } = get();
    for (const t of tabs) await ipc.tabCreate(t.id, t.pinned);
    get().activate(activeId);
    const s = await ipc.settingsGet();
    if (s.theme === "light" || s.theme === "dark" || s.theme === "system") set({ theme: s.theme });
    if (s.newtab_layout === "classic" || s.newtab_layout === "minimal" || s.newtab_layout === "productivity")
      set({ layout: s.newtab_layout });
  },

  newTab: (url = NEW_TAB_URL, opts = {}) => {
    const tab = makeTab(opts);
    set((s) => ({ tabs: [...s.tabs, tab] }));
    void ipc.tabCreate(tab.id, tab.pinned).then(() => {
      get().activate(tab.id);
      if (url) void get().navigate(tab.id, url);
      else get().focusAddress();
    });
    set({ activeId: tab.id });
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeId } = get();
    const next = nextActiveAfterClose(tabs, id);
    const closing = tabs.find((t) => t.id === id);
    if (closing?.url && !isPrivateWindow()) {
      set((s) => ({ closedTabs: [{ url: closing.url, title: closing.title, group: closing.group, pinned: closing.pinned }, ...s.closedTabs].slice(0, 20) }));
    }
    void ipc.tabClose(id);
    if (!next) {
      // Never leave the window without a tab.
      const fresh = makeTab();
      set({ tabs: [fresh], activeId: fresh.id });
      void ipc.tabCreate(fresh.id).then(() => get().activate(fresh.id));
    } else {
      set({ tabs: tabs.filter((t) => t.id !== id), activeId: activeId === id ? next : activeId });
      if (activeId === id) get().activate(next);
    }
    persist(get().tabs, get().activeId);
  },

  activate: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set({ activeId: id });
    void ipc.tabActivate(id).then(() => {
      if (tab.needsLoad && tab.url) {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, needsLoad: false } : t)) }));
        void ipc.tabNavigate(id, tab.url);
      }
    });
    persist(get().tabs, id);
  },

  navigate: async (id, input) => {
    try {
      const url = await ipc.tabNavigate(id, input);
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, url, loading: true, needsLoad: false, suspended: false } : t)) }));
    } catch (e) {
      console.warn("navigate failed", e);
    }
  },

  applyEvent: (e) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === e.id
          ? { ...t, url: e.url || t.url, title: e.title, favicon: e.favicon, audible: e.audible, recording: e.recording, loading: e.loading, suspended: e.suspended, muted: e.muted }
          : t,
      ),
    }));
    persist(get().tabs, get().activeId);
  },

  togglePin: (id) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t) return;
    void ipc.tabSetPinned(id, !t.pinned);
    set((s) => ({ tabs: sortTabs(s.tabs.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x))) }));
    persist(get().tabs, get().activeId);
  },

  toggleMute: (id) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t) return;
    void ipc.tabSetMuted(id, !t.muted);
    set((s) => ({ tabs: s.tabs.map((x) => (x.id === id ? { ...x, muted: !x.muted } : x)) }));
  },

  setGroup: (id, g) => {
    set((s) => ({ tabs: s.tabs.map((x) => (x.id === id ? { ...x, group: g } : x)) }));
    persist(get().tabs, get().activeId);
  },

  duplicate: (id) => {
    const t = get().tabs.find((x) => x.id === id);
    if (t?.url) get().newTab(t.url, { group: t.group });
  },

  toggleBookmark: async (id) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t?.url) return;
    const added = await ipc.bookmarkToggle(t.url, t.title || t.url);
    set((s) => ({ tabs: s.tabs.map((x) => (x.id === id ? { ...x, bookmarked: added } : x)) }));
  },

  setOverlay: (overlay) => set({ overlay }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setSuggestOpen: (suggestOpen) => set({ suggestOpen }),

  setTheme: (theme) => {
    safeSet("qp.theme", theme);
    set({ theme });
    void ipc.settingsSet("theme", theme);
  },
  setLayout: (layout) => {
    safeSet("qp.layout", layout);
    set({ layout });
    void ipc.settingsSet("newtab_layout", layout);
  },
  setAiAutocomplete: (v) => {
    safeSet("qp.aiAutocomplete", v ? "1" : "0");
    set({ aiAutocomplete: v });
  },
  focusAddress: () => set((s) => ({ focusAddressNonce: s.focusAddressNonce + 1 })),

  summarize: async (id) => {
    set({ overlay: "summary", summary: { tabId: id, text: null, error: null, loading: true } });
    try {
      const text = await ipc.aiRun({ task: "summarize", tab_id: id });
      set({ summary: { tabId: id, text, error: null, loading: false } });
    } catch (e) {
      set({ summary: { tabId: id, text: null, error: String(e), loading: false } });
    }
  },

  classify: async (id) => {
    try {
      const g = await ipc.aiRun({ task: "classify", tab_id: id, groups: [...GROUPS] });
      if (g && (GROUPS as string[]).includes(g)) get().setGroup(id, g as GroupName);
    } catch (e) {
      console.warn("classify failed", e);
    }
  },
}));

export const selectActive = (s: State): Tab => s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0];
