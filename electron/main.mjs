// Quick Pebble (Chromium edition): Electron main process.
import { app, ipcMain, Menu, session, dialog, globalShortcut } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Db } from "./db.mjs";
import { Browser, chromeUserAgent } from "./browser.mjs";
import { Downloads } from "./downloads.mjs";
import { buildCommands } from "./commands.mjs";
import { Filters } from "./filters.mjs";
import { Vault } from "./vault.mjs";
import { Extensions } from "./extensions.mjs";
import { ScreenAgent } from "./screen.mjs";
import { StatusBar } from "./overlay.mjs";
import { ContextStore } from "./context.mjs";
import { createSafety } from "./safety.mjs";
import { createCleanup } from "./cleanup.mjs";
import { FileIndex } from "./fileindex.mjs";
import { Timeline } from "./timeline.mjs";
import { School } from "./school.mjs";
import { Routines } from "./routines.mjs";
import { QuickDo } from "./quickdo.mjs";
import { Prices } from "./prices.mjs";
import { initUsage } from "./usage.mjs";
import { installDiagnostics } from "./diagnostics.mjs";
import { Updater } from "./updater.mjs";
import { ghostHandler, registerGhostScheme } from "./ghost/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dev = !!process.env.QP_DEV_URL;
const smoke = process.env.QP_SMOKE === "1" || process.env.QP_SMOKE_WEB === "1" || process.env.QP_SMOKE_UI === "1" || process.env.QP_SMOKE_EXT === "1" || process.env.QP_SMOKE_GHOST === "1" || process.env.QP_SMOKE_SHOTS === "1" || process.env.QP_SMOKE_SCREEN === "1" || process.env.QP_SMOKE_FEATURES === "1" || process.env.QP_SMOKE_AGENT === "1" || process.env.QP_SMOKE_BROWSER === "1";

app.setName("Quick Pebble");
registerGhostScheme();
if (smoke && process.env.QP_SMOKE_NOGPU === "1") app.disableHardwareAcceleration();
if (smoke) app.setPath("userData", fs.mkdtempSync(path.join(app.getPath("temp"), "qp-smoke-")));
// A second launch just focuses the first one.
if (!app.requestSingleInstanceLock()) app.quit();

let browser, db, downloads, commands, filters, extensions, screen, updater, safety;

function appUrl() {
  if (process.env.QP_DEV_URL) return process.env.QP_DEV_URL;
  return pathToFileURL(path.join(here, "..", "dist", "index.html")).href;
}

/** Routes every session through the proxy chosen in Settings (any SOCKS5/HTTP proxy: Tor, WARP, a corporate or personal VPN's proxy port). */
async function applyProxy() {
  const mode = db.getSetting("proxy_mode") ?? "direct";
  const server = (db.getSetting("proxy_server") ?? "").trim();
  const config = mode === "custom" && /^(socks5|socks4|http|https):\/\/[^\s/]+(:\d+)?$/i.test(server) ? { mode: "fixed_servers", proxyRules: server, proxyBypassRules: "<local>" } : { mode: "system" };
  const all = new Set([session.defaultSession, ...browser.sessions]);
  await Promise.all([...all].map((s) => s.setProxy(config)));
}

function setupMenu() {
  // Only roles that don't claim browser shortcuts (Cmd+W/T/R are handled by the browser itself).
  const mac = process.platform === "darwin";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }] : []),
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, ...(mac ? [{ type: "separator" }, { role: "front" }] : [])] },
  ]));
}

function senderWindow(event) {
  const w = browser.windowOf(event.sender.id);
  if (!w) throw new Error("unknown window");
  return w;
}

installDiagnostics();

app.whenReady().then(async () => {
  db = new Db(path.join(app.getPath("userData"), "pebble.db"));
  initUsage(db);
  // Did the last session end cleanly? If not, the UI tells the person their tabs were restored.
  let recovered = db.getSetting("clean_exit") === "false";
  db.setSetting("clean_exit", "false");
  app.on("before-quit", () => { try { db.setSetting("clean_exit", "true"); } catch { /* closing anyway */ } });
  browser = new Browser(db, { appUrl: appUrl(), devtools: dev || process.env.QP_DEVTOOLS === "1" });
  downloads = new Downloads(db, browser, (items) => { for (const w of browser.windows.values()) browser.emitUi(w, "qp://downloads", items); });
  safety = createSafety(db);
  downloads.attachLog(safety.log);
  const cleanup = createCleanup({ db, safety });
  app.on("will-quit", () => cleanup.stop());
  const files = new FileIndex(db, { guarded: safety.guarded });
  const timeline = new Timeline(db);
  const school = new School(db, browser);
  app.on("will-quit", () => school.stop());
  const routines = new Routines(db, browser);
  app.on("will-quit", () => routines.stop());
  const quickdo = new QuickDo(db);
  const prices = new Prices(db, (w, ch, p) => browser.emitUi(w, ch, p));
  app.on("will-quit", () => quickdo.destroy());
  browser.onVisit = (url, title) => { try { timeline.note("page", title, url); } catch { /* never block browsing */ } };
  browser.onSession = (ses) => { applyProxy().catch(() => {}); if (ses.storagePath) extensions?.loadEnabledInto(ses).catch(() => {}); };
  browser.onDownload = (e, item, wc) => downloads.handle(e, item, wc);
  browser.ghost = ghostHandler(db);
  session.defaultSession.protocol.handle("ghost", browser.ghost);
  filters = new Filters();
  browser.extraBlock = () => filters.matcher();
  const filtersReady = filters.start().catch(() => {});
  extensions = new Extensions(() => [...browser.sessions].filter((x) => x.storagePath));
  updater = new Updater(db, (channel, payload) => { for (const w of browser.windows.values()) browser.emitUi(w, channel, payload); });
  const toWindows = (channel) => { for (const w of browser.windows.values()) browser.emitUi(w, channel, {}); };
  const statusBar = new StatusBar(() => toWindows("qp://screen-stop"), () => toWindows("qp://screen-pause"));
  screen = new ScreenAgent(db, statusBar);
  app.on("will-quit", () => { screen.stop(); statusBar.destroy(); });
  const vault = new Vault(db, browser);
  browser.onLoginSeen = (w, t, a) => vault.loginSeen(w, t, a);
  commands = buildCommands({ browser, db, downloads, extras: { context: new ContextStore(db).commands(), applyProxy, filters, vault: vault.commands(), extensions, updater, screen: screen.commands(), safety: { ...safety.commands, ...cleanup.commands, ...files.commands(dialog), ...timeline.commands(), ...school.commands(), ...routines.commands(), ...prices.commands() } } });
  commands.session_recovered = () => { const was = recovered; recovered = false; return was; };
  session.defaultSession.setUserAgent(chromeUserAgent());

  ipcMain.handle("qp:invoke", async (event, cmd, args) => {
    const fn = commands[cmd];
    if (!fn) throw new Error(`unknown command: ${cmd}`);
    // Only the browser's own UI may call commands; web pages use the separate allow-listed channel below.
    const win = browser.uiByContents.get(event.sender.id);
    if (!win) throw new Error("not permitted");
    try { return await fn(win, args ?? {}); }
    catch (e) { console.warn(`[${cmd}] ${e?.message ?? e}`); throw e; }   // recorded (redacted) so a problem report can include it
  });
  ipcMain.handle("qp:page", (event, cmd, args) => browser.pageCommand(event.sender.id, cmd, args));
  ipcMain.on("qp:page-script", (event) => { event.returnValue = browser.pageScript(event.sender.id); });

  applyProxy().catch(() => {});
  setupMenu();
  browser.trackScroll();
  browser.openWindow({ label: "main" });
  updater.start();
  // Talk to the assistant from any app: bring the browser forward with the assistant open and the cursor in its box.
  const HOTKEY = "CommandOrControl+Shift+Space";
  try {
    globalShortcut.register(HOTKEY, () => {
      const w = browser.windows.get("main") ?? [...browser.windows.values()][0];
      if (!w) return;
      if (w.win.isMinimized()) w.win.restore();
      w.win.show();
      w.win.focus();
      browser.emitUi(w, "qp://assistant", {});
    });
  } catch { /* another app owns the shortcut; the assistant is still one click away */ }
  try { globalShortcut.register("CommandOrControl+Alt+P", () => toWindows("qp://screen-pause")); } catch { /* the Pause button on the bar still works */ }
  quickdo.register();   // "Do this for me" from any app; if another app owns the shortcut, it's simply unavailable
  app.on("will-quit", () => globalShortcut.unregisterAll());
  // Developer-only end-to-end checks (QP_SMOKE_*=1); the files are not shipped in packaged builds.
  const runs = { QP_SMOKE_GHOST: "smoke-ghost", QP_SMOKE_SHOTS: "smoke-shots", QP_SMOKE_SCREEN: "smoke-screen", QP_SMOKE_EXT: "smoke-ext", QP_SMOKE_UI: "smoke-ui", QP_SMOKE_WEB: "smoke-web", QP_SMOKE_FEATURES: "smoke-features", QP_SMOKE_AGENT: "smoke-agent", QP_SMOKE_BROWSER: "smoke-browser", QP_SMOKE: "smoke" };
  const hit = Object.keys(runs).find((k) => process.env[k] === "1");
  if (hit) import(`./${runs[hit]}.mjs`).then((m) => m.run({ browser, commands, db, filters, filtersReady, extensions, screenAgent: screen, statusBar, safety, files, timeline, school, routines, quickdo, prices, downloads })).catch((e) => { console.error(`${hit} FAIL`, e); app.exit(1); });
});

app.on("second-instance", () => { const w = [...(browser?.windows.values() ?? [])][0]; if (w) { if (w.win.isMinimized()) w.win.restore(); w.win.focus(); } });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (browser && browser.windows.size === 0) browser.openWindow({ label: "main" }); });
