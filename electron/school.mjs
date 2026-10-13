// Learning and school, main-process side: saved study packs with spaced reminders, calendar files for a timetable, saving a
// note, and reading the text of a PDF open in a tab (for "slides to notes"). Nothing here submits, sends or buys anything.
import { app, dialog, Notification, shell } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { uniquePath } from "./downloads.mjs";
import { pdfText } from "./fileindex.mjs";

const now = () => Date.now();
const MAX_PACK = 200_000;
const clip = (v, n) => String(v ?? "").slice(0, n);

/** Reminder times the UI asks for: in the future, within a day, at most five. */
export function cleanReminders(times, at = now()) {
  return [...new Set((Array.isArray(times) ? times : []).map(Number).filter((t) => Number.isFinite(t) && t > at && t < at + 26 * 3600_000))].sort((a, b) => a - b).slice(0, 5);
}

/** A calendar file must look like one, and be small. */
export function validIcs(ics) {
  const s = String(ics ?? "");
  return s.length < 300_000 && s.startsWith("BEGIN:VCALENDAR") && s.trimEnd().endsWith("END:VCALENDAR") && !/BEGIN:VALARM[\s\S]*ACTION:(EMAIL|PROCEDURE)/i.test(s);
}

/** Text for a Notes body: escaped, line breaks kept. */
export const notesHtml = (title, body) => `<h1>${esc(title)}</h1>${esc(body).split("\n").map((l) => `<div>${l || "<br>"}</div>`).join("")}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export class School {
  constructor(db, browser) {
    this.db = db; this.browser = browser;
    db.d.exec(`CREATE TABLE IF NOT EXISTS study_packs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, created INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS study_reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, pack_id INTEGER NOT NULL REFERENCES study_packs(id) ON DELETE CASCADE, due INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);`);
    db.d.exec("PRAGMA foreign_keys = ON");
    this.timer = setInterval(() => this.remind(), 60_000);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); }

  save(pack, times) {
    const body = JSON.stringify(pack ?? {});
    if (body.length > MAX_PACK || !pack?.title) throw new Error("That study pack is too large or empty.");
    if (this.db.get("SELECT count(*) AS n FROM study_packs").n >= 200) this.db.run("DELETE FROM study_packs WHERE id = (SELECT id FROM study_packs ORDER BY created ASC LIMIT 1)");
    const id = Number(this.db.run("INSERT INTO study_packs (title, created, body) VALUES (?1, ?2, ?3)", clip(pack.title, 80), now(), body).lastInsertRowid);
    for (const t of cleanReminders(times)) this.db.run("INSERT INTO study_reminders (pack_id, due) VALUES (?1, ?2)", id, t);
    return id;
  }
  list() {
    return this.db.all(`SELECT p.id, p.title, p.created, (SELECT MIN(due) FROM study_reminders r WHERE r.pack_id = p.id AND r.done = 0) AS next FROM study_packs p ORDER BY p.created DESC LIMIT 100`)
      .map((r) => ({ id: Number(r.id), title: r.title, created: Number(r.created), next: r.next == null ? null : Number(r.next) }));
  }
  get(id) {
    const r = this.db.get("SELECT id, title, created, body FROM study_packs WHERE id = ?1", Number(id));
    if (!r) throw new Error("That study pack is gone.");
    return { id: Number(r.id), title: r.title, created: Number(r.created), pack: JSON.parse(r.body) };
  }
  remove(id) { this.db.run("DELETE FROM study_reminders WHERE pack_id = ?1", Number(id)); this.db.run("DELETE FROM study_packs WHERE id = ?1", Number(id)); }

  /** Due reminders: a system notification, and the app opens the pack's quiz when it's clicked. */
  remind(at = now()) {
    const due = this.db.all("SELECT r.id, r.pack_id, p.title FROM study_reminders r JOIN study_packs p ON p.id = r.pack_id WHERE r.done = 0 AND r.due <= ?1 LIMIT 5", at);
    for (const r of due) {
      this.db.run("UPDATE study_reminders SET done = 1 WHERE id = ?1", r.id);
      const open = () => { for (const w of this.browser.windows.values()) if (!w.private) { this.browser.emitUi(w, "qp://study-reminder", { id: Number(r.pack_id), title: r.title }); w.win.show(); break; } };
      try { if (Notification.isSupported()) { const n = new Notification({ title: "Time for a quick review", body: `${r.title}: a few questions to keep it fresh.` }); n.on("click", open); n.show(); } } catch { /* notifications off */ }
      open();
    }
    return due.length;
  }

  async saveIcs(ics) {
    if (!validIcs(ics)) throw new Error("That isn't a calendar file.");
    const dir = app.getPath("downloads");
    const file = uniquePath(dir, "Timetable.ics", (p) => fs.existsSync(p));
    fs.writeFileSync(file, ics);
    const err = await shell.openPath(file);   // the Calendar app shows its own "add these events?" step
    return { path: file, opened: !err };
  }

  async saveNote(w, { title, body, where }) {
    const t = clip(title, 120) || "Note", b = clip(body, 50_000);
    if (where === "notes") {
      if (process.platform !== "darwin") throw new Error("Apple Notes is only on Mac. Save it as a file instead.");
      const script = `tell application "Notes" to make new note with properties {body:${JSON.stringify(notesHtml(t, b))}}`;
      await new Promise((resolve, reject) => execFile("osascript", ["-e", script], { timeout: 20000 }, (e, _o, errOut) => (e ? reject(new Error(String(errOut || e.message).trim().split("\n").pop())) : resolve())));
      return { saved: "Notes" };
    }
    const r = await dialog.showSaveDialog(w.win, { title: "Save note", defaultPath: path.join(app.getPath("documents"), `${t.replace(/[\\/:*?"<>|]/g, " ").slice(0, 60)}.txt`), filters: [{ name: "Text", extensions: ["txt", "md"] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, `${t}\n\n${b}\n`);
    return { saved: r.filePath };
  }

  /** Text of a PDF open in a tab, fetched with that tab's own session (so a school login works). */
  async tabPdfText(w, id) {
    const t = this.browser.tab(w, id);
    const url = String(t.url ?? "");
    if (!/^https?:/i.test(url)) throw new Error("Open the slides in a tab first.");
    const ses = t.view?.webContents.session;
    const res = await (ses ?? (await import("electron")).session.defaultSession).fetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (!/pdf/i.test(type) && !/\.pdf(\?|#|$)/i.test(url)) return null;   // not a PDF: the UI reads the page instead
    const len = Number(res.headers.get("content-length") || 0);
    if (len > 60 * 1024 * 1024) throw new Error("That PDF is too large (over 60 MB).");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 60 * 1024 * 1024) throw new Error("That PDF is too large (over 60 MB).");
    return (await pdfText(buf, 120_000)).slice(0, 120_000);
  }

  async pickFiles(w) {
    const r = await dialog.showOpenDialog(w.win, { title: "Choose the file you're going to submit", properties: ["openFile", "multiSelections"] });
    if (r.canceled) return [];
    return r.filePaths.slice(0, 10).map((p) => ({ name: path.basename(p), size: fs.statSync(p).size }));
  }

  commands() {
    return {
      study_save: (w, { pack, reminders }) => { if (w?.private) throw new Error("Study packs aren't saved in private windows."); return this.save(pack, reminders); },
      study_list: () => this.list(),
      study_get: (_w, { id }) => this.get(id),
      study_delete: (_w, { id }) => this.remove(id),
      timetable_save_ics: (_w, { ics }) => this.saveIcs(ics),
      note_save: (w, args) => this.saveNote(w, args ?? {}),
      slides_pdf_text: (w, { id }) => this.tabPdfText(w, id),
      submit_pick_files: (w) => this.pickFiles(w),
    };
  }
}
