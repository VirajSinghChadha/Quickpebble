// Routines: a saved list of steps the person taught by doing the task once (or imported from a friend). Every routine is checked
// against one allow-list of step types, here, whether it is saved, imported or run. A routine never runs on its own: running
// always starts with the full list of steps for the person to approve, and a schedule only reminds them.
import { dialog, Notification } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { frontApp } from "./system.mjs";

export const FORMAT = "quick-pebble-routine";
export const MAX_STEPS = 30;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} .,'&()_-]{0,59}$/u;
const APP = /^[\p{L}\p{N}][\p{L}\p{N} .&+()'_-]{0,59}$/u;
const TRIGGER = /^[\p{L}\p{N}][\p{L}\p{N} '-]{1,39}$/u;
export const PANELS = new Set(["cleanup", "school", "changes"]);
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** The only things a routine may do. Anything else makes the whole routine invalid (it's never half-loaded). */
export const STEP_TYPES = {
  open_url: (s) => { const u = clean(s.url, 2000); try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? { type: "open_url", url: p.href } : "only http(s) web addresses can be opened"; } catch { return "not a web address"; } },
  click: (s) => { const label = clean(s.label, 120); return label ? { type: "click", label } : "a click needs the button's or link's text"; },
  type: (s) => { const label = clean(s.label, 120); return label ? { type: "type", label, text: clean(s.text, 500), secret: s.secret === true } : "typing needs the field's name"; },
  select: (s) => { const label = clean(s.label, 120), text = clean(s.text, 120); return label && text ? { type: "select", label, text } : "a choice needs the field and the option"; },
  open_app: (s) => { const app = clean(s.app, 60); return APP.test(app) ? { type: "open_app", app } : "app names are plain words only"; },
  wait: (s) => { const n = Math.round(Number(s.seconds)); return n >= 1 && n <= 60 ? { type: "wait", seconds: n } : "waits are 1 to 60 seconds"; },
  do: (s) => { const text = clean(s.text, 300); return text.length >= 3 ? { type: "do", text } : "an instruction needs some words"; },
  open_panel: (s) => (PANELS.has(s.panel) ? { type: "open_panel", panel: s.panel } : "unknown panel"),
};

/** Checks a whole routine. Returns { routine } when every part is allowed, or { problems } listing each thing that isn't. */
export function validateRoutine(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object") return { problems: ["That isn't a routine."] };
  const name = clean(raw.name, 60);
  if (!NAME.test(name)) problems.push("The name must be plain words (up to 60 characters).");
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  if (!steps.length) problems.push("It has no steps.");
  if (steps.length > MAX_STEPS) problems.push(`It has ${steps.length} steps; the most allowed is ${MAX_STEPS}.`);
  const out = [];
  steps.slice(0, MAX_STEPS).forEach((s, i) => {
    const check = STEP_TYPES[s?.type];
    if (!check || !Object.hasOwn(STEP_TYPES, s.type)) return problems.push(`Step ${i + 1}: “${clean(s?.type, 30) || "?"}” isn't an allowed kind of step.`);
    const r = check(s);
    if (typeof r === "string") problems.push(`Step ${i + 1}: ${r}.`); else out.push(r);
  });
  const trigger = raw.trigger ? clean(raw.trigger, 40).toLowerCase() : "";
  if (trigger && !TRIGGER.test(trigger)) problems.push("The shortcut phrase must be 2 to 40 letters or numbers.");
  const sched = raw.schedule;
  let schedule = null;
  if (sched) {
    const days = Array.isArray(sched.days) ? [...new Set(sched.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    if (!days.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(sched.time))) problems.push("The schedule needs days and a time like 16:30.");
    else schedule = { days, time: sched.time };
  }
  return problems.length ? { problems } : { routine: { name, steps: out, trigger: trigger || null, schedule } };
}

/** Turns what the person did while teaching into steps: page visits, clicks, typing, choices and app switches, tidied up. */
export function stepsFromEvents(events) {
  const steps = [];
  for (const e of events) {
    const last = steps[steps.length - 1];
    if (e.kind === "nav") {
      // A click that led straight to a new page is enough; otherwise remember the page itself.
      if (last?.type === "open_url") last.url = e.url;
      else if (last?.type !== "click") steps.push({ type: "open_url", url: e.url });
    } else if (e.kind === "click") steps.push({ type: "click", label: e.label });
    else if (e.kind === "type") {
      if (last?.type === "type" && last.label === e.label) { last.text = e.text; last.secret = !!e.secret; }
      else steps.push({ type: "type", label: e.label, text: e.secret ? "" : e.text, secret: !!e.secret });
    } else if (e.kind === "select") steps.push({ type: "select", label: e.label, text: e.text });
    else if (e.kind === "app" && last?.type !== "open_app") steps.push({ type: "open_app", app: e.app });
  }
  return steps.filter((s) => (s.type === "click" ? !!s.label : true)).slice(0, MAX_STEPS).map((s) => (STEP_TYPES[s.type]?.(s))).filter((s) => s && typeof s === "object");
}

/** Is a routine due at this moment (its day, its minute), and not already announced within the last hour? */
export function isDue(schedule, lastAnnounced, at = new Date()) {
  if (!schedule) return false;
  const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return schedule.days.includes(at.getDay()) && schedule.time === hhmm && (!lastAnnounced || at.getTime() - lastAnnounced > 3600_000);
}

export class Routines {
  constructor(db, browser) {
    this.db = db; this.browser = browser;
    this.teach = null;
    this.imports = new Map();
    db.d.exec("CREATE TABLE IF NOT EXISTS routines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, body TEXT NOT NULL, imported INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, announced INTEGER)");
    browser.onTeach = (win, _t, e) => { if (this.teach?.win === win && this.teach.events.length < 500) this.teach.events.push({ ...e, at: Date.now() }); };
    this.timer = setInterval(() => this.announce(), 30_000);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); clearInterval(this.teach?.poll); }

  list() {
    return this.db.all("SELECT id, name, body, imported, created FROM routines ORDER BY name").map((r) => ({ id: Number(r.id), ...JSON.parse(r.body), imported: !!r.imported, created: Number(r.created) }));
  }
  get(id) { const r = this.list().find((x) => x.id === Number(id)); if (!r) throw new Error("That routine is gone."); return r; }
  save(raw, { id = null, imported = false } = {}) {
    const v = validateRoutine(raw);
    if (v.problems) throw new Error(v.problems.join(" "));
    const clash = v.routine.trigger && this.list().find((r) => r.trigger === v.routine.trigger && r.id !== Number(id));
    if (clash) throw new Error(`“${clash.name}” already uses the phrase “${v.routine.trigger}”.`);
    if (id) { if (!this.db.run("UPDATE routines SET name = ?2, body = ?3 WHERE id = ?1", Number(id), v.routine.name, JSON.stringify(v.routine)).changes) throw new Error("That routine is gone."); return Number(id); }
    if (this.db.get("SELECT count(*) AS n FROM routines").n >= 100) throw new Error("You can keep up to 100 routines.");
    return Number(this.db.run("INSERT INTO routines (name, body, imported, created) VALUES (?1, ?2, ?3, ?4)", v.routine.name, JSON.stringify(v.routine), imported ? 1 : 0, Date.now()).lastInsertRowid);
  }
  remove(id) { this.db.run("DELETE FROM routines WHERE id = ?1", Number(id)); }

  // ---- teach by showing
  startTeaching(win) {
    if (win.private) throw new Error("Routines can't be taught in a private window.");
    this.stopTeaching();
    win.teach = true;
    this.teach = { win, events: [], lastApp: null };
    // The page open when teaching starts is where the routine begins.
    const current = win.tabs.get(win.active);
    if (current?.url && /^https?:/i.test(current.url)) this.teach.events.push({ kind: "nav", url: current.url, title: current.title, at: Date.now() });
    for (const t of win.tabs.values()) t.view?.webContents.executeJavaScript("window.__qpTeach && window.__qpTeach(true)").catch(() => {});
    // Outside the browser: notice which app is in front, every 2 seconds (macOS). Nothing about the app's content is read.
    this.teach.poll = setInterval(async () => {
      const app = await frontApp().catch(() => null);
      if (!this.teach || !app || /^(Quick Pebble|Electron)$/i.test(app) || app === this.teach.lastApp) return;
      this.teach.lastApp = app;
      this.teach.events.push({ kind: "app", app, at: Date.now() });
    }, 2000);
    this.teach.poll.unref?.();
    return true;
  }
  stopTeaching() {
    const t = this.teach;
    if (!t) return [];
    clearInterval(t.poll);
    t.win.teach = false;
    for (const tab of t.win.tabs.values()) tab.view?.webContents.executeJavaScript("window.__qpTeach && window.__qpTeach(false)").catch(() => {});
    this.teach = null;
    return stepsFromEvents(t.events);
  }

  // ---- sharing
  async exportFile(w, id) {
    const r = this.get(id);
    const out = await dialog.showSaveDialog(w.win, { title: "Export routine", defaultPath: `${r.name.replace(/[\\/:*?"<>|]/g, " ")}.qproutine`, filters: [{ name: "Quick Pebble routine", extensions: ["qproutine"] }] });
    if (out.canceled || !out.filePath) return null;
    fs.writeFileSync(out.filePath, JSON.stringify({ format: FORMAT, version: 1, name: r.name, steps: r.steps, trigger: r.trigger ?? undefined }, null, 2));
    return out.filePath;
  }
  /** Reads a routine file and checks it. Nothing is saved until the person has seen every step and confirms. */
  async importFile(w) {
    const r = await dialog.showOpenDialog(w.win, { title: "Import a routine", properties: ["openFile"], filters: [{ name: "Quick Pebble routine", extensions: ["qproutine", "json"] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return this.checkImport(fs.readFileSync(r.filePaths[0], "utf8").slice(0, 300_001), path.basename(r.filePaths[0]));
  }
  checkImport(text, file = "routine") {
    if (text.length > 300_000) return { file, problems: ["That file is too large to be a routine."] };
    let raw;
    try { raw = JSON.parse(text); } catch { return { file, problems: ["That file isn't a routine (it isn't readable)."] }; }
    if (raw?.format !== FORMAT) return { file, problems: ["That file isn't a Quick Pebble routine."] };
    const v = validateRoutine({ ...raw, schedule: null });
    if (v.problems) return { file, problems: v.problems };
    const token = `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.imports.set(token, v.routine);
    return { file, token, routine: v.routine };
  }
  confirmImport(token) {
    const r = this.imports.get(token);
    if (!r) throw new Error("Import the file again.");
    this.imports.delete(token);
    return this.save(r, { imported: true });
  }

  /** Scheduled routines only remind: a notification, and the plan opens for the person to approve. */
  announce(at = new Date()) {
    let n = 0;
    for (const row of this.db.all("SELECT id, body, announced FROM routines")) {
      const r = JSON.parse(row.body);
      if (!isDue(r.schedule, row.announced == null ? null : Number(row.announced), at)) continue;
      this.db.run("UPDATE routines SET announced = ?2 WHERE id = ?1", row.id, at.getTime());
      n++;
      const open = () => { for (const w of this.browser.windows.values()) if (!w.private) { this.browser.emitUi(w, "qp://routine-due", { id: Number(row.id) }); w.win.show(); break; } };
      try { if (Notification.isSupported()) { const note = new Notification({ title: `Time for “${r.name}”`, body: "Open Quick Pebble to check the steps and run it." }); note.on("click", open); note.show(); } } catch { /* notifications off */ }
      open();
    }
    return n;
  }

  openApp(app) {
    if (!APP.test(String(app))) throw new Error("That isn't an app name.");
    return new Promise((resolve, reject) => {
      const done = (e) => (e ? reject(new Error(`Couldn't open ${app}. Is it installed?`)) : resolve(true));
      if (process.platform === "darwin") execFile("open", ["-a", app], { timeout: 15000 }, done);
      else if (process.platform === "win32") execFile("powershell", ["-NoProfile", "-Command", "Start-Process", "-FilePath", app], { timeout: 15000, windowsHide: true }, done);
      else reject(new Error("Opening apps works on macOS and Windows."));
    });
  }

  commands() {
    return {
      routines_list: () => this.list(),
      routine_save: (_w, { routine, id }) => this.save(routine, { id }),
      routine_delete: (_w, { id }) => this.remove(id),
      routine_teach_start: (w) => this.startTeaching(w),
      routine_teach_stop: () => this.stopTeaching(),
      routine_export: (w, { id }) => this.exportFile(w, id),
      routine_import: (w) => this.importFile(w),
      routine_import_confirm: (_w, { token }) => this.confirmImport(token),
      routine_open_app: (_w, { app }) => this.openApp(app),
    };
  }
}
