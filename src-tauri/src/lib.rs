//! Quick Pebble — browse quicker.

mod browser;
mod daemon;
mod database;
mod memory_saver;
mod security;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = database::Db::open(&dir.join("pebble.db"))?;
            let state = browser::Browser::default();
            *state.memory.lock().unwrap() = browser::load_memory_config(&db);
            app.manage(db);
            app.manage(state);
            browser::open_window(app.handle(), "main")?;
            browser::spawn_memory_saver(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            browser::qp_report,
            browser::qp_shortcut,
            browser::tab_create,
            browser::tab_activate,
            browser::tab_close,
            browser::tab_navigate,
            browser::tab_nav,
            browser::tab_set_pinned,
            browser::tab_set_muted,
            browser::content_visible,
            browser::history_search,
            browser::history_clear,
            browser::bookmark_toggle,
            browser::bookmark_list,
            browser::suggest,
            browser::settings_get,
            browser::settings_set,
            browser::memory_saver_get,
            browser::memory_saver_set,
            browser::memory_stats,
            browser::ai_status,
            browser::ai_run,
            browser::ai_set_key,
            browser::privacy_stats,
            browser::privacy_permissions,
            browser::privacy_set_permission,
            browser::privacy_clear_data,
            browser::window_new_private,
            browser::window_control,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quick Pebble");
}
