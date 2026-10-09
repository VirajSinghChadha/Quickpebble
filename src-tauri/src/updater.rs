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
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Could not check for updates: {e}"))?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone(),
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

/// Check 15 seconds after launch and every hour, unless disabled in Settings.
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
            tokio::time::sleep(Duration::from_secs(60 * 60)).await;
        }
    });
}
