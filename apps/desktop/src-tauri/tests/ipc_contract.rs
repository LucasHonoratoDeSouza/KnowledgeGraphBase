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
            "graph_get",
            "assistant_ask",
            "workspace_open",
            "document_open",
            "document_save",
            "settings_get",
            "settings_complete_onboarding",
            "settings_update_ai",
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

#[test]
fn capability_grants_only_manifest_permissions_to_main() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/main.json");
    let capability: Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();

    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-workspace-get-state",
            "allow-search-execute",
            "allow-source-capture",
            "allow-library-get",
            "allow-graph-get",
            "allow-assistant-ask",
            "allow-workspace-open",
            "allow-document-open",
            "allow-document-save",
            "allow-settings-get",
            "allow-settings-complete-onboarding",
            "allow-settings-update-ai",
            "allow-settings-update-workspace",
            "allow-provider-connect",
            "allow-provider-rotate",
            "allow-provider-test",
            "allow-provider-remove",
            "dialog:allow-open",
            "core:path:default",
        ]),
    );
    assert_eq!(capability.get("remote"), None);
}
