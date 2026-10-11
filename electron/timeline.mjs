// "A timeline of my day" (opt-in, off by default, on this computer only). Scroll back through pages read, files downloaded,
// chats had and tasks the assistant ran. Pages and assistant tasks are written to a small table only while it is on and
// never from private windows; downloads, chats and clean-ups come from what the app already keeps. "Clear all" empties the
// table and hides everything before that moment, so nothing older shows up again.
const DAY = 86400;
export const KEEP_DAYS = 30;
export const MAX_ROWS = 20000;
const KINDS = new Set(["page", "task"]);
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Start and end (unix seconds) of a local calendar day "YYYY-MM-DD". */
export function dayBounds(day, tzOffsetMin = new Date().getTimezoneOffset()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  if (!m) throw new Error("A day looks like 2026-10-11.");
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000 + tzOffsetMin * 60;
  return [start, start + DAY];
}

/** Collapses runs of visits to the same site within 10 minutes into one entry, so the day reads like a story. */
export function collapse(events) {
  const out = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (prev && e.kind === "page" && prev.kind === "page" && prev.site === e.site && prev.at - e.at < 600) { prev.count = (prev.count ?? 1) + 1; continue; }
    out.push({ ...e });
  }
  return out;
}

const siteOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

export class Timeline {
  constructor(db) {
    this.db = db;
    db.d.exec(`CREATE TABLE IF NOT EXISTS timeline (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS idx_timeline_at ON timeline(at);`);
  }
  get on() { return this.db.getSetting("timeline_enabled") === "1"; }
  get clearedAt() { return Number(this.db.getSetting("timeline_cleared_at")) || 0; }

  note(kind, title, detail = "", at = Math.floor(Date.now() / 1000)) {
    if (!this.on || !KINDS.has(kind)) return false;
    if (kind === "page" && !/^https?:/i.test(detail)) return false;
    this.db.run("INSERT INTO timeline (at, kind, title, detail) VALUES (?1, ?2, ?3, ?4)", at, kind, clip(title, 200) || clip(detail, 200), clip(detail, 600));
    this.db.run("DELETE FROM timeline WHERE at < ?1 OR id NOT IN (SELECT id FROM timeline ORDER BY id DESC LIMIT ?2)", at - KEEP_DAYS * DAY, MAX_ROWS);
    return true;
  }

  /** Everything on one day, newest first. Empty while the timeline is off. */
  day(day) {
    if (!this.on) return { on: false, events: [] };
    const [start0, end] = dayBounds(day);
    const start = Math.max(start0, this.clearedAt);
    const rows = [];
    for (const r of this.db.all("SELECT at, kind, title, detail FROM timeline WHERE at >= ?1 AND at < ?2", start, end)) rows.push({ at: Number(r.at), kind: r.kind, title: r.title, detail: r.detail, site: r.kind === "page" ? siteOf(r.detail) : "" });
    const has = (t) => !!this.db.get("SELECT name FROM sqlite_master WHERE name = ?1", t);
    for (const r of this.db.all("SELECT name, url, finished FROM downloads WHERE ok = 1 AND finished >= ?1 AND finished < ?2", start, end)) rows.push({ at: Number(r.finished), kind: "download", title: r.name, detail: siteOf(r.url) });
    if (has("ctx_chats")) for (const r of this.db.all("SELECT title, last_used FROM ctx_chats WHERE last_used >= ?1 AND last_used < ?2", start, end)) rows.push({ at: Number(r.last_used), kind: "chat", title: r.title || "Untitled chat", detail: "" });
    if (has("receipts")) for (const r of this.db.all("SELECT title, at, done FROM receipts WHERE at >= ?1 AND at < ?2", start, end)) rows.push({ at: Number(r.at), kind: "change", title: r.title, detail: `${r.done} change${Number(r.done) === 1 ? "" : "s"}` });
    rows.sort((a, b) => b.at - a.at);
    return { on: true, events: collapse(rows).slice(0, 1000) };
  }

  clear() {
    this.db.run("DELETE FROM timeline");
    this.db.setSetting("timeline_cleared_at", String(Math.floor(Date.now() / 1000)));
  }

  commands() {
    return {
      timeline_day: (_w, { day }) => this.day(day),
      timeline_note: (w, { kind, title, detail }) => (w?.private ? false : this.note(kind === "task" ? "task" : "", title, detail)),
      timeline_clear: () => this.clear(),
    };
  }
}
