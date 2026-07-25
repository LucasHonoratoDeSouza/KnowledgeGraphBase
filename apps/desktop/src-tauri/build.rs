fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "workspace_get_state",
            "search_execute",
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
        ]),
    ))
    .expect("failed to prepare the Tauri application manifest");
}
