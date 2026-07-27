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

use serde::Serialize;
use tauri::AppHandle;

/// Build-time channel override, baked in via `KNOWLEDGE_OS_CHANNEL`.
const CHANNEL_ENV: Option<&str> = option_env!("KNOWLEDGE_OS_CHANNEL");

/// Version and channel of the running build, exposed to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub version: String,
    pub channel: &'static str,
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

/// Returns the running build's version and channel.
#[must_use]
#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        channel: channel(),
    }
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
}
