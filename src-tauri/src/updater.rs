//! Signed auto-updates via GitHub Releases (`latest.json`), verified against the public key in
//! `tauri.conf.json`. Nothing is installed without the user pressing "Install".

use serde::Serialize;
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
}

async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
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
    *app.state::<PendingUpdate>().0.lock().unwrap_or_else(|e| e.into_inner()) = update;
    Ok(info)
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    check(&app).await
}

#[tauri::command]
pub async fn update_install(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending.0.lock().unwrap_or_else(|e| e.into_inner()).take().ok_or("No update has been checked yet")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Update failed: {e}"))?;
    app.restart();
}

/// Looks for an update 15 s after launch and then every 6 hours (unless switched off in Settings).
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
            tokio::time::sleep(Duration::from_secs(6 * 60 * 60)).await;
        }
    });
}
