// Dry run → confirm → receipt, shared by every task that deletes, moves, renames, quits or uninstalls.
// 1. A feature calls preview(): each item is checked (inside the chosen folders, not protected, still there) and the list is kept
//    here in the main process. The UI only ever sees the list and sends back which numbers the person ticked, so a page or a
//    model can't slip a different path in at confirm time.
// 2. confirm() re-checks every ticked item, does it, writes each change to the action log (so it can be undone) and saves a receipt.
// Deleting always means the Trash, never a permanent delete.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPath } from "./fsguard.mjs";
import { uniquePath } from "./downloads.mjs";

const now = () => Math.floor(Date.now() / 1000);
/** "/Users/alex/Downloads/a.pdf" → "~/Downloads/a.pdf": shorter, and the account name isn't on screen. */
export const tilde = (p, home = os.homedir()) => (typeof p === "string" && home && (p === home || p.startsWith(home + path.sep)) ? `~${p.slice(home.length)}` : p);
const PENDING_MS = 30 * 60 * 1000;
export const MAX_ITEMS = 2000;
const clip = (v, n) => String(v ?? "").slice(0, n);

/** One readable line per item, used in the list and on the receipt. */
export function describeItem(it) {
  const name = path.basename(it.path ?? "") || it.label || "item";
  if (it.kind === "trash") return `Move “${name}” to the Trash`;
  if (it.kind === "move") return it.to ? `Move “${name}” to ${path.basename(path.dirname(it.to))}` : `Move “${name}”`;
  if (it.kind === "rename") return it.to ? `Rename “${name}” to “${path.basename(it.to)}”` : `Rename “${name}”`;
  return clip(it.label || it.kind, 200);
}

/** Checks the items of a dry run. Pure apart from `look` (exists/stat), so the rules can be tested. */
export function checkItems(items, { roots, guarded, look, kinds = {} }) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((raw, i) => {
    const it = { i, kind: String(raw?.kind ?? ""), path: raw?.path == null ? undefined : String(raw.path), to: raw?.to == null ? undefined : String(raw.to), size: Number.isFinite(raw?.size) ? Number(raw.size) : null, note: clip(raw?.note, 200), label: clip(raw?.label, 200), data: raw?.data };
    let problem = null;
    if (["trash", "move", "rename"].includes(it.kind)) {
      problem = checkPath(it.path, { roots, guarded });
      if (!problem && !look.exists(it.path)) problem = "It's no longer there.";
      if (!problem && it.kind !== "trash") {
        if (!it.to) problem = "No destination was given.";
        else if (it.kind === "rename" && path.dirname(path.resolve(it.to)) !== path.dirname(path.resolve(it.path))) problem = "A rename must stay in the same folder.";
        else problem = checkPath(it.to, { roots, guarded });
      }
    } else if (kinds[it.kind]) {
      problem = kinds[it.kind].check(it) ?? null;
    } else problem = "Unknown kind of change.";
    return { ...it, what: describeItem(it), problem };
  });
}

export class Tasks {
  /**
   * log: ActionLog. guarded(): the person's protected folders. trash(path): sends to the Trash, returns where it went or null.
   * kinds: extra item kinds, e.g. { quit_app: { check(item), run(item) → { logKind, what, from, to } | null } }.
   */
  constructor(db, log, { guarded = () => [], trash, kinds = {}, look = { exists: (p) => fs.existsSync(p) } } = {}) {
    this.db = db; this.log = log; this.guarded = guarded; this.trash = trash; this.kinds = kinds; this.look = look;
    this.pending = new Map();
    db.d.exec("CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, title TEXT NOT NULL, at INTEGER NOT NULL, done INTEGER NOT NULL, failed INTEGER NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL)");
  }

  registerKind(name, impl) { this.kinds[name] = impl; }

  /** Makes a dry-run list. Nothing is changed. Returns what the UI shows. */
  preview({ title, items, roots = [], intro = "" }) {
    for (const [k, v] of this.pending) if (v.expires < Date.now()) this.pending.delete(k);
    while (this.pending.size >= 20) this.pending.delete(this.pending.keys().next().value);
    const checked = checkItems(items, { roots, guarded: this.guarded(), look: this.look, kinds: this.kinds });
    const id = `task-${crypto.randomBytes(8).toString("hex")}`;
    this.pending.set(id, { id, title: clip(title, 120), roots, items: checked, expires: Date.now() + PENDING_MS });
    return this.view(id);
  }

  view(id) {
    const p = this.pending.get(id);
    if (!p) throw new Error("That list has expired. Run the task again to get a fresh one.");
    const ok = p.items.filter((i) => !i.problem);
    return {
      id, title: p.title,
      items: p.items.map(({ data: _d, ...it }) => ({ ...it, display: tilde(it.path) })),
      ready: ok.length,
      bytes: ok.reduce((s, i) => s + (i.size ?? 0), 0),
    };
  }

  cancel(id) { this.pending.delete(id); }

  /** Does the ticked items (by number). Every one is checked again first; problems are skipped and listed on the receipt. */
  async confirm(id, picks) {
    const p = this.pending.get(id);
    if (!p) throw new Error("That list has expired. Run the task again to get a fresh one.");
    this.pending.delete(id);
    const want = new Set((Array.isArray(picks) ? picks : []).filter(Number.isInteger));
    const chosen = p.items.filter((it) => want.has(it.i) && !it.problem);
    const recheck = checkItems(chosen, { roots: p.roots, guarded: this.guarded(), look: this.look, kinds: this.kinds });
    const done = [], failed = [];
    let bytes = 0;
    for (const [n, it] of recheck.entries()) {
      const orig = chosen[n];
      if (it.problem) { failed.push({ what: orig.what, error: it.problem }); continue; }
      try {
        const rec = await this.apply({ ...it, data: orig.data });
        if (rec) this.log.record({ task: id, taskTitle: p.title, ...rec });
        done.push({ what: rec?.what ?? orig.what, undoable: !!rec && (rec.kind !== "trash" || !!rec.to) });
        bytes += orig.size ?? 0;
      } catch (e) { failed.push({ what: orig.what, error: String(e?.message ?? e).slice(0, 200) }); }
    }
    const receipt = { id, title: p.title, at: now(), done, failed, bytes, skipped: p.items.length - chosen.length };
    this.db.run("INSERT OR REPLACE INTO receipts (id, title, at, done, failed, bytes, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", id, p.title, receipt.at, done.length, failed.length, bytes, JSON.stringify(receipt));
    this.db.run("DELETE FROM receipts WHERE id NOT IN (SELECT id FROM receipts ORDER BY at DESC LIMIT 200)");
    return receipt;
  }

  /** Carries out one checked item and says what to write in the action log. */
  async apply(it) {
    if (it.kind === "trash") {
      if (!this.trash) throw new Error("The Trash isn't available.");
      const to = await this.trash(it.path);
      return { kind: "trash", what: it.what, from: it.path, to };
    }
    if (it.kind === "move" || it.kind === "rename") {
      const to = uniquePath(path.dirname(it.to), path.basename(it.to), (x) => this.look.exists(x));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(it.path, to);
      return { kind: it.kind, what: describeItem({ ...it, to }), from: it.path, to };
    }
    const out = await this.kinds[it.kind].run(it);
    return out ? { kind: out.logKind ?? it.kind, what: out.what ?? it.what, from: out.from ?? null, to: out.to ?? null } : null;
  }

  receipts(limit = 50) {
    return this.db.all("SELECT body FROM receipts ORDER BY at DESC LIMIT ?1", Math.min(200, Math.max(1, limit))).map((r) => JSON.parse(r.body));
  }

  commands() {
    return {
      task_view: (_w, { id }) => this.view(id),
      task_confirm: (_w, { id, picks }) => this.confirm(id, picks),
      task_cancel: (_w, { id }) => this.cancel(id),
      receipts_list: (_w, { limit }) => this.receipts(limit ?? 50),
    };
  }
}
