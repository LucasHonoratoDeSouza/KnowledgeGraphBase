use std::fs;

use knowledge_os_desktop_lib::ipc::{AuthorizationError, DECLARED_COMMANDS, IpcRequest, authorize};
use serde_json::{Value, json};

const LOCAL_ORIGIN: &str = "tauri://localhost";

#[test]
fn manifest_declares_only_scoped_desktop_foundation_commands() {
    assert_eq!(
        DECLARED_COMMANDS,
        &[
            "workspace_get_state",
            "search_execute",
            "source_capture",
            "library_get",
            "folder_create",
            "entry_rename",
            "entry_delete",
            "entry_move",
            "librarian_reorganize",
            "librarian_undo",
            "librarian_suggestions",
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
        ],
    );
}

#[test]
fn main_window_can_invoke_workspace_state() {
    let request = IpcRequest::new("main", LOCAL_ORIGIN, "workspace_get_state");

    assert_eq!(authorize(&request), Ok(()));
}

#[test]
fn main_window_can_invoke_local_search() {
    let request = IpcRequest::new("main", LOCAL_ORIGIN, "search_execute");

    assert_eq!(authorize(&request), Ok(()));
}

#[test]
fn main_window_can_invoke_only_the_scoped_document_commands() {
    for command in ["workspace_open", "document_open", "document_save"] {
        let request = IpcRequest::new("main", LOCAL_ORIGIN, command);
        assert_eq!(authorize(&request), Ok(()));
    }
}

#[test]
fn unknown_command_fails_closed() {
    let request = IpcRequest::new("main", LOCAL_ORIGIN, "read_arbitrary_file");

    assert_eq!(
        authorize(&request),
        Err(AuthorizationError::UnknownCommand(
            "read_arbitrary_file".to_owned()
        )),
    );
}

#[test]
fn undeclared_window_fails_closed() {
    let request = IpcRequest::new("secondary", LOCAL_ORIGIN, "workspace_get_state");

    assert_eq!(
        authorize(&request),
        Err(AuthorizationError::UnauthorizedWindow(
            "secondary".to_owned()
        )),
    );
}

#[test]
fn remote_origin_fails_closed() {
    let request = IpcRequest::new("main", "https://untrusted.example", "workspace_get_state");

    assert_eq!(
        authorize(&request),
        Err(AuthorizationError::UnauthorizedOrigin(
            "https://untrusted.example".to_owned()
        )),
    );
}

/// Permissions the window legitimately holds that do not map to one of our own
/// commands. Anything else in the capability has to be a declared command.
const NON_COMMAND_PERMISSIONS: &[&str] = &[
    "dialog:allow-open",
    "core:path:default",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-is-maximized",
    "core:window:allow-close",
    "core:window:allow-start-dragging",
    "core:window:allow-start-resize-dragging",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
];

fn main_capability() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/main.json");
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn permissions(capability: &Value) -> Vec<String> {
    capability["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect()
}

/// Every declared command needs its `allow-` grant, or the renderer's invoke is
/// rejected at runtime with "not allowed. Command not found" — a failure mode no
/// unit test catches, because the command itself is perfectly well registered.
/// Deriving the expectation from `DECLARED_COMMANDS` is what keeps the two lists
/// from drifting apart again.
#[test]
fn capability_grants_every_declared_command_to_main() {
    let capability = main_capability();
    let granted = permissions(&capability);

    assert_eq!(capability["windows"], json!(["main"]));
    for command in DECLARED_COMMANDS {
        let permission = format!("allow-{}", command.replace('_', "-"));
        assert!(
            granted.contains(&permission),
            "{command} is declared but the main capability never grants {permission}",
        );
    }
}

#[test]
fn capability_grants_nothing_beyond_the_declared_commands() {
    let capability = main_capability();

    for permission in permissions(&capability) {
        if NON_COMMAND_PERMISSIONS.contains(&permission.as_str()) {
            continue;
        }
        let command = permission
            .strip_prefix("allow-")
            .map(|name| name.replace('-', "_"));
        assert!(
            command.is_some_and(|name| DECLARED_COMMANDS.contains(&name.as_str())),
            "{permission} is granted to the main window but matches no declared command",
        );
    }
    assert_eq!(capability.get("remote"), None);
}
