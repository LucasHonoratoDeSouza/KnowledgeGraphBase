//! Validated domain primitives shared by Knowledge OS application crates.

use std::{fmt, num::NonZeroU64, str::FromStr};

use serde::{Deserialize, Deserializer, Serialize, de::Error as _};
use thiserror::Error;
use uuid::{Uuid, Variant};

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct EntityId(Uuid);

impl FromStr for EntityId {
    type Err = ValueError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let parsed = Uuid::try_parse(value).map_err(|_| ValueError::InvalidEntityId)?;
        let is_canonical = parsed.hyphenated().to_string() == value.to_ascii_lowercase();
        let has_contract_version = (1..=8).contains(&parsed.get_version_num());
        if !is_canonical || !has_contract_version || parsed.get_variant() != Variant::RFC4122 {
            return Err(ValueError::InvalidEntityId);
        }
        Ok(Self(parsed))
    }
}

impl<'de> Deserialize<'de> for EntityId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::from_str(&value).map_err(D::Error::custom)
    }
}

impl fmt::Display for EntityId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct NonEmptyString(String);

impl NonEmptyString {
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<&str> for NonEmptyString {
    type Error = ValueError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        Self::try_from(value.to_owned())
    }
}

impl TryFrom<String> for NonEmptyString {
    type Error = ValueError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.trim().is_empty() {
            return Err(ValueError::Blank);
        }
        Ok(Self(value))
    }
}

impl<'de> Deserialize<'de> for NonEmptyString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::try_from(value).map_err(D::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct Revision(NonZeroU64);

impl Revision {
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0.get()
    }
}

impl TryFrom<u64> for Revision {
    type Error = ValueError;

    fn try_from(value: u64) -> Result<Self, Self::Error> {
        NonZeroU64::new(value)
            .map(Self)
            .ok_or(ValueError::ZeroRevision)
    }
}

impl<'de> Deserialize<'de> for Revision {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = u64::deserialize(deserializer)?;
        Self::try_from(value).map_err(D::Error::custom)
    }
}

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum ValueError {
    #[error("entity id must be a canonical RFC 9562 UUID")]
    InvalidEntityId,
    #[error("value must not be blank")]
    Blank,
    #[error("revision must be greater than zero")]
    ZeroRevision,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    YouTube,
    Pdf,
    Web,
    Text,
    Markdown,
    Note,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessingMode {
    Quick,
    Standard,
    Deep,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProcessingState {
    Pending,
    Fetching,
    Extracting,
    Processing,
    Indexing,
    Completed,
    Failed,
    Cancelled,
}

impl ProcessingState {
    #[must_use]
    pub const fn is_active(self) -> bool {
        matches!(
            self,
            Self::Pending | Self::Fetching | Self::Extracting | Self::Processing | Self::Indexing
        )
    }

    /// Validates and applies one persisted processing-state transition.
    ///
    /// # Errors
    ///
    /// Returns [`DomainError::InvalidProcessingTransition`] when a transition skips a stage,
    /// moves backwards, or attempts to restart a terminal source without a new version.
    pub const fn transition_to(self, next: Self) -> Result<Self, DomainError> {
        let follows_happy_path = matches!(
            (self, next),
            (Self::Pending, Self::Fetching)
                | (Self::Fetching, Self::Extracting)
                | (Self::Extracting, Self::Processing)
                | (Self::Processing, Self::Indexing)
                | (Self::Indexing, Self::Completed)
        );
        let terminates_active = self.is_active() && matches!(next, Self::Failed | Self::Cancelled);
        if follows_happy_path || terminates_active {
            Ok(next)
        } else {
            Err(DomainError::InvalidProcessingTransition {
                from: self,
                to: next,
            })
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelationType {
    RelatedTo,
    IsA,
    PartOf,
    Uses,
    Requires,
    AppliedTo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Confidence(u16);

impl Confidence {
    #[must_use]
    pub const fn basis_points(self) -> u16 {
        self.0
    }
}

impl TryFrom<u16> for Confidence {
    type Error = DomainError;

    fn try_from(value: u16) -> Result<Self, Self::Error> {
        if value <= 10_000 {
            Ok(Self(value))
        } else {
            Err(DomainError::ConfidenceOutOfRange)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SourceIdentity {
    normalized_uri: String,
    content_hash: String,
    pipeline_version: String,
}

impl SourceIdentity {
    /// Creates the complete identity used to deduplicate source artifacts.
    ///
    /// # Errors
    ///
    /// Returns [`DomainError::BlankIdentityPart`] if any versioned identity component is blank.
    pub fn new(
        normalized_uri: impl Into<String>,
        content_hash: impl Into<String>,
        pipeline_version: impl Into<String>,
    ) -> Result<Self, DomainError> {
        let normalized_uri = normalized_uri.into();
        let content_hash = content_hash.into();
        let pipeline_version = pipeline_version.into();
        for (name, value) in [
            ("normalized_uri", normalized_uri.as_str()),
            ("content_hash", content_hash.as_str()),
            ("pipeline_version", pipeline_version.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(DomainError::BlankIdentityPart(name));
            }
        }
        Ok(Self {
            normalized_uri,
            content_hash,
            pipeline_version,
        })
    }

    #[must_use]
    pub fn normalized_uri(&self) -> &str {
        &self.normalized_uri
    }

    #[must_use]
    pub fn content_hash(&self) -> &str {
        &self.content_hash
    }

    #[must_use]
    pub fn pipeline_version(&self) -> &str {
        &self.pipeline_version
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct KnowledgeEdgeIdentity {
    pub source: EntityId,
    pub target: EntityId,
    pub relation: RelationType,
    pub origin_document: EntityId,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeEdge {
    identity: KnowledgeEdgeIdentity,
    confidence: Confidence,
}

impl KnowledgeEdge {
    /// Creates a traceable typed relation between two distinct concepts.
    ///
    /// # Errors
    ///
    /// Returns [`DomainError::SelfEdge`] when source and target are identical.
    pub fn new(
        source: EntityId,
        target: EntityId,
        relation: RelationType,
        confidence: Confidence,
        origin_document: EntityId,
    ) -> Result<Self, DomainError> {
        if source == target {
            return Err(DomainError::SelfEdge);
        }
        Ok(Self {
            identity: KnowledgeEdgeIdentity {
                source,
                target,
                relation,
                origin_document,
            },
            confidence,
        })
    }

    #[must_use]
    pub const fn identity(&self) -> KnowledgeEdgeIdentity {
        self.identity
    }

    #[must_use]
    pub const fn confidence(&self) -> Confidence {
        self.confidence
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DomainError {
    #[error("invalid processing transition from {from:?} to {to:?}")]
    InvalidProcessingTransition {
        from: ProcessingState,
        to: ProcessingState,
    },
    #[error("confidence must be between 0 and 10000 basis points")]
    ConfidenceOutOfRange,
    #[error("knowledge edges cannot link a concept to itself")]
    SelfEdge,
    #[error("source identity part {0} must not be blank")]
    BlankIdentityPart(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppErrorCode {
    ValidationError,
    NotFound,
    Conflict,
    UnauthorizedCommand,
    ProviderUnavailable,
    BudgetExceeded,
    InternalError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldDetail {
    field: NonEmptyString,
    message: NonEmptyString,
}

impl FieldDetail {
    #[must_use]
    pub const fn new(field: NonEmptyString, message: NonEmptyString) -> Self {
        Self { field, message }
    }

    #[must_use]
    pub const fn field(&self) -> &NonEmptyString {
        &self.field
    }

    #[must_use]
    pub const fn message(&self) -> &NonEmptyString {
        &self.message
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppError {
    code: AppErrorCode,
    message: NonEmptyString,
    retryable: bool,
    field_details: Vec<FieldDetail>,
    #[serde(skip_serializing_if = "Option::is_none")]
    operation_id: Option<EntityId>,
}

impl AppError {
    #[must_use]
    pub const fn new(
        code: AppErrorCode,
        message: NonEmptyString,
        retryable: bool,
        field_details: Vec<FieldDetail>,
        operation_id: Option<EntityId>,
    ) -> Self {
        Self {
            code,
            message,
            retryable,
            field_details,
            operation_id,
        }
    }

    #[must_use]
    pub const fn code(&self) -> AppErrorCode {
        self.code
    }

    #[must_use]
    pub const fn message(&self) -> &NonEmptyString {
        &self.message
    }

    #[must_use]
    pub const fn retryable(&self) -> bool {
        self.retryable
    }

    #[must_use]
    pub fn field_details(&self) -> &[FieldDetail] {
        &self.field_details
    }

    #[must_use]
    pub const fn operation_id(&self) -> Option<EntityId> {
        self.operation_id
    }
}
