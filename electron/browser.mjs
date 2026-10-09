// Windows, tabs, layout, sessions (port of browser.rs). Every tab is a real Chromium WebContentsView.
import { app, BaseWindow, WebContentsView, Menu, dialog, session, shell, clipboard } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { allowNavigation, httpsUpgrade, normalizeInput, parseUrl } from "./security.mjs";
import { installBlocker } from "./adblock.mjs";
import { remember } from "./recall.mjs";
import { shouldSuspend, defaultMemoryConfig } from "./memory-saver.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CHROME_HEIGHT = 92;
const MAX_TEXT = 20000;
const INJECT = fs.readFileSync(path.join(here, "inject.js"), "utf8");
const isMac = process.platform === "darwin";

export const SHORTCUTS = new Set(["new-tab", "close-tab", "focus-address", "reload", "bookmark", "back", "forward", "palette", "tab-search", "private", "assistant", "find", "zoom-in", "zoom-out", "zoom-reset", "reopen-tab", "library", "reader", "bookmarks-bar"]);
const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** A real-Chrome user agent: Electron's default carries "Electron/x" and the app's own name/version, which Google and others treat as an embedded browser. */
export const chromeUserAgent = () => app.userAgentFallback.replace(/\s+(Electron|[A-Za-z][\w.-]*)\/(\d[\w.]*)/g, (m, name) => (name === "Mozilla" || name === "AppleWebKit" || name === "Chrome" || name === "Safari" ? m : ""));

export class Browser {
  constructor(db, { appUrl, devtools = false }) {
    this.db = db;
    this.appUrl = appUrl;
    this.devtools = devtools;
    this.windows = new Map(); // label -> window state
    this.byContents = new Map(); // webContents.id -> { win, tab }
    this.uiByContents = new Map(); // ui webContents.id -> window state
    this.sessions = new Set();
    this.privateCounter = 0;
    this.windowCounter = 0;
    this.httpAllowed = new Set();
    this.upgradeAttempts = new Map();
    this.closed = []; // not used by the backend; reopen-tab is handled by the UI
    this.memory = this.loadMemoryConfig();
    this.onDownload = null;
    this.permissionAsk = new Map();
    setInterval(() => this.memorySweep(), 30000).unref?.();
  }

  setting(key) { return this.db.getSetting(key); }
  loadMemoryConfig() {
    try { return { ...defaultMemoryConfig, ...JSON.parse(this.setting("memory_saver") ?? "{}") }; } catch { return { ...defaultMemoryConfig }; }
  }

  // ---------------------------------------------------------------- sessions
  partitionFor(win) {
    if (win.private) return `private-${win.label}`;
    return `persist:profile-${win.profile}`;
  }
  sessionFor(win) {
    const ses = session.fromPartition(this.partitionFor(win));
    if (!this.sessions.has(ses)) { this.sessions.add(ses); this.prepareSession(ses); }
    return ses;
  }
  prepareSession(ses) {
    ses.setUserAgent(chromeUserAgent());
    if (this.ghost) ses.protocol.handle("ghost", this.ghost);
    this.onSession?.(ses);
    installBlocker(ses, (wc) => {
      const e = this.byContents.get(wc.id);
      if (!e) return null;
      let host = ""; try { host = new URL(wc.getURL()).hostname.replace(/^www\./, ""); } catch { /* blank */ }
      const profile = this.siteProfile(host);
      const enabled = profile.trackers ?? this.setting("block_trackers") !== "false";
      return { enabled, strict: this.setting("block_level") === "strict" };
    }, () => this.extraBlock?.());
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      const host = (() => { try { return new URL(details.requestingUrl || wc.getURL()).hostname; } catch { return ""; } })();
      const kind = { media: details.mediaTypes?.includes("video") ? "camera" : "microphone", geolocation: "location", notifications: "notifications" }[permission];
      const SAFE = new Set(["clipboard-sanitized-write", "fullscreen", "pointerLock", "window-management", "keyboardLock", "speaker-selection", "display-capture"]);
      if (!kind) return callback(SAFE.has(permission));
      const rule = this.db.permissionsFor(host).find((p) => p.permission === kind)?.policy;
      if (rule === "allow") return callback(true);
      if (rule === "block") return callback(false);
      const win = this.byContents.get(wc.id)?.win;
      if (!win || win.private) return callback(false);
      const key = `${host}|${kind}`;
      if (this.permissionAsk.has(key)) return this.permissionAsk.get(key).then(callback);
      const p = dialog.showMessageBox(win.win, { type: "question", buttons: ["Allow", "Block"], defaultId: 1, cancelId: 1, message: `${host} wants to use your ${kind}`, detail: "You can change this any time in the Privacy Center.", checkboxLabel: "Remember my choice for this site" })
        .then((r) => { if (r.checkboxChecked) this.db.setPermission(host, kind, r.response === 0 ? "allow" : "block"); return r.response === 0; })
        .finally(() => this.permissionAsk.delete(key));
      this.permissionAsk.set(key, p);
      p.then(callback);
    });
    ses.setPermissionCheckHandler((wc, permission, origin) => {
      const kind = { media: "camera", geolocation: "location", notifications: "notifications" }[permission];
      if (!kind) return true;
      try { return this.db.permissionsFor(new URL(origin).hostname).find((p) => p.permission === kind)?.policy === "allow"; } catch { return false; }
    });
    ses.on("will-download", (e, item, wc) => this.onDownload?.(e, item, wc));
  }

  siteProfile(host) {
    host = host.replace(/^www\./, "");
    try {
      const p = JSON.parse(this.setting("site_profiles") ?? "{}")[host] ?? {};
      return { zoom: Number.isFinite(p.zoom) ? Math.round(Math.min(3, Math.max(0.3, p.zoom)) * 100) / 100 : undefined, trackers: typeof p.trackers === "boolean" ? p.trackers : undefined, muted: typeof p.muted === "boolean" ? p.muted : undefined };
    } catch { return {}; }
  }

  // ---------------------------------------------------------------- windows
  openWindow({ label, profile = "default", privateWindow = false } = {}) {
    label ??= privateWindow ? `private-${++this.privateCounter}` : this.windows.size === 0 && !this.windows.has("main") ? "main" : `win-${++this.windowCounter}`;
    const win = new BaseWindow({
      width: 1280, height: 820, minWidth: 760, minHeight: 480, show: false,
      title: "Quick Pebble", backgroundColor: "#00000000",
      ...(isMac ? { titleBarStyle: "hidden", trafficLightPosition: { x: 14, y: 13 } } : { frame: false }),
    });
    const ui = new WebContentsView({ webPreferences: { preload: path.join(here, "preload-ui.cjs"), additionalArguments: [`--qp-window=${label}`], contextIsolation: true, sandbox: true, nodeIntegration: false, devTools: this.devtools } });
    const state = { label, win, ui, profile, private: privateWindow, tabs: new Map(), active: null, hidden: false, sidebar: 0, chrome: CHROME_HEIGHT };
    this.windows.set(label, state);
    this.uiByContents.set(ui.webContents.id, state);
    win.contentView.addChildView(ui);
    const layout = () => this.relayout(state);
    win.on("resize", layout);
    win.on("closed", () => {
      for (const t of state.tabs.values()) this.destroyView(state, t);
      this.windows.delete(label);
      this.uiByContents.delete(ui.webContents.id);
    });
    ui.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
    ui.webContents.on("will-navigate", (e, url) => { if (url !== ui.webContents.getURL() && !url.startsWith(this.appUrl)) e.preventDefault(); });
    ui.webContents.loadURL(`${this.appUrl}${this.appUrl.includes("?") ? "&" : "?"}w=${encodeURIComponent(label)}`);
    layout();
    win.show();
    return state;
  }

  windowOf(wcId) { return this.uiByContents.get(wcId) ?? this.byContents.get(wcId)?.win; }

  relayout(win) {
    if (win.win.isDestroyed()) return;
    const b = win.win.getContentBounds();
    win.ui.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
    for (const t of win.tabs.values()) if (t.view) t.view.setBounds(this.contentRect(win));
  }
  contentRect(win) {
    const b = win.win.getContentBounds();
    return { x: 0, y: win.chrome, width: Math.max(1, b.width - win.sidebar), height: Math.max(1, b.height - win.chrome) };
  }
  syncVisibility(win) {
    for (const t of win.tabs.values()) if (t.view) t.view.setVisible(!win.hidden && win.active === t.id);
  }
  emitUi(win, channel, payload) {
    if (!win.ui.webContents.isDestroyed()) win.ui.webContents.send(channel, payload);
  }
  emitTab(win, t) {
    this.emitUi(win, "qp://tab", { window: win.label, id: t.id, url: t.url, title: t.title, favicon: t.favicon, audible: t.audible, recording: t.recording, loading: t.loading, suspended: t.suspended, muted: t.muted });
  }

  // ---------------------------------------------------------------- tabs
  tab(win, id) {
    const t = win.tabs.get(id);
    if (!t) throw new Error("unknown tab");
    return t;
  }
  createTab(win, id, pinned = false) {
    if (!validId(id)) throw new Error("invalid tab id");
    win.tabs.set(id, { id, view: null, url: "", title: "", favicon: "", pinned, audible: false, recording: false, downloading: false, suspended: false, muted: false, loading: false, lastActive: Date.now(), text: "", zoom: 1 });
  }
  closeTab(win, id) {
    const t = win.tabs.get(id);
    if (!t) return;
    win.tabs.delete(id);
    if (win.active === id) win.active = null;
    this.destroyView(win, t);
  }
  destroyView(win, t) {
    if (!t.view) return;
    const wc = t.view.webContents;
    this.byContents.delete(wc.id);
    try { win.win.contentView.removeChildView(t.view); } catch { /* window gone */ }
    if (!wc.isDestroyed()) wc.close();
    t.view = null;
  }
  activateTab(win, id) {
    const t = this.tab(win, id);
    t.lastActive = Date.now();
    win.active = id;
    this.ensureLive(win, t);
    this.syncVisibility(win);
    this.emitTab(win, t);
  }
  ensureLive(win, t) {
    if (t.view || !t.url) return;
    t.suspended = false;
    this.buildView(win, t, t.url);
  }

  buildView(win, t, url) {
    const view = new WebContentsView({ webPreferences: { session: this.sessionFor(win), preload: path.join(here, "preload-page.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: true } });
    t.view = view;
    const wc = view.webContents;
    this.byContents.set(wc.id, { win, tab: t });
    win.win.contentView.addChildView(view);
    view.setBounds(this.contentRect(win));
    view.setVisible(!win.hidden && win.active === t.id);
    this.wire(win, t, wc);
    wc.loadURL(url).catch(() => {});
    return view;
  }

  wire(win, t, wc) {
    const emit = () => this.emitTab(win, t);
    wc.setWindowOpenHandler(({ url }) => {
      if (allowNavigation(url, false)) this.emitUi(win, "qp://open-url", { url });
      return { action: "deny" };
    });
    const guard = (e, url) => {
      const u = parseUrl(url);
      if (!u || !allowNavigation(u, this.setting("block_trackers") !== "false")) return e.preventDefault();
      if (u.protocol === "http:" && this.httpsOnlyApplies(u)) { e.preventDefault(); this.startHttpsUpgrade(win, t, u); }
    };
    wc.on("will-navigate", guard);
    wc.on("will-redirect", guard);
    wc.on("did-start-loading", () => { t.loading = true; emit(); });
    wc.on("did-stop-loading", () => {
      t.loading = false;
      try {
        const host = new URL(wc.getURL()).hostname;
        const p = this.siteProfile(host);
        if (p.zoom) { t.zoom = p.zoom; wc.setZoomFactor(p.zoom); }
        if (p.muted !== undefined) { t.muted = p.muted; wc.setAudioMuted(p.muted); }
      } catch { /* blank page */ }
      emit();
    });
    wc.on("did-navigate", (_e, url) => { t.url = url; emit(); });
    wc.on("did-navigate-in-page", (_e, url, isMain) => { if (isMain) { t.url = url; emit(); } });
    wc.on("page-title-updated", (_e, title) => { t.title = title.slice(0, 300); emit(); });
    wc.on("page-favicon-updated", (_e, favs) => { if (favs[0]) { t.favicon = favs[0].slice(0, 2048); emit(); } });
    wc.on("audio-state-changed", (e) => { t.audible = e.audible; emit(); });
    wc.on("render-process-gone", () => { t.loading = false; emit(); });
    wc.on("context-menu", (_e, p) => this.contextMenu(win, t, wc, p));
    wc.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown" || !(isMac ? input.meta : input.control) || input.alt) return;
      const k = input.key.toLowerCase();
      const combos = { t: ["new-tab", "reopen-tab"], w: ["close-tab"], l: ["focus-address"], r: ["reload", "reader"], d: ["bookmark"], "[": ["back"], "]": ["forward"], p: [null, "palette"], a: [null, "tab-search"], n: [null, "private"], j: ["assistant"], f: ["find"], y: ["library"], b: [null, "bookmarks-bar"], "=": ["zoom-in"], "+": [null, "zoom-in"], "-": ["zoom-out"], "0": ["zoom-reset"] };
      const hit = combos[k]?.[input.shift ? 1 : 0];
      if (!hit) return;
      event.preventDefault();
      this.emitUi(win, "qp://shortcut", { window: win.label, action: hit });
    });
    if (t.zoom !== 1) wc.once("did-finish-load", () => wc.setZoomFactor(t.zoom));
  }

  contextMenu(win, t, wc, p) {
    const items = [];
    if (p.linkURL) items.push({ label: "Open Link in New Tab", click: () => this.emitUi(win, "qp://open-url", { url: p.linkURL }) }, { label: "Copy Link Address", click: () => clipboard.writeText(p.linkURL) }, { type: "separator" });
    if (p.srcURL && p.mediaType === "image") items.push({ label: "Open Image in New Tab", click: () => this.emitUi(win, "qp://open-url", { url: p.srcURL }) }, { label: "Copy Image", click: () => wc.copyImageAt(p.x, p.y) }, { type: "separator" });
    if (p.selectionText) items.push({ role: "copy" }, { label: `Search for “${p.selectionText.slice(0, 30)}”`, click: () => this.emitUi(win, "qp://open-url", { url: p.selectionText }) }, { type: "separator" });
    if (p.isEditable) items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }, { type: "separator" });
    items.push({ label: "Back", enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: "Forward", enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() }, { label: "Reload", click: () => wc.reload() });
    if (this.devtools) items.push({ type: "separator" }, { label: "Inspect", click: () => wc.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup({ window: win.win });
  }

  // ---------------------------------------------------------------- navigation
  navigate(win, id, input, allowHttp = false) {
    const t = this.tab(win, id);
    const url = normalizeInput(input, this.setting("search_engine") || "ghostsearch");
    if (!url) throw new Error("empty address");
    if (!allowNavigation(url, this.setting("block_trackers") !== "false")) throw new Error("Blocked by tracker protection. Turn it off for this site in the Site panel to open it.");
    if (allowHttp && url.protocol === "http:") this.httpAllowed.add(url.hostname);
    win.active = id;
    if (url.protocol === "http:" && this.httpsOnlyApplies(url)) {
      this.startHttpsUpgrade(win, t, url);
      return (httpsUpgrade(url) ?? url).href;
    }
    this.loadUrl(win, t, url);
    return url.href;
  }
  loadUrl(win, t, url) {
    t.url = url.href; t.title = ""; t.favicon = ""; t.text = ""; t.suspended = false; t.lastActive = Date.now();
    win.active = t.id;
    if (t.view) t.view.webContents.loadURL(url.href).catch(() => {});
    else this.buildView(win, t, url.href);
    this.syncVisibility(win);
  }
  httpsOnlyApplies(u) {
    return this.setting("https_only") !== "false" && !!httpsUpgrade(u) && !this.httpAllowed.has(u.hostname);
  }
  async startHttpsUpgrade(win, t, httpUrl) {
    const https = httpsUpgrade(httpUrl);
    if (!https) return;
    const host = httpUrl.hostname;
    const now = Date.now();
    let a = this.upgradeAttempts.get(host);
    if (!a || now - a.at > 30000) a = { at: now, n: 0 };
    a.n++; this.upgradeAttempts.set(host, a);
    if (a.n > 3) { this.httpAllowed.add(host); this.loadUrl(win, t, httpUrl); return; }
    t.url = httpUrl.href; // let the address bar show where we're going
    let ok = false;
    try { await fetch(https, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) }); ok = true; } catch { ok = false; }
    if (!win.tabs.has(t.id)) return;
    if (ok) this.loadUrl(win, t, https);
    else this.emitUi(win, "qp://https-fallback", { window: win.label, id: t.id, url: httpUrl.href });
  }

  nav(win, id, action) {
    const wc = this.tab(win, id).view?.webContents;
    if (!wc) return;
    ({ back: () => wc.navigationHistory.goBack(), forward: () => wc.navigationHistory.goForward(), reload: () => wc.reload(), stop: () => wc.stop() })[action]?.();
  }
  setMuted(win, id, muted) {
    const t = this.tab(win, id);
    t.muted = !!muted;
    t.view?.webContents.setAudioMuted(t.muted);
    this.emitTab(win, t);
  }
  zoom(win, id, action) {
    const t = this.tab(win, id);
    let z = t.zoom;
    if (action === "in") z = Math.min(3, z + 0.1);
    else if (action === "out") z = Math.max(0.3, z - 0.1);
    else if (typeof action === "string" && action.startsWith("set:")) { const n = Number(action.slice(4)); if (Number.isFinite(n)) z = Math.min(3, Math.max(0.3, n)); }
    else z = 1;
    t.zoom = Math.round(z * 100) / 100;
    t.view?.webContents.setZoomFactor(t.zoom);
    return t.zoom;
  }
  run(win, id, js) { return this.tab(win, id).view?.webContents.executeJavaScript(js).catch(() => undefined); }

  async agentExec(win, id, op, args) {
    const t = this.tab(win, id);
    this.ensureLive(win, t);
    const wc = t.view?.webContents;
    if (!wc) throw new Error("This tab has no page loaded");
    const call = wc.executeJavaScript(`window.__qpAgent ? window.__qpAgent.call(${JSON.stringify(op)}, ${JSON.stringify(args ?? {})}) : null`);
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000));
    try {
      const r = await Promise.race([call, timeout]);
      if (r == null) throw new Error("no result");
      return r;
    } catch { throw new Error("The page did not respond (it may still be loading or may have navigated)."); }
  }

  // ---------------------------------------------------------------- page -> main
  /** Called for the allow-listed page commands. The tab is identified from the sender. */
  pageCommand(wcId, cmd, args) {
    const e = this.byContents.get(wcId);
    if (!e) return;
    const { win, tab: t } = e;
    if (cmd === "qp_report") {
      const r = args?.report;
      if (!r || typeof r.url !== "string") return;
      const u = parseUrl(r.url);
      if (!u || !/^https?:$/.test(u.protocol)) return;
      const titleChanged = t.title !== r.title;
      t.url = r.url;
      t.title = String(r.title ?? "").slice(0, 300);
      t.favicon = String(r.favicon ?? "").slice(0, 2048) || t.favicon;
      t.recording = !!r.recording;
      if (typeof r.text === "string") {
        t.text = r.text.slice(0, MAX_TEXT);
        if (!win.private) { try { this.db.recordVisit(t.url, t.title); } catch { /* db busy */ } remember(this.db, t.url, t.title, t.text); }
      } else if (titleChanged && !win.private) { try { this.db.updateTitle(t.url, t.title); } catch { /* ignore */ } }
      this.emitTab(win, t);
    } else if (cmd === "qp_shortcut") {
      if (SHORTCUTS.has(args?.action)) this.emitUi(win, "qp://shortcut", { window: win.label, action: args.action });
    } else if (cmd === "qp_login_seen") {
      this.onLoginSeen?.(win, t, args);
    }
  }

  pageScript(wcId) {
    const e = this.byContents.get(wcId);
    if (!e) return "";
    const { win, tab: t } = e;
    let host = "";
    try { host = new URL(t.url).hostname; } catch { /* none */ }
    const blocked = this.db.permissionsFor(host).filter((p) => p.policy === "block").map((p) => p.permission);
    const profile = this.siteProfile(host);
    const trackers = profile.trackers ?? this.setting("block_trackers") !== "false";
    return INJECT
      .replace("__QP_BLOCKED__", JSON.stringify(blocked))
      .replace("__QP_BLOCK__", trackers ? "true" : "false")
      .replace("__QP_COOKIES__", this.setting("cookie_banners") === "false" ? "false" : "true")
      .replace("__QP_STRICT__", this.setting("block_level") === "strict" ? "true" : "false");
  }

  // ---------------------------------------------------------------- memory saver
  memoryPressure() {
    const total = os.totalmem();
    return total ? 1 - os.freemem() / total : 0;
  }
  memorySweep() {
    const pressure = this.memoryPressure();
    for (const win of this.windows.values()) {
      for (const t of win.tabs.values()) {
        if (!shouldSuspend(this.memory, { hasPage: !!t.url && !!t.view, suspended: t.suspended, isActive: win.active === t.id, pinned: t.pinned, audible: t.audible, recording: t.recording, downloading: t.downloading, idleMs: Date.now() - t.lastActive }, pressure)) continue;
        this.destroyView(win, t);
        t.suspended = true; t.audible = false;
        this.emitTab(win, t);
      }
    }
  }
  memoryStats() {
    let total = 0, suspended = 0;
    for (const w of this.windows.values()) for (const t of w.tabs.values()) { total++; if (t.suspended) suspended++; }
    return { total_tabs: total, suspended_tabs: suspended, system_used_pct: this.memoryPressure() * 100, estimated_saved_mb: suspended * 100 };
  }

  clearSiteData(win) {
    return this.sessionFor(win).clearStorageData();
  }
}
