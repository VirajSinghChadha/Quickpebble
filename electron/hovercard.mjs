// A small preview card shown under a tab when you hover it: a picture of the page, its title and site.
// It is its own view stacked above the page (page views would otherwise cover anything drawn by the app's own screen).
// Pictures are kept in memory only, never for private windows, and nothing is fetched from the network.
import { WebContentsView } from "electron";

export const CARD_W = 260;
export const CARD_H = 190;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** HTML for the card. Image must be a data: URL made by us; everything else is escaped text. */
export function cardHtml({ title, host, thumb, dark, desc = "", link = false }) {
  if (link) return linkHtml({ title, host, desc, dark });
  const img = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(String(thumb)) ? `<img src="${thumb}" alt="">` : `<div class="none">No preview yet</div>`;
  const [bg, fg, sub, line] = dark ? ["#1b1d22", "#f3f4f6", "#9ca3af", "#2f3340"] : ["#ffffff", "#111827", "#6b7280", "#e5e7eb"];
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
html,body{margin:0;background:transparent;font:12px -apple-system,system-ui,sans-serif;overflow:hidden}
.c{box-sizing:border-box;width:${CARD_W}px;height:${CARD_H}px;background:${bg};color:${fg};border:1px solid ${line};border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.18)}
img,.none{display:block;width:100%;height:132px;object-fit:cover;object-position:top;background:${line}}.none{display:grid;place-items:center;color:${sub}}
.t{padding:8px 12px 0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.h{padding:2px 12px;color:${sub};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style><div class="c">${img}<div class="t">${esc(title || host || "New tab")}</div><div class="h">${esc(host)}</div></div>`;
}

/** Smaller, picture-less card for a link: its title (if we were allowed to look), its address and a short description. */
function linkHtml({ title, host, desc, dark }) {
  const [bg, fg, sub, line] = dark ? ["#1b1d22", "#f3f4f6", "#9ca3af", "#2f3340"] : ["#ffffff", "#111827", "#6b7280", "#e5e7eb"];
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
html,body{margin:0;background:transparent;font:12px -apple-system,system-ui,sans-serif;overflow:hidden}
.c{box-sizing:border-box;width:${CARD_W}px;height:${CARD_H}px;background:${bg};color:${fg};border:1px solid ${line};border-radius:14px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden}
.t{font-weight:600;font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.h{margin-top:4px;color:${sub};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.d{margin-top:8px;color:${sub};display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4}
</style><div class="c"><div class="t">${esc(title || host)}</div><div class="h">${esc(host)}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ""}</div>`;
}

/** Where the card goes: under the tab, kept inside the window. */
export function cardPlace(anchor, bounds) {
  const x = Math.max(8, Math.min(Math.round(anchor.x + anchor.width / 2 - CARD_W / 2), bounds.width - CARD_W - 8));
  return { x, y: Math.round(anchor.y + anchor.height + 6), width: CARD_W, height: CARD_H };
}

export class HoverCard {
  constructor() { this.views = new Map(); this.token = 0; }
  show(win, { title, host, thumb, dark, anchor, desc, link }) {
    const mine = ++this.token;
    this.hide(win);
    if (win.win.isDestroyed()) return;
    const view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: false } });
    view.setBackgroundColor("#00000000");
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (e) => e.preventDefault());
    view.setBounds(cardPlace(anchor, win.win.getContentBounds()));
    win.win.contentView.addChildView(view);
    this.views.set(win.label, view);
    void view.webContents.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(cardHtml({ title, host, thumb, dark, desc, link }))).catch(() => {});
    if (mine !== this.token) this.hide(win);
  }
  hide(win) {
    const v = this.views.get(win.label);
    if (!v) return;
    this.views.delete(win.label);
    try { win.win.contentView.removeChildView(v); } catch { /* window gone */ }
    try { v.webContents.close(); } catch { /* already gone */ }
  }
}
