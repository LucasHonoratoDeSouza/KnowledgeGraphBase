pub mod app_info;
mod commands;
pub mod editor;
mod enrichment;
pub mod ipc;
pub mod knowledge;
pub mod librarian;
pub mod logging;
pub mod migration;
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
    logging::install_panic_hook();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(editor::DocumentCommandState::default())
        .manage(app_info::UpdateStatusState::default())
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
            app_info::get_log_path,
            app_info::restart_app,
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

/// Checks for, downloads, and installs any available update -- applying it
/// requires the user to relaunch (Settings → About's "Restart now", T23).
///
/// Runs once at startup, spawned rather than awaited by `setup()`, so
/// startup is never gated on this (MVP-48 AC4). Every outcome -- success or
/// failure -- updates the shared `UpdateStatusState` Settings → About reads
/// (T23) and is logged via `logging` (T8/T13): failures keep their existing
/// `log_update_error` call, a successful install is logged too (MVP-48
/// AC5's "success or failure" wording).
async fn check_for_updates(app: &tauri::AppHandle) {
    let status = app.state::<app_info::UpdateStatusState>();
    status.set(app_info::UpdateStatus::Checking);

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            log_update_error("updater-unavailable", &error);
            status.set(app_info::UpdateStatus::Failed {
                message: error.to_string(),
            });
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            status.set(app_info::UpdateStatus::Idle);
            return;
        }
        Err(error) => {
            log_update_error("update-check-failed", &error);
            status.set(app_info::UpdateStatus::Failed {
                message: error.to_string(),
            });
            return;
        }
    };

    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => {
            logging::log_event(
                "update-installed",
                "update downloaded and installed; restart pending",
            );
            status.set(app_info::UpdateStatus::PendingRestart);
        }
        Err(error) => {
            log_update_error("update-install-failed", &error);
            status.set(app_info::UpdateStatus::Failed {
                message: error.to_string(),
            });
        }
    }
}

/// Logs one `check_for_updates` failure branch via `logging::log_error`.
///
/// This is the exact call each `Err` arm in `check_for_updates` makes -- a
/// cfg-gated seam only in the sense that unit tests call it directly with
/// injected error values, since `app.updater()`/`Update` need a running
/// Tauri app and aren't constructible in a `#[cfg(test)]` unit test.
fn log_update_error(stage: &str, error: &impl std::fmt::Display) {
    logging::log_error(stage, &error.to_string());
}

#[cfg(test)]
mod update_error_logging_tests {
    use super::log_update_error;
    use std::sync::{Mutex, Once};
    use tauri_plugin_log::log::{self, Level, LevelFilter, Log, Metadata, Record};

    static CAPTURED: Mutex<Vec<String>> = Mutex::new(Vec::new());
    static INIT: Once = Once::new();

    struct CapturingLogger;

    impl Log for CapturingLogger {
        fn enabled(&self, metadata: &Metadata) -> bool {
            metadata.level() <= Level::Error
        }

        fn log(&self, record: &Record) {
            if self.enabled(record.metadata()) {
                CAPTURED.lock().unwrap().push(format!("{}", record.args()));
            }
        }

        fn flush(&self) {}
    }

    fn init_capture() {
        INIT.call_once(|| {
            log::set_boxed_logger(Box::new(CapturingLogger))
                .expect("failed to install test logger");
            log::set_max_level(LevelFilter::Error);
        });
    }

    #[test]
    fn updater_unavailable_branch_logs_the_updater_unavailable_event() {
        init_capture();

        log_update_error("updater-unavailable", &"updater plugin missing");

        let captured = CAPTURED.lock().unwrap();
        assert!(
            captured
                .iter()
                .any(|line| line.contains("updater-unavailable")
                    && line.contains("updater plugin missing")),
            "expected an updater-unavailable log line, got: {captured:?}"
        );
    }

    #[test]
    fn check_failed_branch_logs_the_update_check_failed_event() {
        init_capture();

        log_update_error(
            "update-check-failed",
            &"network timeout contacting release feed",
        );

        let captured = CAPTURED.lock().unwrap();
        assert!(
            captured
                .iter()
                .any(|line| line.contains("update-check-failed")
                    && line.contains("network timeout contacting release feed")),
            "expected an update-check-failed log line, got: {captured:?}"
        );
    }

    #[test]
    fn install_failed_branch_logs_the_update_install_failed_event() {
        init_capture();

        log_update_error("update-install-failed", &"bad signature rejected");

        let captured = CAPTURED.lock().unwrap();
        assert!(
            captured
                .iter()
                .any(|line| line.contains("update-install-failed")
                    && line.contains("bad signature rejected")),
            "expected an update-install-failed log line, got: {captured:?}"
        );
    }

    /// End-to-end: a real, installed panic hook (T22) catches a panic
    /// triggered from a code path touching credential data and logs it
    /// through the same capturing sink as the tests above, without the
    /// credential appearing verbatim.
    #[test]
    fn installed_panic_hook_logs_a_panic_without_leaking_a_credential() {
        init_capture();
        super::logging::install_panic_hook();

        let credential = "sk-live-abcdef0123456789";
        let previous_hook_output = std::panic::catch_unwind(|| {
            panic!("stronghold unlock failed: invalid secret '{credential}'");
        });
        assert!(
            previous_hook_output.is_err(),
            "the panic must have occurred"
        );

        let captured = CAPTURED.lock().unwrap();
        assert!(
            captured.iter().any(|line| line.starts_with("panic:")),
            "expected a panic log line, got: {captured:?}"
        );
        assert!(
            captured.iter().all(|line| !line.contains(credential)),
            "credential leaked verbatim into a captured log line: {captured:?}"
        );
    }
}
