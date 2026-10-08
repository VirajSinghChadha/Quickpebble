import { invoke } from "@tauri-apps/api/core";
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

export const defaultMemory: MemoryConfig = { enabled: true, mode: "balanced", timeout_minutes: null };

export const ipc = {
  tabCreate: (id: string, pinned = false) => call<void>("tab_create", { id, pinned }),
  tabActivate: (id: string) => call<void>("tab_activate", { id }),
  tabClose: (id: string) => call<void>("tab_close", { id }),
  tabNavigate: (id: string, input: string) => call<string>("tab_navigate", { id, input }, input),
  tabNav: (id: string, action: "back" | "forward" | "reload" | "stop") => call<void>("tab_nav", { id, action }),
  tabSetPinned: (id: string, pinned: boolean) => call<void>("tab_set_pinned", { id, pinned }),
  tabSetMuted: (id: string, muted: boolean) => call<void>("tab_set_muted", { id, muted }),
  contentVisible: (visible: boolean) => call<void>("content_visible", { visible }),
  historySearch: (query: string, limit = 50) => call<HistoryEntry[]>("history_search", { query, limit }, []),
  historyClear: () => call<void>("history_clear"),
  bookmarkToggle: (url: string, title: string) => call<boolean>("bookmark_toggle", { url, title }, false),
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
  windowControl: (action: "minimize" | "maximize" | "close") => call<void>("window_control", { action }),
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
