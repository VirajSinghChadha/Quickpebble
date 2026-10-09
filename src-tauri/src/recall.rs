//! Recall: an opt-in, on-device full-text index of the pages you read, so you (and the assistant)
//! can find "that article about X" later. Nothing leaves the machine; it lives in the same SQLite
//! file as history, is never written in private windows, and is cleared with history.

use crate::database::{Db, RecallHit};
use serde::Serialize;
use tauri::State;
use url::Url;

/// Pages shorter than this are navigation shells, not something worth remembering.
const MIN_BODY_CHARS: usize = 300;
const MAX_BODY_CHARS: usize = 12_000;

/// Hosts and paths where the page text is likely personal or financial. Never indexed.
const SENSITIVE_HOST_PARTS: &[&str] = &[
    "bank", "paypal", "mail.", "webmail", "accounts.", "login.", "signin.", "auth.", "sso.", "secure.", "wallet", "health", "patient",
];
const SENSITIVE_PATH_PARTS: &[&str] = &[
    "login", "signin", "sign-in", "signup", "sign-up", "checkout", "payment", "billing", "password", "account", "oauth", "2fa", "verify",
];

/// True for pages that are fine to remember: public http(s) pages that don't look like logins,
/// payments or webmail.
pub fn is_indexable(url: &str) -> bool {
    let Ok(u) = Url::parse(url) else { return false };
    if !matches!(u.scheme(), "http" | "https") {
        return false;
    }
    let Some(host) = u.host_str().map(str::to_lowercase) else { return false };
    if host == "localhost" || host.ends_with(".local") || host.parse::<std::net::IpAddr>().is_ok() {
        return false;
    }
    if SENSITIVE_HOST_PARTS.iter().any(|p| host.contains(p)) {
        return false;
    }
    let path = u.path().to_lowercase();
    !SENSITIVE_PATH_PARTS.iter().any(|p| path.contains(p))
}

/// Indexes a page if Recall is switched on. Called for non-private tabs only.
pub fn remember(db: &Db, url: &str, title: &str, text: &str) {
    if db.get_setting("recall_enabled").as_deref() != Some("true") || !is_indexable(url) {
        return;
    }
    let body: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if body.chars().count() < MIN_BODY_CHARS {
        return;
    }
    let body: String = body.chars().take(MAX_BODY_CHARS).collect();
    let _ = db.recall_put(url, title, &body);
}

const STOP_WORDS: &[&str] = &[
    "the", "and", "for", "with", "that", "this", "what", "was", "were", "who", "how", "why", "when", "where", "which", "about", "from",
    "have", "has", "had", "you", "your", "are", "can", "could", "did", "does", "page", "pages", "article", "site", "read", "saw", "see",
    "found", "find", "remember", "visited", "looking", "last", "week", "yesterday", "earlier", "some", "any", "one",
];

/// Turns a natural-language question into a safe FTS5 expression: each meaningful word is quoted
/// (so operators and punctuation in user text can't break or alter the query) and OR-ed together;
/// bm25 ranking then puts pages matching the most words first. Returns None if nothing is left.
pub fn fts_query(question: &str) -> Option<String> {
    let mut seen: Vec<String> = Vec::new();
    for w in question.split(|c: char| !c.is_alphanumeric()) {
        let w = w.to_lowercase();
        if w.chars().count() < 3 || STOP_WORDS.contains(&w.as_str()) || seen.contains(&w) {
            continue;
        }
        seen.push(w);
        if seen.len() == 12 {
            break;
        }
    }
    if seen.is_empty() {
        None
    } else {
        Some(seen.iter().map(|w| format!("\"{w}\"")).collect::<Vec<_>>().join(" OR "))
    }
}

#[derive(Serialize)]
pub struct RecallStats {
    pub pages: i64,
    pub enabled: bool,
}

#[tauri::command]
pub fn recall_search(db: State<Db>, query: String, limit: Option<usize>) -> Result<Vec<RecallHit>, String> {
    let Some(expr) = fts_query(&query) else { return Ok(vec![]) };
    db.recall_search(&expr, limit.unwrap_or(6).clamp(1, 20)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recall_stats(db: State<Db>) -> RecallStats {
    RecallStats { pages: db.recall_count(), enabled: db.get_setting("recall_enabled").as_deref() == Some("true") }
}

#[tauri::command]
pub fn recall_forget(db: State<Db>, url: String) -> Result<(), String> {
    db.recall_forget(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recall_clear(db: State<Db>) -> Result<(), String> {
    db.recall_clear().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn long(s: &str) -> String {
        format!("{s} {}", "filler words to make this look like a real article. ".repeat(10))
    }

    #[test]
    fn skips_sensitive_and_local_pages() {
        for u in [
            "https://mail.google.com/mail/u/0/",
            "https://www.mybank.com/home",
            "https://shop.com/checkout/step1",
            "https://site.com/user/login",
            "http://localhost:3000/",
            "http://192.168.1.4/admin",
            "file:///etc/passwd",
            "https://accounts.google.com/",
        ] {
            assert!(!is_indexable(u), "{u}");
        }
        assert!(is_indexable("https://en.wikipedia.org/wiki/Pebble"));
    }

    #[test]
    fn query_is_quoted_and_stripped() {
        assert_eq!(fts_query("What was that article about sourdough starters?").as_deref(), Some("\"sourdough\" OR \"starters\""));
        assert_eq!(fts_query("\"; DROP TABLE x; -- NEAR(a b)").as_deref(), Some("\"drop\" OR \"table\" OR \"near\""));
        assert_eq!(fts_query("the and ?!"), None);
    }

    #[test]
    fn finds_ranks_and_forgets() {
        let db = Db::memory().unwrap();
        db.recall_put("https://a.com/bread", "Sourdough guide", &long("how to feed a sourdough starter every day")).unwrap();
        db.recall_put("https://b.com/cars", "Engines", &long("how a combustion engine works")).unwrap();
        let hits = db.recall_search(&fts_query("sourdough starter").unwrap(), 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].url, "https://a.com/bread");
        assert!(hits[0].snippet.contains("sourdough"));
        // stemming: "engines" finds "engine"
        assert_eq!(db.recall_search(&fts_query("engines").unwrap(), 5).unwrap().len(), 1);
        db.recall_forget("https://a.com/bread").unwrap();
        assert_eq!(db.recall_count(), 1);
    }

    #[test]
    fn remember_respects_setting_and_size() {
        let db = Db::memory().unwrap();
        remember(&db, "https://a.com/x", "X", &long("pebbles"));
        assert_eq!(db.recall_count(), 0, "off by default");
        db.set_setting("recall_enabled", "true").unwrap();
        remember(&db, "https://a.com/x", "X", "too short");
        assert_eq!(db.recall_count(), 0);
        remember(&db, "https://a.com/x", "X", &long("pebbles"));
        assert_eq!(db.recall_count(), 1);
        remember(&db, "https://a.com/x", "X", &long("pebbles again"));
        assert_eq!(db.recall_count(), 1, "re-visit updates, never duplicates");
    }

    #[test]
    fn clearing_history_clears_recall() {
        let db = Db::memory().unwrap();
        db.recall_put("https://a.com/", "A", &long("hello")).unwrap();
        db.clear_history().unwrap();
        assert_eq!(db.recall_count(), 0);
    }
}
