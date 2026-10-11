/** The bridge the Chromium shell's preload script exposes to Quick Pebble's own UI. */
interface QpBridge {
  label: string;
  platform: string;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, cb: (payload: never) => void) => () => void;
}
declare global {
  interface Window { qp?: QpBridge }
}
type UnlistenFn = () => void;

/** True when running inside the Quick Pebble shell (false in a plain browser, e.g. `npm run dev`). */
export const isNative = typeof window !== "undefined" && !!window.qp;
export const isTauri = isNative; // kept so older call sites keep working

const bridge = (): QpBridge | undefined => (typeof window === "undefined" ? undefined : window.qp);
export const windowLabel = (): string => bridge()?.label ?? "main";
export const isPrivateWindow = (): boolean => windowLabel().startsWith("private-");

async function call<T>(cmd: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  const b = bridge();
  if (!b) return fallback as T;
  try {
    return (await b.invoke(cmd, args)) as T;
  } catch (e) {
    // Electron wraps errors as "Error invoking remote method 'qp:invoke': Error: <message>"; show just the message.
    const msg = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, "") : String(e);
    throw msg;
  }
}

function listen<T>(event: string, cb: (e: { payload: T }) => void): Promise<UnlistenFn> {
  const b = bridge();
  return Promise.resolve(b ? b.on(event, ((payload: T) => cb({ payload })) as (p: never) => void) : () => {});
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
  crashed?: boolean;
  scrollY?: number;
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
export interface Profile {
  id: string;
  name: string;
  color: string;
}
export interface RecallHit {
  url: string;
  title: string;
  snippet: string;
  at: number;
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
export type AgentOp = "snapshot" | "click" | "type" | "select" | "scroll" | "press" | "collect_text" | "apply_text" | "restore_text" | "page_facts";
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
  manual?: boolean;
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
  tabScrollTo: (id: string, y: number) => call<void>("tab_scroll_to", { id, y }),
  sessionRecovered: () => call<boolean>("session_recovered", undefined, false),
  tabNav: (id: string, action: "back" | "forward" | "reload" | "stop") => call<void>("tab_nav", { id, action }),
  tabSetPinned: (id: string, pinned: boolean) => call<void>("tab_set_pinned", { id, pinned }),
  tabSetMuted: (id: string, muted: boolean) => call<void>("tab_set_muted", { id, muted }),
  contentVisible: (visible: boolean) => call<void>("content_visible", { visible }),
  historySearch: (query: string, limit = 50) => call<HistoryEntry[]>("history_search", { query, limit }, []),
  historyClear: () => call<void>("history_clear"),
  bookmarkToggle: (url: string, title: string) => call<boolean>("bookmark_toggle", { url, title }, false),
  bookmarkSetFolder: (url: string, folder: string) => call<void>("bookmark_set_folder", { url, folder }),
  bookmarksImportChrome: () => call<number>("bookmarks_import_chrome", undefined, 0),
  hoverShow: (id: string, r: { x: number; y: number; width: number; height: number }, dark: boolean) => call<void>("hover_show", { id, ...r, dark }),
  hoverHide: () => call<void>("hover_hide"),
  importScan: (browser: "chrome" | "safari") => call<ImportScan>("import_scan", { browser }),
  importRun: (browser: "chrome" | "safari", opts: { history: boolean; bookmarks: boolean; tabs: boolean }) => call<{ history: number; bookmarks: number; tabs: string[] }>("import_run", { browser, ...opts }),
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
  updateOpenPage: async () => {
    if (isTauri) await call<void>("update_open_page");
  },
  updateInstall: async (onProgress: (progress: UpdateProgress) => void) => {
    if (!isTauri) throw new Error("Updates are available in the installed Quick Pebble app.");
    const stop = await listen<UpdateProgress>("qp://update-progress", (e) => onProgress(e.payload));
    try {
      return await call<void>("update_install");
    } finally {
      stop();
    }
  },
  updateSkip: () => call<void>("update_skip"),
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
  screenPropose: async (goal: string, history: string[], categories?: { id: string; label: string }[], pageText?: string, watch = false) => {
    if (!isTauri) throw new Error("Screen control only works inside the Quick Pebble app.");
    return call<ScreenResponse>("screen_propose", { goal, history, categories, pageText, watch });
  },
  actionsList: (limit = 200) => call<ActionEntry[]>("actions_list", { limit }, []),
  actionUndo: (id: number) => call<boolean>("action_undo", { id }),
  actionsUndoTask: (task: string) => call<{ undone: number; failed: { id: number; error: string }[] }>("actions_undo_task", { task }),
  actionsClear: () => call<void>("actions_clear"),
  taskView: (id: string) => call<TaskView>("task_view", { id }),
  taskConfirm: (id: string, picks: number[]) => call<Receipt>("task_confirm", { id, picks }),
  taskCancel: (id: string) => call<void>("task_cancel", { id }, undefined),
  receiptsList: (limit = 50) => call<Receipt[]>("receipts_list", { limit }, []),
  protectedList: () => call<string[]>("protected_list", undefined, []),
  protectedAdd: () => call<string[]>("protected_add"),
  protectedRemove: (path: string) => call<string[]>("protected_remove", { path }),
  folderPick: (title: string) => call<string | null>("folder_pick", { title }),
  filesFolders: () => call<FileFolder[]>("files_folders", undefined, []),
  filesAddFolder: () => call<FileFolder[] | null>("files_add_folder"),
  filesRemoveFolder: (path: string) => call<FileFolder[]>("files_remove_folder", { path }),
  filesReindex: () => call<{ path: string; files: number; skipped: number; capped: boolean }[]>("files_reindex"),
  filesSearch: (query: string, limit = 5) => call<FileHit[]>("files_search", { query, limit }, []),
  timelineDay: (day: string) => call<{ on: boolean; events: TimelineEvent[] }>("timeline_day", { day }, { on: false, events: [] }),
  timelineNote: (title: string) => call<boolean>("timeline_note", { kind: "task", title, detail: "" }, false),
  timelineClear: () => call<void>("timeline_clear"),
  pageTrackers: (id: string) => call<{ host: string; count: number; blocked: boolean }[]>("page_trackers", { id }, []),
  studySave: (pack: unknown, reminders: number[]) => call<number>("study_save", { pack, reminders }),
  studyList: () => call<{ id: number; title: string; created: number; next: number | null }[]>("study_list", undefined, []),
  studyGet: (id: number) => call<{ id: number; title: string; created: number; pack: unknown }>("study_get", { id }),
  studyDelete: (id: number) => call<void>("study_delete", { id }),
  timetableSaveIcs: (ics: string) => call<{ path: string; opened: boolean }>("timetable_save_ics", { ics }),
  noteSave: (title: string, body: string, where: "notes" | "file") => call<{ saved: string } | null>("note_save", { title, body, where }),
  slidesPdfText: (id: string) => call<string | null>("slides_pdf_text", { id }),
  submitPickFiles: () => call<{ name: string; size: number }[]>("submit_pick_files", undefined, []),
  routinesList: () => call<import("./routines").Routine[]>("routines_list", undefined, []),
  routineSave: (routine: unknown, id?: number) => call<number>("routine_save", { routine, id }),
  routineDelete: (id: number) => call<void>("routine_delete", { id }),
  routineTeachStart: () => call<boolean>("routine_teach_start"),
  routineTeachStop: () => call<import("./routines").Step[]>("routine_teach_stop", undefined, []),
  routineExport: (id: number) => call<string | null>("routine_export", { id }),
  routineImport: () => call<{ file: string; token?: string; routine?: Omit<import("./routines").Routine, "id">; problems?: string[] } | null>("routine_import"),
  routineImportConfirm: (token: string) => call<number>("routine_import_confirm", { token }),
  routineOpenApp: (app: string) => call<boolean>("routine_open_app", { app }),
  cleanDiskScan: () => call<DiskReport>("clean_disk_scan"),
  cleanDiskReview: (group: string) => call<TaskView>("clean_disk_review", { group }),
  cleanInstallers: () => call<TaskView>("clean_installers"),
  cleanAppsScan: (days: number) => call<ForgottenApp[]>("clean_apps_scan", { days }, []),
  cleanAppsReview: (paths: string[]) => call<TaskView>("clean_apps_review", { paths }),
  cleanTidy: (folders: ("desktop" | "downloads")[]) => call<TaskView>("clean_tidy", { folders }),
  cleanRenameCandidates: (folder: string) => call<RenameCandidates>("clean_rename_candidates", { folder }),
  cleanRenameSuggest: (paths: string[]) => call<{ view: TaskView; failed: { name: string; error: string }[] }>("clean_rename_suggest", { paths }),
  cleanPhotosScan: (folder: string) => call<{ view: TaskView; unsure: number }>("clean_photos_scan", { folder }),
  cleanPhotosUnsure: () => call<{ path: string; name: string; size: number | null }[]>("clean_photos_unsure", undefined, []),
  cleanPhotosAi: (paths: string[]) => call<{ view: TaskView; unsure: number; failed: { name: string; error: string }[] }>("clean_photos_ai", { paths }),
  systemSlow: () => call<SlowReport>("system_slow"),
  appsRunning: (hours: number) => call<{ running: { name: string; bundle: string | null }[]; tracking: boolean; since: number | null; unused: { name: string; lastSeen: number | null }[] }>("apps_running", { hours }),
  appsQuitReview: (names: string[]) => call<TaskView>("apps_quit_review", { names }),
  loginItems: () => call<LoginItem[]>("login_items", undefined, []),
  loginItemsReview: (names: string[]) => call<TaskView>("login_items_review", { names }),
  screenVerify: async (goal: string, history: string[], pending: string, pageText?: string) => {
    if (!isTauri) throw new Error("Screen control only works inside the Quick Pebble app.");
    return call<{ ok: boolean; problems: string }>("screen_verify", { goal, history, pending, pageText });
  },
  ctxProjects: () => call<Project[]>("ctx_projects", undefined, []),
  ctxProjectSave: (project: { id?: number; name: string; notes: string }) => call<number>("ctx_project_save", { project }),
  ctxProjectDelete: (id: number) => call<boolean>("ctx_project_delete", { id }),
  ctxProjectTouch: (id: number) => call<void>("ctx_project_touch", { id }),
  ctxChats: () => call<ChatSummary[]>("ctx_chats", undefined, []),
  ctxChatNew: (title: string, projectId: number | null) => call<number>("ctx_chat_new", { title, projectId }),
  ctxChatLoad: (id: number) => call<{ id: number; title: string; project_id: number | null; items: { kind: string; text: string }[] }>("ctx_chat_load", { id }),
  ctxChatPeek: (id: number) => call<{ id: number; title: string; items: { kind: string; text: string }[] }>("ctx_chat_peek", { id }),
  ctxChatSquash: (id: number, summary: string) => call<{ saved: number }>("ctx_chat_squash", { id, summary }),
  ctxChatAppend: (id: number, items: { kind: string; text: string }[]) => call<void>("ctx_chat_append", { id, items }),
  ctxChatProject: (id: number, projectId: number | null) => call<void>("ctx_chat_project", { id, projectId }),
  ctxUsage: () => call<ContextUsage>("ctx_usage", undefined, { chats: 0, messages: 0, projects: 0, bytes: 0 }),
  ctxStale: (days: number) => call<StaleReport>("ctx_stale", { days }, { days, chats: [], projects: [] }),
  ctxClear: (chatIds: number[], projectIds: number[]) => call<{ chats: number; projects: number }>("ctx_clear", { chatIds, projectIds }),
  reportPreview: (includeLog: boolean) => call<{ text: string; version: string; platform: string }>("report_preview", { includeLog }, { text: "(Only available in the installed app.)", version: "", platform: "" }),
  taskManager: () => call<TaskReport>("task_manager", undefined, { rows: [], total_mb: 0, tabs_mb: 0, other_mb: 0, processes: 0, suspended: 0 }),
  tabSuspend: (id: string) => call<boolean>("tab_suspend", { id }),
  usageToday: () => call<UsageToday>("usage_today", undefined, { date: "", calls: 0, limit: 1000, level: "ok" }),
  /** Updates the status bar at the bottom of the screen (no-op outside the app). */
  screenOverlay: (state: ScreenStatus) => call<boolean>("screen_overlay", { state }, false),
  weatherSearch: (query: string) => call<Place[]>("weather_search", { query }),
  weatherFetch: (lat: number, lon: number, fahrenheit: boolean) => call<Weather>("weather_fetch", { lat, lon, fahrenheit }),
  newsFetch: (source: string, count = 5) => call<Headline[]>("news_fetch", { source, count }),
  downloadsList: () => call<DownloadItem[]>("downloads_list", undefined, []),
  downloadOpen: (id: number) => call<void>("download_open", { id }),
  downloadReveal: (id: number) => call<void>("download_reveal", { id }),
  downloadUndoMove: (id: number) => call<void>("download_undo_move", { id }),
  downloadRename: (id: number, name: string) => call<void>("download_rename", { id, name }),
  downloadSuggestApply: (id: number, reply: string) => call<void>("download_suggest_apply", { id, reply }),
  downloadRemove: (id: number) => call<void>("download_remove", { id }),
  downloadsClearFinished: () => call<void>("downloads_clear_finished"),
  vaultStatus: () => call<{ exists: boolean; unlocked: boolean }>("vault_status", undefined, { exists: false, unlocked: false }),
  vaultCreate: (master: string) => call<void>("vault_create", { master }),
  vaultUnlock: (master: string) => call<void>("vault_unlock", { master }),
  vaultLock: () => call<void>("vault_lock"),
  vaultList: (query = "") => call<VaultEntry[]>("vault_list", { query }, []),
  vaultReveal: (id: number) => call<string>("vault_reveal", { id }),
  vaultSave: (host: string, username: string, password: string) => call<number>("vault_save", { host, username, password }),
  vaultImportFile: () => call<{ added: number; updated: number; unchanged: number; skipped: number } | null>("vault_import_file", undefined, null),
  vaultDelete: (id: number) => call<void>("vault_delete", { id }),
  vaultFill: (tabId: string, id: number) => call<void>("vault_fill", { tabId, id }),
  vaultSavePending: (tabId: string) => call<number>("vault_save_pending", { tabId }),
  vaultDismissPending: (tabId: string, never: boolean) => call<void>("vault_dismiss_pending", { tabId, never }),
  geminiModels: () => call<string[]>("gemini_models", undefined, []),
  screenAct: (action: ScreenAction) => call<{ ok: boolean; changed: boolean | null }>("screen_act", { action }),
  extensionList: () => call<ExtensionInfo[]>("extension_list", undefined, []),
  extensionInstallStore: (input: string) => call<ExtensionInfo>("extension_install_store", { input }),
  extensionInstallFile: () => call<ExtensionInfo | null>("extension_install_file", undefined, null),
  extensionSetEnabled: (id: string, enabled: boolean) => call<void>("extension_set_enabled", { id, enabled }),
  extensionRemove: (id: string) => call<void>("extension_remove", { id }),
  recallSearch: (query: string, limit = 6) => call<RecallHit[]>("recall_search", { query, limit }, []),
  recallStats: () => call<{ pages: number; enabled: boolean }>("recall_stats", undefined, { pages: 0, enabled: false }),
  recallForget: (url: string) => call<void>("recall_forget", { url }),
  recallClear: () => call<void>("recall_clear"),
  profileList: () => call<Profile[]>("profile_list", undefined, []),
  profileCreate: (name: string, color: string) => call<Profile>("profile_create", { name, color }),
  profileDelete: (id: string) => call<void>("profile_delete", { id }),
  windowNewProfile: (id: string) => call<void>("window_new_profile", { id }),
  profileCurrent: () => call<{ id: string; private: boolean }>("profile_current", undefined, { id: "default", private: false }),
  windowControl: (action: "minimize" | "maximize" | "close" | "restore") => call<void>("window_control", { action }),
};

export async function onTabEvent(cb: (e: TabEvent) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  const label = windowLabel();
  return listen<TabEvent>("qp://tab", (e) => e.payload.window === label && cb(e.payload));
}

export async function onStudyReminder(cb: (e: { id: number; title: string }) => void): Promise<UnlistenFn> {
  return listen<{ id: number; title: string }>("qp://study-reminder", (e) => cb(e.payload));
}

export async function onRoutineDue(cb: (e: { id: number }) => void): Promise<UnlistenFn> {
  return listen<{ id: number }>("qp://routine-due", (e) => cb(e.payload));
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

/** A page asked to open a link in a new tab (target=_blank, window.open, "Open Link in New Tab"). */
export async function onOpenUrl(cb: (e: { url: string }) => void): Promise<UnlistenFn> {
  return listen<{ url: string }>("qp://open-url", (e) => cb(e.payload));
}

export async function onUpdate(cb: (info: UpdateInfo) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<UpdateInfo>("qp://update", (e) => cb(e.payload));
}

/** Backend half of the agent's reply: executed exactly as given. `cell` is a grid label such as "M7". */
export interface ScreenAction {
  type: "click" | "double_click" | "right_click" | "drag" | "type" | "key" | "scroll" | "open_app" | "wait" | "ask" | "done";
  cell?: string;
  to_cell?: string;
  /** Where to act, as [y, x] integers 0..1000 across the screen (y first). */
  point?: number[];
  to_point?: number[];
  app?: string;
  fx?: number;
  fy?: number;
  text?: string;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  category?: string; // id of one of the site's permissions, or "none"
  ax?: number; // exact point (fraction of the screen) found by the zoomed second look; sent back unchanged
  ay?: number;
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
  /** The app in front when the screenshot was taken (macOS and Windows), for the per-app permission. */
  app?: string;
  /** Watch mode only: the JPEG (base64) the model looked at. Kept in memory, never saved. */
  shot?: string;
}

export interface FileFolder { path: string; files: number; indexed_at: number | null; skipped: number }
export interface FileHit { path: string; name: string; snippet: string }
export interface TimelineEvent { at: number; kind: "page" | "task" | "download" | "chat" | "change"; title: string; detail: string; site?: string; count?: number }
export interface DiskItem { path: string; size: number; note: string }
export interface DiskReport { total: number; partial: boolean; scanned: number; folders: { path: string; size: number }[]; groups: { id: string; title: string; count: number; bytes: number; top: DiskItem[] }[] }
export interface ForgottenApp { name: string; path: string; lastUsed: number | null; size: number | null; leftovers: number; leftoverBytes: number }
export interface RenameCandidates { folder: string; files: { path: string; name: string; mode: "picture" | "text"; size: number | null }[]; provider: string; model: string }
export interface AppLoad { name: string; cpu: number; mem: number; processes: number; app: boolean; why?: string; canQuit?: boolean }
export interface SlowReport { cpus: number; load: number | null; memUsed: number; memTotal: number; groups: AppLoad[]; culprits: AppLoad[]; note: string }
export interface LoginItem { kind: "login_item" | "launch_agent" | "run_key"; name: string; path: string | null; note: string }

/** One change in the "Recent changes" list. */
export interface ActionEntry { id: number; task: string; task_title: string; kind: string; what: string; src: string | null; dst: string | null; at: number; undone: boolean; can_undo: boolean }
/** A dry-run list waiting for the person's OK. Items with a problem are shown but can't be ticked. */
export interface TaskItem { i: number; kind: string; path?: string; to?: string; size: number | null; note: string; label: string; what: string; problem: string | null }
export interface TaskView { id: string; title: string; items: TaskItem[]; ready: number; bytes: number }
export interface Receipt { id: string; title: string; at: number; done: { what: string; undoable: boolean }[]; failed: { what: string; error: string }[]; bytes: number; skipped: number }

export interface VaultEntry {
  id: number;
  host: string;
  username: string;
  created_at: number;
}

/** A login form was submitted in a tab. The password stays in the browser until the person agrees to save it. */
export async function onLoginSeen(cb: (e: { id: string; host: string; username: string }) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  const label = windowLabel();
  return listen<{ window: string; id: string; host: string; username: string }>("qp://login-seen", (e) => e.payload.window === label && cb(e.payload));
}

export interface ImportScan { browser: "chrome" | "safari"; history: number | null; bookmarks: number | null; tabs: number; extensions: { id: string; name: string }[]; problem: string }

export interface DownloadItem {
  id: number;
  name: string;
  url: string;
  host: string;
  path: string;
  state: "active" | "done" | "failed";
  started: number;
  finished: number | null;
  size: number | null;
  can_open: boolean;
  can_undo?: boolean;
  generic?: boolean;
}

export interface Project { id: number; name: string; notes: string; created: number; last_used: number; bytes: number; chats?: number; last_chat?: number | null }
export interface ChatSummary { id: number; title: string; project_id: number | null; created: number; last_used: number; messages: number; bytes: number; summarized?: number }
export interface StaleRow { id: number; title: string; last_used: number; bytes: number; messages?: number; summarized?: boolean }
export interface StaleReport { days: number; chats: StaleRow[]; projects: StaleRow[] }
export interface ContextUsage { chats: number; messages: number; projects: number; bytes: number }

export interface TaskRow { id: string; title: string; url: string; mb: number; cpu: number; shared: boolean; live: boolean; suspended: boolean; pinned: boolean; active: boolean; audible: boolean }
export interface TaskReport { rows: TaskRow[]; total_mb: number; tabs_mb: number; other_mb: number; processes: number; suspended: number }

export interface UsageToday { date: string; calls: number; limit: number; level: "ok" | "near" | "over" }

export interface ScreenStatus {
  phase: "looking" | "thinking" | "acting" | "waiting" | "paused" | "done" | "error" | "idle";
  thinking?: string;
  next?: string;
  step?: number;
  max?: number;
}

/** The global shortcut (⌘⇧Space) asked for the assistant. */
export async function onAssistantHotkey(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<unknown>("qp://assistant", () => cb());
}

/** Pause/Resume was pressed on the status bar, or its hotkey (Cmd/Ctrl+Alt+P). */
export async function onScreenPause(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<unknown>("qp://screen-pause", () => cb());
}

/** The status bar's Stop button was pressed. */
export async function onScreenStop(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<unknown>("qp://screen-stop", () => cb());
}

export async function onDownloads(cb: (items: DownloadItem[]) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<DownloadItem[]>("qp://downloads", (e) => cb(e.payload));
}

export interface Place {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}
export interface Weather {
  temp: number;
  feels: number;
  code: number;
  is_day: boolean;
  high: number;
  low: number;
  rain_chance: number | null;
  wind: number;
}
export interface Headline {
  title: string;
  url: string;
}
