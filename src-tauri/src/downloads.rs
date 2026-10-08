//! Download manager. Files go to the user's Downloads folder under a safe, unique name. The list (active and
//! finished) is shown in the side panel; finished downloads are remembered across restarts (not for private tabs).
//!
//! "Open" is refused for anything that can run code (apps, scripts, installers): those can only be revealed in
//! the folder, so a malicious download is never launched by one click.

use crate::browser::Browser;
use crate::database::Db;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Emitter, Manager, State, Webview};

#[derive(Serialize, Clone, Debug)]
pub struct DownloadItem {
    pub id: u64,
    pub name: String,
    pub url: String,
    pub host: String,
    pub path: String,
    /// "active" | "done" | "failed"
    pub state: String,
    pub started: i64,
    pub finished: Option<i64>,
    pub size: Option<u64>,
    pub can_open: bool,
    #[serde(skip)]
    pub private: bool,
    #[serde(skip)]
    pub tab: String,
}

#[derive(Default)]
pub struct Downloads {
    items: Mutex<Vec<DownloadItem>>,
    next: AtomicU64,
}

const KEEP: usize = 100;

/// Extensions that can execute code or install software when opened.
const RISKY: &[&str] = &[
    "app", "command", "tool", "pkg", "mpkg", "workflow", "action", "scpt", "applescript", "terminal", "sh", "bash", "zsh", "csh", "ksh",
    "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "lnk", "reg", "jar", "apk", "deb",
    "rpm", "appimage", "run", "bin", "dmg", "iso", "cpl", "hta", "msc", "pif", "gadget", "desktop",
];

pub fn is_risky(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| RISKY.contains(&e.to_ascii_lowercase().as_str()))
}

/// A file name that is safe to create: no path parts, no reserved characters, no leading dots.
pub fn sanitize_filename(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let cleaned: String = base.chars().map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c }).collect();
    let cleaned = cleaned.trim().trim_start_matches('.').trim_end_matches(['.', ' ']).to_string();
    let cleaned: String = cleaned.chars().take(150).collect();
    if cleaned.is_empty() { "download".into() } else { cleaned }
}

/// `name`, or `name (1).ext`, `name (2).ext` … the first that does not exist yet.
pub fn unique_path(dir: &Path, name: &str, exists: impl Fn(&Path) -> bool) -> PathBuf {
    let first = dir.join(name);
    if !exists(&first) {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..10_000).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|p| !exists(p)).unwrap_or_else(|| dir.join(format!("{stem} (copy){ext}")))
}

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

impl Downloads {
    pub fn load(db: &Db) -> Self {
        let rows = db.downloads_recent(KEEP);
        let next = rows.iter().map(|r| r.0).max().unwrap_or(0) + 1;
        let items = rows
            .into_iter()
            .map(|(id, name, url, path, ok, started, finished, size)| DownloadItem {
                id,
                host: url::Url::parse(&url).ok().and_then(|u| u.host_str().map(String::from)).unwrap_or_default(),
                can_open: !is_risky(Path::new(&path)),
                name,
                url,
                path,
                state: if ok { "done" } else { "failed" }.into(),
                started,
                finished: Some(finished),
                size,
                private: false,
                tab: String::new(),
            })
            .collect();
        Self { items: Mutex::new(items), next: AtomicU64::new(next) }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<DownloadItem>> {
        self.items.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn snapshot(&self) -> Vec<DownloadItem> {
        let mut v = self.lock().clone();
        v.sort_by_key(|d| std::cmp::Reverse(d.id));
        v
    }
}

fn announce(app: &AppHandle) {
    let _ = app.emit("qp://downloads", app.state::<Downloads>().snapshot());
}

/// The webview's download hook. Returns whether the download may proceed.
pub fn handle(app: &AppHandle, webview: &Webview, event: DownloadEvent<'_>) -> bool {
    let state = app.state::<Downloads>();
    match event {
        DownloadEvent::Requested { url, destination } => {
            if !matches!(url.scheme(), "http" | "https") {
                return false;
            }
            let suggested = destination.file_name().and_then(|n| n.to_str()).map(String::from).or_else(|| url.path_segments().and_then(|mut s| s.next_back()).map(String::from)).unwrap_or_default();
            let name = sanitize_filename(&suggested);
            let dir = app.path().download_dir().or_else(|_| app.path().home_dir()).unwrap_or_else(|_| PathBuf::from("."));
            // Reserve names already in the list too, so two downloads started together don't collide.
            let taken: Vec<PathBuf> = state.lock().iter().filter(|d| d.state == "active").map(|d| PathBuf::from(&d.path)).collect();
            let path = unique_path(&dir, &name, |p| p.exists() || taken.contains(&p.to_path_buf()));
            *destination = path.clone();
            let label = webview.label().to_string();
            let private = app.state::<Browser>().tab_url(&label).is_some_and(|(_, p)| p);
            let item = DownloadItem {
                id: state.next.fetch_add(1, Ordering::Relaxed),
                name: path.file_name().and_then(|n| n.to_str()).unwrap_or("download").to_string(),
                host: url.host_str().unwrap_or_default().to_string(),
                url: url.to_string(),
                path: path.to_string_lossy().into_owned(),
                state: "active".into(),
                started: now(),
                finished: None,
                size: None,
                can_open: !is_risky(&path),
                private,
                tab: label.clone(),
            };
            state.lock().push(item);
            app.state::<Browser>().set_downloading(&label, true);
            announce(app);
            true
        }
        DownloadEvent::Finished { url, success, .. } => {
            let label = webview.label().to_string();
            let mut finished = None;
            let still_active;
            {
                let mut items = state.lock();
                if let Some(d) = items.iter_mut().filter(|d| d.state == "active" && d.url == url.as_str()).min_by_key(|d| d.id) {
                    let ok = success && Path::new(&d.path).exists();
                    d.state = if ok { "done" } else { "failed" }.into();
                    d.finished = Some(now());
                    d.size = std::fs::metadata(&d.path).ok().map(|m| m.len());
                    finished = Some(d.clone());
                }
                still_active = items.iter().any(|d| d.state == "active" && d.tab == label);
                // Keep the list bounded: drop the oldest finished entries.
                while items.len() > KEEP {
                    if let Some(i) = items.iter().position(|d| d.state != "active") { items.remove(i); } else { break; }
                }
            }
            if !still_active {
                app.state::<Browser>().set_downloading(&label, false);
            }
            if let Some(d) = finished.filter(|d| !d.private) {
                let _ = app.state::<Db>().downloads_put(d.id, &d.name, &d.url, &d.path, d.state == "done", d.started, d.finished.unwrap_or_else(now), d.size);
            }
            announce(app);
            true
        }
        _ => true,
    }
}

fn find(state: &Downloads, id: u64) -> Result<DownloadItem, String> {
    state.lock().iter().find(|d| d.id == id).cloned().ok_or_else(|| "That download is no longer in the list.".to_string())
}

fn launch(program: &str, args: &[&std::ffi::OsStr]) -> Result<(), String> {
    std::process::Command::new(program).args(args).spawn().map(|_| ()).map_err(|e| format!("Could not open it: {e}"))
}

#[tauri::command]
pub fn downloads_list(state: State<Downloads>) -> Vec<DownloadItem> {
    state.snapshot()
}

#[tauri::command]
pub fn download_open(state: State<Downloads>, id: u64) -> Result<(), String> {
    let d = find(&state, id)?;
    let path = Path::new(&d.path);
    if d.state != "done" || !path.exists() {
        return Err("That file isn't there any more.".into());
    }
    if is_risky(path) {
        return Err("This kind of file can run code on your computer, so I won't open it for you. Use “Show in folder” if you trust it.".into());
    }
    #[cfg(target_os = "macos")]
    return launch("open", &[path.as_os_str()]);
    #[cfg(target_os = "windows")]
    return launch("explorer", &[path.as_os_str()]);
    #[cfg(all(unix, not(target_os = "macos")))]
    return launch("xdg-open", &[path.as_os_str()]);
}

#[tauri::command]
pub fn download_reveal(state: State<Downloads>, id: u64) -> Result<(), String> {
    let d = find(&state, id)?;
    let path = Path::new(&d.path);
    if !path.exists() {
        return Err("That file isn't there any more.".into());
    }
    #[cfg(target_os = "macos")]
    return launch("open", &["-R".as_ref(), path.as_os_str()]);
    #[cfg(target_os = "windows")]
    return launch("explorer", &[format!("/select,{}", path.display()).as_ref()]);
    #[cfg(all(unix, not(target_os = "macos")))]
    return launch("xdg-open", &[path.parent().unwrap_or(path).as_os_str()]);
}

/// Removes an entry from the list. The file itself is never deleted.
#[tauri::command]
pub fn download_remove(app: AppHandle, state: State<Downloads>, db: State<Db>, id: u64) {
    state.lock().retain(|d| d.id != id || d.state == "active");
    let _ = db.downloads_delete(id);
    announce(&app);
}

#[tauri::command]
pub fn downloads_clear_finished(app: AppHandle, state: State<Downloads>, db: State<Db>) {
    state.lock().retain(|d| d.state == "active");
    let _ = db.downloads_clear();
    announce(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filenames_are_made_safe() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("C:\\Users\\x\\evil.exe"), "evil.exe");
        assert_eq!(sanitize_filename(".bashrc"), "bashrc");
        assert_eq!(sanitize_filename("a<b>:c|d?.pdf"), "a_b__c_d_.pdf");
        assert_eq!(sanitize_filename("  "), "download");
        assert_eq!(sanitize_filename("report.pdf."), "report.pdf");
        assert_eq!(sanitize_filename(&"x".repeat(400)).len(), 150);
    }

    #[test]
    fn names_never_overwrite_existing_files() {
        let dir = Path::new("/d");
        let taken = ["/d/a.pdf", "/d/a (1).pdf"];
        let exists = |p: &Path| taken.contains(&p.to_str().unwrap());
        assert_eq!(unique_path(dir, "b.pdf", exists), Path::new("/d/b.pdf"));
        assert_eq!(unique_path(dir, "a.pdf", exists), Path::new("/d/a (2).pdf"));
        assert_eq!(unique_path(dir, "noext", |p| p == Path::new("/d/noext")), Path::new("/d/noext (1)"));
    }

    #[test]
    fn code_running_files_are_not_openable() {
        for f in ["x.app", "x.EXE", "x.sh", "x.command", "x.pkg", "x.dmg", "x.msi", "x.jar", "x.js", "x.ps1"] {
            assert!(is_risky(Path::new(f)), "{f}");
        }
        for f in ["x.pdf", "x.png", "x.docx", "x.zip", "x.mp4", "noext"] {
            assert!(!is_risky(Path::new(f)), "{f}");
        }
    }
}
