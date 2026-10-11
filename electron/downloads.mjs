// Download manager (port of downloads.rs). Files that can run code can only be revealed, never opened.
import { app, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { cleanSuggestion, isGenericName, plannedPath } from "./downloadsort.mjs";

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
  snapshot() { return this.items.map(({ private: _p, tab: _t, item: _i, movedFrom, ...rest }) => ({ ...rest, can_undo: !!movedFrom, generic: rest.state === "done" && !rest.renamed && isGenericName(rest.name) })).sort((a, b) => b.id - a.id); }
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
      if (ok && !d.private) this.tidy(d, dir);
      if (entry && !this.items.some((x) => x.state === "active" && x.tab === d.tab)) entry.tab.downloading = false;
      while (this.items.length > KEEP) { const i = this.items.findIndex((x) => x.state !== "active"); if (i < 0) break; this.items.splice(i, 1); }
      if (!d.private) { try { this.db.downloadsPut({ id: d.id, name: d.name, url: d.url, path: d.path, ok, started: d.started, finished: d.finished, size: d.size }); } catch { /* ignore */ } }
      this.push();
    });
  }
  /** Optional: file a finished download into Downloads/<kind>. Never overwrites, and can be undone. */
  tidy(d, dir) {
    if (this.db.getSetting("downloads_sort") !== "1") return;
    try {
      const to = plannedPath(dir, d.path, (p) => fs.existsSync(p));
      if (!to) return;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(d.path, to);
      d.movedFrom = d.path; d.path = to; d.name = path.basename(to);
    } catch { /* leave it where it is */ }
  }
  /** Put a tidied download back where it was saved, if that spot is still free. */
  undoMove(id) {
    const d = this.find(id);
    if (!d.movedFrom) throw new Error("That download was not moved.");
    if (fs.existsSync(d.movedFrom)) throw new Error("Something with the original name is already in Downloads.");
    fs.renameSync(d.path, d.movedFrom);
    d.path = d.movedFrom; d.name = path.basename(d.path); delete d.movedFrom;
    this.persist(d); this.push();
  }
  /** Give a finished download a clearer name, in the same folder, never overwriting. */
  rename(id, raw) {
    const d = this.find(id);
    if (d.state !== "done") throw new Error("That download isn't finished.");
    const name = sanitizeFilename(raw);
    const to = uniquePath(path.dirname(d.path), name, (p) => fs.existsSync(p));
    fs.renameSync(d.path, to);
    d.path = to; d.name = path.basename(to); d.renamed = true; delete d.movedFrom;
    this.persist(d); this.push();
  }
  /** Apply a model's suggested name (cleaned to a safe file name). */
  applySuggestion(id, reply) {
    const d = this.find(id);
    const name = cleanSuggestion(reply, path.extname(d.path));
    if (!name) throw new Error("There was not enough to go on for a better name.");
    this.rename(id, name);
  }
  persist(d) { if (!d.private) { try { this.db.downloadsPut({ id: d.id, name: d.name, url: d.url, path: d.path, ok: d.state === "done", started: d.started, finished: d.finished, size: d.size }); } catch { /* ignore */ } } }
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
