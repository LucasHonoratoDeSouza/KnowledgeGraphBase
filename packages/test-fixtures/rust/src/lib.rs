//! Cross-stack loader for the shared Knowledge OS golden fixtures.
use std::{fs, path::Path};

use serde::Deserialize;
use serde_json::Value;
use thiserror::Error;

const SOURCE_KINDS: [&str; 6] = ["youtube", "pdf", "web", "text", "markdown", "note"];

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FixtureKind {
    Source,
    Provider,
    Vault,
}

#[derive(Debug, Deserialize)]
pub struct FixtureEnvelope {
    pub fixture_version: u32,
    pub kind: FixtureKind,
    pub case: String,
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub fixture_version: u32,
    pub cases: Vec<ManifestCase>,
}

#[derive(Debug, Deserialize)]
pub struct ManifestCase {
    pub name: String,
    pub path: String,
    pub kind: FixtureKind,
    pub valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Eq, PartialEq)]
pub struct ValidationResult {
    pub valid: bool,
    pub error_code: Option<String>,
}

#[derive(Debug, Error)]
pub enum FixtureLoadError {
    #[error("failed to read fixture: {0}")]
    Read(#[from] std::io::Error),
    #[error("failed to parse fixture: {0}")]
    Parse(#[from] serde_json::Error),
}

/// Loads and decodes one versioned golden fixture.
///
/// # Errors
///
/// Returns [`FixtureLoadError::Read`] when the file cannot be read and
/// [`FixtureLoadError::Parse`] when its JSON does not match the fixture envelope.
pub fn load_fixture(path: impl AsRef<Path>) -> Result<FixtureEnvelope, FixtureLoadError> {
    let contents = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&contents)?)
}

fn invalid(error_code: &str) -> ValidationResult {
    ValidationResult {
        valid: false,
        error_code: Some(error_code.to_owned()),
    }
}

fn is_safe_vault_path(path: &str) -> bool {
    !path.starts_with(['/', '\\'])
        && !path.split(['/', '\\']).any(|component| component == "..")
        && Path::new(path)
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

#[must_use]
pub fn validate_fixture(fixture: &FixtureEnvelope) -> ValidationResult {
    match fixture.kind {
        FixtureKind::Source => {
            let source_kind = fixture.payload.get("source_kind").and_then(Value::as_str);
            if !source_kind.is_some_and(|kind| SOURCE_KINDS.contains(&kind)) {
                return invalid("UNSUPPORTED_SOURCE_KIND");
            }
        }
        FixtureKind::Provider => {
            if fixture.payload.get("api_key").is_some() {
                return invalid("SECRET_FIELD");
            }
        }
        FixtureKind::Vault => {
            let path = fixture.payload.get("markdown_path").and_then(Value::as_str);
            if !path.is_some_and(is_safe_vault_path) {
                return invalid("UNSAFE_VAULT_PATH");
            }
        }
    }

    ValidationResult {
        valid: true,
        error_code: None,
    }
}
