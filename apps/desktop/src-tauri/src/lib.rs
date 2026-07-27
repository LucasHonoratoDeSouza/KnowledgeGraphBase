pub mod app_info;
mod commands;
pub mod editor;
mod enrichment;
pub mod ipc;
pub mod knowledge;
pub mod librarian;
pub mod logging;
pub mod settings;
mod transcription;

use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Starts the native Knowledge OS shell.
///
/// # Panics
///
/// Panics when Tauri cannot initialize or run the application event loop.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(editor::DocumentCommandState::default())
        .setup(|app| {
            logging::init_logging(app)?;
            let data_directory = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            app.manage(commands::SettingsCommandState::open(&data_directory)?);
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_updates(&update_handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info::get_app_info,
            commands::workspace_get_state,
            commands::search_execute,
            commands::source_capture,
            commands::library_get,
            commands::folder_create,
            commands::entry_rename,
            commands::entry_delete,
            commands::entry_move,
            commands::librarian_reorganize,
            commands::librarian_undo,
            commands::librarian_suggestions,
            commands::organization_get,
            commands::graph_get,
            commands::assistant_ask,
            commands::workspace_open,
            commands::document_open,
            commands::document_save,
            commands::settings_get,
            commands::settings_complete_onboarding,
            commands::settings_update_ai,
            commands::settings_set_ai_enabled,
            commands::settings_update_workspace,
            commands::provider_connect,
            commands::provider_rotate,
            commands::provider_test,
            commands::provider_remove
        ])
        .run(tauri::generate_context!())
        .expect("error while running Knowledge OS");
}

/// Silently installs any available dev-channel update and relaunches.
///
/// Runs once at startup so a closed-and-reopened dev build always ends up
/// on the latest `dev` branch push without any user interaction.
async fn check_for_updates(app: &tauri::AppHandle) {
    let Ok(updater) = app.updater() else {
        return;
    };
    let Ok(Some(update)) = updater.check().await else {
        return;
    };
    let _ = update.download_and_install(|_, _| {}, || {}).await;
}
