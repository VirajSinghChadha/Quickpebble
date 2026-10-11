// Projects and chats the assistant remembers. Everything lives in the app's own database on this computer; nothing is synced.
// A "project" is a name plus notes the person wrote (what it is, where files live, what matters). The assistant gets the
// active project's notes with every request so it keeps context. Chats persist so a conversation can be continued later.
const now = () => Math.floor(Date.now() / 1000);
const DAY = 86400;
export const LIMITS = { name: 80, notes: 8000, title: 80, message: 6000, messagesPerChat: 1500, chats: 500, projects: 100 };
const KINDS = new Set(["user", "assistant", "say", "step", "error", "question"]);
const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const int = (v) => (Number.isInteger(v) && v > 0 ? v : null);

/** Chats and projects not used for `days` days, newest-unused last. Pure, so the rule is easy to test. */
export function staleRows(rows, days, at = now()) {
  const cutoff = at - Math.max(1, Math.floor(days)) * DAY;
  return rows.filter((r) => r.last_used < cutoff).sort((a, b) => a.last_used - b.last_used);
}

export class ContextStore {
  constructor(db) {
    this.db = db;
    db.d.exec(`CREATE TABLE IF NOT EXISTS ctx_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, last_used INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ctx_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', project_id INTEGER, created INTEGER NOT NULL, last_used INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ctx_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL REFERENCES ctx_chats(id) ON DELETE CASCADE, kind TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_ctx_messages_chat ON ctx_messages(chat_id, id);`);
    db.d.exec("PRAGMA foreign_keys = ON");
  }

  // ------------------------------------------------------------ projects
  projects() {
    return this.db.all("SELECT id, name, notes, created, last_used, length(name) + length(notes) AS bytes FROM ctx_projects ORDER BY last_used DESC LIMIT ?1", LIMITS.projects);
  }
  saveProject({ id, name, notes }) {
    const n = clip(name, LIMITS.name);
    if (!n) throw new Error("A project needs a name.");
    const body = clip(notes, LIMITS.notes);
    const pid = int(id);
    if (pid) {
      if (!this.db.run("UPDATE ctx_projects SET name = ?2, notes = ?3, last_used = ?4 WHERE id = ?1", pid, n, body, now()).changes) throw new Error("That project no longer exists.");
      return pid;
    }
    if (this.db.get("SELECT COUNT(*) AS c FROM ctx_projects").c >= LIMITS.projects) throw new Error(`You can keep up to ${LIMITS.projects} projects. Delete some first.`);
    return Number(this.db.run("INSERT INTO ctx_projects (name, notes, created, last_used) VALUES (?1, ?2, ?3, ?3)", n, body, now()).lastInsertRowid);
  }
  deleteProject(id) {
    const pid = int(id);
    if (!pid) return false;
    this.db.run("UPDATE ctx_chats SET project_id = NULL WHERE project_id = ?1", pid);
    return this.db.run("DELETE FROM ctx_projects WHERE id = ?1", pid).changes > 0;
  }
  touchProject(id) { const pid = int(id); if (pid) this.db.run("UPDATE ctx_projects SET last_used = ?2 WHERE id = ?1", pid, now()); }

  // ------------------------------------------------------------ chats
  chats() {
    return this.db.all(`SELECT c.id, c.title, c.project_id, c.created, c.last_used,
        (SELECT COUNT(*) FROM ctx_messages m WHERE m.chat_id = c.id) AS messages,
        (SELECT COALESCE(SUM(length(m.text)), 0) FROM ctx_messages m WHERE m.chat_id = c.id) + length(c.title) AS bytes
      FROM ctx_chats c ORDER BY c.last_used DESC LIMIT ?1`, LIMITS.chats);
  }
  newChat({ title, projectId } = {}) {
    const total = this.db.get("SELECT COUNT(*) AS c FROM ctx_chats").c;
    if (total >= LIMITS.chats) this.db.run("DELETE FROM ctx_chats WHERE id IN (SELECT id FROM ctx_chats ORDER BY last_used ASC LIMIT ?1)", total - LIMITS.chats + 1);
    return Number(this.db.run("INSERT INTO ctx_chats (title, project_id, created, last_used) VALUES (?1, ?2, ?3, ?3)", clip(title, LIMITS.title), int(projectId), now()).lastInsertRowid);
  }
  loadChat(id) {
    const cid = int(id);
    const chat = cid && this.db.get("SELECT id, title, project_id FROM ctx_chats WHERE id = ?1", cid);
    if (!chat) throw new Error("That chat no longer exists.");
    this.db.run("UPDATE ctx_chats SET last_used = ?2 WHERE id = ?1", cid, now());
    return { ...chat, items: this.db.all("SELECT kind, text FROM ctx_messages WHERE chat_id = ?1 ORDER BY id", cid) };
  }
  appendMessages(chatId, items) {
    const cid = int(chatId);
    if (!cid || !this.db.get("SELECT 1 AS x FROM ctx_chats WHERE id = ?1", cid)) throw new Error("That chat no longer exists.");
    const t = now();
    this.db.d.exec("BEGIN");
    try {
      for (const it of Array.isArray(items) ? items.slice(0, 200) : []) {
        const text = clip(it?.text, LIMITS.message);
        if (KINDS.has(it?.kind) && text) this.db.run("INSERT INTO ctx_messages (chat_id, kind, text, created) VALUES (?1, ?2, ?3, ?4)", cid, it.kind, text, t);
      }
      this.db.run("DELETE FROM ctx_messages WHERE chat_id = ?1 AND id NOT IN (SELECT id FROM ctx_messages WHERE chat_id = ?1 ORDER BY id DESC LIMIT ?2)", cid, LIMITS.messagesPerChat);
      this.db.run("UPDATE ctx_chats SET last_used = ?2 WHERE id = ?1", cid, t);
      this.db.d.exec("COMMIT");
    } catch (e) { this.db.d.exec("ROLLBACK"); throw e; }
  }
  renameChat(id, title) { const cid = int(id); if (cid) this.db.run("UPDATE ctx_chats SET title = ?2 WHERE id = ?1", cid, clip(title, LIMITS.title)); }
  setChatProject(id, projectId) { const cid = int(id); if (cid) this.db.run("UPDATE ctx_chats SET project_id = ?2 WHERE id = ?1", cid, int(projectId)); }

  // ------------------------------------------------------------ storage
  usage() {
    const one = (sql) => this.db.get(sql);
    const messages = one("SELECT COUNT(*) AS c, COALESCE(SUM(length(text)), 0) AS b FROM ctx_messages");
    const projects = one("SELECT COUNT(*) AS c, COALESCE(SUM(length(name) + length(notes)), 0) AS b FROM ctx_projects");
    return { chats: one("SELECT COUNT(*) AS c FROM ctx_chats").c, messages: messages.c, projects: projects.c, bytes: messages.b + projects.b };
  }
  /** Exactly what a clean-up of things unused for `days` days would erase. Nothing is deleted here. */
  stale(days) {
    const d = Math.min(3650, Math.max(1, Math.floor(Number(days) || 30)));
    return {
      days: d,
      chats: staleRows(this.chats(), d).map((c) => ({ id: c.id, title: c.title || "Untitled chat", last_used: c.last_used, bytes: c.bytes, messages: c.messages })),
      projects: staleRows(this.projects(), d).map((p) => ({ id: p.id, title: p.name, last_used: p.last_used, bytes: p.bytes })),
    };
  }
  /** Deletes only the ids it is given (the ones the person confirmed). */
  clear({ chatIds, projectIds }) {
    const ids = (v) => (Array.isArray(v) ? v.map(int).filter(Boolean).slice(0, 1000) : []);
    let chats = 0, projects = 0;
    this.db.d.exec("BEGIN");
    try {
      for (const id of ids(chatIds)) chats += Number(this.db.run("DELETE FROM ctx_chats WHERE id = ?1", id).changes);
      for (const id of ids(projectIds)) { this.db.run("UPDATE ctx_chats SET project_id = NULL WHERE project_id = ?1", id); projects += Number(this.db.run("DELETE FROM ctx_projects WHERE id = ?1", id).changes); }
      this.db.d.exec("COMMIT");
    } catch (e) { this.db.d.exec("ROLLBACK"); throw e; }
    return { chats, projects };
  }

  /** Commands exposed to the UI. */
  commands() {
    return {
      ctx_projects: () => this.projects(),
      ctx_project_save: (_w, { project }) => this.saveProject(project ?? {}),
      ctx_project_delete: (_w, { id }) => this.deleteProject(id),
      ctx_project_touch: (_w, { id }) => this.touchProject(id),
      ctx_chats: () => this.chats(),
      ctx_chat_new: (_w, { title, projectId }) => this.newChat({ title, projectId }),
      ctx_chat_load: (_w, { id }) => this.loadChat(id),
      ctx_chat_append: (_w, { id, items }) => this.appendMessages(id, items),
      ctx_chat_rename: (_w, { id, title }) => this.renameChat(id, title),
      ctx_chat_project: (_w, { id, projectId }) => this.setChatProject(id, projectId),
      ctx_usage: () => this.usage(),
      ctx_stale: (_w, { days }) => this.stale(days),
      ctx_clear: (_w, args) => this.clear(args ?? {}),
    };
  }
}
