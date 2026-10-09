// Download manager (port of downloads.rs). Files that can run code can only be revealed, never opened.
import { app, shell } from "electron";
import fs from "node:fs";
import path from "node:path";

const KEEP = 100;
const RISKY = new Set("app command tool pkg mpkg workflow action scpt applescript terminal sh bash zsh csh ksh exe msi bat cmd com scr ps1 psm1 vbs vbe js jse wsf wsh lnk reg jar apk deb rpm appimage run bin dmg iso cpl hta msc pif gadget desktop".split(" "));
export const isRisky = (p) => RISKY.has(path.extname(p).slice(1).toLowerCase());

export function sanitizeFilename(raw) {
  const base = String(raw).split(/[\\/]/).pop() ?? "";
  let c = [...base].map((ch) => (ch.charCodeAt(0) < 32 || '<>:"|?*'.includes(ch) ? "_" : ch)).join("").trim().replace(/^\.+/, "").replace(/[. ]+$/, "");
  c = [...c].slice(0, 150).join("");
  return c || "download";
}
export function uniquePath(dir, name, exists) {
  const first = path.join(dir, name);
  if (!exists(first)) return first;
  const i = name.lastIndexOf(".");
  const [stem, ext] = i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ""];
  for (let n = 1; n < 10000; n++) { const p = path.join(dir, `${stem} (${n})${ext}`); if (!exists(p)) return p; }
  return path.join(dir, `${stem} (copy)${ext}`);
}

export class Downloads {
  constructor(db, browser, announce) {
    this.db = db; this.browser = browser; this.announce = announce;
    this.items = db.downloadsRecent(KEEP).map((r) => ({
      id: Number(r.id), name: r.name, url: r.url, host: hostOf(r.url), path: r.path, state: r.ok ? "done" : "failed",
      started: Number(r.started), finished: Number(r.finished), size: r.size == null ? null : Number(r.size), can_open: !isRisky(r.path), private: false, tab: "",
    }));
    this.next = Math.max(0, ...this.items.map((i) => i.id)) + 1;
  }
  snapshot() { return this.items.map(({ private: _p, tab: _t, ...rest }) => rest).sort((a, b) => b.id - a.id); }
  push() { this.announce(this.snapshot()); }

  handle(_event, item, wc) {
    const entry = this.browser.byContents.get(wc.id);
    const url = item.getURL();
    if (!/^https?:/.test(url)) return item.cancel();
    const dir = app.getPath("downloads");
    const name = sanitizeFilename(item.getFilename() || new URL(url).pathname.split("/").pop());
    const taken = new Set(this.items.filter((d) => d.state === "active").map((d) => d.path));
    const target = uniquePath(dir, name, (p) => fs.existsSync(p) || taken.has(p));
    item.setSavePath(target);
    const d = { id: this.next++, name: path.basename(target), url, host: hostOf(url), path: target, state: "active", started: now(), finished: null, size: item.getTotalBytes() || null, can_open: !isRisky(target), private: !!entry?.win.private, tab: entry?.tab.id ?? "", item };
    this.items.push(d);
    if (entry) entry.tab.downloading = true;
    this.push();
    item.on("updated", () => { d.size = item.getTotalBytes() || d.size; });
    item.once("done", (_e, state) => {
      const ok = state === "completed" && fs.existsSync(target);
      d.state = ok ? "done" : "failed";
      d.finished = now();
      try { d.size = fs.statSync(target).size; } catch { /* partial file gone */ }
      delete d.item;
      if (entry && !this.items.some((x) => x.state === "active" && x.tab === d.tab)) entry.tab.downloading = false;
      while (this.items.length > KEEP) { const i = this.items.findIndex((x) => x.state !== "active"); if (i < 0) break; this.items.splice(i, 1); }
      if (!d.private) { try { this.db.downloadsPut({ id: d.id, name: d.name, url: d.url, path: d.path, ok, started: d.started, finished: d.finished, size: d.size }); } catch { /* ignore */ } }
      this.push();
    });
  }
  find(id) { const d = this.items.find((x) => x.id === id); if (!d) throw new Error("That download is no longer in the list."); return d; }
  async open(id) {
    const d = this.find(id);
    if (d.state !== "done") throw new Error("That download isn't finished.");
    if (isRisky(d.path)) throw new Error("This kind of file can run code, so it can only be shown in its folder.");
    const err = await shell.openPath(d.path);
    if (err) throw new Error(`Could not open it: ${err}`);
  }
  reveal(id) { shell.showItemInFolder(this.find(id).path); }
  remove(id) {
    const d = this.find(id);
    if (d.state === "active") d.item?.cancel();
    this.items = this.items.filter((x) => x.id !== id);
    try { this.db.downloadsDelete(id); } catch { /* ignore */ }
    this.push();
  }
  clearFinished() {
    this.items = this.items.filter((x) => x.state === "active");
    try { this.db.downloadsClear(); } catch { /* ignore */ }
    this.push();
  }
}
const now = () => Math.floor(Date.now() / 1000);
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
