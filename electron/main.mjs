// Quick Pebble (Chromium edition): Electron main process.
import { app, ipcMain, Menu, session, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Db } from "./db.mjs";
import { Browser, chromeUserAgent } from "./browser.mjs";
import { Downloads } from "./downloads.mjs";
import { buildCommands } from "./commands.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dev = !!process.env.QP_DEV_URL;
const smoke = process.env.QP_SMOKE === "1";

app.setName("Quick Pebble");
if (smoke && process.env.QP_SMOKE_NOGPU === "1") app.disableHardwareAcceleration();
if (smoke) app.setPath("userData", fs.mkdtempSync(path.join(app.getPath("temp"), "qp-smoke-")));
// A second launch just focuses the first one.
if (!app.requestSingleInstanceLock()) app.quit();

let browser, db, downloads, commands;

function appUrl() {
  if (process.env.QP_DEV_URL) return process.env.QP_DEV_URL;
  return pathToFileURL(path.join(here, "..", "dist", "index.html")).href;
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

app.whenReady().then(async () => {
  db = new Db(path.join(app.getPath("userData"), "pebble.db"));
  browser = new Browser(db, { appUrl: appUrl(), devtools: dev || process.env.QP_DEVTOOLS === "1" });
  downloads = new Downloads(db, browser, (items) => { for (const w of browser.windows.values()) browser.emitUi(w, "qp://downloads", items); });
  browser.onDownload = (e, item, wc) => downloads.handle(e, item, wc);
  commands = buildCommands({ browser, db, downloads, extras: {} });
  session.defaultSession.setUserAgent(chromeUserAgent());

  ipcMain.handle("qp:invoke", async (event, cmd, args) => {
    const fn = commands[cmd];
    if (!fn) throw new Error(`unknown command: ${cmd}`);
    // Only the browser's own UI may call commands; web pages use the separate allow-listed channel below.
    const win = browser.uiByContents.get(event.sender.id);
    if (!win) throw new Error("not permitted");
    return fn(win, args ?? {});
  });
  ipcMain.handle("qp:page", (event, cmd, args) => browser.pageCommand(event.sender.id, cmd, args));
  ipcMain.on("qp:page-script", (event) => { event.returnValue = browser.pageScript(event.sender.id); });

  setupMenu();
  browser.openWindow({ label: "main" });
  if (smoke) import("./smoke.mjs").then((m) => m.run({ browser, commands, db })).catch((e) => { console.error("SMOKE FAIL", e); app.exit(1); });
});

app.on("second-instance", () => { const w = [...(browser?.windows.values() ?? [])][0]; if (w) { if (w.win.isMinimized()) w.win.restore(); w.win.focus(); } });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (browser && browser.windows.size === 0) browser.openWindow({ label: "main" }); });
