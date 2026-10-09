// SQLite storage (port of database.rs) on Node's built-in sqlite. FTS5 powers Recall.
import { DatabaseSync } from "node:sqlite";

const now = () => Math.floor(Date.now() / 1000);
const like = (q) => `%${String(q).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;

export class Db {
  constructor(path) {
    this.d = new DatabaseSync(path);
    this.d.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS history (url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', visited_at INTEGER NOT NULL, visit_count INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS idx_history_visited ON history(visited_at DESC);
      CREATE TABLE IF NOT EXISTS bookmarks (url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, folder TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS vault_meta (k TEXT PRIMARY KEY, v BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS vault_items (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT NOT NULL, username TEXT NOT NULL, blob BLOB NOT NULL, created_at INTEGER NOT NULL, UNIQUE(host, username));
      CREATE TABLE IF NOT EXISTS vault_never (host TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS downloads (id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, path TEXT NOT NULL, ok INTEGER NOT NULL, started INTEGER NOT NULL, finished INTEGER NOT NULL, size INTEGER);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS site_permissions (host TEXT NOT NULL, permission TEXT NOT NULL, policy TEXT NOT NULL, PRIMARY KEY (host, permission));
      CREATE VIRTUAL TABLE IF NOT EXISTS recall_fts USING fts5(url UNINDEXED, title, body, at UNINDEXED, tokenize = 'porter unicode61');`);
  }
  run(sql, ...p) { return this.d.prepare(sql).run(...p); }
  all(sql, ...p) { return this.d.prepare(sql).all(...p); }
  get(sql, ...p) { return this.d.prepare(sql).get(...p); }

  recordVisit(url, title) {
    this.run(`INSERT INTO history (url, title, visited_at, visit_count) VALUES (?1, ?2, ?3, 1)
      ON CONFLICT(url) DO UPDATE SET title = CASE WHEN excluded.title != '' THEN excluded.title ELSE history.title END,
      visited_at = excluded.visited_at, visit_count = history.visit_count + 1`, url, title, now());
  }
  updateTitle(url, title) { this.run("UPDATE history SET title = ?2 WHERE url = ?1", url, title); }
  searchHistory(q, limit) {
    return this.all(`SELECT url, title, visited_at, visit_count FROM history WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\'
      ORDER BY visit_count DESC, visited_at DESC LIMIT ?2`, like(q), limit);
  }
  clearHistory() { this.run("DELETE FROM history"); this.recallClear(); }

  toggleBookmark(url, title) {
    if (this.run("DELETE FROM bookmarks WHERE url = ?1", url).changes > 0) return false;
    this.run("INSERT INTO bookmarks (url, title, created_at) VALUES (?1, ?2, ?3)", url, title, now());
    return true;
  }
  bookmarks(q, limit) {
    return this.all(`SELECT url, title, created_at, folder FROM bookmarks WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\' ORDER BY created_at DESC LIMIT ?2`, like(q), limit);
  }
  setBookmarkFolder(url, folder) { this.run("UPDATE bookmarks SET folder = ?2 WHERE url = ?1", url, folder); }
  importBookmarks(items) {
    let added = 0;
    this.d.exec("BEGIN");
    try {
      for (const { url, title, folder } of items) added += Number(this.run("INSERT OR IGNORE INTO bookmarks (url, title, created_at, folder) VALUES (?1, ?2, ?3, ?4)", url, title, now(), folder).changes);
      this.d.exec("COMMIT");
    } catch (e) { this.d.exec("ROLLBACK"); throw e; }
    return added;
  }

  getSetting(key) { return this.get("SELECT value FROM settings WHERE key = ?1", key)?.value; }
  setSetting(key, value) {
    this.run("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }
  setPermission(host, permission, policy) {
    if (policy === "ask") this.run("DELETE FROM site_permissions WHERE host = ?1 AND permission = ?2", host, permission);
    else this.run("INSERT INTO site_permissions (host, permission, policy) VALUES (?1, ?2, ?3) ON CONFLICT(host, permission) DO UPDATE SET policy = excluded.policy", host, permission, policy);
  }
  permissions() { return this.all("SELECT host, permission, policy FROM site_permissions ORDER BY host, permission"); }
  permissionsFor(host) { return this.permissions().filter((p) => p.host === host); }

  downloadsPut(d) {
    this.run("INSERT OR REPLACE INTO downloads (id, name, url, path, ok, started, finished, size) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", d.id, d.name, d.url, d.path, d.ok ? 1 : 0, d.started, d.finished, d.size ?? null);
  }
  downloadsRecent(limit) { return this.all("SELECT id, name, url, path, ok, started, finished, size FROM downloads ORDER BY id DESC LIMIT ?1", limit); }
  downloadsDelete(id) { this.run("DELETE FROM downloads WHERE id = ?1", id); }
  downloadsClear() { this.run("DELETE FROM downloads"); }

  // ---- Recall (opt-in, on-device page text index) ----
  recallPut(url, title, body) {
    const REFRESH = 600, MAX_PAGES = 2000;
    const recent = this.get("SELECT at FROM recall_fts WHERE url = ?1", url)?.at;
    if (recent != null && now() - Number(recent) < REFRESH) return;
    this.run("DELETE FROM recall_fts WHERE url = ?1", url);
    this.run("INSERT INTO recall_fts (url, title, body, at) VALUES (?1, ?2, ?3, ?4)", url, title, body, now());
    this.run("DELETE FROM recall_fts WHERE rowid IN (SELECT rowid FROM recall_fts ORDER BY at ASC LIMIT max(0, (SELECT count(*) FROM recall_fts) - ?1))", MAX_PAGES);
  }
  recallSearch(expr, limit) {
    return this.all(`SELECT url, title, snippet(recall_fts, 2, '', '', ' … ', 48) AS snippet, at FROM recall_fts
      WHERE recall_fts MATCH ?1 ORDER BY bm25(recall_fts, 0.0, 5.0, 1.0, 0.0) LIMIT ?2`, expr, limit).map((r) => ({ ...r, at: Number(r.at) }));
  }
  recallCount() { return Number(this.get("SELECT count(*) AS n FROM recall_fts").n); }
  recallForget(url) { this.run("DELETE FROM recall_fts WHERE url = ?1", url); }
  recallClear() { this.run("DELETE FROM recall_fts"); }
}
