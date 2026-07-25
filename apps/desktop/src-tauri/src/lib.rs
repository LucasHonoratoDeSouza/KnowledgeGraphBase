mod commands;
pub mod editor;
mod enrichment;
pub mod ipc;
pub mod knowledge;
pub mod settings;
mod transcription;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Starts the native Knowledge OS shell.
///
/// # Panics
///
/// Panics when Tauri cannot initialize or run the application event loop.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(editor::DocumentCommandState::default())
        .setup(|app| {
            let data_directory = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            app.manage(commands::SettingsCommandState::open(&data_directory)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace_get_state,
            commands::search_execute,
            commands::source_capture,
            commands::library_get,
            commands::graph_get,
            commands::assistant_ask,
            commands::workspace_open,
            commands::document_open,
            commands::document_save,
            commands::settings_get,
            commands::settings_complete_onboarding,
            commands::settings_update_ai,
            commands::settings_update_workspace,
            commands::provider_connect,
            commands::provider_rotate,
            commands::provider_test,
            commands::provider_remove
        ])
        .run(tauri::generate_context!())
        .expect("error while running Knowledge OS");
}
