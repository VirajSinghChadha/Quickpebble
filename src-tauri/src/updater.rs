//! Signed in-app updates via GitHub Releases. Installation requires a user click.

use serde::Serialize;
use std::time::Duration;
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

// Hold the async lock throughout each operation, including network requests. This prevents
// background checks from replacing the update while another window is installing it.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
    /// True when the in-app installer could not be used and the new version must be downloaded by hand.
    manual: bool,
}

const RELEASES_PAGE: &str = "https://github.com/VirajSinghChadha/Quickpebble/releases/latest";
const FEED: &str = "https://github.com/VirajSinghChadha/Quickpebble/releases/latest/download/latest.json";
const RELEASES_API: &str = "https://api.github.com/repos/VirajSinghChadha/Quickpebble/releases?per_page=30";

/// The update file of the newest 1.x release, found by asking GitHub which releases exist. Reading the release list means
/// the check keeps working even when a newer release of a different kind (for example the Chromium 2.x app) is the
/// repository's "latest" and has no update file of its own. Falls back to the fixed address if GitHub can't be asked.
async fn feed_url() -> String {
    async fn newest() -> Option<String> {
        let list: serde_json::Value = reqwest::Client::new()
            .get(RELEASES_API)
            .header("User-Agent", "quick-pebble-updater")
            .header("Accept", "application/vnd.github+json")
            .timeout(Duration::from_secs(15))
            .send().await.ok()?.error_for_status().ok()?.json().await.ok()?;
        list.as_array()?
            .iter()
            .filter(|r| !r["draft"].as_bool().unwrap_or(true) && !r["prerelease"].as_bool().unwrap_or(true))
            .filter_map(|r| {
                let tag = r["tag_name"].as_str()?;
                let has_feed = r["assets"].as_array()?.iter().any(|a| a["name"].as_str() == Some("latest.json"));
                (tag.starts_with("v1.") && has_feed).then(|| tag.to_string())
            })
            .max_by_key(|t| numeric(t))
            .map(|t| format!("https://github.com/VirajSinghChadha/Quickpebble/releases/download/{t}/latest.json"))
    }
    newest().await.unwrap_or_else(|| FEED.to_string())
}

fn chain(e: &dyn std::error::Error) -> String {
    let mut out = e.to_string();
    let mut src = e.source();
    while let Some(c) = src {
        out.push_str(&format!(": {c}"));
        src = c.source();
    }
    out
}

fn numeric(v: &str) -> Vec<u64> {
    v.trim_start_matches('v').split('.').map(|p| p.split(['-', '+']).next().and_then(|n| n.parse().ok()).unwrap_or(0)).collect()
}

/// Backup check over the app's own HTTP client, used when the updater plugin's connection fails.
async fn check_feed(url: &str) -> Result<Option<UpdateInfo>, String> {
    let body: serde_json::Value = reqwest::Client::new()
        .get(url)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| chain(&e))?
        .json()
        .await
        .map_err(|e| chain(&e))?;
    let version = body["version"].as_str().ok_or("The update feed has no version")?.to_string();
    let current = env!("CARGO_PKG_VERSION").to_string();
    if numeric(&version) <= numeric(&current) {
        return Ok(None);
    }
    Ok(Some(UpdateInfo { version, current, notes: body["notes"].as_str().map(str::to_string), manual: true }))
}

#[tauri::command]
pub fn update_open_page() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(RELEASES_PAGE).spawn();
    #[cfg(windows)]
    let r = std::process::Command::new("cmd").args(["/c", "start", "", RELEASES_PAGE]).spawn();
    #[cfg(all(not(target_os = "macos"), not(windows)))]
    let r = std::process::Command::new("xdg-open").arg(RELEASES_PAGE).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
pub struct UpdateProgress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
}

async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    let pending = app.state::<PendingUpdate>();
    let mut pending = pending.0.try_lock().map_err(|_| "An update operation is already running")?;
    let url = feed_url().await;
    let result = match url.parse::<tauri::Url>().map_err(|e| e.to_string()).and_then(|u| {
        app.updater_builder().endpoints(vec![u]).map_err(|e| chain(&e)).and_then(|b| b.build().map_err(|e| chain(&e)))
    }) {
        Ok(u) => u.check().await.map_err(|e| chain(&e)),
        Err(e) => Err(e),
    };
    let update = match result {
        Ok(u) => u,
        Err(first) => {
            *pending = None;
            return check_feed(&url).await.map_err(|second| format!("Could not check for updates ({first}; backup check: {second})"));
        }
    };
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
        manual: false,
    });
    *pending = update;
    Ok(info)
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    check(&app).await
}

#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    progress: Channel<UpdateProgress>,
) -> Result<(), String> {
    // If the stored update was lost (a later check came back empty or failed), look again instead of asking the person to.
    let missing = pending.0.try_lock().map_err(|_| "An update operation is already running")?.is_none();
    if missing {
        check(&app).await?;
    }
    let pending = pending.0.try_lock().map_err(|_| "An update operation is already running")?;
    // Borrow instead of taking the update so a failed download can be retried.
    let update = pending.as_ref().ok_or("No update was found. Try Check now again in a minute.")?;
    let mut downloaded = 0_u64;
    update
        .download_and_install(
            |chunk, total| {
                downloaded = downloaded.saturating_add(chunk as u64);
                let _ = progress.send(UpdateProgress { phase: "downloading", downloaded, total });
            },
            || {
                let _ = progress.send(UpdateProgress { phase: "installing", downloaded: 0, total: None });
            },
        )
        .await
        .map_err(|e| format!("Update failed. You can retry: {e}"))?;
    app.restart();
}

/// Check 15 seconds after launch and every 10 minutes, unless disabled in Settings.
pub fn spawn_startup_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            let enabled = app
                .try_state::<crate::database::Db>()
                .and_then(|db| db.get_setting("auto_update_check"))
                .as_deref()
                != Some("false");
            if enabled {
                if let Ok(Some(info)) = check(&app).await {
                    let _ = app.emit("qp://update", info);
                }
            }
            tokio::time::sleep(Duration::from_secs(10 * 60)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::numeric;

    #[test]
    fn compares_versions_numerically() {
        assert!(numeric("1.2.10") > numeric("1.2.9"));
        assert!(numeric("v1.3.0") > numeric("1.2.9"));
        assert!(numeric("1.2.2") <= numeric("1.2.2"));
    }
}
