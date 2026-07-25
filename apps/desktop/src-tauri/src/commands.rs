#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri command handlers deserialize owned IPC arguments and inject State by value"
)]

use std::{path::Path, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    editor::{DocumentCommandState, NoteDocument},
    settings::{
        AiConfiguration, BudgetSettings, ModelProfile, OnboardingInput, Phase2ProviderProbe,
        PrivacySettings, ProviderConnectionService, ProviderKind, PublicSettings, RoutingSettings,
        SecretInput, SettingsError, SettingsRepository, StrongholdCredentialVault,
        VaultSetupRequest, prepare_vault,
    },
};

type NativeSettingsService =
    ProviderConnectionService<StrongholdCredentialVault, Phase2ProviderProbe>;

pub struct SettingsCommandState {
    service: Mutex<NativeSettingsService>,
}

impl SettingsCommandState {
    /// Opens the private settings database and encrypted provider credential snapshot.
    ///
    /// # Errors
    ///
    /// Propagates database, install-key, and Stronghold initialization errors.
    pub fn open(data_directory: &Path) -> Result<Self, SettingsError> {
        let repository = SettingsRepository::open(data_directory.join("settings.sqlite3"))?;
        let vault = StrongholdCredentialVault::open(
            &data_directory.join("providers.hold"),
            &data_directory.join("stronghold.key"),
        )?;
        Ok(Self {
            service: Mutex::new(ProviderConnectionService::new(
                repository,
                vault,
                Phase2ProviderProbe,
            )),
        })
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingCommandRequest {
    vault: VaultCommandRequest,
    ai_enabled: bool,
    provider: Option<ProviderKind>,
    endpoint: Option<String>,
    credential: Option<String>,
    main_model_id: Option<String>,
    daily_budget_cents: u64,
    monthly_budget_cents: u64,
    layout_json: String,
}

#[derive(Deserialize)]
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
enum VaultCommandRequest {
    Create {
        parent_path: String,
        vault_name: String,
    },
    OpenExisting {
        vault_path: String,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConnectCommandRequest {
    provider: ProviderKind,
    endpoint: String,
    credential: String,
}

fn command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn lock_settings<'a>(
    state: &'a State<'a, SettingsCommandState>,
) -> Result<std::sync::MutexGuard<'a, NativeSettingsService>, String> {
    state.service.lock().map_err(command_error)
}

#[derive(Debug, Serialize)]
pub struct WorkspaceState {
    mode: &'static str,
    index: &'static str,
}

#[tauri::command]
pub const fn workspace_get_state() -> WorkspaceState {
    WorkspaceState {
        mode: "local",
        index: "ready",
    }
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    query: String,
    results: Vec<String>,
}

#[tauri::command]
pub fn search_execute(query: String) -> SearchResponse {
    SearchResponse {
        query,
        results: Vec::new(),
    }
}

#[tauri::command]
pub fn workspace_open(root: String, state: State<'_, DocumentCommandState>) -> Result<(), String> {
    state
        .workspace_open(root)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn document_open(
    path: String,
    state: State<'_, DocumentCommandState>,
) -> Result<NoteDocument, String> {
    state
        .document_open(&path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn document_save(
    path: String,
    content: String,
    state: State<'_, DocumentCommandState>,
) -> Result<NoteDocument, String> {
    state
        .document_save(&path, &content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn settings_get(
    state: State<'_, SettingsCommandState>,
    documents: State<'_, DocumentCommandState>,
) -> Result<PublicSettings, String> {
    let service = lock_settings(&state)?;
    let workspace_root = service.workspace_root().map_err(command_error)?;
    let snapshot = service.public_snapshot().map_err(command_error)?;
    drop(service);
    if let Some(root) = workspace_root {
        documents.workspace_open(root).map_err(command_error)?;
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn settings_complete_onboarding(
    request: OnboardingCommandRequest,
    state: State<'_, SettingsCommandState>,
    documents: State<'_, DocumentCommandState>,
) -> Result<PublicSettings, String> {
    let ai_setup = if request.ai_enabled {
        let provider = request
            .provider
            .ok_or_else(|| "AI setup requires a provider".to_owned())?;
        let endpoint = request
            .endpoint
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "AI setup requires a provider endpoint".to_owned())?;
        let credential = SecretInput::new(
            request
                .credential
                .ok_or_else(|| "AI setup requires a provider credential".to_owned())?,
        )
        .map_err(command_error)?;
        let model_id = request
            .main_model_id
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "AI setup requires a main model".to_owned())?;
        let configuration = AiConfiguration {
            models: vec![ModelProfile {
                id: model_id.clone(),
                provider,
                display_name: model_id.clone(),
                enabled: true,
            }],
            routing: RoutingSettings {
                main_model_id: Some(model_id.clone()),
                assistant_default_model_id: Some(model_id),
                explicit_fallback_model_id: None,
            },
            budgets: BudgetSettings {
                daily_cents: request.daily_budget_cents,
                monthly_cents: request.monthly_budget_cents,
            },
            privacy: PrivacySettings::default(),
        };
        Some((provider, endpoint, credential, configuration))
    } else {
        None
    };

    let vault_request = match request.vault {
        VaultCommandRequest::Create {
            parent_path,
            vault_name,
        } => VaultSetupRequest::Create {
            parent: parent_path.into(),
            name: vault_name,
        },
        VaultCommandRequest::OpenExisting { vault_path } => VaultSetupRequest::OpenExisting {
            path: vault_path.into(),
        },
    };
    let onboarding = OnboardingInput {
        vault_root: prepare_vault(&vault_request).map_err(command_error)?,
        ai_enabled: request.ai_enabled,
        active_mode: "Ingest".to_owned(),
        layout_json: request.layout_json,
    };
    let mut service = lock_settings(&state)?;
    service
        .complete_onboarding(&onboarding)
        .map_err(command_error)?;
    if let Some((provider, endpoint, credential, configuration)) = ai_setup {
        service
            .save_ai_configuration(&configuration)
            .map_err(command_error)?;
        service
            .connect(provider, &endpoint, credential)
            .map_err(command_error)?;
    }
    let snapshot = service.public_snapshot().map_err(command_error)?;
    drop(service);
    documents
        .workspace_open(&onboarding.vault_root)
        .map_err(command_error)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn settings_update_ai(
    configuration: AiConfiguration,
    state: State<'_, SettingsCommandState>,
) -> Result<PublicSettings, String> {
    let mut service = lock_settings(&state)?;
    service
        .save_ai_configuration(&configuration)
        .map_err(command_error)?;
    service.public_snapshot().map_err(command_error)
}

#[tauri::command]
pub fn settings_update_workspace(
    active_mode: String,
    layout_json: String,
    state: State<'_, SettingsCommandState>,
) -> Result<PublicSettings, String> {
    let mut service = lock_settings(&state)?;
    service
        .save_workspace_state(&active_mode, &layout_json)
        .map_err(command_error)?;
    service.public_snapshot().map_err(command_error)
}

#[tauri::command]
pub fn provider_connect(
    request: ProviderConnectCommandRequest,
    state: State<'_, SettingsCommandState>,
) -> Result<PublicSettings, String> {
    let credential = SecretInput::new(request.credential).map_err(command_error)?;
    let mut service = lock_settings(&state)?;
    service
        .connect(request.provider, &request.endpoint, credential)
        .map_err(command_error)?;
    service.public_snapshot().map_err(command_error)
}

#[tauri::command]
pub fn provider_rotate(
    provider: ProviderKind,
    credential: String,
    state: State<'_, SettingsCommandState>,
) -> Result<PublicSettings, String> {
    let credential = SecretInput::new(credential).map_err(command_error)?;
    let mut service = lock_settings(&state)?;
    service
        .rotate(provider, credential)
        .map_err(command_error)?;
    service.public_snapshot().map_err(command_error)
}

#[tauri::command]
pub fn provider_test(
    provider: ProviderKind,
    state: State<'_, SettingsCommandState>,
) -> Result<PublicSettings, String> {
    let mut service = lock_settings(&state)?;
    service.test(provider).map_err(command_error)?;
    service.public_snapshot().map_err(command_error)
}

#[tauri::command]
pub fn provider_remove(
    provider: ProviderKind,
    state: State<'_, SettingsCommandState>,
) -> Result<PublicSettings, String> {
    let mut service = lock_settings(&state)?;
    service.remove(provider).map_err(command_error)?;
    service.public_snapshot().map_err(command_error)
}
