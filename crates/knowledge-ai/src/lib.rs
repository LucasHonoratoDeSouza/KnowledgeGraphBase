#![allow(
    clippy::missing_errors_doc,
    reason = "the public AI boundary uses a single typed AiError contract"
)]
//! Provider-neutral model policy, structured extraction, caching, and native HTTP transports.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use zeroize::Zeroizing;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum AiError {
    #[error("AI model is not configured")]
    ModelNotConfigured,
    #[error("AI model is disabled or unhealthy")]
    ModelUnavailable,
    #[error("AI budget would be exceeded")]
    BudgetExceeded,
    #[error("fallback models require an explicit user opt-in")]
    FallbackNotExplicit,
    #[error("structured AI output is invalid: {0}")]
    InvalidStructuredOutput(String),
    #[error("provider credential is unavailable")]
    MissingCredential,
    #[error("provider request failed: {0}")]
    Transport(String),
    #[error("AI lock was poisoned")]
    LockPoisoned,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    OpenAi,
    Anthropic,
    DeepSeek,
    Groq,
    Compatible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDefinition {
    pub id: String,
    pub provider: AiProvider,
    pub remote_name: String,
    pub enabled: bool,
    pub healthy: bool,
    pub input_microusd_per_million: u64,
    pub output_microusd_per_million: u64,
    pub max_context_tokens: u32,
    pub deep_allowed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRouting {
    pub main_model_id: Option<String>,
    pub assistant_default_model_id: Option<String>,
    pub explicit_fallback_model_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskKind {
    Organization,
    Extraction,
    Assistant,
    DeepAnalysis,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BudgetSnapshot {
    pub daily_limit_microusd: u64,
    pub monthly_limit_microusd: u64,
    pub spent_today_microusd: u64,
    pub spent_month_microusd: u64,
}

impl BudgetSnapshot {
    #[must_use]
    pub fn permits(self, estimated_microusd: u64) -> bool {
        self.spent_today_microusd
            .checked_add(estimated_microusd)
            .is_some_and(|total| total <= self.daily_limit_microusd)
            && self
                .spent_month_microusd
                .checked_add(estimated_microusd)
                .is_some_and(|total| total <= self.monthly_limit_microusd)
    }
}

#[derive(Debug, Clone, Default)]
pub struct ModelCatalog {
    models: HashMap<String, ModelDefinition>,
    routing: ModelRouting,
}

impl ModelCatalog {
    #[must_use]
    pub fn new(models: Vec<ModelDefinition>, routing: ModelRouting) -> Self {
        Self {
            models: models
                .into_iter()
                .map(|model| (model.id.clone(), model))
                .collect(),
            routing,
        }
    }

    pub fn select(
        &self,
        task: TaskKind,
        requested_model_id: Option<&str>,
        explicit_fallback: bool,
        estimated_microusd: u64,
        budget: BudgetSnapshot,
    ) -> Result<&ModelDefinition, AiError> {
        if !budget.permits(estimated_microusd) {
            return Err(AiError::BudgetExceeded);
        }
        let selected = match task {
            TaskKind::Organization | TaskKind::Extraction => self.routing.main_model_id.as_deref(),
            TaskKind::Assistant => {
                requested_model_id.or(self.routing.assistant_default_model_id.as_deref())
            }
            TaskKind::DeepAnalysis => requested_model_id,
        };
        let selected = selected.ok_or(AiError::ModelNotConfigured)?;
        if self.routing.explicit_fallback_model_id.as_deref() == Some(selected)
            && !explicit_fallback
        {
            return Err(AiError::FallbackNotExplicit);
        }
        let model = self
            .models
            .get(selected)
            .ok_or(AiError::ModelNotConfigured)?;
        if !model.enabled || !model.healthy {
            return Err(AiError::ModelUnavailable);
        }
        if task == TaskKind::DeepAnalysis && !model.deep_allowed {
            return Err(AiError::ModelUnavailable);
        }
        Ok(model)
    }

    #[must_use]
    pub fn assistant_models(&self) -> Vec<&ModelDefinition> {
        let mut models = self
            .models
            .values()
            .filter(|model| model.enabled && model.healthy)
            .collect::<Vec<_>>();
        models.sort_by(|left, right| left.id.cmp(&right.id));
        models
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub model_id: String,
    pub system: String,
    pub input: String,
    pub max_output_tokens: u32,
    pub temperature_milli: u16,
    pub schema_version: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub content: String,
    pub usage: TokenUsage,
}

pub trait AiPort: Send + Sync {
    fn complete(&self, request: &AiRequest) -> Result<AiResponse, AiError>;
}

#[derive(Clone, Default)]
pub struct FakeAiPort {
    responses: Arc<Mutex<Vec<AiResponse>>>,
    requests: Arc<Mutex<Vec<AiRequest>>>,
}

impl FakeAiPort {
    #[must_use]
    pub fn with_responses(responses: Vec<AiResponse>) -> Self {
        Self {
            responses: Arc::new(Mutex::new(responses.into_iter().rev().collect())),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn requests(&self) -> Result<Vec<AiRequest>, AiError> {
        self.requests
            .lock()
            .map(|requests| requests.clone())
            .map_err(|_| AiError::LockPoisoned)
    }
}

impl AiPort for FakeAiPort {
    fn complete(&self, request: &AiRequest) -> Result<AiResponse, AiError> {
        self.requests
            .lock()
            .map_err(|_| AiError::LockPoisoned)?
            .push(request.clone());
        self.responses
            .lock()
            .map_err(|_| AiError::LockPoisoned)?
            .pop()
            .ok_or_else(|| AiError::Transport("fake response queue is empty".to_owned()))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedRelation {
    pub source: String,
    pub target: String,
    pub relation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptDefinition {
    pub concept: String,
    pub definition: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredKnowledge {
    pub title: String,
    /// One machine-oriented line describing the note, written into its
    /// `context:` frontmatter field. Optional: a model that omits it falls
    /// back to a deterministic line built from the body.
    #[serde(default)]
    pub context: String,
    pub summary: String,
    pub concepts: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_lenient_vec")]
    pub relations: Vec<ExtractedRelation>,
    #[serde(default, deserialize_with = "deserialize_lenient_vec")]
    pub concept_definitions: Vec<ConceptDefinition>,
    #[serde(default)]
    pub projects: Vec<String>,
    #[serde(default)]
    pub areas: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Models frequently return list entries that do not match the expected
/// object shape (a bare string summary, a missing field) for fields like
/// `relations` or `conceptDefinitions`. Neither is required for a note to be
/// useful, so a malformed entry is dropped instead of failing the whole
/// structured response and discarding a valid title/summary/concepts
/// extraction.
fn deserialize_lenient_vec<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::de::DeserializeOwned,
{
    let raw = Vec::<serde_json::Value>::deserialize(deserializer)?;
    Ok(raw
        .into_iter()
        .filter_map(|value| serde_json::from_value(value).ok())
        .collect())
}

impl StructuredKnowledge {
    pub fn parse(content: &str) -> Result<Self, AiError> {
        let parsed: Self = serde_json::from_str(content)
            .map_err(|error| AiError::InvalidStructuredOutput(error.to_string()))?;
        if parsed.title.trim().is_empty()
            || parsed.summary.trim().is_empty()
            || parsed.concepts.is_empty()
            || parsed
                .concepts
                .iter()
                .any(|concept| concept.trim().is_empty())
        {
            return Err(AiError::InvalidStructuredOutput(
                "title, summary and non-empty concepts are required".to_owned(),
            ));
        }
        Ok(parsed)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CacheKey(String);

impl CacheKey {
    #[must_use]
    pub fn for_request(request: &AiRequest, prompt_version: &str) -> Self {
        let normalized = request
            .input
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        let material = format!(
            "{}\0{}\0{}\0{}\0{}\0{}",
            request.model_id,
            request.schema_version,
            prompt_version,
            request.max_output_tokens,
            request.temperature_milli,
            normalized
        );
        Self(blake3::hash(material.as_bytes()).to_hex().to_string())
    }
}

#[derive(Default)]
pub struct ArtifactCache {
    values: Mutex<HashMap<CacheKey, AiResponse>>,
}

impl ArtifactCache {
    pub fn get(&self, key: &CacheKey) -> Result<Option<AiResponse>, AiError> {
        self.values
            .lock()
            .map(|values| values.get(key).cloned())
            .map_err(|_| AiError::LockPoisoned)
    }

    pub fn put(&self, key: CacheKey, response: AiResponse) -> Result<(), AiError> {
        self.values
            .lock()
            .map_err(|_| AiError::LockPoisoned)?
            .insert(key, response);
        Ok(())
    }

    pub fn complete_cached(
        &self,
        port: &dyn AiPort,
        request: &AiRequest,
        prompt_version: &str,
    ) -> Result<(AiResponse, bool), AiError> {
        let key = CacheKey::for_request(request, prompt_version);
        if let Some(response) = self.get(&key)? {
            return Ok((response, true));
        }
        let response = port.complete(request)?;
        self.put(key, response.clone())?;
        Ok((response, false))
    }
}

pub trait SecretResolver: Send + Sync {
    fn resolve(&self, provider: AiProvider) -> Result<Zeroizing<String>, AiError>;
}

#[derive(Debug, Clone)]
pub struct ProviderConnection {
    pub provider: AiProvider,
    pub endpoint: String,
    pub model: String,
}

pub struct NativeHttpAiPort<R> {
    client: Client,
    resolver: R,
    connections: HashMap<String, ProviderConnection>,
}

impl<R: SecretResolver> NativeHttpAiPort<R> {
    pub fn new(
        resolver: R,
        connections: HashMap<String, ProviderConnection>,
    ) -> Result<Self, AiError> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(90))
            .build()
            .map_err(transport_error)?;
        Ok(Self {
            client,
            resolver,
            connections,
        })
    }

    fn request_openai(
        &self,
        connection: &ProviderConnection,
        request: &AiRequest,
        secret: &str,
    ) -> Result<AiResponse, AiError> {
        let url = format!(
            "{}/chat/completions",
            connection.endpoint.trim_end_matches('/')
        );
        let response = self
            .client
            .post(url)
            .bearer_auth(secret)
            .json(&serde_json::json!({
                "model": connection.model,
                "messages": [
                    {"role": "system", "content": request.system},
                    {"role": "user", "content": request.input}
                ],
                "max_tokens": request.max_output_tokens,
                "temperature": f64::from(request.temperature_milli) / 1000.0,
                "response_format": {"type": "json_object"}
            }))
            .send()
            .map_err(transport_error)?;
        let status = response.status();
        let body: serde_json::Value = response.json().map_err(transport_error)?;
        if !status.is_success() {
            return Err(AiError::Transport(format!(
                "provider returned HTTP {status}"
            )));
        }
        let content = body["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| AiError::Transport("provider response has no message".to_owned()))?;
        Ok(AiResponse {
            content: content.to_owned(),
            usage: TokenUsage {
                input_tokens: json_u32(&body["usage"]["prompt_tokens"]),
                output_tokens: json_u32(&body["usage"]["completion_tokens"]),
            },
        })
    }

    fn request_anthropic(
        &self,
        connection: &ProviderConnection,
        request: &AiRequest,
        secret: &str,
    ) -> Result<AiResponse, AiError> {
        let url = format!("{}/messages", connection.endpoint.trim_end_matches('/'));
        let response = self
            .client
            .post(url)
            .header("x-api-key", secret)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": connection.model,
                "system": request.system,
                "messages": [{"role": "user", "content": request.input}],
                "max_tokens": request.max_output_tokens,
                "temperature": f64::from(request.temperature_milli) / 1000.0
            }))
            .send()
            .map_err(transport_error)?;
        let status = response.status();
        let body: serde_json::Value = response.json().map_err(transport_error)?;
        if !status.is_success() {
            return Err(AiError::Transport(format!(
                "provider returned HTTP {status}"
            )));
        }
        let content = body["content"][0]["text"]
            .as_str()
            .ok_or_else(|| AiError::Transport("provider response has no content".to_owned()))?;
        Ok(AiResponse {
            content: content.to_owned(),
            usage: TokenUsage {
                input_tokens: json_u32(&body["usage"]["input_tokens"]),
                output_tokens: json_u32(&body["usage"]["output_tokens"]),
            },
        })
    }
}

impl<R: SecretResolver> AiPort for NativeHttpAiPort<R> {
    fn complete(&self, request: &AiRequest) -> Result<AiResponse, AiError> {
        let connection = self
            .connections
            .get(&request.model_id)
            .ok_or(AiError::ModelNotConfigured)?;
        let secret = self.resolver.resolve(connection.provider)?;
        match connection.provider {
            AiProvider::Anthropic => self.request_anthropic(connection, request, &secret),
            AiProvider::OpenAi
            | AiProvider::DeepSeek
            | AiProvider::Groq
            | AiProvider::Compatible => self.request_openai(connection, request, &secret),
        }
    }
}

fn json_u32(value: &serde_json::Value) -> u32 {
    value
        .as_u64()
        .map_or(0, |number| u32::try_from(number).unwrap_or(u32::MAX))
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned reqwest::Error values"
)]
fn transport_error(error: reqwest::Error) -> AiError {
    AiError::Transport(error.to_string())
}
