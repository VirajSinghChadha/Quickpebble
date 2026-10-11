// "Last things I did": every file or setting change the app makes for the person is written here (what, from, to, when,
// and which task it belonged to), so each one, or a whole task, can be undone. Stored only in the local database.
// Undo never overwrites: if the file was changed or something else now sits where it came from, it stops and says so.
import fs from "node:fs";
import path from "node:path";

const now = () => Math.floor(Date.now() / 1000);
export const KEEP = 2000;
export const FILE_KINDS = new Set(["move", "rename", "trash"]);
const clip = (v, n) => String(v ?? "").slice(0, n);

/** What undoing one entry means, or why it can't be done. Pure: `exists` is the only look at the disk. */
export function undoStep(entry, exists) {
  if (entry.undone) return { error: "Already undone." };
  if (!FILE_KINDS.has(entry.kind)) return { custom: true };
  if (!entry.dst) return { error: entry.kind === "trash" ? "It went to the Recycle Bin: restore it from there." : "There's no record of where it went." };
  if (!exists(entry.dst)) return { error: `“${path.basename(entry.dst)}” is no longer where it was put.` };
  if (exists(entry.src)) return { error: `Something called “${path.basename(entry.src)}” is already back in its old place.` };
  return { from: entry.dst, to: entry.src };
}

/** Moves a file or folder, also across disks (copy, then remove the original only once the copy is complete). */
export function moveAcross(from, to) {
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    fs.rmSync(from, { recursive: true });
  }
}

export class ActionLog {
  constructor(db, { move = moveAcross, exists = (p) => fs.existsSync(p) } = {}) {
    this.db = db; this.move = move; this.exists = exists;
    this.undoers = new Map();
    this.listeners = new Set();
    db.d.exec(`CREATE TABLE IF NOT EXISTS action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT NOT NULL, task_title TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL, what TEXT NOT NULL, src TEXT, dst TEXT, at INTEGER NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS idx_action_log_task ON action_log(task, id);`);
  }

  /** Teach the log how to undo a non-file kind, such as "setting". fn(entry) puts the old value back or throws. */
  register(kind, fn) { this.undoers.set(kind, fn); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(entry) { for (const fn of this.listeners) { try { fn(entry); } catch { /* a listener's problem isn't the log's */ } } }

  record({ task, taskTitle = "", kind, what, from = null, to = null }) {
    if (!/^[a-z_]{2,20}$/.test(String(kind))) throw new Error("unknown change kind");
    const id = Number(this.db.run("INSERT INTO action_log (task, task_title, kind, what, src, dst, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      clip(task || `single-${Date.now()}`, 80), clip(taskTitle, 120), kind, clip(what, 300), from == null ? null : clip(from, 4096), to == null ? null : clip(to, 4096), now()).lastInsertRowid);
    this.db.run("DELETE FROM action_log WHERE id NOT IN (SELECT id FROM action_log ORDER BY id DESC LIMIT ?1)", KEEP);
    this.changed({ id });
    return id;
  }

  list(limit = 200) {
    return this.db.all("SELECT id, task, task_title, kind, what, src, dst, at, undone FROM action_log ORDER BY id DESC LIMIT ?1", Math.min(1000, Math.max(1, limit)))
      .map((r) => ({ ...r, id: Number(r.id), at: Number(r.at), undone: !!r.undone, can_undo: !r.undone && (FILE_KINDS.has(r.kind) ? !!r.dst : this.undoers.has(r.kind)) }));
  }

  get(id) {
    const e = this.db.get("SELECT id, task, task_title, kind, what, src, dst, at, undone FROM action_log WHERE id = ?1", Number(id));
    if (!e) throw new Error("That change is no longer in the list.");
    return { ...e, id: Number(e.id), undone: !!e.undone };
  }

  undo(id) {
    const e = this.get(id);
    const step = undoStep(e, this.exists);
    if (step.error) throw new Error(step.error);
    if (step.custom) {
      const fn = this.undoers.get(e.kind);
      if (!fn) throw new Error("This change can't be undone from here.");
      fn(e);
    } else {
      fs.mkdirSync(path.dirname(step.to), { recursive: true });
      this.move(step.from, step.to);
    }
    this.db.run("UPDATE action_log SET undone = 1 WHERE id = ?1", e.id);
    this.changed(e);
    return e;
  }

  /** Undoes every change of one task, newest first, and reports what couldn't be put back. */
  undoTask(task) {
    const rows = this.db.all("SELECT id FROM action_log WHERE task = ?1 AND undone = 0 ORDER BY id DESC", clip(task, 80));
    const out = { undone: 0, failed: [] };
    for (const { id } of rows) {
      try { this.undo(Number(id)); out.undone++; }
      catch (err) { out.failed.push({ id: Number(id), error: err.message }); }
    }
    return out;
  }

  /** Forgets the list (the changes themselves stay as they are). */
  clear() { this.db.run("DELETE FROM action_log"); this.changed({}); }

  commands() {
    return {
      actions_list: (_w, { limit }) => this.list(limit ?? 200),
      action_undo: (_w, { id }) => { this.undo(id); return true; },
      actions_undo_task: (_w, { task }) => this.undoTask(task),
      actions_clear: () => this.clear(),
    };
  }
}
