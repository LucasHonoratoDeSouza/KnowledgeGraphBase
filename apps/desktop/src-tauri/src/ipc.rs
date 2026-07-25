use thiserror::Error;

pub const DECLARED_COMMANDS: &[&str] = &[
    "workspace_get_state",
    "search_execute",
    "source_capture",
    "library_get",
    "organization_get",
    "graph_get",
    "assistant_ask",
    "workspace_open",
    "document_open",
    "document_save",
    "settings_get",
    "settings_complete_onboarding",
    "settings_update_ai",
    "settings_set_ai_enabled",
    "settings_update_workspace",
    "provider_connect",
    "provider_rotate",
    "provider_test",
    "provider_remove",
];

#[derive(Debug, Clone, Copy)]
pub struct IpcRequest<'a> {
    window_label: &'a str,
    origin: &'a str,
    command: &'a str,
}

impl<'a> IpcRequest<'a> {
    #[must_use]
    pub const fn new(window_label: &'a str, origin: &'a str, command: &'a str) -> Self {
        Self {
            window_label,
            origin,
            command,
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum AuthorizationError {
    #[error("unknown IPC command: {0}")]
    UnknownCommand(String),
    #[error("window is not authorized for IPC: {0}")]
    UnauthorizedWindow(String),
    #[error("remote origin is not authorized for IPC: {0}")]
    UnauthorizedOrigin(String),
}

/// Authorizes a request against the shell's explicit command, window, and origin allowlist.
///
/// # Errors
///
/// Returns an [`AuthorizationError`] when any allowlist dimension rejects the request.
pub fn authorize(request: &IpcRequest<'_>) -> Result<(), AuthorizationError> {
    if !DECLARED_COMMANDS.contains(&request.command) {
        return Err(AuthorizationError::UnknownCommand(
            request.command.to_owned(),
        ));
    }
    if request.window_label != "main" {
        return Err(AuthorizationError::UnauthorizedWindow(
            request.window_label.to_owned(),
        ));
    }
    if request.origin != "tauri://localhost" {
        return Err(AuthorizationError::UnauthorizedOrigin(
            request.origin.to_owned(),
        ));
    }
    Ok(())
}
