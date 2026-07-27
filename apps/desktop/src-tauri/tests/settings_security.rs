use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use knowledge_os_desktop_lib::settings::{
    AiConfiguration, BudgetSettings, CredentialRef, CredentialStatus, CredentialVault,
    HealthStatus, ModelProfile, OnboardingInput, PrivacySettings, ProviderConnectionService,
    ProviderKind, ProviderProbe, RoutingSettings, SecretInput, SettingsError, SettingsRepository,
    StrongholdCredentialVault, VaultSetupRequest, prepare_vault,
};

#[derive(Default)]
struct RecordingVault {
    secrets: HashMap<ProviderKind, Vec<u8>>,
    removed: Vec<CredentialRef>,
    revision: u64,
}

impl CredentialVault for RecordingVault {
    fn replace(
        &mut self,
        provider: ProviderKind,
        secret: SecretInput,
    ) -> Result<CredentialRef, SettingsError> {
        self.revision += 1;
        self.secrets.insert(provider, secret.into_bytes());
        CredentialRef::new(format!(
            "stronghold://provider/{}/{}",
            provider.as_str(),
            self.revision
        ))
    }

    fn remove(&mut self, credential: &CredentialRef) -> Result<(), SettingsError> {
        self.removed.push(credential.clone());
        Ok(())
    }
}

#[derive(Default)]
struct RecordingProbe {
    fail: bool,
}

impl ProviderProbe for RecordingProbe {
    fn test(
        &self,
        _provider: ProviderKind,
        _endpoint: &str,
        _credential: &CredentialRef,
    ) -> Result<(), SettingsError> {
        if self.fail {
            Err(SettingsError::ConnectionTestFailed)
        } else {
            Ok(())
        }
    }
}

fn vault_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap()
}

fn configured_repository() -> SettingsRepository {
    let mut repository = SettingsRepository::open_in_memory().unwrap();
    repository
        .complete_onboarding(&OnboardingInput {
            vault_root: vault_root(),
            ai_enabled: true,
            active_mode: "Ingest".to_owned(),
            layout_json: r#"{"version":1}"#.to_owned(),
        })
        .unwrap();
    repository
}

fn sample_ai_configuration() -> AiConfiguration {
    AiConfiguration {
        models: vec![ModelProfile {
            id: "anthropic:claude".to_owned(),
            provider: ProviderKind::Anthropic,
            display_name: "Claude".to_owned(),
            enabled: true,
        }],
        routing: RoutingSettings {
            main_model_id: Some("anthropic:claude".to_owned()),
            assistant_default_model_id: Some("anthropic:claude".to_owned()),
            explicit_fallback_model_id: None,
            librarian_model_id: None,
        },
        budgets: BudgetSettings {
            daily_cents: 250,
            monthly_cents: 4_000,
        },
        privacy: PrivacySettings {
            allow_source_content: false,
            store_prompts: false,
        },
    }
}

#[test]
fn new_repository_defaults_to_incomplete_local_setup() {
    let repository = SettingsRepository::open_in_memory().unwrap();
    let snapshot = repository.public_snapshot().unwrap();

    assert!(!snapshot.setup_complete);
    assert!(!snapshot.ai_enabled);
    assert_eq!(snapshot.active_mode, "Ingest");
}

#[test]
fn onboarding_persists_only_a_vault_display_name_publicly() {
    let repository = configured_repository();
    let snapshot = repository.public_snapshot().unwrap();

    let expected_vault_name = vault_root()
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned);

    assert!(snapshot.setup_complete);
    assert_eq!(snapshot.vault_name, expected_vault_name);
    assert!(
        !serde_json::to_string(&snapshot)
            .unwrap()
            .contains(vault_root().to_string_lossy().as_ref())
    );
}

#[test]
fn onboarding_rejects_relative_or_ungranted_paths() {
    let mut repository = SettingsRepository::open_in_memory().unwrap();
    let error = repository
        .complete_onboarding(&OnboardingInput {
            vault_root: PathBuf::from("relative-vault"),
            ai_enabled: false,
            active_mode: "Ingest".to_owned(),
            layout_json: "{}".to_owned(),
        })
        .unwrap_err();

    assert_eq!(error, SettingsError::InvalidVaultPath);
    assert!(!repository.public_snapshot().unwrap().setup_complete);
}

#[test]
fn create_local_vault_initializes_scoped_structure_and_sqlite() {
    let parent = tempfile::tempdir().unwrap();

    let vault = prepare_vault(&VaultSetupRequest::Create {
        parent: parent.path().to_path_buf(),
        name: "Research Base".to_owned(),
    })
    .unwrap();

    assert_eq!(vault, parent.path().join("Research Base"));
    assert!(vault.join("notes").is_dir());
    assert!(vault.join("attachments").is_dir());
    let metadata = vault.join(".knowledge-os/knowledge.sqlite3");
    assert!(metadata.is_file());
    let connection = rusqlite::Connection::open(metadata).unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT schema_version FROM vault_metadata WHERE id = 1",
                [],
                |row| row.get::<_, u32>(0),
            )
            .unwrap(),
        1
    );
}

#[test]
fn create_local_vault_rejects_an_empty_collision_without_mutation() {
    let parent = tempfile::tempdir().unwrap();
    let collision = parent.path().join("Existing");
    fs::create_dir(&collision).unwrap();

    assert_eq!(
        prepare_vault(&VaultSetupRequest::Create {
            parent: parent.path().to_path_buf(),
            name: "Existing".to_owned(),
        }),
        Err(SettingsError::VaultCollision)
    );
    assert!(fs::read_dir(collision).unwrap().next().is_none());
}

#[test]
fn create_local_vault_rejects_a_non_empty_collision_without_mutation() {
    let parent = tempfile::tempdir().unwrap();
    let collision = parent.path().join("Existing");
    fs::create_dir(&collision).unwrap();
    fs::write(collision.join("owned.md"), "keep me").unwrap();

    assert_eq!(
        prepare_vault(&VaultSetupRequest::Create {
            parent: parent.path().to_path_buf(),
            name: "Existing".to_owned(),
        }),
        Err(SettingsError::VaultCollision)
    );
    assert_eq!(
        fs::read_to_string(collision.join("owned.md")).unwrap(),
        "keep me"
    );
}

#[test]
fn create_local_vault_rejects_invalid_names_before_writing() {
    let parent = tempfile::tempdir().unwrap();

    for name in ["", "..", "nested/vault", "nested\\vault", ".hidden"] {
        assert_eq!(
            prepare_vault(&VaultSetupRequest::Create {
                parent: parent.path().to_path_buf(),
                name: name.to_owned(),
            }),
            Err(SettingsError::InvalidVaultName)
        );
    }
    assert!(fs::read_dir(parent.path()).unwrap().next().is_none());
}

#[test]
fn create_local_vault_rejects_relative_or_missing_parent_paths() {
    for parent in [
        PathBuf::from("relative"),
        PathBuf::from("/definitely/missing/kos-parent"),
    ] {
        assert_eq!(
            prepare_vault(&VaultSetupRequest::Create {
                parent,
                name: "Research".to_owned(),
            }),
            Err(SettingsError::InvalidVaultParent)
        );
    }
}

#[test]
fn open_existing_vault_canonicalizes_without_creating_metadata() {
    let parent = tempfile::tempdir().unwrap();
    fs::write(parent.path().join("existing.md"), "# Existing").unwrap();

    let opened = prepare_vault(&VaultSetupRequest::OpenExisting {
        path: parent.path().to_path_buf(),
    })
    .unwrap();

    assert_eq!(opened, parent.path().canonicalize().unwrap());
    assert!(!opened.join(".knowledge-os").exists());
    assert_eq!(
        fs::read_to_string(opened.join("existing.md")).unwrap(),
        "# Existing"
    );
}

#[test]
fn accountless_local_setup_has_no_provider_or_ai_dependency() {
    let parent = tempfile::tempdir().unwrap();
    let vault = prepare_vault(&VaultSetupRequest::Create {
        parent: parent.path().to_path_buf(),
        name: "Offline Base".to_owned(),
    })
    .unwrap();
    let mut repository = SettingsRepository::open_in_memory().unwrap();
    repository
        .complete_onboarding(&OnboardingInput {
            vault_root: vault,
            ai_enabled: false,
            active_mode: "Ingest".to_owned(),
            layout_json: r#"{"version":1}"#.to_owned(),
        })
        .unwrap();

    let snapshot = repository.public_snapshot().unwrap();
    assert!(snapshot.setup_complete);
    assert!(!snapshot.ai_enabled);
    assert!(snapshot.providers.is_empty());
}

#[test]
fn layout_and_active_mode_survive_a_sqlite_restart() {
    let path = temporary_database_path("restart");
    {
        let mut repository = SettingsRepository::open(&path).unwrap();
        repository
            .complete_onboarding(&OnboardingInput {
                vault_root: vault_root(),
                ai_enabled: false,
                active_mode: "Retrieve".to_owned(),
                layout_json: r#"{"version":1,"open":"note:alpha"}"#.to_owned(),
            })
            .unwrap();
    }

    let snapshot = SettingsRepository::open(&path)
        .unwrap()
        .public_snapshot()
        .unwrap();
    assert_eq!(snapshot.active_mode, "Retrieve");
    assert_eq!(snapshot.layout_json, r#"{"version":1,"open":"note:alpha"}"#);
    fs::remove_file(path).unwrap();
}

#[test]
fn models_routing_budgets_and_privacy_survive_a_restart() {
    let path = temporary_database_path("ai-config");
    {
        let mut repository = SettingsRepository::open(&path).unwrap();
        repository
            .save_ai_configuration(&sample_ai_configuration())
            .unwrap();
    }

    let snapshot = SettingsRepository::open(&path)
        .unwrap()
        .public_snapshot()
        .unwrap();
    assert_eq!(snapshot.ai, sample_ai_configuration());
    fs::remove_file(path).unwrap();
}

#[test]
fn each_supported_provider_keeps_an_independent_credential_reference() {
    let repository = configured_repository();
    let mut service = ProviderConnectionService::new(
        repository,
        RecordingVault::default(),
        RecordingProbe::default(),
    );

    for (provider, key) in [
        (ProviderKind::OpenAi, "open-key"),
        (ProviderKind::Anthropic, "anthropic-key"),
        (ProviderKind::DeepSeek, "deepseek-key"),
        (ProviderKind::Groq, "groq-key"),
    ] {
        service
            .connect(
                provider,
                "https://api.example",
                SecretInput::new(key).unwrap(),
            )
            .unwrap();
    }

    let snapshot = service.public_snapshot().unwrap();
    assert_eq!(snapshot.providers.len(), 4);
    assert_eq!(service.vault().secrets.len(), 4);
    assert_ne!(
        service.credential_ref(ProviderKind::OpenAi).unwrap(),
        service.credential_ref(ProviderKind::Anthropic).unwrap()
    );
}

#[test]
fn provider_queries_return_masked_status_without_credential_refs() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe::default(),
    );
    service
        .connect(
            ProviderKind::OpenAi,
            "https://api.openai.example",
            SecretInput::new("plain-secret").unwrap(),
        )
        .unwrap();

    let json = serde_json::to_string(&service.public_snapshot().unwrap()).unwrap();
    assert!(json.contains("configured_masked"));
    assert!(!json.contains("plain-secret"));
    assert!(!json.contains("stronghold://"));
}

#[test]
fn sqlite_never_contains_provider_plaintext() {
    let path = temporary_database_path("plaintext-boundary");
    {
        let repository = SettingsRepository::open(&path).unwrap();
        let mut service = ProviderConnectionService::new(
            repository,
            RecordingVault::default(),
            RecordingProbe::default(),
        );
        service
            .connect(
                ProviderKind::DeepSeek,
                "https://api.deepseek.example",
                SecretInput::new("never-write-this-key").unwrap(),
            )
            .unwrap();
    }

    let bytes = fs::read(&path).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("never-write-this-key"));
    fs::remove_file(path).unwrap();
}

#[test]
fn secret_debug_output_is_redacted() {
    let secret = SecretInput::new("do-not-log-me").unwrap();

    assert_eq!(format!("{secret:?}"), "SecretInput([REDACTED])");
    assert!(!format!("{secret:?}").contains("do-not-log-me"));
}

#[test]
fn rotating_a_key_replaces_the_reference_and_removes_the_old_one() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe::default(),
    );
    service
        .connect(
            ProviderKind::Anthropic,
            "https://api.anthropic.example",
            SecretInput::new("first").unwrap(),
        )
        .unwrap();
    let first = service
        .credential_ref(ProviderKind::Anthropic)
        .unwrap()
        .clone();

    service
        .rotate(ProviderKind::Anthropic, SecretInput::new("second").unwrap())
        .unwrap();

    assert_ne!(
        service.credential_ref(ProviderKind::Anthropic).unwrap(),
        &first
    );
    assert_eq!(service.vault().removed, vec![first]);
}

#[test]
fn removing_a_provider_deletes_the_reference_and_public_connection() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe::default(),
    );
    service
        .connect(
            ProviderKind::OpenAi,
            "https://api.openai.example",
            SecretInput::new("key").unwrap(),
        )
        .unwrap();

    service.remove(ProviderKind::OpenAi).unwrap();

    assert!(service.public_snapshot().unwrap().providers.is_empty());
    assert_eq!(service.vault().removed.len(), 1);
}

#[test]
fn successful_connection_test_persists_healthy_state() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe::default(),
    );
    service
        .connect(
            ProviderKind::OpenAi,
            "https://api.openai.example",
            SecretInput::new("key").unwrap(),
        )
        .unwrap();

    service.test(ProviderKind::OpenAi).unwrap();

    assert_eq!(
        service.public_snapshot().unwrap().providers[0].health,
        HealthStatus::Healthy
    );
}

#[test]
fn failed_connection_test_persists_unhealthy_state() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe { fail: true },
    );
    service
        .connect(
            ProviderKind::DeepSeek,
            "https://api.deepseek.example",
            SecretInput::new("key").unwrap(),
        )
        .unwrap();

    assert_eq!(
        service.test(ProviderKind::DeepSeek),
        Err(SettingsError::ConnectionTestFailed)
    );
    assert_eq!(
        service.public_snapshot().unwrap().providers[0].health,
        HealthStatus::Unhealthy
    );
}

#[test]
fn blank_credentials_fail_before_vault_or_database_mutation() {
    assert_eq!(SecretInput::new("  "), Err(SettingsError::EmptyCredential));
}

#[test]
fn unsafe_provider_endpoint_fails_before_vault_mutation() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe::default(),
    );

    assert_eq!(
        service.connect(
            ProviderKind::OpenAi,
            "file:///tmp/key",
            SecretInput::new("key").unwrap()
        ),
        Err(SettingsError::InvalidEndpoint)
    );
    assert!(service.vault().secrets.is_empty());
}

#[test]
fn testing_an_unconfigured_provider_fails_closed() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe::default(),
    );

    assert_eq!(
        service.test(ProviderKind::OpenAi),
        Err(SettingsError::ProviderNotConfigured)
    );
}

#[test]
fn credential_references_accept_only_the_stronghold_namespace() {
    assert!(CredentialRef::new("stronghold://provider/openai/1".to_owned()).is_ok());
    assert_eq!(
        CredentialRef::new("sqlite://provider/openai/1".to_owned()),
        Err(SettingsError::InvalidCredentialReference)
    );
}

#[test]
fn configured_provider_public_status_is_always_masked() {
    let mut service = ProviderConnectionService::new(
        configured_repository(),
        RecordingVault::default(),
        RecordingProbe::default(),
    );
    service
        .connect(
            ProviderKind::Anthropic,
            "https://api.anthropic.example",
            SecretInput::new("key").unwrap(),
        )
        .unwrap();

    assert_eq!(
        service.public_snapshot().unwrap().providers[0].credential_status,
        CredentialStatus::ConfiguredMasked
    );
}

#[test]
fn renderer_capability_exposes_no_stronghold_read_permission() {
    let capability = fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/capabilities/main.json"
    ))
    .unwrap();

    assert!(!capability.contains("stronghold:"));
    assert!(!capability.contains("get-store-record"));
}

#[test]
fn stronghold_adapter_encrypts_provider_plaintext_at_rest() {
    let directory = tempfile::tempdir().unwrap();
    let snapshot = directory.path().join("providers.hold");
    let key = directory.path().join("stronghold.key");
    let mut vault = StrongholdCredentialVault::open(&snapshot, &key).unwrap();

    let credential = vault
        .replace(
            ProviderKind::OpenAi,
            SecretInput::new("encrypted-at-rest-secret").unwrap(),
        )
        .unwrap();

    assert!(snapshot.is_file());
    assert!(
        credential
            .to_string()
            .starts_with("stronghold://provider/openai/")
    );
    assert!(
        !String::from_utf8_lossy(&fs::read(snapshot).unwrap()).contains("encrypted-at-rest-secret")
    );
}

#[test]
fn stronghold_adapter_reopens_and_removes_an_opaque_reference() {
    let directory = tempfile::tempdir().unwrap();
    let snapshot = directory.path().join("providers.hold");
    let key = directory.path().join("stronghold.key");
    let credential = {
        let mut vault = StrongholdCredentialVault::open(&snapshot, &key).unwrap();
        vault
            .replace(
                ProviderKind::DeepSeek,
                SecretInput::new("temporary-secret").unwrap(),
            )
            .unwrap()
    };

    let mut reopened = StrongholdCredentialVault::open(&snapshot, &key).unwrap();
    reopened.remove(&credential).unwrap();

    assert!(snapshot.is_file());
    assert!(!String::from_utf8_lossy(&fs::read(snapshot).unwrap()).contains("temporary-secret"));
}

#[test]
fn stronghold_install_key_is_a_generated_32_byte_key() {
    let directory = tempfile::tempdir().unwrap();
    let snapshot = directory.path().join("providers.hold");
    let key = directory.path().join("stronghold.key");

    let _vault = StrongholdCredentialVault::open(&snapshot, &key).unwrap();

    assert_eq!(fs::read(&key).unwrap().len(), 32);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(key).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}

#[test]
fn stronghold_rejects_an_invalid_install_key_without_replacing_it() {
    let directory = tempfile::tempdir().unwrap();
    let snapshot = directory.path().join("providers.hold");
    let key = directory.path().join("stronghold.key");
    fs::write(&key, b"not-a-generated-32-byte-install-key").unwrap();

    let error = StrongholdCredentialVault::open(&snapshot, &key)
        .err()
        .unwrap();

    assert_eq!(
        error,
        SettingsError::SecureStore("Stronghold install key has invalid length".to_owned())
    );
    assert_eq!(
        fs::read(key).unwrap(),
        b"not-a-generated-32-byte-install-key"
    );
    assert!(!snapshot.exists());
}

fn temporary_database_path(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "knowledge-os-{label}-{}-{nonce}.sqlite3",
        std::process::id()
    ))
}
