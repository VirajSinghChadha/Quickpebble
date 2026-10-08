import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** True when running inside the Tauri shell (false in a plain browser, e.g. `npm run dev`). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const windowLabel = (): string => (isTauri ? getCurrentWindow().label : "main");
export const isPrivateWindow = (): boolean => windowLabel().startsWith("private-");

async function call<T>(cmd: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  if (!isTauri) return fallback as T;
  return invoke<T>(cmd, args);
}

export interface TabEvent {
  window: string;
  id: string;
  url: string;
  title: string;
  favicon: string;
  audible: boolean;
  recording: boolean;
  loading: boolean;
  suspended: boolean;
  muted: boolean;
}

export interface Suggestion {
  kind: "bookmark" | "history";
  title: string;
  url: string;
}
export interface HistoryEntry {
  url: string;
  title: string;
  visited_at: number;
  visit_count: number;
}
export interface Bookmark {
  url: string;
  title: string;
  created_at: number;
  folder: string;
}
export interface SitePermission {
  host: string;
  permission: string;
  policy: string;
}
export interface MemoryConfig {
  enabled: boolean;
  mode: "balanced" | "maximum";
  timeout_minutes: number | null;
}
export interface MemoryStats {
  total_tabs: number;
  suspended_tabs: number;
  system_used_pct: number;
  estimated_saved_mb: number;
}
export interface AiStatus {
  online: boolean;
  provider: string;
  model: string;
  models: string[];
  has_key: boolean;
  error: string | null;
}
export interface PrivacyStats {
  blocked_total: number;
  block_trackers: boolean;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}
export interface PageSnapshot {
  url: string;
  title: string;
  scroll: { y: number; max: number };
  text: string;
  elements: { i: number; tag: string; type?: string; label: string; href?: string; value?: string; disabled?: boolean; offscreen?: boolean }[];
}
export type AgentOp = "snapshot" | "click" | "type" | "select" | "scroll" | "press";
export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  hosts: string[];
  permissions: string[];
  has_content_scripts: boolean;
  warnings: string[];
  source: string;
}

export interface UpdateInfo {
  version: string;
  current: string;
  notes: string | null;
}

export interface UpdateProgress {
  phase: "downloading" | "installing";
  downloaded: number;
  total: number | null;
}

export const defaultMemory: MemoryConfig = { enabled: true, mode: "balanced", timeout_minutes: null };

export const ipc = {
  tabCreate: (id: string, pinned = false) => call<void>("tab_create", { id, pinned }),
  tabActivate: (id: string) => call<void>("tab_activate", { id }),
  tabClose: (id: string) => call<void>("tab_close", { id }),
  tabNavigate: (id: string, input: string, allowHttp = false) => call<string>("tab_navigate", { id, input, allowHttp }, input),
  tabNav: (id: string, action: "back" | "forward" | "reload" | "stop") => call<void>("tab_nav", { id, action }),
  tabSetPinned: (id: string, pinned: boolean) => call<void>("tab_set_pinned", { id, pinned }),
  tabSetMuted: (id: string, muted: boolean) => call<void>("tab_set_muted", { id, muted }),
  contentVisible: (visible: boolean) => call<void>("content_visible", { visible }),
  historySearch: (query: string, limit = 50) => call<HistoryEntry[]>("history_search", { query, limit }, []),
  historyClear: () => call<void>("history_clear"),
  bookmarkToggle: (url: string, title: string) => call<boolean>("bookmark_toggle", { url, title }, false),
  bookmarkSetFolder: (url: string, folder: string) => call<void>("bookmark_set_folder", { url, folder }),
  bookmarksImportChrome: () => call<number>("bookmarks_import_chrome", undefined, 0),
  bookmarksImportFile: () => call<number | null>("bookmarks_import_file", undefined, null),
  bookmarkList: (query = "") => call<Bookmark[]>("bookmark_list", { query }, []),
  suggest: (query: string) => call<Suggestion[]>("suggest", { query }, []),
  settingsGet: () => call<Record<string, string>>("settings_get", undefined, {}),
  settingsSet: (key: string, value: string) => call<void>("settings_set", { key, value }),
  memorySaverGet: () => call<MemoryConfig>("memory_saver_get", undefined, defaultMemory),
  memorySaverSet: (config: MemoryConfig) => call<void>("memory_saver_set", { config }),
  memoryStats: () =>
    call<MemoryStats>("memory_stats", undefined, { total_tabs: 0, suspended_tabs: 0, system_used_pct: 0, estimated_saved_mb: 0 }),
  aiStatus: () =>
    call<AiStatus>("ai_status", undefined, { online: false, provider: "ollama", model: "llama3", models: [], has_key: true, error: "Not running in Quick Pebble" }),
  aiRun: (req: { task: "summarize" | "classify" | "complete"; tab_id?: string; prefix?: string; groups?: string[] }) =>
    call<string | null>("ai_run", { req }, null),
  aiSetKey: (provider: string, key: string) => call<void>("ai_set_key", { provider, key }),
  privacyStats: () => call<PrivacyStats>("privacy_stats", undefined, { blocked_total: 0, block_trackers: true }),
  privacyPermissions: () => call<SitePermission[]>("privacy_permissions", undefined, []),
  privacySetPermission: (host: string, permission: string, policy: string) =>
    call<void>("privacy_set_permission", { host, permission, policy }),
  privacyClearData: (history: boolean, siteData: boolean) => call<void>("privacy_clear_data", { history, siteData }),
  windowNewPrivate: () => call<void>("window_new_private"),
  chromeSet: (height: number) => call<void>("chrome_set", { height }),
  tabReader: (id: string) => call<void>("tab_reader", { id }),
  updateCheck: async () => {
    if (!isTauri) throw new Error("Updates are available in the installed Quick Pebble app.");
    return call<UpdateInfo | null>("update_check");
  },
  updateInstall: async (onProgress: (progress: UpdateProgress) => void) => {
    if (!isTauri) throw new Error("Updates are available in the installed Quick Pebble app.");
    const progress = new Channel<UpdateProgress>();
    progress.onmessage = onProgress;
    return call<void>("update_install", { progress });
  },
  sidebarSet: (width: number) => call<void>("sidebar_set", { width }),
  tabZoom: (id: string, action: "in" | "out" | "reset" | `set:${number}`) => call<number | null>("tab_zoom", { id, action }, null),
  tabFind: (id: string) => call<void>("tab_find", { id }),
  researchStatus: () => call<boolean>("research_status", undefined, false),
  researchKeySet: async (key: string) => {
    if (!isTauri) throw new Error("Configure web research in the installed Quick Pebble app.");
    return call<void>("research_key_set", { key });
  },
  researchSearch: async (query: string) => {
    if (!isTauri) throw new Error("Web research is available in the installed Quick Pebble app.");
    return call<{ title: string; url: string; text: string }[]>("research_search", { query });
  },
  aiChat: (system: string, messages: ChatMsg[], json = false) =>
    call<string>("ai_chat", { req: { system, messages, json } }, "The assistant only works inside the Quick Pebble app."),
  agentExec: <T = unknown>(tabId: string, op: AgentOp, args: Record<string, unknown> = {}) =>
    call<T>("agent_exec", { tabId, op, args }),
  screenPropose: async (goal: string, history: string[], categories?: { id: string; label: string }[], pageText?: string) => {
    if (!isTauri) throw new Error("Screen control only works inside the Quick Pebble app.");
    return call<ScreenResponse>("screen_propose", { goal, history, categories, pageText });
  },
  screenVerify: async (goal: string, history: string[], pending: string, pageText?: string) => {
    if (!isTauri) throw new Error("Screen control only works inside the Quick Pebble app.");
    return call<{ ok: boolean; problems: string }>("screen_verify", { goal, history, pending, pageText });
  },
  geminiModels: () => call<string[]>("gemini_models", undefined, []),
  screenAct: (action: ScreenAction) => call<{ ok: boolean; changed: boolean | null }>("screen_act", { action }),
  extensionList: () => call<ExtensionInfo[]>("extension_list", undefined, []),
  extensionInstallStore: (input: string) => call<ExtensionInfo>("extension_install_store", { input }),
  extensionInstallFile: () => call<ExtensionInfo | null>("extension_install_file", undefined, null),
  extensionSetEnabled: (id: string, enabled: boolean) => call<void>("extension_set_enabled", { id, enabled }),
  extensionRemove: (id: string) => call<void>("extension_remove", { id }),
  windowControl: (action: "minimize" | "maximize" | "close" | "restore") => call<void>("window_control", { action }),
};

export async function onTabEvent(cb: (e: TabEvent) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  const label = windowLabel();
  return listen<TabEvent>("qp://tab", (e) => e.payload.window === label && cb(e.payload));
}

export async function onShortcut(cb: (action: string) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  const label = windowLabel();
  return listen<{ window: string; action: string }>("qp://shortcut", (e) => e.payload.window === label && cb(e.payload.action));
}

export async function onHttpsFallback(cb: (e: { id: string; url: string }) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  const label = windowLabel();
  return listen<{ window: string; id: string; url: string }>("qp://https-fallback", (e) => e.payload.window === label && cb(e.payload));
}

export async function onUpdate(cb: (info: UpdateInfo) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<UpdateInfo>("qp://update", (e) => cb(e.payload));
}

/** Backend half of the agent's reply: executed exactly as given. `cell` is a grid label such as "M7". */
export interface ScreenAction {
  type: "click" | "double_click" | "right_click" | "type" | "key" | "scroll" | "wait" | "ask" | "done";
  cell?: string;
  fx?: number;
  fy?: number;
  text?: string;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  category?: string; // id of one of the site's permissions, or "none"
  risk?: "low" | "high";
}

/** User half of the agent's reply: how it got there, and the message or final answer. Never executed. */
export interface ScreenUser {
  thinking: string;
  message: string;
}

export interface ScreenResponse {
  user: ScreenUser;
  action: ScreenAction;
}
