#![allow(
    clippy::missing_errors_doc,
    reason = "repository methods consistently return the crate's typed StorageError"
)]
//! `SQLite` persistence for the local Knowledge OS vault.

use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
};

use knowledge_domain::{ProcessingState, RelationType, SourceKind};
use rusqlite::{Connection, ErrorCode, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

mod vault;

pub use vault::{JournalFault, RecoveryReport, TrashRecord};

const MIGRATION_V1: &str = r"
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  original_uri TEXT NOT NULL,
  normalized_uri TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  processing_state TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(normalized_uri, content_hash, pipeline_version)
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  text TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK(token_count >= 0),
  locator TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  UNIQUE(document_id, ordinal)
);
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS concept_aliases (
  normalized_alias TEXT PRIMARY KEY,
  display_alias TEXT NOT NULL,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS knowledge_edges (
  id TEXT PRIMARY KEY,
  source_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence_basis_points INTEGER NOT NULL CHECK(confidence_basis_points BETWEEN 0 AND 10000),
  CHECK(source_concept_id <> target_concept_id),
  UNIQUE(source_concept_id, target_concept_id, relation_type)
);
CREATE TABLE IF NOT EXISTS edge_evidence (
  edge_id TEXT NOT NULL REFERENCES knowledge_edges(id) ON DELETE CASCADE,
  origin_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY(edge_id, origin_document_id)
);
CREATE TABLE IF NOT EXISTS facets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  UNIQUE(kind, normalized_name)
);
CREATE TABLE IF NOT EXISTS facet_memberships (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  facet_id TEXT NOT NULL REFERENCES facets(id) ON DELETE CASCADE,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
  confidence_basis_points INTEGER NOT NULL DEFAULT 0 CHECK(confidence_basis_points BETWEEN 0 AND 10000),
  PRIMARY KEY(source_id, facet_id)
);
CREATE TABLE IF NOT EXISTS organization_audit (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  prior_state_json TEXT NOT NULL,
  next_state_json TEXT NOT NULL,
  reason_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  undone_at TEXT
);
CREATE TABLE IF NOT EXISTS write_journal (
  operation_id TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL,
  staging_path TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PREPARED', 'PUBLISHED'))
);
CREATE INDEX IF NOT EXISTS idx_sources_state ON sources(processing_state);
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_edges_source ON knowledge_edges(source_concept_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON knowledge_edges(target_concept_id);
PRAGMA user_version = 1;
";

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum StorageError {
    #[error("storage constraint failed: {0}")]
    Constraint(String),
    #[error("storage operation failed: {0}")]
    Database(String),
    #[error("{0} was not found")]
    NotFound(&'static str),
    #[error("knowledge edges cannot link a concept to itself")]
    SelfEdge,
    #[error("table is not available to diagnostics")]
    InvalidTable,
    #[error("persisted enum value is invalid: {0}")]
    InvalidEnum(String),
}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        if matches!(
            error,
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error {
                    code: ErrorCode::ConstraintViolation,
                    ..
                },
                _
            )
        ) {
            Self::Constraint(error.to_string())
        } else {
            Self::Database(error.to_string())
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceDraft {
    pub kind: SourceKind,
    pub original_uri: String,
    pub normalized_uri: String,
    pub content_hash: String,
    pub pipeline_version: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRecord {
    pub id: String,
    pub kind: SourceKind,
    pub original_uri: String,
    pub normalized_uri: String,
    pub content_hash: String,
    pub pipeline_version: String,
    pub state: ProcessingState,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentDraft {
    pub source_id: String,
    pub path: String,
    pub title: String,
    pub summary: String,
    pub content_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRecord {
    pub id: String,
    pub source_id: String,
    pub path: String,
    pub title: String,
    pub summary: String,
    pub revision: u64,
    pub content_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkDraft {
    pub ordinal: u32,
    pub text: String,
    pub token_count: u32,
    pub locator: String,
    pub content_hash: String,
}

impl ChunkDraft {
    #[must_use]
    pub fn new(
        ordinal: u32,
        text: impl Into<String>,
        token_count: u32,
        locator: impl Into<String>,
        content_hash: impl Into<String>,
    ) -> Self {
        Self {
            ordinal,
            text: text.into(),
            token_count,
            locator: locator.into(),
            content_hash: content_hash.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConceptDraft {
    pub display_name: String,
}

impl ConceptDraft {
    #[must_use]
    pub fn new(display_name: impl Into<String>) -> Self {
        Self {
            display_name: display_name.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptRecord {
    pub id: String,
    pub normalized_name: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeDraft {
    pub source_concept_id: String,
    pub target_concept_id: String,
    pub relation: RelationType,
    pub confidence_basis_points: u16,
    pub origin_document_id: String,
}

impl EdgeDraft {
    #[must_use]
    pub fn new(
        source_concept_id: impl Into<String>,
        target_concept_id: impl Into<String>,
        relation: RelationType,
        confidence_basis_points: u16,
        origin_document_id: impl Into<String>,
    ) -> Self {
        Self {
            source_concept_id: source_concept_id.into(),
            target_concept_id: target_concept_id.into(),
            relation,
            confidence_basis_points,
            origin_document_id: origin_document_id.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeRecord {
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FacetDraft {
    pub kind: String,
    pub display_name: String,
}

impl FacetDraft {
    #[must_use]
    pub fn new(kind: impl Into<String>, display_name: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            display_name: display_name.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FacetRecord {
    pub id: String,
    pub kind: String,
    pub normalized_name: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FacetMembership {
    pub facet_id: String,
    pub pinned: bool,
}

pub struct KnowledgeStore {
    connection: Mutex<Connection>,
}

impl KnowledgeStore {
    /// Opens and migrates one on-disk local index.
    ///
    /// # Errors
    ///
    /// Returns a typed storage error when `SQLite` cannot open or migrate the database.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let connection = Connection::open(path)?;
        let store = Self {
            connection: Mutex::new(connection),
        };
        store.configure(true)?;
        store.migrate()?;
        Ok(store)
    }

    /// Opens and migrates an isolated in-memory index for deterministic tests.
    ///
    /// # Errors
    ///
    /// Returns a typed storage error when `SQLite` initialization fails.
    pub fn open_in_memory() -> Result<Self, StorageError> {
        let connection = Connection::open_in_memory()?;
        let store = Self {
            connection: Mutex::new(connection),
        };
        store.configure(false)?;
        store.migrate()?;
        Ok(store)
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, StorageError> {
        self.connection
            .lock()
            .map_err(|_| StorageError::Database("storage lock was poisoned".to_owned()))
    }

    fn configure(&self, on_disk: bool) -> Result<(), StorageError> {
        let connection = self.lock()?;
        connection.pragma_update(None, "foreign_keys", true)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        if on_disk {
            connection.pragma_update(None, "journal_mode", "WAL")?;
        }
        Ok(())
    }

    /// Applies the current idempotent schema migration.
    ///
    /// # Errors
    ///
    /// Returns a typed storage error if any schema statement fails.
    pub fn migrate(&self) -> Result<(), StorageError> {
        self.lock()?.execute_batch(MIGRATION_V1)?;
        Ok(())
    }

    pub fn schema_version(&self) -> Result<u32, StorageError> {
        Ok(self
            .lock()?
            .pragma_query_value(None, "user_version", |row| row.get(0))?)
    }

    pub fn foreign_keys_enabled(&self) -> Result<bool, StorageError> {
        Ok(self
            .lock()?
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))?)
    }

    pub fn journal_mode(&self) -> Result<String, StorageError> {
        Ok(self
            .lock()?
            .pragma_query_value(None, "journal_mode", |row| row.get(0))?)
    }

    pub fn create_source(&self, draft: &SourceDraft) -> Result<SourceRecord, StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let existing = source_by_identity(
            &transaction,
            &draft.normalized_uri,
            &draft.content_hash,
            &draft.pipeline_version,
        )?;
        if let Some(record) = existing {
            transaction.commit()?;
            return Ok(record);
        }
        let id = new_id();
        transaction.execute(
            "INSERT INTO sources(id, kind, original_uri, normalized_uri, content_hash, pipeline_version, processing_state, title) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)",
            params![id, source_kind(draft.kind), draft.original_uri, draft.normalized_uri, draft.content_hash, draft.pipeline_version, draft.title],
        )?;
        let record = source_by_id(&transaction, &id)?.ok_or(StorageError::NotFound("source"))?;
        transaction.commit()?;
        Ok(record)
    }

    pub fn source(&self, id: &str) -> Result<Option<SourceRecord>, StorageError> {
        let connection = self.lock()?;
        source_by_id(&connection, id)
    }

    pub fn transition_source(&self, id: &str, next: ProcessingState) -> Result<(), StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let current = source_by_id(&transaction, id)?.ok_or(StorageError::NotFound("source"))?;
        current
            .state
            .transition_to(next)
            .map_err(|error| StorageError::Constraint(error.to_string()))?;
        transaction.execute(
            "UPDATE sources SET processing_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            params![processing_state(next), id],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_document(
        &self,
        draft: &DocumentDraft,
        chunks: &[ChunkDraft],
    ) -> Result<DocumentRecord, StorageError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let id = new_id();
        transaction.execute(
            "INSERT INTO documents(id, source_id, path, title, summary, content_hash) VALUES (?, ?, ?, ?, ?, ?)",
            params![id, draft.source_id, draft.path, draft.title, draft.summary, draft.content_hash],
        )?;
        for chunk in chunks {
            transaction.execute(
                "INSERT INTO chunks(id, document_id, ordinal, text, token_count, locator, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
                params![new_id(), id, chunk.ordinal, chunk.text, chunk.token_count, chunk.locator, chunk.content_hash],
            )?;
        }
        let record =
            document_by_id(&transaction, &id)?.ok_or(StorageError::NotFound("document"))?;
        transaction.commit()?;
        Ok(record)
    }

    pub fn document(&self, id: &str) -> Result<Option<DocumentRecord>, StorageError> {
        let connection = self.lock()?;
        document_by_id(&connection, id)
    }

    pub fn chunks_for_document(&self, document_id: &str) -> Result<Vec<ChunkDraft>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT ordinal, text, token_count, locator, content_hash FROM chunks WHERE document_id = ? ORDER BY ordinal",
        )?;
        let rows = statement.query_map([document_id], |row| {
            Ok(ChunkDraft {
                ordinal: row.get(0)?,
                text: row.get(1)?,
                token_count: row.get(2)?,
                locator: row.get(3)?,
                content_hash: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn upsert_concept(&self, draft: &ConceptDraft) -> Result<ConceptRecord, StorageError> {
        let normalized = normalize_label(&draft.display_name);
        let connection = self.lock()?;
        connection.execute(
            "INSERT OR IGNORE INTO concepts(id, normalized_name, display_name) VALUES (?, ?, ?)",
            params![new_id(), normalized, draft.display_name],
        )?;
        concept_by_normalized(&connection, &normalized)?.ok_or(StorageError::NotFound("concept"))
    }

    pub fn add_alias(&self, concept_id: &str, alias: &str) -> Result<(), StorageError> {
        self.lock()?.execute(
            "INSERT INTO concept_aliases(normalized_alias, display_alias, concept_id) VALUES (?, ?, ?)",
            params![normalize_label(alias), alias, concept_id],
        )?;
        Ok(())
    }

    pub fn resolve_concept(&self, name: &str) -> Result<Option<ConceptRecord>, StorageError> {
        let normalized = normalize_label(name);
        let connection = self.lock()?;
        if let Some(concept) = concept_by_normalized(&connection, &normalized)? {
            return Ok(Some(concept));
        }
        connection
            .query_row(
                "SELECT c.id, c.normalized_name, c.display_name FROM concepts c JOIN concept_aliases a ON a.concept_id = c.id WHERE a.normalized_alias = ?",
                [normalized],
                concept_from_row,
            )
            .optional()
            .map_err(StorageError::from)
    }

    pub fn add_edge(&self, draft: &EdgeDraft) -> Result<EdgeRecord, StorageError> {
        if draft.source_concept_id == draft.target_concept_id {
            return Err(StorageError::SelfEdge);
        }
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let relation = relation_type(draft.relation);
        transaction.execute(
            "INSERT OR IGNORE INTO knowledge_edges(id, source_concept_id, target_concept_id, relation_type, confidence_basis_points) VALUES (?, ?, ?, ?, ?)",
            params![new_id(), draft.source_concept_id, draft.target_concept_id, relation, draft.confidence_basis_points],
        )?;
        let id: String = transaction.query_row(
            "SELECT id FROM knowledge_edges WHERE source_concept_id = ? AND target_concept_id = ? AND relation_type = ?",
            params![draft.source_concept_id, draft.target_concept_id, relation],
            |row| row.get(0),
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO edge_evidence(edge_id, origin_document_id) VALUES (?, ?)",
            params![id, draft.origin_document_id],
        )?;
        transaction.commit()?;
        Ok(EdgeRecord { id })
    }

    pub fn upsert_facet(&self, draft: &FacetDraft) -> Result<FacetRecord, StorageError> {
        let normalized = normalize_label(&draft.display_name);
        let connection = self.lock()?;
        connection.execute(
            "INSERT OR IGNORE INTO facets(id, kind, normalized_name, display_name) VALUES (?, ?, ?, ?)",
            params![new_id(), draft.kind, normalized, draft.display_name],
        )?;
        Ok(connection.query_row(
            "SELECT id, kind, normalized_name, display_name FROM facets WHERE kind = ? AND normalized_name = ?",
            params![draft.kind, normalized],
            |row| {
                Ok(FacetRecord {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    normalized_name: row.get(2)?,
                    display_name: row.get(3)?,
                })
            },
        )?)
    }

    pub fn add_membership(
        &self,
        source_id: &str,
        facet_id: &str,
        pinned: bool,
    ) -> Result<(), StorageError> {
        self.lock()?.execute(
            "INSERT INTO facet_memberships(source_id, facet_id, pinned) VALUES (?, ?, ?) ON CONFLICT(source_id, facet_id) DO UPDATE SET pinned = MAX(pinned, excluded.pinned)",
            params![source_id, facet_id, pinned],
        )?;
        Ok(())
    }

    pub fn memberships_for_source(
        &self,
        source_id: &str,
    ) -> Result<Vec<FacetMembership>, StorageError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT facet_id, pinned FROM facet_memberships WHERE source_id = ? ORDER BY facet_id",
        )?;
        let rows = statement.query_map([source_id], |row| {
            Ok(FacetMembership {
                facet_id: row.get(0)?,
                pinned: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn delete_source(&self, id: &str) -> Result<(), StorageError> {
        let affected = self
            .lock()?
            .execute("DELETE FROM sources WHERE id = ?", [id])?;
        if affected == 0 {
            Err(StorageError::NotFound("source"))
        } else {
            Ok(())
        }
    }

    pub fn count(&self, table: &str) -> Result<u64, StorageError> {
        const ALLOWED: &[&str] = &[
            "sources",
            "documents",
            "chunks",
            "concepts",
            "concept_aliases",
            "knowledge_edges",
            "edge_evidence",
            "facets",
            "facet_memberships",
            "organization_audit",
            "write_journal",
        ];
        if !ALLOWED.contains(&table) {
            return Err(StorageError::InvalidTable);
        }
        let sql = format!("SELECT COUNT(*) FROM {table}");
        let count: i64 = self.lock()?.query_row(&sql, [], |row| row.get(0))?;
        u64::try_from(count).map_err(|error| StorageError::Database(error.to_string()))
    }
}

fn new_id() -> String {
    Uuid::now_v7().hyphenated().to_string()
}

fn normalize_label(value: &str) -> String {
    value
        .split_whitespace()
        .map(str::to_lowercase)
        .collect::<Vec<_>>()
        .join(" ")
}

fn source_kind(value: SourceKind) -> &'static str {
    match value {
        SourceKind::YouTube => "youtube",
        SourceKind::Pdf => "pdf",
        SourceKind::Web => "web",
        SourceKind::Text => "text",
        SourceKind::Markdown => "markdown",
        SourceKind::Note => "note",
    }
}

fn parse_source_kind(value: &str) -> Result<SourceKind, StorageError> {
    match value {
        "youtube" => Ok(SourceKind::YouTube),
        "pdf" => Ok(SourceKind::Pdf),
        "web" => Ok(SourceKind::Web),
        "text" => Ok(SourceKind::Text),
        "markdown" => Ok(SourceKind::Markdown),
        "note" => Ok(SourceKind::Note),
        _ => Err(StorageError::InvalidEnum(value.to_owned())),
    }
}

fn processing_state(value: ProcessingState) -> &'static str {
    match value {
        ProcessingState::Pending => "PENDING",
        ProcessingState::Fetching => "FETCHING",
        ProcessingState::Extracting => "EXTRACTING",
        ProcessingState::Processing => "PROCESSING",
        ProcessingState::Indexing => "INDEXING",
        ProcessingState::Completed => "COMPLETED",
        ProcessingState::Failed => "FAILED",
        ProcessingState::Cancelled => "CANCELLED",
    }
}

fn parse_processing_state(value: &str) -> Result<ProcessingState, StorageError> {
    match value {
        "PENDING" => Ok(ProcessingState::Pending),
        "FETCHING" => Ok(ProcessingState::Fetching),
        "EXTRACTING" => Ok(ProcessingState::Extracting),
        "PROCESSING" => Ok(ProcessingState::Processing),
        "INDEXING" => Ok(ProcessingState::Indexing),
        "COMPLETED" => Ok(ProcessingState::Completed),
        "FAILED" => Ok(ProcessingState::Failed),
        "CANCELLED" => Ok(ProcessingState::Cancelled),
        _ => Err(StorageError::InvalidEnum(value.to_owned())),
    }
}

fn relation_type(value: RelationType) -> &'static str {
    match value {
        RelationType::RelatedTo => "RELATED_TO",
        RelationType::IsA => "IS_A",
        RelationType::PartOf => "PART_OF",
        RelationType::Uses => "USES",
        RelationType::Requires => "REQUIRES",
        RelationType::AppliedTo => "APPLIED_TO",
    }
}

fn source_by_id(connection: &Connection, id: &str) -> Result<Option<SourceRecord>, StorageError> {
    connection
        .query_row(
            "SELECT id, kind, original_uri, normalized_uri, content_hash, pipeline_version, processing_state, title FROM sources WHERE id = ?",
            [id],
            |row| {
                let kind: String = row.get(1)?;
                let state: String = row.get(6)?;
                Ok((
                    row.get(0)?,
                    kind,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    state,
                    row.get(7)?,
                ))
            },
        )
        .optional()?
        .map(|(id, kind, original_uri, normalized_uri, content_hash, pipeline_version, state, title)| {
            Ok(SourceRecord {
                id,
                kind: parse_source_kind(&kind)?,
                original_uri,
                normalized_uri,
                content_hash,
                pipeline_version,
                state: parse_processing_state(&state)?,
                title,
            })
        })
        .transpose()
}

fn source_by_identity(
    connection: &Connection,
    normalized_uri: &str,
    content_hash: &str,
    pipeline_version: &str,
) -> Result<Option<SourceRecord>, StorageError> {
    let id = connection
        .query_row(
            "SELECT id FROM sources WHERE normalized_uri = ? AND content_hash = ? AND pipeline_version = ?",
            params![normalized_uri, content_hash, pipeline_version],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    id.map(|id| source_by_id(connection, &id).map(Option::unwrap))
        .transpose()
}

fn document_by_id(
    connection: &Connection,
    id: &str,
) -> Result<Option<DocumentRecord>, StorageError> {
    Ok(connection
        .query_row(
            "SELECT id, source_id, path, title, summary, revision, content_hash FROM documents WHERE id = ?",
            [id],
            |row| {
                Ok(DocumentRecord {
                    id: row.get(0)?,
                    source_id: row.get(1)?,
                    path: row.get(2)?,
                    title: row.get(3)?,
                    summary: row.get(4)?,
                    revision: row.get::<_, i64>(5)?.cast_unsigned(),
                    content_hash: row.get(6)?,
                })
            },
        )
        .optional()?)
}

fn concept_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConceptRecord> {
    Ok(ConceptRecord {
        id: row.get(0)?,
        normalized_name: row.get(1)?,
        display_name: row.get(2)?,
    })
}

fn concept_by_normalized(
    connection: &Connection,
    normalized: &str,
) -> Result<Option<ConceptRecord>, StorageError> {
    Ok(connection
        .query_row(
            "SELECT id, normalized_name, display_name FROM concepts WHERE normalized_name = ?",
            [normalized],
            concept_from_row,
        )
        .optional()?)
}
