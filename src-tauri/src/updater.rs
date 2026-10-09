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
async fn check_feed() -> Result<Option<UpdateInfo>, String> {
    let body: serde_json::Value = reqwest::Client::new()
        .get(FEED)
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
    let result = match app.updater() {
        Ok(u) => u.check().await.map_err(|e| chain(&e)),
        Err(e) => Err(chain(&e)),
    };
    let update = match result {
        Ok(u) => u,
        Err(first) => {
            *pending = None;
            return check_feed().await.map_err(|second| format!("Could not check for updates ({first}; backup check: {second})"));
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
    let pending = pending.0.try_lock().map_err(|_| "An update operation is already running")?;
    // Borrow instead of taking the update so a failed download can be retried.
    let update = pending.as_ref().ok_or("Check for an update before installing")?;
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
