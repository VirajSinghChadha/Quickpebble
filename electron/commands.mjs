// Every command the UI can invoke (same names and shapes as the old Tauri commands).
import { app, dialog, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ai from "./ai.mjs";
import * as home from "./home.mjs";
import { ftsQuery } from "./recall.mjs";
import { PERMISSIONS, POLICIES, SEARCH_ENGINES, parseUrl } from "./security.mjs";
import { stats as blockStats, pageTrackers } from "./adblock.mjs";
import { parseChromeJson, parseNetscapeHtml } from "./bookmarks.mjs";
import * as importer from "./importer.mjs";
import { buildBrief } from "./morning.mjs";
import { usageSummary } from "./usage.mjs";
import { buildReport } from "./diagnostics.mjs";

const SETTING_KEYS = new Set(["account_session", "recall_enabled", "screen_precision", "home_weather", "home_weather_place", "home_weather_unit", "home_news", "home_news_source", "home_tiles", "home_cards", "home_onboarded", "cookie_banners", "chrome_ua", "block_level", "site_profiles", "screen_permissions", "screen_model", "https_only", "auto_update_check", "theme", "newtab_layout", "search_engine", "block_trackers", "ai_provider", "ai_model", "ollama_url", "profiles", "proxy_mode", "proxy_server", "ghost_searx_url", "active_project", "active_chat", "ctx_stale_days", "screen_plan", "usage_limit", "tour_seen", "downloads_sort", "search_lang", "link_preview", "timeline_enabled", "protected_folders", "screen_app_permissions", "screen_watch", "app_activity", "price_country", "price_shops", "agent_allowed_sites", "morning_brief", "morning_countries", "morning_last", "open_at_login", "ep_notes"]);
/** {"Notes": "allow", "Mail": "deny", …}: plain app names only, two possible answers. */
export function validAppPerms(json) {
  try {
    const o = JSON.parse(json);
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    const entries = Object.entries(o);
    return entries.length <= 500 && entries.every(([k, v]) => /^[\p{L}\p{N}][\p{L}\p{N} .&+()'_-]{0,79}$/u.test(k) && (v === "allow" || v === "deny"));
  } catch { return false; }
}
const unsupported = (what) => () => { throw new Error(`${what} isn't available in the Chromium build yet.`); };

export function buildCommands({ browser, db, downloads, extras = {} }) {
  const B = browser;
  const jsonOk = (v) => { try { JSON.parse(v); return true; } catch { return false; } };

  const commands = {
    // ---- tabs
    tab_create: (w, { id, pinned }) => B.createTab(w, id, !!pinned),
    tab_activate: (w, { id }) => B.activateTab(w, id),
    tab_close: (w, { id }) => B.closeTab(w, id),
    tab_navigate: (w, { id, input, allowHttp }) => B.navigate(w, id, input, !!allowHttp),
    tab_nav: (w, { id, action }) => B.nav(w, id, action),
    tab_set_pinned: (w, { id, pinned }) => { B.tab(w, id).pinned = !!pinned; },
    tab_set_muted: (w, { id, muted }) => B.setMuted(w, id, muted),
    content_visible: (w, { visible }) => { w.hidden = !visible; B.syncVisibility(w); },
    tab_zoom: (w, { id, action }) => { try { return B.zoom(w, id, action); } catch { return null; } },
    tab_find: (w, { id }) => { B.run(w, id, "window.__qpFind && window.__qpFind()"); },
    tab_reader: (w, { id }) => { B.run(w, id, "window.__qpReader && window.__qpReader()"); },
    agent_exec: (w, { tabId, op, args }) => {
      if (!["snapshot", "click", "type", "select", "scroll", "press", "collect_text", "apply_text", "restore_text", "page_facts"].includes(op)) throw new Error("unknown agent operation");
      return B.agentExec(w, tabId, op, args);
    },
    page_trackers: (w, { id }) => {
      const t = B.tab(w, id);
      const wc = t.view?.webContents;
      let top = "";
      try { top = new URL(t.url).hostname.toLowerCase(); } catch { /* no page */ }
      return wc && top ? pageTrackers(wc.id, top) : [];
    },
    sidebar_set: (w, { width }) => { w.sidebar = Number.isFinite(width) ? Math.min(640, Math.max(0, width)) : 0; B.relayout(w); },
    chrome_set: (w, { height }) => { w.chrome = Number.isFinite(height) ? Math.min(200, Math.max(92, height)) : 92; B.relayout(w); },

    // ---- history / bookmarks / settings
    history_search: (_w, { query, limit }) => db.searchHistory(query ?? "", Math.min(200, limit ?? 50)),
    history_clear: () => db.clearHistory(),
    bookmark_toggle: (_w, { url, title }) => {
      const u = parseUrl(url);
      if (!u || !/^https?:$/.test(u.protocol)) throw new Error("only web pages can be bookmarked");
      return db.toggleBookmark(url, title ?? "");
    },
    bookmark_list: (_w, { query }) => db.bookmarks(query ?? "", 200),
    bookmark_set_folder: (_w, { url, folder }) => db.setBookmarkFolder(url, String(folder).trim().slice(0, 80)),
    bookmarks_import_chrome: () => {
      const dir = { darwin: path.join(os.homedir(), "Library/Application Support/Google/Chrome/Default"), win32: path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/User Data/Default") }[process.platform] ?? path.join(os.homedir(), ".config/google-chrome/Default");
      const file = path.join(dir, "Bookmarks");
      if (!fs.existsSync(file)) throw new Error("Chrome's bookmarks were not found on this computer.");
      return db.importBookmarks(parseChromeJson(fs.readFileSync(file, "utf8")).slice(0, 5000));
    },
    // Import from Chrome / Safari. Scan counts what is there; run brings the chosen kinds in.
    import_scan: async (_w, { browser }) => {
      const b = browser === "safari" ? "safari" : "chrome";
      const res = { browser: b, history: null, bookmarks: null, tabs: await importer.openTabs(b).then((t) => t.length), extensions: b === "chrome" ? importer.chromeExtensions() : [], problem: "" };
      try { res.history = importer.history(b).length; } catch (e) { res.problem = importer.explain(b, e); }
      try { res.bookmarks = (b === "chrome" ? importer.chromeBookmarks() : await importer.safariBookmarks()).length; } catch (e) { res.problem ||= importer.explain(b, e); }
      return res;
    },
    import_run: async (_w, { browser, history, bookmarks, tabs }) => {
      const b = browser === "safari" ? "safari" : "chrome";
      const out = { history: 0, bookmarks: 0, tabs: [] };
      if (history) out.history = db.importHistory(importer.history(b));
      if (bookmarks) out.bookmarks = db.importBookmarks(b === "chrome" ? importer.chromeBookmarks() : await importer.safariBookmarks());
      if (tabs) out.tabs = await importer.openTabs(b);
      return out;
    },
    bookmarks_import_file: async (w) => {
      const r = await dialog.showOpenDialog(w.win, { filters: [{ name: "Bookmarks", extensions: ["html", "htm"] }], properties: ["openFile"] });
      if (r.canceled || !r.filePaths[0]) return null;
      const f = r.filePaths[0];
      if (fs.statSync(f).size > 20_000_000) throw new Error("That file is too large to be a bookmarks export.");
      const items = parseNetscapeHtml(fs.readFileSync(f, "utf8"));
      if (!items.length) throw new Error("No bookmarks found in that file.");
      return db.importBookmarks(items.slice(0, 5000));
    },
    suggest: (_w, { query }) => {
      const q = String(query ?? "").trim();
      if (!q) return [];
      const out = db.bookmarks(q, 3).map((b) => ({ kind: "bookmark", title: b.title, url: b.url }));
      const seen = new Set(out.map((s) => s.url));
      out.push(...db.searchHistory(q, 6).filter((h) => !seen.has(h.url)).slice(0, 5).map((h) => ({ kind: "history", title: h.title, url: h.url })));
      return out;
    },
    settings_get: () => Object.fromEntries([...SETTING_KEYS].flatMap((k) => { const v = db.getSetting(k); return v == null ? [] : [[k, v]]; })),
    settings_set: (_w, { key, value }) => {
      if (!SETTING_KEYS.has(key)) throw new Error(`unknown setting: ${key}`);
      value = String(value);
      if (key === "search_engine" && !SEARCH_ENGINES[value]) throw new Error("unknown search engine");
      if (key === "usage_limit" && !(Number(value) >= 10 && Number(value) <= 100000)) throw new Error("The daily limit must be between 10 and 100000");
      if (key === "screen_plan" && !["big", "always", "never"].includes(value)) throw new Error("unknown plan setting");
      if (key === "screen_precision" && !["standard", "high"].includes(value)) throw new Error("unknown precision");
      if (key === "home_weather_place" && (value.length > 512 || (value && !jsonOk(value)))) throw new Error("invalid place");
      if (key === "home_news_source" && !home.NEWS_SOURCES[value]) throw new Error("unknown news source");
      if (key.startsWith("home_") && key !== "home_weather_place" && value.length > 64) throw new Error("value too long");
      if (key === "account_session" && value && (value.length > 16384 || !jsonOk(value))) throw new Error("invalid account session");
      if (["site_profiles", "screen_permissions", "profiles"].includes(key) && (value.length > 65536 || !jsonOk(value))) throw new Error(`invalid ${key}`);
      if (key === "ghost_searx_url" && value && !/^https?:$/.test(parseUrl(value)?.protocol ?? "")) throw new Error("The SearXNG address must start with http:// or https://");
      if ((key === "screen_watch" || key === "app_activity" || key === "timeline_enabled") && !["0", "1"].includes(value)) throw new Error(`${key} is 0 or 1`);
      if (key === "protected_folders" && (value.length > 65536 || !jsonOk(value) || !Array.isArray(JSON.parse(value)))) throw new Error("invalid protected folders");
      if (key === "screen_app_permissions" && (value.length > 65536 || !validAppPerms(value))) throw new Error("invalid app permissions");
      if (key === "agent_allowed_sites" && (value.length > 20000 || !jsonOk(value) || !Array.isArray(JSON.parse(value)))) throw new Error("invalid site list");
      if (key === "ep_notes" && value.length > 4000) throw new Error("Those notes are too long (4000 characters at most).");
      if (key === "price_country" && !/^[A-Z]{2}$/.test(value)) throw new Error("A country is a two-letter code like AE");
      if (key === "price_shops" && (value.length > 65536 || !jsonOk(value))) throw new Error("invalid shop list");
      if (key === "ollama_url" && !/^https?:$/.test(parseUrl(value)?.protocol ?? "")) throw new Error("Ollama URL must be http(s)");
      db.setSetting(key, value);
      if (key === "proxy_mode" || key === "proxy_server") extras.applyProxy?.();
    },

    // ---- memory saver
    memory_saver_get: () => B.memory,
    task_manager: (w) => B.taskManager(w),
    tab_scroll_to: (w, { id, y }) => { const t = B.tab(w, id); t.restoreScrollY = Number.isFinite(y) ? Math.max(0, Math.min(1e7, Math.round(y))) : 0; },
    hover_show: async (w, { id, x, y, width, height, dark }) => {
      const t = B.tab(w, id);
      const host = (() => { try { return new URL(t.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
      const num = (n) => (Number.isFinite(n) ? Number(n) : 0);
      B.hoverCard.show(w, { title: t.title, host, thumb: await B.thumbOf(w, id), dark: !!dark, anchor: { x: num(x), y: num(y), width: num(width), height: num(height) } });
    },
    hover_hide: (w) => B.hoverCard.hide(w),
    tab_suspend: (w, { id }) => B.suspendTab(w, id),
    memory_saver_set: (_w, { config }) => { db.setSetting("memory_saver", JSON.stringify(config)); B.memory = { ...B.memory, ...config }; },
    memory_stats: () => B.memoryStats(),

    // ---- AI
    ai_status: () => ai.status(ai.aiConfig(db)),
    usage_today: () => usageSummary(),
    // The exact text a problem report would carry, so the person can read it before choosing to send it.
    report_preview: (_w, { includeLog }) => {
      const settings = Object.fromEntries(["theme", "newtab_layout", "screen_precision", "screen_plan", "ai_provider", "ai_model", "block_level", "search_engine"].flatMap((k) => { const v = db.getSetting(k); return v == null ? [] : [[k, v]]; }));
      return { text: buildReport({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, settings, includeLog: !!includeLog }), version: app.getVersion(), platform: `${process.platform}-${process.arch}` };
    },
    ai_run: async (w, { req }) => {
      const cfg = ai.aiConfig(db);
      if (req.task === "complete") {
        const prefix = String(req.prefix ?? "");
        return prefix.trim().length < 3 ? null : ai.complete(cfg, prefix.slice(0, 200));
      }
      const t = B.tab(w, req.tab_id);
      if (req.task === "summarize") return ai.summarize(cfg, t.title, t.url, t.text);
      if (req.task === "classify") return ai.classify(cfg, t.title, t.url, t.text, req.groups?.length ? req.groups : ["School", "Work", "Personal"]);
      throw new Error(`unknown task: ${req.task}`);
    },
    ai_set_key: (_w, { provider, key }) => ai.setKey(provider, key),
    ai_chat: (_w, { req }) => {
      if (req.messages.length > 60 || req.system.length > 120000 || req.messages.some((m) => m.content.length > 60000)) throw new Error("Conversation is too large");
      return ai.chat(ai.aiConfig(db), req.system, req.messages, !!req.json);
    },
    gemini_models: () => ai.geminiModels(),
    research_status: () => home.researchStatus(),
    research_key_set: (_w, { key }) => home.researchKeySet(key),
    research_search: (_w, { query }) => home.researchSearch(query),
    weather_search: (_w, { query }) => home.weatherSearch(query),
    weather_fetch: (_w, { lat, lon, fahrenheit }) => home.weatherFetch(lat, lon, !!fahrenheit),
    news_fetch: (_w, { source, count }) => home.newsFetch(source, count),

    // ---- Recall
    recall_search: (_w, { query, limit }) => { const e = ftsQuery(query ?? ""); return e ? db.recallSearch(e, Math.min(20, Math.max(1, limit ?? 6))) : []; },
    recall_stats: () => ({ pages: db.recallCount(), enabled: db.getSetting("recall_enabled") === "true" }),
    recall_forget: (_w, { url }) => db.recallForget(url),
    recall_clear: () => db.recallClear(),

    // ---- privacy
    privacy_stats: () => ({ blocked_total: blockStats.blocked, block_trackers: db.getSetting("block_trackers") !== "false", filter_lists: !!extras.filters?.ready }),
    privacy_permissions: () => db.permissions(),
    privacy_set_permission: (_w, { host, permission, policy }) => {
      if (!PERMISSIONS.includes(permission) || !POLICIES.includes(policy)) throw new Error("invalid permission or policy");
      host = String(host).trim().toLowerCase();
      if (!host || host.length > 253 || /[^a-z0-9.-]/.test(host)) throw new Error("invalid host");
      db.setPermission(host, permission, policy);
    },
    privacy_clear_data: async (w, { history, siteData }) => {
      if (history) db.clearHistory();
      if (siteData) await B.clearSiteData(w);
    },
    qp_blocked: () => {},

    // ---- windows
    window_new_private: () => { B.openWindow({ privateWindow: true }); },
    window_new_profile: (_w, { id }) => {
      const list = JSON.parse(db.getSetting("profiles") ?? "[]");
      if (!list.some((p) => p.id === id)) throw new Error("unknown profile");
      B.openWindow({ profile: id, label: `profile-${id}-${++B.windowCounter}` });
    },
    profile_list: () => JSON.parse(db.getSetting("profiles") ?? "[]"),
    profile_create: (_w, { name, color }) => {
      const list = JSON.parse(db.getSetting("profiles") ?? "[]");
      const clean = String(name).trim().slice(0, 40);
      if (!clean) throw new Error("Give the profile a name.");
      if (list.length >= 12) throw new Error("That's the maximum number of profiles.");
      const id = `${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile"}-${Date.now().toString(36)}`;
      const p = { id, name: clean, color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#2563eb" };
      list.push(p);
      db.setSetting("profiles", JSON.stringify(list));
      return p;
    },
    profile_delete: (_w, { id }) => {
      db.setSetting("profiles", JSON.stringify(JSON.parse(db.getSetting("profiles") ?? "[]").filter((p) => p.id !== id)));
      extras.deleteProfileData?.(id);
    },
    profile_current: (w) => ({ id: w.profile, private: w.private }),
    window_control: (w, { action }) => {
      const win = w.win;
      switch (action) {
        case "minimize": return win.minimize();
        case "maximize": return win.isMaximized() ? win.unmaximize() : win.maximize();
        case "close": return win.close();
        case "restore": if (win.isMinimized()) { win.restore(); win.show(); win.focus(); } return;
        default: throw new Error("unknown action");
      }
    },

    // ---- downloads
    downloads_list: () => downloads.snapshot(),
    download_open: (_w, { id }) => downloads.open(id),
    download_reveal: (_w, { id }) => downloads.reveal(id),
    download_undo_move: (_w, { id }) => downloads.undoMove(id),
    download_rename: (_w, { id, name }) => downloads.rename(id, name),
    download_suggest_apply: (_w, { id, reply }) => downloads.applySuggestion(id, reply),
    morning_preview: () => buildBrief(db),
    login_item_set: (_w, { on }) => {
      if (!app.isPackaged) throw new Error("Open at login only works in the installed app.");
      app.setLoginItemSettings({ openAtLogin: !!on });
      db.setSetting("open_at_login", on ? "1" : "0");
    },
    download_remove: (_w, { id }) => downloads.remove(id),
    downloads_clear_finished: () => downloads.clearFinished(),

    // ---- updates (the Chromium build ships updates through its installer for now)
    update_check: () => extras.updater.check({ userInitiated: true }),
    update_install: (w) => extras.updater.install((p) => B.emitUi(w, "qp://update-progress", p)),
    update_skip: () => extras.updater.skip(),

    // ---- not yet ported
    ...(extras.context ?? {}),
    ...(extras.safety ?? {}),
    ...(extras.screen ?? { screen_propose: unsupported("Screen control"), screen_act: unsupported("Screen control"), screen_verify: unsupported("Screen control"), screen_overlay: unsupported("Screen control") }),
    extension_list: () => extras.extensions?.list() ?? [],
    extension_install_store: (_w, { input }) => extras.extensions ? extras.extensions.installStore(input) : unsupported("Extensions")(),
    extension_install_file: (w) => extras.extensions ? extras.extensions.installFile(w) : unsupported("Extensions")(),
    extension_set_enabled: (_w, { id, enabled }) => extras.extensions?.setEnabled(id, enabled),
    extension_remove: (_w, { id }) => extras.extensions?.remove(id),
    ...(extras.vault ?? {
      vault_status: () => ({ exists: false, unlocked: false }),
      vault_create: unsupported("The password manager"), vault_unlock: unsupported("The password manager"), vault_lock: () => {},
      vault_list: () => [], vault_reveal: unsupported("The password manager"), vault_save: unsupported("The password manager"),
      vault_import_file: () => null, vault_delete: () => {}, vault_fill: () => {}, vault_save_pending: unsupported("The password manager"), vault_dismiss_pending: () => {},
    }),
  };
  return commands;
}
