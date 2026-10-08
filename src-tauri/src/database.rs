//! SQLite storage for history, bookmarks, settings and per-site permissions.

use rusqlite::{params, Connection};
use serde::Serialize;
use std::{path::Path, sync::Mutex};

#[derive(Serialize, Clone, Debug)]
pub struct HistoryEntry {
    pub url: String,
    pub title: String,
    pub visited_at: i64,
    pub visit_count: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Bookmark {
    pub url: String,
    pub title: String,
    pub created_at: i64,
    pub folder: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct SitePermission {
    pub host: String,
    pub permission: String,
    pub policy: String,
}

pub struct Db {
    conn: Mutex<Connection>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Escapes LIKE wildcards so user input is matched literally.
fn like_pattern(q: &str) -> String {
    let escaped = q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    format!("%{escaped}%")
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        Self::init(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn memory() -> rusqlite::Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> rusqlite::Result<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS history (
               url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
               visited_at INTEGER NOT NULL, visit_count INTEGER NOT NULL DEFAULT 1);
             CREATE INDEX IF NOT EXISTS idx_history_visited ON history(visited_at DESC);
             CREATE TABLE IF NOT EXISTS bookmarks (
               url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS site_permissions (
               host TEXT NOT NULL, permission TEXT NOT NULL, policy TEXT NOT NULL,
               PRIMARY KEY (host, permission));",
        )?;
        // Bookmarks gained folders after v1; add the column to existing databases (error = already there).
        let _ = conn.execute("ALTER TABLE bookmarks ADD COLUMN folder TEXT NOT NULL DEFAULT ''", []);
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn record_visit(&self, url: &str, title: &str) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO history (url, title, visited_at, visit_count) VALUES (?1, ?2, ?3, 1)
             ON CONFLICT(url) DO UPDATE SET
               title = CASE WHEN excluded.title != '' THEN excluded.title ELSE history.title END,
               visited_at = excluded.visited_at,
               visit_count = history.visit_count + 1",
            params![url, title, now()],
        )?;
        Ok(())
    }

    /// Updates the title of an already-recorded visit without bumping the counter.
    pub fn update_title(&self, url: &str, title: &str) -> rusqlite::Result<()> {
        self.lock()
            .execute("UPDATE history SET title = ?2 WHERE url = ?1", params![url, title])?;
        Ok(())
    }

    pub fn search_history(&self, q: &str, limit: usize) -> rusqlite::Result<Vec<HistoryEntry>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT url, title, visited_at, visit_count FROM history
             WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\'
             ORDER BY visit_count DESC, visited_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![like_pattern(q), limit as i64], |r| {
            Ok(HistoryEntry { url: r.get(0)?, title: r.get(1)?, visited_at: r.get(2)?, visit_count: r.get(3)? })
        })?;
        rows.collect()
    }

    pub fn clear_history(&self) -> rusqlite::Result<()> {
        self.lock().execute("DELETE FROM history", [])?;
        Ok(())
    }

    pub fn toggle_bookmark(&self, url: &str, title: &str) -> rusqlite::Result<bool> {
        let conn = self.lock();
        let removed = conn.execute("DELETE FROM bookmarks WHERE url = ?1", params![url])?;
        if removed > 0 {
            return Ok(false);
        }
        conn.execute(
            "INSERT INTO bookmarks (url, title, created_at) VALUES (?1, ?2, ?3)",
            params![url, title, now()],
        )?;
        Ok(true)
    }

    pub fn set_bookmark_folder(&self, url: &str, folder: &str) -> rusqlite::Result<()> {
        self.lock().execute("UPDATE bookmarks SET folder = ?2 WHERE url = ?1", params![url, folder])?;
        Ok(())
    }

    /// Adds bookmarks that are not already saved; returns how many were new.
    pub fn import_bookmarks(&self, items: &[(String, String, String)]) -> rusqlite::Result<usize> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let mut added = 0;
        for (url, title, folder) in items {
            added += tx.execute(
                "INSERT OR IGNORE INTO bookmarks (url, title, created_at, folder) VALUES (?1, ?2, ?3, ?4)",
                params![url, title, now(), folder],
            )?;
        }
        tx.commit()?;
        Ok(added)
    }

    pub fn bookmarks(&self, q: &str, limit: usize) -> rusqlite::Result<Vec<Bookmark>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT url, title, created_at, folder FROM bookmarks
             WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\'
             ORDER BY created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![like_pattern(q), limit as i64], |r| {
            Ok(Bookmark { url: r.get(0)?, title: r.get(1)?, created_at: r.get(2)?, folder: r.get(3)? })
        })?;
        rows.collect()
    }

    pub fn get_setting(&self, key: &str) -> Option<String> {
        self.lock()
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .ok()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn set_permission(&self, host: &str, permission: &str, policy: &str) -> rusqlite::Result<()> {
        let conn = self.lock();
        if policy == "ask" {
            conn.execute(
                "DELETE FROM site_permissions WHERE host = ?1 AND permission = ?2",
                params![host, permission],
            )?;
        } else {
            conn.execute(
                "INSERT INTO site_permissions (host, permission, policy) VALUES (?1, ?2, ?3)
                 ON CONFLICT(host, permission) DO UPDATE SET policy = excluded.policy",
                params![host, permission, policy],
            )?;
        }
        Ok(())
    }

    pub fn permissions(&self) -> rusqlite::Result<Vec<SitePermission>> {
        let conn = self.lock();
        let mut stmt =
            conn.prepare("SELECT host, permission, policy FROM site_permissions ORDER BY host, permission")?;
        let rows = stmt.query_map([], |r| {
            Ok(SitePermission { host: r.get(0)?, permission: r.get(1)?, policy: r.get(2)? })
        })?;
        rows.collect()
    }

    pub fn permissions_for(&self, host: &str) -> Vec<SitePermission> {
        self.permissions()
            .unwrap_or_default()
            .into_iter()
            .filter(|p| p.host == host)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_counts_and_searches() {
        let db = Db::memory().unwrap();
        db.record_visit("https://a.com/", "A").unwrap();
        db.record_visit("https://a.com/", "").unwrap();
        let r = db.search_history("a.com", 5).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].visit_count, 2);
        assert_eq!(r[0].title, "A");
    }

    #[test]
    fn like_wildcards_are_literal() {
        let db = Db::memory().unwrap();
        db.record_visit("https://a.com/", "A").unwrap();
        assert!(db.search_history("%", 5).unwrap().is_empty());
    }

    #[test]
    fn bookmark_folders_and_import_dedupe() {
        let db = Db::memory().unwrap();
        let items = vec![
            ("https://a.com/".to_string(), "A".to_string(), "Work".to_string()),
            ("https://b.com/".to_string(), "B".to_string(), String::new()),
        ];
        assert_eq!(db.import_bookmarks(&items).unwrap(), 2);
        assert_eq!(db.import_bookmarks(&items).unwrap(), 0);
        db.set_bookmark_folder("https://b.com/", "School").unwrap();
        let all = db.bookmarks("", 10).unwrap();
        assert_eq!(all.iter().find(|b| b.url == "https://b.com/").unwrap().folder, "School");
    }

    #[test]
    fn bookmark_toggles() {
        let db = Db::memory().unwrap();
        assert!(db.toggle_bookmark("https://a.com/", "A").unwrap());
        assert_eq!(db.bookmarks("", 10).unwrap().len(), 1);
        assert!(!db.toggle_bookmark("https://a.com/", "A").unwrap());
    }

    #[test]
    fn permissions_ask_clears_rule() {
        let db = Db::memory().unwrap();
        db.set_permission("a.com", "camera", "block").unwrap();
        assert_eq!(db.permissions_for("a.com").len(), 1);
        db.set_permission("a.com", "camera", "ask").unwrap();
        assert!(db.permissions_for("a.com").is_empty());
    }
}
