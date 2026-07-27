//! Integration tests for the compatibility check wired into every knowledge
//! command's vault-open call site (`knowledge.rs`'s `open_store`, T20).
//!
//! Fixture vaults are hand-stamped with specific `PRAGMA user_version` /
//! `vault_metadata.schema_version` values (bypassing the normal
//! `KnowledgeStore::open`/`initialize_vault_structure` paths, which would
//! otherwise migrate them to "current" before the test could observe
//! anything) to exercise each branch of `migration::check_vault_compatibility`
//! through a real command entry point.

use std::fs;

use knowledge_os_desktop_lib::knowledge::graph_in_vault;
use rusqlite::Connection;
use tempfile::tempdir;

fn create_fixture_db(vault_root: &std::path::Path, sqlite_schema_version: u32, vault_format_version: u32) {
    let metadata_dir = vault_root.join(".knowledge-os");
    fs::create_dir_all(&metadata_dir).unwrap();
    let db_path = metadata_dir.join("knowledge.sqlite3");
    let connection = Connection::open(&db_path).unwrap();
    connection
        .execute_batch(&format!(
            "CREATE TABLE vault_metadata (
               id INTEGER PRIMARY KEY CHECK (id = 1),
               schema_version INTEGER NOT NULL
             );
             INSERT INTO vault_metadata (id, schema_version) VALUES (1, {vault_format_version});
             PRAGMA user_version = {sqlite_schema_version};"
        ))
        .unwrap();
}

#[test]
fn older_sqlite_schema_triggers_a_non_destructive_automatic_rebuild() {
    let vault = tempdir().unwrap();
    // Actual SQLite schema (0, SQLite's untouched default) is behind what
    // this binary expects (2); vault format (1) matches -- design.md's
    // "sqlite cmp: <, format cmp: <=" row -> RebuildCache.
    create_fixture_db(vault.path(), 0, 1);

    // `graph_in_vault` routes through `open_store`, which must fall through
    // to a normal (migrating) open on `RebuildCache`, not refuse.
    let result = graph_in_vault(vault.path());
    assert!(
        result.is_ok(),
        "expected the older-schema vault to open via an automatic rebuild, got: {result:?}"
    );

    // The rebuild is non-destructive: the pre-existing vault_metadata row
    // survives, and the SQLite schema has been brought up to date (proving
    // an actual migration ran, not a silent no-op).
    let db_path = vault.path().join(".knowledge-os/knowledge.sqlite3");
    let connection = Connection::open(&db_path).unwrap();
    let format_version: u32 = connection
        .query_row("SELECT schema_version FROM vault_metadata WHERE id = 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(format_version, 1, "vault_metadata row must survive the rebuild untouched");
    let sqlite_version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(
        sqlite_version, 2,
        "SQLite schema must have been migrated forward, proving a real rebuild ran"
    );
}

#[test]
fn vault_newer_than_binary_refuses_and_leaves_the_fixture_byte_for_byte_unchanged() {
    let vault = tempdir().unwrap();
    // Actual SQLite schema (99) is newer than what this binary expects (2)
    // -- design.md's "sqlite cmp: >" row -> Refuse, regardless of format.
    create_fixture_db(vault.path(), 99, 1);

    let db_path = vault.path().join(".knowledge-os/knowledge.sqlite3");
    let bytes_before = fs::read(&db_path).unwrap();

    let result = graph_in_vault(vault.path());
    let error = result.expect_err("a newer-than-binary vault must refuse to open");
    assert!(
        error.contains("newer version"),
        "expected a clear newer-version message, got: {error}"
    );

    let bytes_after = fs::read(&db_path).unwrap();
    assert_eq!(
        bytes_before, bytes_after,
        "a refused vault's SQLite file must be byte-for-byte unchanged after the attempt"
    );
}
