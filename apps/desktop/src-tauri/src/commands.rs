#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri command handlers deserialize owned IPC arguments and inject State by value"
)]

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};

use knowledge_ai::{AiError, AiProvider, NativeHttpAiPort, ProviderConnection, SecretResolver};
use knowledge_retrieval::{AssistantAnswer, RetrievalResult};
use knowledge_storage::GraphView;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use tauri::State;
use zeroize::Zeroizing;

use crate::{
    editor::{DocumentCommandState, NoteDocument},
    enrichment::MainModelEnricher,
    knowledge::{
        CaptureCommandRequest, CaptureCommandResponse, LibrarySnapshot, ask_in_vault,
        capture_in_vault_with_services, graph_in_vault, library_in_vault, search_in_vault,
    },
    settings::{
        AiConfiguration, BudgetSettings, HealthStatus, ModelProfile, OnboardingInput,
        Phase2ProviderProbe, PrivacySettings, ProviderConnectionService, ProviderKind,
        PublicSettings, RoutingSettings, SecretInput, SettingsError, SettingsRepository,
        StrongholdCredentialVault, VaultSetupRequest, prepare_vault,
    },
    transcription::OpenAiYouTubeTranscriber,
};

type NativeSettingsService =
    ProviderConnectionService<StrongholdCredentialVault, Phase2ProviderProbe>;

pub struct SettingsCommandState {
    service: Mutex<NativeSettingsService>,
    data_directory: PathBuf,
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
            data_directory: data_directory.to_path_buf(),
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
    result: RetrievalResult,
}

#[tauri::command]
pub fn search_execute(
    query: String,
    state: State<'_, SettingsCommandState>,
) -> Result<SearchResponse, String> {
    let root = workspace_root(&state)?;
    Ok(SearchResponse {
        result: search_in_vault(&root, &query)?,
    })
}

#[tauri::command]
pub fn source_capture(
    request: CaptureCommandRequest,
    state: State<'_, SettingsCommandState>,
) -> Result<CaptureCommandResponse, String> {
    let root = workspace_root(&state)?;
    let (openai, main) = {
        let service = lock_settings(&state)?;
        let snapshot = service.public_snapshot().map_err(command_error)?;
        let openai = service.native_provider(ProviderKind::OpenAi).ok();
        let main = if snapshot.ai_enabled && snapshot.ai.privacy.allow_source_content {
            snapshot
                .ai
                .routing
                .main_model_id
                .as_deref()
                .and_then(|main_id| {
                    snapshot
                        .ai
                        .models
                        .iter()
                        .find(|model| model.id == main_id && model.enabled)
                })
                .and_then(|model| {
                    snapshot
                        .providers
                        .iter()
                        .find(|connection| {
                            connection.provider == model.provider
                                && connection.health == HealthStatus::Healthy
                        })
                        .map(|_| model)
                })
                .map(|model| {
                    service
                        .native_provider(model.provider)
                        .map(|(endpoint, secret)| {
                            (model.id.clone(), model.provider, endpoint, secret)
                        })
                })
                .transpose()
                .map_err(command_error)?
        } else {
            None
        };
        (openai, main)
    };
    let transcriber = openai
        .map(|(endpoint, secret)| {
            OpenAiYouTubeTranscriber::new(endpoint, secret, state.data_directory.join("tools"))
        })
        .transpose()
        .map_err(command_error)?;
    let enricher = main
        .map(|(model_id, provider, endpoint, secret)| {
            MainModelEnricher::new(model_id, ai_provider(provider), endpoint, secret)
        })
        .transpose()?;
    capture_in_vault_with_services(
        &root,
        &request,
        transcriber
            .as_ref()
            .map(|value| value as &dyn knowledge_ingestion::YouTubeTranscriptionFallback),
        enricher
            .as_ref()
            .map(|value| value as &dyn crate::knowledge::KnowledgeEnrichmentPort),
    )
}

#[tauri::command]
pub fn library_get(state: State<'_, SettingsCommandState>) -> Result<LibrarySnapshot, String> {
    library_in_vault(&workspace_root(&state)?)
}

#[tauri::command]
pub fn graph_get(state: State<'_, SettingsCommandState>) -> Result<GraphView, String> {
    graph_in_vault(&workspace_root(&state)?)
}

#[tauri::command]
pub fn assistant_ask(
    question: String,
    model_id: String,
    state: State<'_, SettingsCommandState>,
) -> Result<AssistantAnswer, String> {
    let (root, provider, endpoint, remote_model, secret) = {
        let service = lock_settings(&state)?;
        let root = service
            .workspace_root()
            .map_err(command_error)?
            .ok_or_else(|| "complete local vault setup first".to_owned())?;
        let snapshot = service.public_snapshot().map_err(command_error)?;
        let model = snapshot
            .ai
            .models
            .iter()
            .find(|model| model.id == model_id && model.enabled)
            .ok_or_else(|| "assistant model is not configured".to_owned())?;
        let connection = snapshot
            .providers
            .iter()
            .find(|connection| connection.provider == model.provider)
            .ok_or_else(|| "assistant provider is not configured".to_owned())?;
        if connection.health != HealthStatus::Healthy {
            return Err("test this provider connection before using the assistant".to_owned());
        }
        let (endpoint, secret) = service
            .native_provider(model.provider)
            .map_err(command_error)?;
        (
            root,
            ai_provider(model.provider),
            endpoint,
            model.id.clone(),
            secret,
        )
    };
    let resolver = OneSecretResolver { provider, secret };
    let connections = HashMap::from([(
        model_id.clone(),
        ProviderConnection {
            provider,
            endpoint,
            model: remote_model,
        },
    )]);
    let ai = NativeHttpAiPort::new(resolver, connections).map_err(command_error)?;
    ask_in_vault(&root, &question, &model_id, &ai)
}

struct OneSecretResolver {
    provider: AiProvider,
    secret: Zeroizing<String>,
}

impl SecretResolver for OneSecretResolver {
    fn resolve(&self, provider: AiProvider) -> Result<Zeroizing<String>, AiError> {
        if provider == self.provider {
            Ok(Zeroizing::new((*self.secret).clone()))
        } else {
            Err(AiError::MissingCredential)
        }
    }
}

const fn ai_provider(provider: ProviderKind) -> AiProvider {
    match provider {
        ProviderKind::OpenAi => AiProvider::OpenAi,
        ProviderKind::Anthropic => AiProvider::Anthropic,
        ProviderKind::DeepSeek => AiProvider::DeepSeek,
        ProviderKind::Compatible => AiProvider::Compatible,
    }
}

fn workspace_root(state: &State<'_, SettingsCommandState>) -> Result<std::path::PathBuf, String> {
    lock_settings(state)?
        .workspace_root()
        .map_err(command_error)?
        .ok_or_else(|| "complete local vault setup first".to_owned())
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
    let (endpoint, secret) = lock_settings(&state)?
        .native_provider(provider)
        .map_err(command_error)?;
    let probe = probe_provider_connection(provider, &endpoint, &secret);
    let mut service = lock_settings(&state)?;
    service
        .mark_health(
            provider,
            if probe.is_ok() {
                HealthStatus::Healthy
            } else {
                HealthStatus::Unhealthy
            },
        )
        .map_err(command_error)?;
    probe?;
    service.public_snapshot().map_err(command_error)
}

fn probe_provider_connection(
    provider: ProviderKind,
    endpoint: &str,
    secret: &str,
) -> Result<(), String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(command_error)?;
    let url = format!("{}/models", endpoint.trim_end_matches('/'));
    let request = match provider {
        ProviderKind::Anthropic => client
            .get(url)
            .header("x-api-key", secret)
            .header("anthropic-version", "2023-06-01"),
        ProviderKind::OpenAi | ProviderKind::DeepSeek | ProviderKind::Compatible => {
            client.get(url).bearer_auth(secret)
        }
    };
    let response = request.send().map_err(|error| {
        format!(
            "provider connection test failed: {}",
            transport_summary(&error)
        )
    })?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "provider connection test failed with HTTP {}",
            response.status()
        ))
    }
}

fn transport_summary(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "request timed out"
    } else if error.is_connect() {
        "could not connect"
    } else {
        "network request failed"
    }
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
