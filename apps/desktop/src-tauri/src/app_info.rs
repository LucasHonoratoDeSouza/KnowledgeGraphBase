//! Exposes the running build's release channel and version to the frontend.
//!
//! # Channel and updater endpoint contract
//!
//! `apps/desktop/src-tauri/tauri.conf.json`'s `plugins.updater.endpoints`
//! value is overridden per channel at build time via `tauri-action`'s
//! `--config` override (the same mechanism already used to set the dev
//! build's monotonic version, see `release-dev.yml`/`release-stable.yml`).
//! The in-repo `tauri.conf.json` value is the **dev**-channel default and is
//! left unchanged by dev builds.
//!
//! The channel string returned by [`channel`] is baked in the same way, via
//! the `KNOWLEDGE_OS_CHANNEL` build-time environment variable set by
//! `release-stable.yml` (to `"stable"`); it defaults to `"dev"` when unset,
//! matching the in-repo endpoint default.
//!
//! **This is load-bearing**: once the first stable release ships, changing
//! the stable updater endpoint value is irreversible for every existing
//! install already pointed at it -- it must not be changed casually.

// SPEC_DEVIATION: this documentation lives here rather than as an inline
// comment inside tauri.conf.json itself, because Tauri's config parser
// rejects unknown top-level keys (deny_unknown_fields, verified via
// `cargo build`: a `$comment` key fails the build with "unknown field
// `$comment`"). JSON has no native comment syntax, so this adjacent module
// doc comment is the documentation the task's "inline comment or adjacent
// doc" Done-when criterion allows.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri command handlers deserialize owned IPC arguments and inject State by value"
)]

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};

/// Build-time channel override, baked in via `KNOWLEDGE_OS_CHANNEL`.
const CHANNEL_ENV: Option<&str> = option_env!("KNOWLEDGE_OS_CHANNEL");

/// The self-update path's current state, as observable in Settings → About
/// (T23). Updated by `check_for_updates` in `lib.rs` and read by
/// [`get_app_info`].
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum UpdateStatus {
    /// No update check has found anything actionable (yet, or the vault is
    /// already current).
    #[default]
    Idle,
    /// An update check is currently in flight.
    Checking,
    /// An update finished downloading and installing; relaunching applies
    /// it.
    PendingRestart,
    /// The most recent update check or install attempt failed.
    Failed { message: String },
}

/// Shared, thread-safe holder for the current [`UpdateStatus`], managed via
/// `app.manage(...)`.
#[derive(Default)]
pub struct UpdateStatusState(Mutex<UpdateStatus>);

impl UpdateStatusState {
    /// Replaces the current status.
    pub fn set(&self, status: UpdateStatus) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = status;
        }
    }

    /// Returns a clone of the current status.
    #[must_use]
    pub fn get(&self) -> UpdateStatus {
        self.0
            .lock()
            .map_or(UpdateStatus::Idle, |guard| guard.clone())
    }
}

/// Version, channel, and update status of the running build, exposed to the
/// frontend.
#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub version: String,
    pub channel: &'static str,
    pub update_status: UpdateStatus,
}

/// Returns this build's release channel: `"stable"` or `"dev"`.
#[must_use]
pub fn channel() -> &'static str {
    resolve_channel(CHANNEL_ENV)
}

/// Pure decision function behind [`channel`], taking the build-time value as
/// a parameter so both branches are unit-testable without recompiling.
fn resolve_channel(raw: Option<&str>) -> &'static str {
    match raw {
        Some("stable") => "stable",
        _ => "dev",
    }
}

/// Returns the running build's version, channel, and current update status.
#[must_use]
#[tauri::command]
pub fn get_app_info(app: AppHandle, update_status: State<'_, UpdateStatusState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        channel: channel(),
        update_status: update_status.get(),
    }
}

/// Relaunches the app to apply an already-downloaded, installed update
/// (Settings → About's "Restart now" action, T23). In practice the process
/// exits and restarts before this ever returns to its caller.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart()
}

/// Returns the rotating log file's path (T22), for Settings' "copy log
/// path" action and the bug-report path documented in the README.
///
/// # Errors
///
/// Returns a renderer-safe string error when the app-local-data directory
/// cannot be resolved.
#[tauri::command]
pub fn get_log_path(app: AppHandle) -> Result<String, String> {
    crate::logging::log_file_path(&app)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_stable_channel_from_build_time_value() {
        assert_eq!(resolve_channel(Some("stable")), "stable");
    }

    #[test]
    fn resolves_dev_channel_when_build_time_value_is_unset() {
        assert_eq!(resolve_channel(None), "dev");
    }

    #[test]
    fn resolves_dev_channel_for_the_explicit_dev_value() {
        assert_eq!(resolve_channel(Some("dev")), "dev");
    }

    #[test]
    fn update_status_state_defaults_to_idle() {
        let state = UpdateStatusState::default();
        assert_eq!(state.get(), UpdateStatus::Idle);
    }

    #[test]
    fn update_status_state_round_trips_pending_restart() {
        let state = UpdateStatusState::default();
        state.set(UpdateStatus::PendingRestart);
        assert_eq!(state.get(), UpdateStatus::PendingRestart);
    }

    #[test]
    fn update_status_state_round_trips_a_failure_message() {
        let state = UpdateStatusState::default();
        state.set(UpdateStatus::Failed {
            message: "network timeout".to_owned(),
        });
        assert_eq!(
            state.get(),
            UpdateStatus::Failed {
                message: "network timeout".to_owned()
            }
        );
    }
}
