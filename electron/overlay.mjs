// A small always-on-top bar at the bottom of the screen that shows what the screen agent is thinking and about to do.
// It never takes focus, is excluded from screen capture where the OS allows (so the agent doesn't see its own bar),
// and only its Stop button receives clicks.
import { BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { barBounds, lingerMs, sanitizeState, STALE_MS } from "./overlay-state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export class StatusBar {
  constructor(onStop) {
    this.onStop = onStop;
    this.win = null;
    this.hideTimer = null;
    ipcMain.on("qp-overlay:stop", () => { this.onStop?.(); this.update({ phase: "idle" }); });
    ipcMain.on("qp-overlay:hover", (e, on) => { if (this.win && e.sender === this.win.webContents) this.win.setIgnoreMouseEvents(!on, { forward: true }); });
  }

  ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const b = barBounds(screen.getPrimaryDisplay().workArea);
    const win = new BrowserWindow({
      ...b, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      focusable: false, skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true,
      webPreferences: { preload: path.join(here, "preload-overlay.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); // keeps the Dock icon as it is
    win.setContentProtection(true);                       // keeps the bar out of the agent's own screenshots
    win.setIgnoreMouseEvents(true, { forward: true });    // click-through except over the Stop button
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.loadFile(path.join(here, "overlay.html"));
    win.on("closed", () => { this.win = null; });
    this.win = win;
    return win;
  }

  update(raw) {
    const state = sanitizeState(raw);
    clearTimeout(this.hideTimer);
    if (state.phase === "idle") return this.hide();
    const win = this.ensure();
    const place = () => { win.setBounds(barBounds(screen.getPrimaryDisplay().workArea)); win.webContents.send("qp-overlay:state", state); win.showInactive(); };
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", place); else place();
    // Finished and failed states fade away; a "working" state with no news for 90 seconds is stale and goes too.
    this.hideTimer = setTimeout(() => this.hide(), lingerMs(state.phase) ?? STALE_MS);
  }

  hide() {
    clearTimeout(this.hideTimer);
    if (this.win && !this.win.isDestroyed()) this.win.hide();
  }

  destroy() { clearTimeout(this.hideTimer); if (this.win && !this.win.isDestroyed()) this.win.destroy(); this.win = null; }
}
