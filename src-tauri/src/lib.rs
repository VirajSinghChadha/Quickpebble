//! Quick Pebble — browse quicker.

mod bookmarks;
mod browser;
mod daemon;
mod downloads;
mod database;
mod extensions;
mod home;
mod memory_saver;
mod recall;
mod security;
mod vault;
mod vault_import;
mod updater;
mod research;
mod screen;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = database::Db::open(&dir.join("pebble.db"))?;
            let state = browser::Browser::default();
            *state.memory.lock().unwrap() = browser::load_memory_config(&db);
            app.manage(downloads::Downloads::load(&db));
            app.manage(db);
            app.manage(state);
            app.manage(updater::PendingUpdate::default());
            app.manage(screen::ScreenAgent::default());
            app.manage(vault::Vault::default());
            browser::open_window(app.handle(), "main")?;
            browser::spawn_memory_saver(app.handle().clone());
            updater::spawn_startup_check(app.handle().clone());
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
            browser::bookmark_set_folder,
            browser::bookmarks_import_chrome,
            browser::bookmarks_import_file,
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
            browser::sidebar_set,
            browser::chrome_set,
            browser::tab_reader,
            browser::qp_blocked,
            updater::update_check,
            updater::update_install,
            browser::tab_zoom,
            browser::tab_find,
            browser::ai_chat,
            research::research_search,
            research::research_status,
            research::research_key_set,
            browser::agent_exec,
            browser::qp_agent_result,
            extensions::extension_list,
            extensions::extension_install_store,
            extensions::extension_install_file,
            extensions::extension_set_enabled,
            extensions::extension_remove,
            screen::screen_propose,
            screen::screen_act,
            screen::screen_verify,
            screen::gemini_models,
            home::weather_search,
            home::weather_fetch,
            home::news_fetch,
            downloads::downloads_list,
            downloads::download_open,
            downloads::download_reveal,
            downloads::download_remove,
            downloads::downloads_clear_finished,
            vault::vault_status,
            vault::vault_create,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_list,
            vault::vault_reveal,
            vault::vault_save,
            vault::vault_delete,
            vault::vault_import_file,
            vault::vault_fill,
            vault::qp_login_seen,
            vault::vault_save_pending,
            vault::vault_dismiss_pending,
            recall::recall_search,
            recall::recall_stats,
            recall::recall_forget,
            recall::recall_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quick Pebble");
}
