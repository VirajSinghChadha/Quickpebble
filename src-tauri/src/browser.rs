//! Tab/webview orchestration and the IPC command surface used by the Pebble UI.
//!
//! Layout: every window holds one full-size UI webview (`ui-<window>`) and, on top of it,
//! one child webview per live tab (`tab-<window>-<id>`) positioned below the 92px chrome.
//! Tabs without a URL (new tab page) and suspended tabs have no webview at all.

use crate::{
    daemon::{self, AiConfig},
    database::{Bookmark, Db, HistoryEntry, SitePermission},
    memory_saver::{self, MemoryConfig, TabFacts},
    security,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{
    webview::{PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl, Window,
};
use url::Url;

/// Height of tab strip (40) + toolbar (52); the frontend raises it when the bookmarks bar is shown.
pub const CHROME_HEIGHT: f64 = 92.0;
const INJECT: &str = include_str!("inject.js");
const MAX_TEXT: usize = 20_000;

#[derive(Debug, Clone)]
pub struct TabInfo {
    pub id: String,
    pub window: String,
    pub url: String,
    pub title: String,
    pub favicon: String,
    pub pinned: bool,
    pub audible: bool,
    pub recording: bool,
    pub downloading: bool,
    pub suspended: bool,
    pub muted: bool,
    pub loading: bool,
    pub private: bool,
    pub last_active: Instant,
    pub text: String,
    pub zoom: f64,
}

#[derive(Default)]
pub struct Browser {
    tabs: Mutex<HashMap<String, TabInfo>>,
    active: Mutex<HashMap<String, String>>,
    hidden: Mutex<HashSet<String>>,
    pub memory: Mutex<MemoryConfig>,
    private_counter: AtomicU32,
    /// Width in logical px of the right-hand side panel, per window.
    sidebar: Mutex<HashMap<String, f64>>,
    /// Chrome (tab strip + toolbar [+ bookmarks bar]) height per window.
    chrome: Mutex<HashMap<String, f64>>,
    /// Hosts the user chose to open over plain HTTP this session.
    http_allowed: Mutex<HashSet<String>>,
    upgrade_attempts: Mutex<HashMap<String, (Instant, u32)>>,
    agent_pending: Mutex<HashMap<String, (String, tokio::sync::oneshot::Sender<serde_json::Value>)>>,
    agent_counter: AtomicU32,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn tab_label(window: &str, id: &str) -> String {
    format!("tab-{window}-{id}")
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[derive(Serialize, Clone)]
struct TabEvent {
    window: String,
    id: String,
    url: String,
    title: String,
    favicon: String,
    audible: bool,
    recording: bool,
    loading: bool,
    suspended: bool,
    muted: bool,
}

impl From<&TabInfo> for TabEvent {
    fn from(t: &TabInfo) -> Self {
        Self {
            window: t.window.clone(),
            id: t.id.clone(),
            url: t.url.clone(),
            title: t.title.clone(),
            favicon: t.favicon.clone(),
            audible: t.audible,
            recording: t.recording,
            loading: t.loading,
            suspended: t.suspended,
            muted: t.muted,
        }
    }
}

fn emit_tab(app: &AppHandle, t: &TabInfo) {
    let _ = app.emit("qp://tab", TabEvent::from(t));
}

fn content_rect(window: &Window) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window
        .inner_size()
        .map(|s| s.to_logical::<f64>(scale))
        .unwrap_or(LogicalSize::new(1280.0, 800.0));
    let side = window
        .try_state::<Browser>()
        .map(|st| lock(&st.sidebar).get(window.label()).copied().unwrap_or(0.0))
        .unwrap_or(0.0);
    let top = window
        .try_state::<Browser>()
        .map(|st| lock(&st.chrome).get(window.label()).copied().unwrap_or(CHROME_HEIGHT))
        .unwrap_or(CHROME_HEIGHT);
    (
        LogicalPosition::new(0.0, top),
        LogicalSize::new((size.width - side).max(1.0), (size.height - top).max(1.0)),
    )
}

/// Resize the UI webview and all tab webviews of `window` after a window resize.
pub fn relayout(app: &AppHandle, window: &Window) {
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Ok(size) = window.inner_size() {
        if let Some(ui) = app.get_webview(&format!("ui-{}", window.label())) {
            let _ = ui.set_size(size.to_logical::<f64>(scale));
        }
    }
    let (pos, size) = content_rect(window);
    let prefix = format!("tab-{}-", window.label());
    for (label, wv) in app.webviews() {
        if label.starts_with(&prefix) {
            let _ = wv.set_position(pos);
            let _ = wv.set_size(size);
        }
    }
}

/// Show only the active tab's webview (and none while an overlay is open).
fn sync_visibility(app: &AppHandle, state: &Browser, window: &str) {
    let hidden = lock(&state.hidden).contains(window);
    let active = lock(&state.active).get(window).cloned();
    let prefix = format!("tab-{window}-");
    for (label, wv) in app.webviews() {
        if let Some(id) = label.strip_prefix(&prefix) {
            if !hidden && active.as_deref() == Some(id) {
                let _ = wv.show();
            } else {
                let _ = wv.hide();
            }
        }
    }
}

fn setting(app: &AppHandle, key: &str) -> Option<String> {
    app.try_state::<Db>().and_then(|db| db.get_setting(key))
}

pub fn ai_config(db: &Db) -> AiConfig {
    let provider = db.get_setting("ai_provider").unwrap_or_else(|| "ollama".into());
    AiConfig {
        model: db
            .get_setting("ai_model")
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| daemon::default_model(&provider).into()),
        ollama_url: db.get_setting("ollama_url").unwrap_or_else(|| daemon::DEFAULT_OLLAMA_URL.into()),
        provider,
    }
}

#[cfg(target_os = "macos")]
const CHROME_UA: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

fn build_tab_webview(app: &AppHandle, window: &Window, label: &str, url: Url, private: bool) -> Result<Webview, String> {
    let blocked: Vec<String> = url
        .host_str()
        .and_then(|h| app.try_state::<Db>().map(|db| db.permissions_for(h)))
        .unwrap_or_default()
        .into_iter()
        .filter(|p| p.policy == "block")
        .map(|p| p.permission)
        .collect();
    let profile = url.host_str().map(|h| site_profile(app, h)).unwrap_or_default();
    let block_trackers = profile.trackers.unwrap_or_else(|| setting(app, "block_trackers").as_deref() != Some("false"));
    let script = INJECT
        .replace("__QP_BLOCKED__", &serde_json::to_string(&blocked).unwrap_or_else(|_| "[]".into()))
        .replace("__QP_TRACKERS__", &serde_json::to_string(security::TRACKER_HOSTS).unwrap_or_else(|_| "[]".into()))
        .replace("__QP_BLOCK__", if block_trackers { "true" } else { "false" });
    let (pos, size) = content_rect(window);
    let nav_app = app.clone();
    let nav_label = label.to_string();
    let load_app = app.clone();
    let mut builder = WebviewBuilder::new(label, WebviewUrl::External(url))
        .initialization_script(&script)
        .incognito(private);
    // macOS renders with WebKit, and some sites refuse anything that doesn't say it's Chrome.
    #[cfg(target_os = "macos")]
    {
        builder = builder.user_agent(CHROME_UA);
    }
    // Content scripts of enabled Chrome extensions (not injected into private windows).
    if !private {
        if let Ok(root) = crate::extensions::root_dir(app) {
            for ext_script in crate::extensions::init_scripts(&root) {
                builder = builder.initialization_script(&ext_script);
            }
        }
    }
    let builder = builder
        .on_navigation(move |u| {
            let block = setting(&nav_app, "block_trackers").as_deref() != Some("false");
            if !security::allow_navigation(u, block) {
                return false;
            }
            if u.scheme() == "http" && https_only_applies(&nav_app, u) {
                start_https_upgrade(&nav_app, &nav_label, u.clone());
                return false;
            }
            true
        })
        .on_page_load(move |wv, payload| {
            let st = load_app.state::<Browser>();
            let mut tabs = lock(&st.tabs);
            if let Some(t) = tabs.get_mut(wv.label()) {
                match payload.event() {
                    PageLoadEvent::Started => {
                        t.loading = true;
                        t.url = payload.url().to_string();
                    }
                    PageLoadEvent::Finished => {
                        t.loading = false;
                        // Apply this site's saved zoom and mute choice once the page has loaded.
                        if let Some(host) = Url::parse(payload.url().as_str()).ok().and_then(|u| u.host_str().map(String::from)) {
                            let p = site_profile(&load_app, &host);
                            if let Some(z) = p.zoom {
                                t.zoom = z;
                                let _ = wv.set_zoom(z);
                            }
                            if let Some(m) = p.muted {
                                t.muted = m;
                                let _ = wv.eval(format!("window.__qpSetMuted && window.__qpSetMuted({m})"));
                            }
                        }
                    }
                }
                emit_tab(&load_app, t);
            }
        });
    window.add_child(builder, pos, size).map_err(|e| e.to_string())
}

/// Per-site preferences the person chose in the Site panel. Missing fields mean "use the default".
#[derive(Default, Clone)]
struct SiteProfile {
    zoom: Option<f64>,
    trackers: Option<bool>,
    muted: Option<bool>,
}

fn site_profile(app: &AppHandle, host: &str) -> SiteProfile {
    let host = host.strip_prefix("www.").unwrap_or(host);
    let Some(json) = setting(app, "site_profiles") else { return SiteProfile::default() };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) else { return SiteProfile::default() };
    let p = &v[host];
    SiteProfile {
        zoom: p["zoom"].as_f64().filter(|z| z.is_finite()).map(|z| (z.clamp(0.3, 3.0) * 100.0).round() / 100.0),
        trackers: p["trackers"].as_bool(),
        muted: p["muted"].as_bool(),
    }
}

fn engine(db: &Db) -> String {
    db.get_setting("search_engine").unwrap_or_else(|| "google".into())
}

// ---------------------------------------------------------------------------------------------
// Page -> backend reports (called by injected script; identity is taken from the webview label)
// ---------------------------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PageReport {
    url: String,
    title: String,
    favicon: String,
    audible: bool,
    recording: bool,
    text: Option<String>,
}

#[tauri::command]
pub fn qp_report(app: AppHandle, webview: Webview, state: State<Browser>, db: State<Db>, report: PageReport) {
    let label = webview.label().to_string();
    let Ok(page_url) = Url::parse(&report.url) else { return };
    if !matches!(page_url.scheme(), "http" | "https") {
        return;
    }
    let mut tabs = lock(&state.tabs);
    let Some(t) = tabs.get_mut(&label) else { return };
    let title_changed = t.title != report.title;
    t.url = report.url.clone();
    t.title = report.title.chars().take(300).collect();
    t.favicon = report.favicon.chars().take(2048).collect();
    t.audible = report.audible;
    t.recording = report.recording;
    if let Some(text) = report.text {
        t.text = text.chars().take(MAX_TEXT).collect();
        if !t.private {
            let _ = db.record_visit(&t.url, &t.title);
        }
    } else if title_changed && !t.private {
        let _ = db.update_title(&t.url, &t.title);
    }
    emit_tab(&app, t);
}

#[derive(Serialize, Clone)]
struct ShortcutEvent {
    window: String,
    action: String,
}

const SHORTCUTS: &[&str] = &[
    "new-tab",
    "close-tab",
    "focus-address",
    "reload",
    "bookmark",
    "back",
    "forward",
    "palette",
    "tab-search",
    "private",
    "assistant",
    "find",
    "zoom-in",
    "zoom-out",
    "zoom-reset",
    "reopen-tab",
    "library",
    "reader",
    "bookmarks-bar",
];

#[tauri::command]
pub fn qp_shortcut(app: AppHandle, webview: Webview, action: String) {
    if SHORTCUTS.contains(&action.as_str()) {
        let _ = app.emit(
            "qp://shortcut",
            ShortcutEvent { window: webview.window().label().to_string(), action },
        );
    }
}

// ---------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------

#[tauri::command]
pub fn tab_create(window: Window, state: State<Browser>, id: String, pinned: Option<bool>) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("invalid tab id".into());
    }
    let label = tab_label(window.label(), &id);
    lock(&state.tabs).insert(
        label,
        TabInfo {
            id,
            window: window.label().into(),
            url: String::new(),
            title: String::new(),
            favicon: String::new(),
            pinned: pinned.unwrap_or(false),
            audible: false,
            recording: false,
            downloading: false,
            suspended: false,
            muted: false,
            loading: false,
            private: window.label().starts_with("private-"),
            last_active: Instant::now(),
            text: String::new(),
            zoom: 1.0,
        },
    );
    Ok(())
}

/// Brings the tab's webview back if it was suspended or never created.
fn ensure_live(app: &AppHandle, window: &Window, label: &str) -> Result<(), String> {
    if app.get_webview(label).is_some() {
        return Ok(());
    }
    let (url, private) = {
        let st = app.state::<Browser>();
        let mut tabs = lock(&st.tabs);
        let Some(t) = tabs.get_mut(label) else { return Ok(()) };
        if t.url.is_empty() {
            return Ok(());
        }
        t.suspended = false;
        (t.url.clone(), t.private)
    };
    let url = Url::parse(&url).map_err(|e| e.to_string())?;
    build_tab_webview(app, window, label, url, private).map(|_| ())
}

#[tauri::command]
pub fn tab_activate(app: AppHandle, window: Window, state: State<Browser>, id: String) -> Result<(), String> {
    let label = tab_label(window.label(), &id);
    {
        let mut tabs = lock(&state.tabs);
        let t = tabs.get_mut(&label).ok_or("unknown tab")?;
        t.last_active = Instant::now();
    }
    lock(&state.active).insert(window.label().into(), id);
    ensure_live(&app, &window, &label)?;
    sync_visibility(&app, &state, window.label());
    if let Some(t) = lock(&state.tabs).get(&label) {
        emit_tab(&app, t);
    }
    Ok(())
}

#[tauri::command]
pub fn tab_close(app: AppHandle, window: Window, state: State<Browser>, id: String) {
    let label = tab_label(window.label(), &id);
    lock(&state.tabs).remove(&label);
    {
        let mut active = lock(&state.active);
        if active.get(window.label()) == Some(&id) {
            active.remove(window.label());
        }
    }
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }
}

/// Points tab `label` at `url`, creating its webview if needed, and makes it the active tab.
fn load_url(app: &AppHandle, window: &Window, label: &str, id: &str, url: &Url) -> Result<(), String> {
    let state = app.state::<Browser>();
    let private = {
        let mut tabs = lock(&state.tabs);
        let t = tabs.get_mut(label).ok_or("unknown tab")?;
        t.url = url.to_string();
        t.title.clear();
        t.favicon.clear();
        t.text.clear();
        t.suspended = false;
        t.last_active = Instant::now();
        t.private
    };
    match app.get_webview(label) {
        Some(wv) => wv.navigate(url.clone()).map_err(|e| e.to_string())?,
        None => {
            build_tab_webview(app, window, label, url.clone(), private)?;
        }
    }
    lock(&state.active).insert(window.label().into(), id.to_string());
    sync_visibility(app, &state, window.label());
    Ok(())
}

fn https_only_applies(app: &AppHandle, u: &Url) -> bool {
    let on = setting(app, "https_only").as_deref() != Some("false");
    let host = u.host_str().unwrap_or_default().to_string();
    on && security::https_upgrade(u).is_some() && !lock(&app.state::<Browser>().http_allowed).contains(&host)
}

/// Probes the HTTPS version of an http:// URL. On success the tab is moved to HTTPS; otherwise the
/// UI is asked whether to continue over plain HTTP.
fn start_https_upgrade(app: &AppHandle, label: &str, http_url: Url) {
    let Some(https) = security::https_upgrade(&http_url) else { return };
    let host = http_url.host_str().unwrap_or_default().to_string();
    {
        // A server that bounces https back to http would loop forever: give up after 3 tries in 30 s.
        let state = app.state::<Browser>();
        let mut attempts = lock(&state.upgrade_attempts);
        let e = attempts.entry(host.clone()).or_insert((Instant::now(), 0));
        if e.0.elapsed() > Duration::from_secs(30) {
            *e = (Instant::now(), 0);
        }
        e.1 += 1;
        if e.1 > 3 {
            lock(&state.http_allowed).insert(host);
            drop(attempts);
            let _ = app.get_webview(label).map(|wv| wv.navigate(http_url));
            return;
        }
    }
    let (app, label) = (app.clone(), label.to_string());
    tauri::async_runtime::spawn(async move {
        let reachable = match reqwest::Client::builder().timeout(Duration::from_secs(5)).build() {
            Ok(c) => c.get(https.clone()).send().await.is_ok(),
            Err(_) => false,
        };
        let state = app.state::<Browser>();
        let Some((window_label, id)) = lock(&state.tabs).get(&label).map(|t| (t.window.clone(), t.id.clone())) else { return };
        if reachable {
            if let Some(window) = app.get_window(&window_label) {
                let _ = load_url(&app, &window, &label, &id, &https);
            }
        } else {
            let _ = app.emit("qp://https-fallback", serde_json::json!({ "window": window_label, "id": id, "url": http_url.to_string() }));
        }
    });
}

#[tauri::command]
pub fn tab_navigate(
    app: AppHandle,
    window: Window,
    state: State<Browser>,
    db: State<Db>,
    id: String,
    input: String,
    allow_http: Option<bool>,
) -> Result<String, String> {
    let label = tab_label(window.label(), &id);
    let url = security::normalize_input(&input, &engine(&db)).ok_or("empty address")?;
    if !lock(&state.tabs).contains_key(&label) {
        return Err("unknown tab".into());
    }
    if allow_http == Some(true) && url.scheme() == "http" {
        if let Some(h) = url.host_str() {
            lock(&state.http_allowed).insert(h.to_string());
        }
    }
    if url.scheme() == "http" && https_only_applies(&app, &url) {
        start_https_upgrade(&app, &label, url.clone());
        lock(&state.active).insert(window.label().into(), id);
        return Ok(security::https_upgrade(&url).unwrap_or(url).to_string());
    }
    load_url(&app, &window, &label, &id, &url)?;
    Ok(url.to_string())
}

#[tauri::command]
pub fn tab_nav(app: AppHandle, window: Window, id: String, action: String) {
    if let Some(wv) = app.get_webview(&tab_label(window.label(), &id)) {
        let js = match action.as_str() {
            "back" => "history.back()",
            "forward" => "history.forward()",
            "reload" => "location.reload()",
            "stop" => "window.stop()",
            _ => return,
        };
        let _ = wv.eval(js);
    }
}

#[tauri::command]
pub fn tab_set_pinned(window: Window, state: State<Browser>, id: String, pinned: bool) {
    if let Some(t) = lock(&state.tabs).get_mut(&tab_label(window.label(), &id)) {
        t.pinned = pinned;
    }
}

#[tauri::command]
pub fn tab_set_muted(app: AppHandle, window: Window, state: State<Browser>, id: String, muted: bool) {
    let label = tab_label(window.label(), &id);
    if let Some(t) = lock(&state.tabs).get_mut(&label) {
        t.muted = muted;
        emit_tab(&app, t);
    }
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.eval(format!("window.__qpSetMuted && window.__qpSetMuted({muted})"));
    }
}

/// Overlays (menus, palette, dialogs) are drawn by the UI webview, which sits *under* the page
/// webviews, so the page is hidden while one is open.
#[tauri::command]
pub fn content_visible(app: AppHandle, window: Window, state: State<Browser>, visible: bool) {
    {
        let mut hidden = lock(&state.hidden);
        if visible {
            hidden.remove(window.label());
        } else {
            hidden.insert(window.label().into());
        }
    }
    sync_visibility(&app, &state, window.label());
}

// ---------------------------------------------------------------------------------------------
// History, bookmarks, suggestions, settings
// ---------------------------------------------------------------------------------------------

#[tauri::command]
pub fn history_search(db: State<Db>, query: String, limit: Option<usize>) -> Result<Vec<HistoryEntry>, String> {
    db.search_history(&query, limit.unwrap_or(50).min(200)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn history_clear(db: State<Db>) -> Result<(), String> {
    db.clear_history().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bookmark_toggle(db: State<Db>, url: String, title: String) -> Result<bool, String> {
    let u = Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(u.scheme(), "http" | "https") {
        return Err("only web pages can be bookmarked".into());
    }
    db.toggle_bookmark(&url, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bookmark_list(db: State<Db>, query: Option<String>) -> Result<Vec<Bookmark>, String> {
    db.bookmarks(&query.unwrap_or_default(), 200).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bookmark_set_folder(db: State<Db>, url: String, folder: String) -> Result<(), String> {
    let folder: String = folder.trim().chars().take(80).collect();
    db.set_bookmark_folder(&url, &folder).map_err(|e| e.to_string())
}

fn save_imported(db: &Db, items: Vec<crate::bookmarks::Imported>) -> Result<usize, String> {
    let rows: Vec<(String, String, String)> = items.into_iter().take(5000).map(|i| (i.url, i.title, i.folder)).collect();
    db.import_bookmarks(&rows).map_err(|e| e.to_string())
}

/// Reads Chrome's own bookmarks file. Returns how many new bookmarks were added.
#[tauri::command]
pub fn bookmarks_import_chrome(db: State<Db>) -> Result<usize, String> {
    let path = crate::bookmarks::chrome_bookmarks_path().filter(|p| p.exists()).ok_or("Chrome's bookmarks were not found on this computer.")?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    save_imported(&db, crate::bookmarks::parse_chrome_json(&text))
}

/// Imports a bookmarks HTML file exported from Safari, Firefox, Edge, Brave or Chrome.
#[tauri::command]
pub async fn bookmarks_import_file(app: AppHandle) -> Result<Option<usize>, String> {
    use tauri_plugin_dialog::DialogExt;
    let handle = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || handle.dialog().file().add_filter("Bookmarks", &["html", "htm"]).blocking_pick_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 20_000_000 {
        return Err("That file is too large to be a bookmarks export.".into());
    }
    let text = std::fs::read_to_string(&path).map_err(|_| "Could not read that file as text.".to_string())?;
    let items = crate::bookmarks::parse_netscape_html(&text);
    if items.is_empty() {
        return Err("No bookmarks found in that file.".into());
    }
    let db = app.state::<Db>();
    save_imported(&db, items).map(Some)
}

#[derive(Serialize)]
pub struct Suggestion {
    kind: &'static str,
    title: String,
    url: String,
}

#[tauri::command]
pub fn suggest(db: State<Db>, query: String) -> Result<Vec<Suggestion>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let mut out: Vec<Suggestion> = db
        .bookmarks(q, 3)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|b| Suggestion { kind: "bookmark", title: b.title, url: b.url })
        .collect();
    let seen: HashSet<String> = out.iter().map(|s| s.url.clone()).collect();
    out.extend(
        db.search_history(q, 6)
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|h| !seen.contains(&h.url))
            .take(5)
            .map(|h| Suggestion { kind: "history", title: h.title, url: h.url }),
    );
    Ok(out)
}

const SETTING_KEYS: &[&str] = &[
    "site_profiles",
    "screen_permissions",
    "screen_model",
    "https_only",
    "auto_update_check",
    "theme",
    "newtab_layout",
    "search_engine",
    "block_trackers",
    "ai_provider",
    "ai_model",
    "ollama_url",
];

#[tauri::command]
pub fn settings_get(db: State<Db>) -> HashMap<String, String> {
    SETTING_KEYS
        .iter()
        .filter_map(|k| db.get_setting(k).map(|v| (k.to_string(), v)))
        .collect()
}

#[tauri::command]
pub fn settings_set(db: State<Db>, key: String, value: String) -> Result<(), String> {
    if !SETTING_KEYS.contains(&key.as_str()) {
        return Err(format!("unknown setting: {key}"));
    }
    if key == "search_engine" && !security::SEARCH_ENGINES.iter().any(|(n, _)| *n == value) {
        return Err("unknown search engine".into());
    }
    if key == "site_profiles" && (value.len() > 65_536 || serde_json::from_str::<serde_json::Value>(&value).is_err()) {
        return Err("invalid site profiles".into());
    }
    if key == "screen_permissions" && (value.len() > 65_536 || serde_json::from_str::<serde_json::Value>(&value).is_err()) {
        return Err("invalid screen permissions".into());
    }
    if key == "ollama_url" && !Url::parse(&value).map(|u| matches!(u.scheme(), "http" | "https")).unwrap_or(false) {
        return Err("Ollama URL must be http(s)".into());
    }
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------
// Memory saver
// ---------------------------------------------------------------------------------------------

#[tauri::command]
pub fn memory_saver_get(state: State<Browser>) -> MemoryConfig {
    lock(&state.memory).clone()
}

#[tauri::command]
pub fn memory_saver_set(state: State<Browser>, db: State<Db>, config: MemoryConfig) -> Result<(), String> {
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    db.set_setting("memory_saver", &json).map_err(|e| e.to_string())?;
    *lock(&state.memory) = config;
    Ok(())
}

#[derive(Serialize)]
pub struct MemoryStats {
    total_tabs: usize,
    suspended_tabs: usize,
    system_used_pct: f32,
    /// Rough figure: ~100 MB per suspended tab. Per-tab accounting is not exposed by system webviews.
    estimated_saved_mb: usize,
}

fn system_pressure() -> f32 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    if sys.total_memory() == 0 {
        0.0
    } else {
        sys.used_memory() as f32 / sys.total_memory() as f32
    }
}

#[tauri::command]
pub fn memory_stats(state: State<Browser>) -> MemoryStats {
    let tabs = lock(&state.tabs);
    let suspended = tabs.values().filter(|t| t.suspended).count();
    MemoryStats {
        total_tabs: tabs.len(),
        suspended_tabs: suspended,
        system_used_pct: system_pressure() * 100.0,
        estimated_saved_mb: suspended * 100,
    }
}

/// Background loop: every 30 s suspend idle tabs that pass the exclusion rules.
pub fn spawn_memory_saver(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let state = app.state::<Browser>();
            let cfg = lock(&state.memory).clone();
            if !cfg.enabled {
                continue;
            }
            let pressure = system_pressure();
            let victims: Vec<String> = {
                let active = lock(&state.active);
                lock(&state.tabs)
                    .iter()
                    .filter(|(_, t)| {
                        memory_saver::should_suspend(
                            &cfg,
                            &TabFacts {
                                is_active: active.get(&t.window) == Some(&t.id),
                                pinned: t.pinned,
                                audible: t.audible,
                                recording: t.recording,
                                downloading: t.downloading,
                                suspended: t.suspended,
                                has_page: !t.url.is_empty(),
                                idle: t.last_active.elapsed(),
                            },
                            pressure,
                        )
                    })
                    .map(|(l, _)| l.clone())
                    .collect()
            };
            for label in victims {
                if let Some(wv) = app.get_webview(&label) {
                    let _ = wv.close();
                }
                if let Some(t) = lock(&state.tabs).get_mut(&label) {
                    t.suspended = true;
                    t.audible = false;
                    emit_tab(&app, t);
                }
            }
        }
    });
}

pub fn load_memory_config(db: &Db) -> MemoryConfig {
    db.get_setting("memory_saver")
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_status(db: State<'_, Db>) -> Result<daemon::AiStatus, String> {
    let cfg = ai_config(&db);
    Ok(daemon::status(&cfg).await)
}

#[derive(Deserialize)]
pub struct AiRequest {
    task: String,
    tab_id: Option<String>,
    prefix: Option<String>,
    groups: Option<Vec<String>>,
}

#[tauri::command]
pub async fn ai_run(
    window: Window,
    state: State<'_, Browser>,
    db: State<'_, Db>,
    req: AiRequest,
) -> Result<Option<String>, String> {
    let cfg = ai_config(&db);
    if req.task == "complete" {
        let prefix = req.prefix.unwrap_or_default();
        if prefix.trim().len() < 3 {
            return Ok(None);
        }
        return daemon::complete(&cfg, &prefix.chars().take(200).collect::<String>()).await.map(Some);
    }
    let id = req.tab_id.ok_or("tab_id required")?;
    let (title, url, text) = {
        let tabs = lock(&state.tabs);
        let t = tabs.get(&tab_label(window.label(), &id)).ok_or("unknown tab")?;
        (t.title.clone(), t.url.clone(), t.text.clone())
    };
    match req.task.as_str() {
        "summarize" => daemon::summarize(&cfg, &title, &url, &text).await.map(Some),
        "classify" => {
            let groups = req
                .groups
                .filter(|g| !g.is_empty())
                .unwrap_or_else(|| vec!["School".into(), "Work".into(), "Personal".into()]);
            daemon::classify(&cfg, &title, &url, &text, &groups).await
        }
        other => Err(format!("unknown task: {other}")),
    }
}

#[tauri::command]
pub fn ai_set_key(provider: String, key: String) -> Result<(), String> {
    if !["openai", "anthropic", "gemini"].contains(&provider.as_str()) {
        return Err("unknown provider".into());
    }
    daemon::set_key(&provider, key.trim())
}

// ---------------------------------------------------------------------------------------------
// Privacy centre
// ---------------------------------------------------------------------------------------------

#[derive(Serialize)]
pub struct PrivacyStats {
    blocked_total: u64,
    block_trackers: bool,
}

#[tauri::command]
pub fn privacy_stats(db: State<Db>) -> PrivacyStats {
    PrivacyStats {
        blocked_total: security::blocked_total(),
        block_trackers: db.get_setting("block_trackers").as_deref() != Some("false"),
    }
}

#[tauri::command]
pub fn privacy_permissions(db: State<Db>) -> Result<Vec<SitePermission>, String> {
    db.permissions().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn privacy_set_permission(db: State<Db>, host: String, permission: String, policy: String) -> Result<(), String> {
    if !security::PERMISSIONS.contains(&permission.as_str()) || !security::POLICIES.contains(&policy.as_str()) {
        return Err("invalid permission or policy".into());
    }
    let host = host.trim().to_ascii_lowercase();
    if host.is_empty()
        || host.len() > 253
        || host.chars().any(|c| !(c.is_ascii_alphanumeric() || c == '.' || c == '-'))
    {
        return Err("invalid host".into());
    }
    db.set_permission(&host, &permission, &policy).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn privacy_clear_data(
    app: AppHandle,
    window: Window,
    db: State<Db>,
    history: bool,
    site_data: bool,
) -> Result<(), String> {
    if history {
        db.clear_history().map_err(|e| e.to_string())?;
    }
    if site_data {
        let prefix = format!("tab-{}-", window.label());
        for (label, wv) in app.webviews() {
            if label.starts_with(&prefix) {
                let _ = wv.clear_all_browsing_data();
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

pub fn open_window(app: &AppHandle, label: &str) -> Result<(), String> {
    use tauri::window::WindowBuilder;
    let mut wb = WindowBuilder::new(app, label)
        .title("Quick Pebble")
        .inner_size(1280.0, 820.0)
        .min_inner_size(760.0, 480.0)
        .center();
    #[cfg(target_os = "macos")]
    {
        wb = wb.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        wb = wb.decorations(false);
    }
    let window = wb.build().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    window
        .add_child(
            WebviewBuilder::new(format!("ui-{label}"), WebviewUrl::App("index.html".into())),
            LogicalPosition::new(0.0, 0.0),
            size,
        )
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    let w = window.clone();
    window.on_window_event(move |ev| match ev {
        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => relayout(&handle, &w),
        tauri::WindowEvent::Destroyed => {
            let st = handle.state::<Browser>();
            let prefix = format!("tab-{}-", w.label());
            lock(&st.tabs).retain(|k, _| !k.starts_with(&prefix));
            lock(&st.active).remove(w.label());
            lock(&st.hidden).remove(w.label());
        }
        _ => {}
    });
    Ok(())
}

#[tauri::command]
pub fn window_new_private(app: AppHandle, state: State<Browser>) -> Result<(), String> {
    let n = state.private_counter.fetch_add(1, Ordering::Relaxed) + 1;
    open_window(&app, &format!("private-{n}"))
}

#[tauri::command]
pub fn window_control(window: Window, action: String) -> Result<(), String> {
    match action.as_str() {
        "minimize" => window.minimize(),
        "maximize" => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        "close" => window.close(),
        // For the screen agent: bring a minimized window back so its clicks can land.
        "restore" => {
            if window.is_minimized().unwrap_or(false) {
                window.unminimize().and_then(|_| window.show()).and_then(|_| window.set_focus())
            } else {
                Ok(())
            }
        }
        _ => return Err("unknown action".into()),
    }
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------
// Side panel, zoom, find
// ---------------------------------------------------------------------------------------------

#[tauri::command]
pub fn sidebar_set(app: AppHandle, window: Window, state: State<Browser>, width: f64) {
    let w = if width.is_finite() { width.clamp(0.0, 640.0) } else { 0.0 };
    lock(&state.sidebar).insert(window.label().into(), w);
    relayout(&app, &window);
}

#[tauri::command]
pub fn tab_zoom(app: AppHandle, window: Window, state: State<Browser>, id: String, action: String) -> Option<f64> {
    let label = tab_label(window.label(), &id);
    let mut tabs = lock(&state.tabs);
    let t = tabs.get_mut(&label)?;
    t.zoom = match action.as_str() {
        "in" => (t.zoom + 0.1).min(3.0),
        "out" => (t.zoom - 0.1).max(0.3),
        a if a.starts_with("set:") => a[4..].parse::<f64>().ok().filter(|z| z.is_finite()).map_or(t.zoom, |z| z.clamp(0.3, 3.0)),
        _ => 1.0,
    };
    t.zoom = (t.zoom * 100.0).round() / 100.0;
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.set_zoom(t.zoom);
    }
    Some(t.zoom)
}

#[tauri::command]
pub fn tab_find(app: AppHandle, window: Window, id: String) {
    if let Some(wv) = app.get_webview(&tab_label(window.label(), &id)) {
        let _ = wv.eval("window.__qpFind && window.__qpFind()");
    }
}

// ---------------------------------------------------------------------------------------------
// AI chat + page agent
// ---------------------------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ChatRequest {
    system: String,
    messages: Vec<daemon::ChatMsg>,
    json: Option<bool>,
}

#[tauri::command]
pub async fn ai_chat(db: State<'_, Db>, req: ChatRequest) -> Result<String, String> {
    if req.messages.len() > 60 || req.system.len() > 120_000 || req.messages.iter().any(|m| m.content.len() > 60_000) {
        return Err("Conversation is too large".into());
    }
    let cfg = ai_config(&db);
    daemon::chat(&cfg, &req.system, &req.messages, req.json.unwrap_or(false)).await
}

const AGENT_OPS: &[&str] = &["snapshot", "click", "type", "select", "scroll", "press"];

/// Runs one agent operation inside a tab and waits for the page script to report back.
#[tauri::command]
pub async fn agent_exec(
    app: AppHandle,
    window: Window,
    state: State<'_, Browser>,
    tab_id: String,
    op: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if !AGENT_OPS.contains(&op.as_str()) {
        return Err("unknown agent operation".into());
    }
    let label = tab_label(window.label(), &tab_id);
    ensure_live(&app, &window, &label)?;
    let wv = app.get_webview(&label).ok_or("This tab has no page loaded")?;
    let id = state.agent_counter.fetch_add(1, Ordering::Relaxed).to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    lock(&state.agent_pending).insert(id.clone(), (label, tx));
    let args_js = serde_json::to_string(&args).map_err(|e| e.to_string())?;
    if let Err(e) = wv.eval(format!("window.__qpAgent ? window.__qpAgent.run({id:?}, {op:?}, {args_js}) : null")) {
        lock(&state.agent_pending).remove(&id);
        return Err(e.to_string());
    }
    let out = tokio::time::timeout(Duration::from_secs(10), rx).await;
    lock(&state.agent_pending).remove(&id);
    match out {
        Ok(Ok(v)) => Ok(v),
        _ => Err("The page did not respond (it may still be loading or may have navigated).".into()),
    }
}

/// Called by the injected page script. The calling webview must be the one the request targeted.
#[tauri::command]
pub fn qp_agent_result(webview: Webview, state: State<Browser>, id: String, result: serde_json::Value) {
    let mut pending = lock(&state.agent_pending);
    if pending.get(&id).map(|(label, _)| label == webview.label()).unwrap_or(false) {
        if let Some((_, tx)) = pending.remove(&id) {
            let _ = tx.send(result);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Chrome height (bookmarks bar), reader mode, blocker stats
// ---------------------------------------------------------------------------------------------

#[tauri::command]
pub fn chrome_set(app: AppHandle, window: Window, state: State<Browser>, height: f64) {
    let h = if height.is_finite() { height.clamp(CHROME_HEIGHT, 200.0) } else { CHROME_HEIGHT };
    lock(&state.chrome).insert(window.label().into(), h);
    relayout(&app, &window);
}

#[tauri::command]
pub fn tab_reader(app: AppHandle, window: Window, id: String) {
    if let Some(wv) = app.get_webview(&tab_label(window.label(), &id)) {
        let _ = wv.eval("window.__qpReader && window.__qpReader()");
    }
}

/// Page scripts report how many sub-resource requests they blocked. Capped so a page cannot
/// meaningfully inflate the counter.
#[tauri::command]
pub fn qp_blocked(webview: Webview, count: u32) {
    if webview.label().starts_with("tab-") {
        security::BLOCKED_COUNT.fetch_add(u64::from(count.min(50)), Ordering::Relaxed);
    }
}
