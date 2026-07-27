//! Integration test for T21: any migration step that would rewrite
//! Markdown content must back it up first, and that backup must be
//! restorable.
//!
//! No real vault-format migration exists yet (see `migration.rs`'s module
//! docs), so this test exercises the required mechanism directly: back up,
//! then simulate what a future content-rewriting migration would do, then
//! prove the backup is a faithful copy and restoring it recovers the
//! pre-migration state exactly.

use std::fs;

use knowledge_os_desktop_lib::migration::backup_markdown_before_migration;
use tempfile::tempdir;

#[test]
fn backup_is_faithful_and_restoring_it_recovers_the_pre_migration_state() {
    let vault = tempdir().unwrap();
    fs::create_dir_all(vault.path().join("Projects")).unwrap();
    let note_path = vault.path().join("Projects/note.md");
    let original_content = "# Original note\n\nBefore any migration.\n";
    fs::write(&note_path, original_content).unwrap();

    let backup_dir = backup_markdown_before_migration(vault.path()).unwrap();

    // The backup is a faithful copy, taken before any rewrite.
    let backed_up_path = backup_dir.join("Projects/note.md");
    assert!(
        backed_up_path.is_file(),
        "backup must mirror the vault's relative directory structure"
    );
    assert_eq!(
        fs::read_to_string(&backed_up_path).unwrap(),
        original_content,
        "backup must be a byte-for-byte faithful copy of the pre-migration content"
    );

    // Simulate a future content-rewriting migration running *after* the
    // backup was taken.
    let migrated_content = "# Original note (migrated)\n\nAfter the simulated migration.\n";
    fs::write(&note_path, migrated_content).unwrap();
    assert_eq!(fs::read_to_string(&note_path).unwrap(), migrated_content);

    // Restoring the backup recovers the exact pre-migration state.
    fs::copy(&backed_up_path, &note_path).unwrap();
    assert_eq!(
        fs::read_to_string(&note_path).unwrap(),
        original_content,
        "restoring the backup must recover the pre-migration content exactly"
    );
}

#[test]
fn backup_never_descends_into_the_sqlite_metadata_directory() {
    let vault = tempdir().unwrap();
    fs::create_dir_all(vault.path().join(".knowledge-os")).unwrap();
    fs::write(
        vault.path().join(".knowledge-os/knowledge.sqlite3"),
        "not markdown, must never be treated as a note",
    )
    .unwrap();
    fs::write(vault.path().join("note.md"), "real content").unwrap();

    let backup_dir = backup_markdown_before_migration(vault.path()).unwrap();

    assert!(backup_dir.join("note.md").is_file());
    assert!(
        !backup_dir.join(".knowledge-os").exists(),
        "the backup must never copy the SQLite metadata directory"
    );
}
