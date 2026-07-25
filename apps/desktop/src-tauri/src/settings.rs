use std::{
    collections::HashMap,
    fmt::{self, Write as _},
    fs::{self, OpenOptions},
    io::Write as _,
    path::{Path, PathBuf},
};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use zeroize::Zeroize;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum SettingsError {
    #[error("credential must not be blank")]
    EmptyCredential,
    #[error("credential reference must use the Stronghold namespace")]
    InvalidCredentialReference,
    #[error("provider endpoint must use http or https")]
    InvalidEndpoint,
    #[error("vault path must be an existing absolute directory")]
    InvalidVaultPath,
    #[error("vault parent must be an existing absolute directory")]
    InvalidVaultParent,
    #[error("vault name must contain only letters, numbers, spaces, hyphens or underscores")]
    InvalidVaultName,
    #[error("a vault already exists at the requested location")]
    VaultCollision,
    #[error("vault initialization failed: {0}")]
    VaultInitialization(String),
    #[error("active mode is invalid")]
    InvalidMode,
    #[error("saved layout is not valid JSON")]
    InvalidLayout,
    #[error("provider is not configured")]
    ProviderNotConfigured,
    #[error("provider connection test failed")]
    ConnectionTestFailed,
    #[error("settings database error: {0}")]
    Database(String),
    #[error("settings serialization error: {0}")]
    Serialization(String),
    #[error("secure credential store error: {0}")]
    SecureStore(String),
}

impl From<rusqlite::Error> for SettingsError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<serde_json::Error> for SettingsError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serialization(value.to_string())
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    #[serde(rename = "openai")]
    OpenAi,
    Anthropic,
    #[serde(rename = "deepseek")]
    DeepSeek,
}

impl ProviderKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::DeepSeek => "deepseek",
        }
    }

    fn parse(value: &str) -> Result<Self, SettingsError> {
        match value {
            "openai" => Ok(Self::OpenAi),
            "anthropic" => Ok(Self::Anthropic),
            "deepseek" => Ok(Self::DeepSeek),
            _ => Err(SettingsError::Database(format!(
                "unknown provider kind: {value}"
            ))),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredentialRef(String);

impl CredentialRef {
    /// Creates an opaque reference to a secret owned by the Stronghold adapter.
    ///
    /// # Errors
    ///
    /// Returns [`SettingsError::InvalidCredentialReference`] for other namespaces.
    pub fn new(value: String) -> Result<Self, SettingsError> {
        if value.starts_with("stronghold://provider/") {
            Ok(Self(value))
        } else {
            Err(SettingsError::InvalidCredentialReference)
        }
    }

    fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for CredentialRef {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Clone, Eq, PartialEq)]
pub struct SecretInput(String);

impl SecretInput {
    /// Wraps a transient credential received by narrow IPC.
    ///
    /// # Errors
    ///
    /// Returns [`SettingsError::EmptyCredential`] for blank input.
    pub fn new(value: impl Into<String>) -> Result<Self, SettingsError> {
        let value = value.into();
        if value.trim().is_empty() {
            Err(SettingsError::EmptyCredential)
        } else {
            Ok(Self(value))
        }
    }

    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.0.into_bytes()
    }
}

impl fmt::Debug for SecretInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretInput([REDACTED])")
    }
}

/// Write-only secret lifecycle required from the Phase 5 Stronghold adapter.
///
/// Deliberately no read method exists: provider adapters consume secrets behind this boundary.
pub trait CredentialVault {
    /// Writes or replaces a provider secret and returns an opaque reference.
    ///
    /// # Errors
    ///
    /// Returns a storage error without exposing the secret.
    fn replace(
        &mut self,
        provider: ProviderKind,
        secret: SecretInput,
    ) -> Result<CredentialRef, SettingsError>;

    /// Removes the secret at an opaque reference.
    ///
    /// # Errors
    ///
    /// Returns a storage error without exposing the secret.
    fn remove(&mut self, credential: &CredentialRef) -> Result<(), SettingsError>;
}

pub trait ProviderProbe {
    /// Tests a provider through an adapter that resolves the secret internally.
    ///
    /// # Errors
    ///
    /// Returns [`SettingsError::ConnectionTestFailed`] when the probe fails.
    fn test(
        &self,
        provider: ProviderKind,
        endpoint: &str,
        credential: &CredentialRef,
    ) -> Result<(), SettingsError>;
}

/// Phase 2's deterministic provider boundary.
///
/// Network-backed health checks arrive with provider adapters in Phase 5. Until then this
/// validates only the already-scoped endpoint and opaque credential reference, so desktop tests
/// and offline startup never make an implicit network request.
#[derive(Default)]
pub struct Phase2ProviderProbe;

impl ProviderProbe for Phase2ProviderProbe {
    fn test(
        &self,
        _provider: ProviderKind,
        endpoint: &str,
        credential: &CredentialRef,
    ) -> Result<(), SettingsError> {
        if (endpoint.starts_with("https://") || endpoint.starts_with("http://"))
            && credential.as_str().starts_with("stronghold://provider/")
        {
            Ok(())
        } else {
            Err(SettingsError::ConnectionTestFailed)
        }
    }
}

pub struct StrongholdCredentialVault {
    stronghold: tauri_plugin_stronghold::stronghold::Stronghold,
}

impl StrongholdCredentialVault {
    const CLIENT: &'static [u8] = b"knowledge-os-provider-credentials";

    /// Opens the encrypted Stronghold snapshot using a per-install restricted key file.
    ///
    /// This API deliberately accepts a key *path*, not a password. A missing key is atomically
    /// created from 32 CSPRNG bytes with mode `0600` on Unix; an existing key must be exactly 32
    /// bytes or opening fails closed. Because the key is high-entropy rather than user-derived,
    /// Stronghold's own guidance permits work factor zero without reducing key strength.
    ///
    /// # Errors
    ///
    /// Returns a secure-store error when key generation, snapshot loading, or client creation fails.
    pub fn open(snapshot_path: &Path, key_path: &Path) -> Result<Self, SettingsError> {
        let mut key = load_or_create_install_key(key_path)?;
        // Stronghold documents work factor zero as safe for cryptographically random 256-bit keys;
        // its expensive default is intended to strengthen low-entropy user passwords.
        iota_stronghold::engine::snapshot::try_set_encrypt_work_factor(0)
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        let stronghold =
            tauri_plugin_stronghold::stronghold::Stronghold::new(snapshot_path, key.clone())
                .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        key.zeroize();
        if stronghold.load_client(Self::CLIENT).is_err() {
            stronghold
                .create_client(Self::CLIENT)
                .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
            stronghold
                .save()
                .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        }
        Ok(Self { stronghold })
    }
}

fn load_or_create_install_key(path: &Path) -> Result<Vec<u8>, SettingsError> {
    if path.exists() {
        let key = fs::read(path).map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        if key.len() != 32 {
            return Err(SettingsError::SecureStore(
                "Stronghold install key has invalid length".to_owned(),
            ));
        }
        return Ok(key);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
    }
    let mut key = vec![0_u8; 32];
    getrandom::fill(&mut key).map_err(|error| SettingsError::SecureStore(error.to_string()))?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
    file.write_all(&key)
        .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
    file.sync_all()
        .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
    Ok(key)
}

impl CredentialVault for StrongholdCredentialVault {
    fn replace(
        &mut self,
        provider: ProviderKind,
        secret: SecretInput,
    ) -> Result<CredentialRef, SettingsError> {
        let mut nonce = [0_u8; 16];
        getrandom::fill(&mut nonce)
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        let nonce = nonce.iter().fold(
            String::with_capacity(nonce.len() * 2),
            |mut encoded, byte| {
                write!(encoded, "{byte:02x}").expect("writing to a String cannot fail");
                encoded
            },
        );
        let credential = CredentialRef::new(format!(
            "stronghold://provider/{}/{nonce}",
            provider.as_str()
        ))?;
        let client = self
            .stronghold
            .get_client(Self::CLIENT)
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        let mut bytes = secret.into_bytes();
        let mut previous = client
            .store()
            .insert(credential.as_str().as_bytes().to_vec(), bytes.clone(), None)
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        bytes.zeroize();
        if let Some(previous) = previous.as_mut() {
            previous.zeroize();
        }
        self.stronghold
            .save()
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        Ok(credential)
    }

    fn remove(&mut self, credential: &CredentialRef) -> Result<(), SettingsError> {
        let client = self
            .stronghold
            .get_client(Self::CLIENT)
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        let mut removed = client
            .store()
            .delete(credential.as_str().as_bytes())
            .map_err(|error| SettingsError::SecureStore(error.to_string()))?;
        if let Some(removed) = removed.as_mut() {
            removed.zeroize();
        }
        self.stronghold
            .save()
            .map_err(|error| SettingsError::SecureStore(error.to_string()))
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    pub id: String,
    pub provider: ProviderKind,
    pub display_name: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingSettings {
    pub main_model_id: Option<String>,
    pub assistant_default_model_id: Option<String>,
    pub explicit_fallback_model_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetSettings {
    pub daily_cents: u64,
    pub monthly_cents: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacySettings {
    pub allow_source_content: bool,
    pub store_prompts: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfiguration {
    pub models: Vec<ModelProfile>,
    pub routing: RoutingSettings,
    pub budgets: BudgetSettings,
    pub privacy: PrivacySettings,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnboardingInput {
    pub vault_root: PathBuf,
    pub ai_enabled: bool,
    pub active_mode: String,
    pub layout_json: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VaultSetupRequest {
    Create { parent: PathBuf, name: String },
    OpenExisting { path: PathBuf },
}

/// Resolves a narrowly scoped vault setup request without exposing directory enumeration.
///
/// New vaults are restricted to one validated direct child of an explicitly supplied existing
/// parent. Creation is collision-safe and rolls back only the directory created by this operation
/// if metadata initialization fails. Existing vaults are canonicalized but never rewritten.
///
/// # Errors
///
/// Rejects relative/missing parents, unsafe names, collisions, invalid existing roots, and any
/// filesystem or `SQLite` initialization error.
pub fn prepare_vault(request: &VaultSetupRequest) -> Result<PathBuf, SettingsError> {
    match request {
        VaultSetupRequest::OpenExisting { path } => {
            if !path.is_absolute() || !path.is_dir() {
                return Err(SettingsError::InvalidVaultPath);
            }
            path.canonicalize()
                .map_err(|_| SettingsError::InvalidVaultPath)
        }
        VaultSetupRequest::Create { parent, name } => {
            if !parent.is_absolute() || !parent.is_dir() {
                return Err(SettingsError::InvalidVaultParent);
            }
            if !is_safe_vault_name(name) {
                return Err(SettingsError::InvalidVaultName);
            }
            let parent = parent
                .canonicalize()
                .map_err(|_| SettingsError::InvalidVaultParent)?;
            let target = parent.join(name);
            match fs::create_dir(&target) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Err(SettingsError::VaultCollision);
                }
                Err(error) => {
                    return Err(SettingsError::VaultInitialization(error.to_string()));
                }
            }

            if let Err(error) = initialize_vault_structure(&target) {
                if let Err(cleanup) = fs::remove_dir_all(&target) {
                    return Err(SettingsError::VaultInitialization(format!(
                        "{error}; rollback failed: {cleanup}"
                    )));
                }
                return Err(error);
            }
            target
                .canonicalize()
                .map_err(|error| SettingsError::VaultInitialization(error.to_string()))
        }
    }
}

fn is_safe_vault_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 80
        && name.trim() == name
        && name
            .chars()
            .all(|character| character.is_alphanumeric() || matches!(character, ' ' | '-' | '_'))
}

fn initialize_vault_structure(target: &Path) -> Result<(), SettingsError> {
    fs::create_dir(target.join("notes"))
        .map_err(|error| SettingsError::VaultInitialization(error.to_string()))?;
    fs::create_dir(target.join("attachments"))
        .map_err(|error| SettingsError::VaultInitialization(error.to_string()))?;
    let metadata_directory = target.join(".knowledge-os");
    fs::create_dir(&metadata_directory)
        .map_err(|error| SettingsError::VaultInitialization(error.to_string()))?;
    let connection = Connection::open(metadata_directory.join("knowledge.sqlite3"))
        .map_err(|error| SettingsError::VaultInitialization(error.to_string()))?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE vault_metadata (
               id INTEGER PRIMARY KEY CHECK (id = 1),
               schema_version INTEGER NOT NULL
             );
             INSERT INTO vault_metadata (id, schema_version) VALUES (1, 1);",
        )
        .map_err(|error| SettingsError::VaultInitialization(error.to_string()))?;
    Ok(())
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialStatus {
    ConfiguredMasked,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Untested,
    Healthy,
    Unhealthy,
}

impl HealthStatus {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Untested => "untested",
            Self::Healthy => "healthy",
            Self::Unhealthy => "unhealthy",
        }
    }

    fn parse(value: &str) -> Result<Self, SettingsError> {
        match value {
            "untested" => Ok(Self::Untested),
            "healthy" => Ok(Self::Healthy),
            "unhealthy" => Ok(Self::Unhealthy),
            _ => Err(SettingsError::Database(format!(
                "unknown provider health: {value}"
            ))),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConnectionView {
    pub provider: ProviderKind,
    pub endpoint: String,
    pub credential_status: CredentialStatus,
    pub health: HealthStatus,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSettings {
    pub setup_complete: bool,
    pub vault_name: Option<String>,
    pub active_mode: String,
    pub layout_json: String,
    pub ai_enabled: bool,
    pub providers: Vec<ProviderConnectionView>,
    pub ai: AiConfiguration,
}

struct ProviderRecord {
    provider: ProviderKind,
    endpoint: String,
    credential_ref: CredentialRef,
    health: HealthStatus,
}

pub struct SettingsRepository {
    connection: Connection,
}

impl SettingsRepository {
    /// Opens a settings database and applies the Phase 2 schema.
    ///
    /// # Errors
    ///
    /// Returns a database or serialization error.
    pub fn open(path: impl AsRef<std::path::Path>) -> Result<Self, SettingsError> {
        Self::from_connection(Connection::open(path)?)
    }

    /// Opens an isolated `SQLite` settings database.
    ///
    /// # Errors
    ///
    /// Returns a database or serialization error.
    pub fn open_in_memory() -> Result<Self, SettingsError> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(connection: Connection) -> Result<Self, SettingsError> {
        connection.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS workspace_settings (
               id INTEGER PRIMARY KEY CHECK (id = 1),
               setup_complete INTEGER NOT NULL,
               vault_root TEXT,
               vault_name TEXT,
               ai_enabled INTEGER NOT NULL,
               active_mode TEXT NOT NULL,
               layout_json TEXT NOT NULL,
               ai_json TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS provider_connections (
               provider TEXT PRIMARY KEY,
               endpoint TEXT NOT NULL,
               credential_ref TEXT NOT NULL,
               health TEXT NOT NULL
             );",
        )?;
        let default_ai = serde_json::to_string(&AiConfiguration::default())?;
        connection.execute(
            "INSERT OR IGNORE INTO workspace_settings
             (id, setup_complete, vault_root, vault_name, ai_enabled, active_mode, layout_json, ai_json)
             VALUES (1, 0, NULL, NULL, 0, 'Ingest', '{}', ?1)",
            [default_ai],
        )?;
        Ok(Self { connection })
    }

    /// Persists the non-secret first-run workspace selection.
    ///
    /// # Errors
    ///
    /// Rejects invalid paths, modes, layouts, or database failures.
    pub fn complete_onboarding(&mut self, input: &OnboardingInput) -> Result<(), SettingsError> {
        if !input.vault_root.is_absolute() || !input.vault_root.is_dir() {
            return Err(SettingsError::InvalidVaultPath);
        }
        if !matches!(input.active_mode.as_str(), "Ingest" | "Retrieve") {
            return Err(SettingsError::InvalidMode);
        }
        let _: serde_json::Value =
            serde_json::from_str(&input.layout_json).map_err(|_| SettingsError::InvalidLayout)?;
        let canonical = input
            .vault_root
            .canonicalize()
            .map_err(|_| SettingsError::InvalidVaultPath)?;
        let name = canonical
            .file_name()
            .and_then(std::ffi::OsStr::to_str)
            .ok_or(SettingsError::InvalidVaultPath)?;

        self.connection.execute(
            "UPDATE workspace_settings SET
             setup_complete = 1, vault_root = ?1, vault_name = ?2, ai_enabled = ?3,
             active_mode = ?4, layout_json = ?5 WHERE id = 1",
            params![
                canonical.to_string_lossy(),
                name,
                input.ai_enabled,
                input.active_mode,
                input.layout_json
            ],
        )?;
        Ok(())
    }

    /// Persists configured model metadata, roles, budgets, and privacy controls.
    ///
    /// # Errors
    ///
    /// Returns a serialization or database error.
    pub fn save_ai_configuration(
        &mut self,
        configuration: &AiConfiguration,
    ) -> Result<(), SettingsError> {
        let json = serde_json::to_string(configuration)?;
        self.connection.execute(
            "UPDATE workspace_settings SET ai_json = ?1 WHERE id = 1",
            [json],
        )?;
        Ok(())
    }

    /// Persists the active primary mode and serializable workspace layout.
    ///
    /// # Errors
    ///
    /// Rejects invalid modes/layouts and propagates database failures.
    pub fn save_workspace_state(
        &mut self,
        active_mode: &str,
        layout_json: &str,
    ) -> Result<(), SettingsError> {
        if !matches!(active_mode, "Ingest" | "Retrieve") {
            return Err(SettingsError::InvalidMode);
        }
        let _: serde_json::Value =
            serde_json::from_str(layout_json).map_err(|_| SettingsError::InvalidLayout)?;
        self.connection.execute(
            "UPDATE workspace_settings SET active_mode = ?1, layout_json = ?2 WHERE id = 1",
            params![active_mode, layout_json],
        )?;
        Ok(())
    }

    /// Returns the native-only canonical vault root.
    ///
    /// # Errors
    ///
    /// Propagates database failures. The path is never part of the public settings snapshot.
    pub fn workspace_root(&self) -> Result<Option<PathBuf>, SettingsError> {
        self.connection
            .query_row(
                "SELECT vault_root FROM workspace_settings WHERE id = 1",
                [],
                |row| row.get::<_, Option<String>>(0),
            )
            .map(|root| root.map(PathBuf::from))
            .map_err(SettingsError::from)
    }

    /// Returns renderer-safe settings with paths and credential references removed.
    ///
    /// # Errors
    ///
    /// Returns a serialization or database error.
    pub fn public_snapshot(&self) -> Result<PublicSettings, SettingsError> {
        let mut snapshot = self.connection.query_row(
            "SELECT setup_complete, vault_name, active_mode, layout_json, ai_enabled, ai_json
             FROM workspace_settings WHERE id = 1",
            [],
            |row| {
                let ai_json: String = row.get(5)?;
                Ok((
                    row.get::<_, bool>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, bool>(4)?,
                    ai_json,
                ))
            },
        )?;
        let ai: AiConfiguration = serde_json::from_str(&snapshot.5)?;
        let providers = self
            .provider_records()?
            .into_iter()
            .map(|record| ProviderConnectionView {
                provider: record.provider,
                endpoint: record.endpoint,
                credential_status: CredentialStatus::ConfiguredMasked,
                health: record.health,
            });
        Ok(PublicSettings {
            setup_complete: snapshot.0,
            vault_name: snapshot.1.take(),
            active_mode: snapshot.2,
            layout_json: snapshot.3,
            ai_enabled: snapshot.4,
            providers: providers.collect(),
            ai,
        })
    }

    fn provider_records(&self) -> Result<Vec<ProviderRecord>, SettingsError> {
        let mut statement = self.connection.prepare(
            "SELECT provider, endpoint, credential_ref, health FROM provider_connections
             ORDER BY CASE provider WHEN 'openai' THEN 1 WHEN 'anthropic' THEN 2 ELSE 3 END",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        rows.map(|row| {
            let (provider, endpoint, credential_ref, health) = row?;
            Ok(ProviderRecord {
                provider: ProviderKind::parse(&provider)?,
                endpoint,
                credential_ref: CredentialRef::new(credential_ref)?,
                health: HealthStatus::parse(&health)?,
            })
        })
        .collect()
    }

    fn provider_record(
        &self,
        provider: ProviderKind,
    ) -> Result<Option<ProviderRecord>, SettingsError> {
        self.connection
            .query_row(
                "SELECT endpoint, credential_ref, health FROM provider_connections WHERE provider = ?1",
                [provider.as_str()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?
            .map(|(endpoint, credential_ref, health)| {
                Ok(ProviderRecord {
                    provider,
                    endpoint,
                    credential_ref: CredentialRef::new(credential_ref)?,
                    health: HealthStatus::parse(&health)?,
                })
            })
            .transpose()
    }

    fn upsert_provider(&mut self, record: &ProviderRecord) -> Result<(), SettingsError> {
        self.connection.execute(
            "INSERT INTO provider_connections (provider, endpoint, credential_ref, health)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(provider) DO UPDATE SET endpoint = excluded.endpoint,
             credential_ref = excluded.credential_ref, health = excluded.health",
            params![
                record.provider.as_str(),
                record.endpoint,
                record.credential_ref.as_str(),
                record.health.as_str()
            ],
        )?;
        Ok(())
    }

    fn update_health(
        &mut self,
        provider: ProviderKind,
        health: HealthStatus,
    ) -> Result<(), SettingsError> {
        self.connection.execute(
            "UPDATE provider_connections SET health = ?1 WHERE provider = ?2",
            params![health.as_str(), provider.as_str()],
        )?;
        Ok(())
    }

    fn remove_provider(&mut self, provider: ProviderKind) -> Result<(), SettingsError> {
        self.connection.execute(
            "DELETE FROM provider_connections WHERE provider = ?1",
            [provider.as_str()],
        )?;
        Ok(())
    }
}

pub struct ProviderConnectionService<V, P> {
    repository: SettingsRepository,
    vault: V,
    probe: P,
    credential_refs: HashMap<ProviderKind, CredentialRef>,
}

impl<V: CredentialVault, P: ProviderProbe> ProviderConnectionService<V, P> {
    #[must_use]
    pub fn new(repository: SettingsRepository, vault: V, probe: P) -> Self {
        let credential_refs = repository
            .provider_records()
            .unwrap_or_default()
            .into_iter()
            .map(|record| (record.provider, record.credential_ref))
            .collect();
        Self {
            repository,
            vault,
            probe,
            credential_refs,
        }
    }

    /// Adds a provider through a transient secret and stores only its opaque reference.
    ///
    /// # Errors
    ///
    /// Rejects unsafe endpoints and propagates vault/database errors.
    pub fn connect(
        &mut self,
        provider: ProviderKind,
        endpoint: &str,
        secret: SecretInput,
    ) -> Result<(), SettingsError> {
        if !(endpoint.starts_with("https://") || endpoint.starts_with("http://")) {
            return Err(SettingsError::InvalidEndpoint);
        }
        let previous = self.credential_refs.get(&provider).cloned();
        let credential_ref = self.vault.replace(provider, secret)?;
        self.repository.upsert_provider(&ProviderRecord {
            provider,
            endpoint: endpoint.to_owned(),
            credential_ref: credential_ref.clone(),
            health: HealthStatus::Untested,
        })?;
        self.credential_refs.insert(provider, credential_ref);
        if let Some(previous) = previous {
            self.vault.remove(&previous)?;
        }
        Ok(())
    }

    /// Rotates one configured provider without reading its stored secret.
    ///
    /// # Errors
    ///
    /// Returns an error when the provider is absent or storage fails.
    pub fn rotate(
        &mut self,
        provider: ProviderKind,
        secret: SecretInput,
    ) -> Result<(), SettingsError> {
        let endpoint = self
            .repository
            .provider_record(provider)?
            .ok_or(SettingsError::ProviderNotConfigured)?
            .endpoint;
        self.connect(provider, &endpoint, secret)
    }

    /// Tests one configured connection through a probe behind the secret boundary.
    ///
    /// # Errors
    ///
    /// Returns an error and persists unhealthy state when the probe fails.
    pub fn test(&mut self, provider: ProviderKind) -> Result<(), SettingsError> {
        let record = self
            .repository
            .provider_record(provider)?
            .ok_or(SettingsError::ProviderNotConfigured)?;
        match self
            .probe
            .test(provider, &record.endpoint, &record.credential_ref)
        {
            Ok(()) => self
                .repository
                .update_health(provider, HealthStatus::Healthy),
            Err(error) => {
                self.repository
                    .update_health(provider, HealthStatus::Unhealthy)?;
                Err(error)
            }
        }
    }

    /// Removes one provider connection and its secret reference.
    ///
    /// # Errors
    ///
    /// Returns an error when the provider is absent or storage fails.
    pub fn remove(&mut self, provider: ProviderKind) -> Result<(), SettingsError> {
        let credential = self
            .credential_refs
            .get(&provider)
            .cloned()
            .ok_or(SettingsError::ProviderNotConfigured)?;
        self.vault.remove(&credential)?;
        self.repository.remove_provider(provider)?;
        self.credential_refs.remove(&provider);
        Ok(())
    }

    /// Returns the renderer-safe snapshot.
    ///
    /// # Errors
    ///
    /// Returns a database or serialization error.
    pub fn public_snapshot(&self) -> Result<PublicSettings, SettingsError> {
        self.repository.public_snapshot()
    }

    /// Persists first-run workspace configuration through the native repository.
    ///
    /// # Errors
    ///
    /// Propagates validation and database failures.
    pub fn complete_onboarding(&mut self, input: &OnboardingInput) -> Result<(), SettingsError> {
        self.repository.complete_onboarding(input)
    }

    /// Persists model, routing, budget, and privacy configuration.
    ///
    /// # Errors
    ///
    /// Propagates serialization and database failures.
    pub fn save_ai_configuration(
        &mut self,
        configuration: &AiConfiguration,
    ) -> Result<(), SettingsError> {
        self.repository.save_ai_configuration(configuration)
    }

    /// Persists mode and layout for restart restoration.
    ///
    /// # Errors
    ///
    /// Propagates validation and database failures.
    pub fn save_workspace_state(
        &mut self,
        active_mode: &str,
        layout_json: &str,
    ) -> Result<(), SettingsError> {
        self.repository
            .save_workspace_state(active_mode, layout_json)
    }

    /// Returns the native-only workspace root used to scope document commands.
    ///
    /// # Errors
    ///
    /// Propagates database failures.
    pub fn workspace_root(&self) -> Result<Option<PathBuf>, SettingsError> {
        self.repository.workspace_root()
    }

    #[must_use]
    pub const fn vault(&self) -> &V {
        &self.vault
    }

    #[must_use]
    pub fn credential_ref(&self, provider: ProviderKind) -> Option<&CredentialRef> {
        self.credential_refs.get(&provider)
    }
}
