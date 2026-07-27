//! Unified schema/vault-format version model (MVP-52).
//!
//! Two independent version concepts already exist for the vault's single
//! `SQLite` file (`<vault>/.knowledge-os/knowledge.sqlite3`):
//!
//! - `PRAGMA user_version` (owned by `knowledge-storage`, bumped by its
//!   migrations) -- the **`SQLite` schema version**: table/index shape.
//! - `vault_metadata.schema_version` (bootstrapped in `settings.rs`) --
//!   repurposed here as the **vault-format version**: Markdown front-matter
//!   shape, directory layout, anything outside `SQLite` entirely.
//!
//! Neither was ever compared against what the running binary expects before
//! this module. [`check_vault_compatibility`] is the single startup gate
//! that does so, via the pure [`decide`] decision function (unit-tested
//! against every row of design.md's compatibility table), so a newer binary
//! opening an older vault -- or an older binary opening a newer vault --
//! takes one explicit, deliberate branch instead of silently reading
//! (possibly incompatible) data.

use std::path::Path;

use thiserror::Error;

/// The `SQLite` schema version this binary expects. Bump alongside
/// `knowledge-storage`'s own `PRAGMA user_version` (currently set by
/// `MIGRATION_V1` in `crates/knowledge-storage/src/lib.rs`) whenever that
/// crate's migrations change.
pub const EXPECTED_SQLITE_SCHEMA_VERSION: u32 = 2;

/// The vault-format version this binary expects. Bump whenever the
/// Markdown front-matter shape or vault directory layout changes in a way
/// that requires a migration.
pub const EXPECTED_VAULT_FORMAT_VERSION: u32 = 1;

/// The outcome of comparing a vault's persisted versions against what this
/// binary expects. See design.md's Data Models compatibility table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompatibilityDecision {
    /// Both the `SQLite` schema and vault-format versions already match what
    /// this binary expects -- open normally.
    UpToDate,
    /// The vault is behind what this binary expects, but non-destructively
    /// catchable: `SQLite` is a reconstructible cache (rebuild it from
    /// Markdown), or a defined vault-format migration exists for the jump.
    RebuildCache,
    /// Refuse to open: either the vault was last written by a newer
    /// version than this binary (never rewind another version's data), or
    /// its vault-format version has no defined migration path yet. Carries
    /// a user-facing message explaining why.
    Refuse(String),
}

/// Failure reading either persisted version from the vault's `SQLite` file.
#[derive(Debug, Error)]
pub enum MigrationError {
    #[error("could not read the vault's SQLite schema version: {0}")]
    SqliteSchema(String),
    #[error("could not read the vault's format version: {0}")]
    VaultFormat(String),
}

/// Reads both persisted versions from the vault at `vault_root` and
/// compares them against what this binary expects.
///
/// Deliberately opens the `SQLite` file with a plain, unmigrated connection
/// (never `KnowledgeStore::open`, which unconditionally runs its own
/// migration on open) -- this check must be side-effect-free so a
/// [`CompatibilityDecision::Refuse`] outcome never mutates the file, even
/// by a single byte, before the caller has decided what to do.
///
/// # Errors
///
/// Returns [`MigrationError`] if either version cannot be read (e.g. the
/// vault's `SQLite` file is missing or corrupt).
pub fn check_vault_compatibility(
    vault_root: &Path,
) -> Result<CompatibilityDecision, MigrationError> {
    let db_path = vault_root.join(".knowledge-os").join("knowledge.sqlite3");
    let connection = rusqlite::Connection::open(&db_path)
        .map_err(|error| MigrationError::SqliteSchema(error.to_string()))?;

    let actual_sqlite: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| MigrationError::SqliteSchema(error.to_string()))?;
    let actual_format: u32 = connection
        .query_row(
            "SELECT schema_version FROM vault_metadata WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|error| MigrationError::VaultFormat(error.to_string()))?;

    let migration_defined =
        vault_format_migration_defined(actual_format, EXPECTED_VAULT_FORMAT_VERSION);

    Ok(decide(
        actual_sqlite,
        actual_format,
        EXPECTED_SQLITE_SCHEMA_VERSION,
        EXPECTED_VAULT_FORMAT_VERSION,
        migration_defined,
    ))
}

/// Whether a defined migration exists to carry a vault-format version
/// forward from `from` to `to`. No vault-format migration has been needed
/// yet (only version 1 has ever existed) -- this is the extension point a
/// future format bump adds a case to, per design.md's Tech Decisions.
fn vault_format_migration_defined(from: u32, to: u32) -> bool {
    let _ = (from, to);
    false
}

/// Pure decision function behind [`check_vault_compatibility`], taking
/// already-read values so every row of design.md's compatibility table is
/// unit-testable without a real vault fixture (see T20 for the integration
/// tests that exercise this through real fixture vaults).
///
/// | sqlite cmp | format cmp | Decision |
/// | --- | --- | --- |
/// | `==` | `==` | `UpToDate` |
/// | `<` | `<=` | `RebuildCache` |
/// | `<=` | `<` | `RebuildCache` if a migration is defined, else `Refuse` |
/// | `>` (either dimension) | -- | `Refuse` (vault newer than binary) |
fn decide(
    actual_sqlite: u32,
    actual_format: u32,
    expected_sqlite: u32,
    expected_format: u32,
    format_migration_defined: bool,
) -> CompatibilityDecision {
    if actual_sqlite > expected_sqlite || actual_format > expected_format {
        return CompatibilityDecision::Refuse(format!(
            "This vault was last opened by a newer version of Knowledge OS \
             (schema {actual_sqlite}, format {actual_format}) than this \
             binary supports (schema {expected_sqlite}, format {expected_format}). \
             Update Knowledge OS before opening this vault."
        ));
    }

    if actual_sqlite == expected_sqlite && actual_format == expected_format {
        return CompatibilityDecision::UpToDate;
    }

    if actual_sqlite < expected_sqlite && actual_format <= expected_format {
        return CompatibilityDecision::RebuildCache;
    }

    // Remaining case: actual_sqlite <= expected_sqlite && actual_format < expected_format.
    if format_migration_defined {
        CompatibilityDecision::RebuildCache
    } else {
        CompatibilityDecision::Refuse(format!(
            "This vault's format (version {actual_format}) requires a migration \
             this version of Knowledge OS does not yet define (expected format \
             {expected_format}). Refusing to open to avoid data loss."
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_current_is_up_to_date() {
        assert_eq!(decide(2, 1, 2, 1, false), CompatibilityDecision::UpToDate);
    }

    #[test]
    fn sqlite_behind_rebuilds_the_cache() {
        assert_eq!(
            decide(1, 1, 2, 1, false),
            CompatibilityDecision::RebuildCache
        );
    }

    #[test]
    fn format_behind_with_a_defined_migration_rebuilds_the_cache() {
        assert_eq!(
            decide(2, 0, 2, 1, true),
            CompatibilityDecision::RebuildCache
        );
    }

    #[test]
    fn format_behind_without_a_defined_migration_refuses() {
        assert!(matches!(
            decide(2, 0, 2, 1, false),
            CompatibilityDecision::Refuse(_)
        ));
    }

    #[test]
    fn vault_newer_than_binary_refuses() {
        assert!(matches!(
            decide(3, 1, 2, 1, false),
            CompatibilityDecision::Refuse(_)
        ));
    }

    #[test]
    fn vault_format_newer_than_binary_refuses_even_if_sqlite_matches() {
        assert!(matches!(
            decide(2, 2, 2, 1, false),
            CompatibilityDecision::Refuse(_)
        ));
    }
}
