//! Rotating local log infra, wired via the official `tauri-plugin-log` plugin.
//!
//! This module is the only call surface the rest of the app should use to
//! write to the local log file (`log_event`/`log_error`). Callers on paths
//! that may carry note content, vault contents, or provider credentials
//! (Stronghold error paths, note-content paths) must never pass that data
//! through unchecked: every `detail` string routes through [`redact`] before
//! it can reach the log sink, which strips credential/token-shaped
//! substrings and caps the remaining length so a full note or vault content
//! blob can never round-trip into the log file.
//!
//! # AD-014
//!
//! `tauri-plugin-log` is a new native (Rust-side) Tauri dependency. AD-012
//! ("no new runtime dependency enters the app") is scoped to the desktop
//! renderer only (AD-012 Scope: "renderer do desktop"). AD-014 clarifies
//! that native Tauri plugins for backend concerns such as logging are
//! governed by normal dependency-review judgment, not blocked by AD-012 —
//! see `.specs/STATE.md` AD-012/AD-014.

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

/// Minimum length (in contiguous alphanumeric/`-`/`_` characters) for a
/// token to be treated as credential-shaped and redacted.
const CREDENTIAL_TOKEN_MIN_LEN: usize = 12;

/// Maximum length of a redacted detail string before it is truncated, so a
/// full note body or vault content blob can never round-trip into the log.
const MAX_DETAIL_LEN: usize = 120;

/// Registers the rotating file logger, writing into the app-local-data
/// directory.
///
/// # Errors
///
/// Returns an error when the app-local-data directory cannot be resolved or
/// the log plugin fails to initialize.
pub fn init_logging(app: &tauri::App) -> tauri::Result<()> {
    let data_directory = app.path().app_local_data_dir()?;
    app.handle().plugin(
        tauri_plugin_log::Builder::new()
            .targets([Target::new(TargetKind::Folder {
                path: data_directory,
                file_name: None,
            })])
            .build(),
    )
}

/// Logs an informational event. `detail` is redacted before it reaches the
/// log sink — see module docs.
pub fn log_event(event: &str, detail: &str) {
    tauri_plugin_log::log::info!("{event}: {}", redact(detail));
}

/// Logs an error event. `detail` is redacted before it reaches the log sink
/// — see module docs.
pub fn log_error(event: &str, detail: &str) {
    tauri_plugin_log::log::error!("{event}: {}", redact(detail));
}

/// Redacts a detail string before it can reach the log sink.
///
/// Two independent protections:
/// - Any run of [`CREDENTIAL_TOKEN_MIN_LEN`]+ alphanumeric/`-`/`_`
///   characters (the shape of API keys, passwords, and Stronghold secrets)
///   is replaced with `[REDACTED]`.
/// - The remaining text is capped at [`MAX_DETAIL_LEN`] characters, so a
///   full note body or vault content blob can never round-trip into the log
///   even if it contains no credential-shaped tokens.
fn redact(detail: &str) -> String {
    let mut result = String::new();
    let mut token = String::new();

    for ch in detail.chars() {
        if ch.is_alphanumeric() || ch == '-' || ch == '_' {
            token.push(ch);
        } else {
            flush_token(&mut token, &mut result);
            result.push(ch);
        }
    }
    flush_token(&mut token, &mut result);

    if result.chars().count() > MAX_DETAIL_LEN {
        let truncated: String = result.chars().take(MAX_DETAIL_LEN).collect();
        format!("{truncated}... [truncated]")
    } else {
        result
    }
}

fn flush_token(token: &mut String, result: &mut String) {
    if token.chars().count() >= CREDENTIAL_TOKEN_MIN_LEN {
        result.push_str("[REDACTED]");
    } else {
        result.push_str(token);
    }
    token.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Simulates a Stronghold error path: the underlying vault error message
    /// embeds the credential itself (a common shape for "invalid password"
    /// style errors). The credential must never appear verbatim in the
    /// logged output.
    #[test]
    fn stronghold_error_path_credential_is_redacted() {
        let credential = "sk-live-abcdef0123456789";
        let stronghold_error =
            format!("failed to unlock stronghold vault: invalid secret '{credential}'");

        let redacted = redact(&stronghold_error);

        assert!(
            !redacted.contains(credential),
            "credential leaked verbatim into redacted output: {redacted}"
        );
    }

    /// Simulates a note-content path: an error touching note text embeds the
    /// note body. Even without a credential-shaped token, the full body must
    /// not round-trip into the log (length cap).
    #[test]
    fn note_content_path_is_redacted() {
        let note_body = "Meeting notes: remember to renew the certificate before the deadline \
            because the client asked twice and the team lead confirmed the budget line item";
        let note_error = format!("failed to index note: {note_body}");

        let redacted = redact(&note_error);

        assert!(
            !redacted.contains(note_body),
            "note content leaked verbatim into redacted output: {redacted}"
        );
    }

    #[test]
    fn short_non_sensitive_detail_is_left_readable() {
        let detail = "network timeout";

        let redacted = redact(detail);

        assert_eq!(redacted, "network timeout");
    }
}
