use std::fs;

use knowledge_storage::{JournalFault, KnowledgeStore, StorageError};

fn vault() -> (tempfile::TempDir, KnowledgeStore) {
    let directory = tempfile::tempdir().unwrap();
    fs::create_dir(directory.path().join(".knowledge-os")).unwrap();
    let store =
        KnowledgeStore::open(directory.path().join(".knowledge-os/knowledge.sqlite3")).unwrap();
    (directory, store)
}

#[test]
fn successful_publish_writes_exact_markdown_and_clears_journal() {
    let (vault, store) = vault();
    store
        .publish_markdown(
            vault.path(),
            "Projects/Knowledge OS.md",
            b"# Knowledge OS\n",
            JournalFault::None,
        )
        .unwrap();
    assert_eq!(
        fs::read(vault.path().join("Projects/Knowledge OS.md")).unwrap(),
        b"# Knowledge OS\n"
    );
    assert_eq!(store.count("write_journal").unwrap(), 0);
}

#[test]
fn prepared_crash_is_completed_on_recovery() {
    let (vault, store) = vault();
    assert!(
        store
            .publish_markdown(
                vault.path(),
                "Inbox/note.md",
                b"durable",
                JournalFault::AfterPrepared
            )
            .is_err()
    );
    assert!(!vault.path().join("Inbox/note.md").exists());
    let report = store.recover_writes(vault.path()).unwrap();
    assert_eq!(report.completed, 1);
    assert_eq!(
        fs::read(vault.path().join("Inbox/note.md")).unwrap(),
        b"durable"
    );
    assert_eq!(store.count("write_journal").unwrap(), 0);
}

#[test]
fn published_crash_keeps_destination_and_clears_journal() {
    let (vault, store) = vault();
    assert!(
        store
            .publish_markdown(
                vault.path(),
                "Inbox/note.md",
                b"durable",
                JournalFault::AfterPublished
            )
            .is_err()
    );
    assert_eq!(
        fs::read(vault.path().join("Inbox/note.md")).unwrap(),
        b"durable"
    );
    assert_eq!(store.recover_writes(vault.path()).unwrap().completed, 1);
    assert_eq!(store.count("write_journal").unwrap(), 0);
}

#[test]
fn recovery_removes_unjournaled_staging_orphan() {
    let (vault, store) = vault();
    let staging = vault.path().join(".knowledge-os/staging");
    fs::create_dir_all(&staging).unwrap();
    fs::write(staging.join("orphan.stage"), b"partial").unwrap();
    let report = store.recover_writes(vault.path()).unwrap();
    assert_eq!(report.cleaned_orphans, 1);
    assert!(!staging.join("orphan.stage").exists());
}

#[test]
fn absolute_publish_path_is_rejected_before_file_creation() {
    let (vault, store) = vault();
    let error = store
        .publish_markdown(vault.path(), "/tmp/out.md", b"bad", JournalFault::None)
        .unwrap_err();
    assert!(matches!(error, StorageError::Constraint(_)));
    assert_eq!(store.count("write_journal").unwrap(), 0);
}

#[test]
fn traversing_publish_path_is_rejected_before_file_creation() {
    let (vault, store) = vault();
    assert!(
        store
            .publish_markdown(vault.path(), "../out.md", b"bad", JournalFault::None)
            .is_err()
    );
    assert_eq!(store.count("write_journal").unwrap(), 0);
}

#[test]
fn non_markdown_publish_path_is_rejected() {
    let (vault, store) = vault();
    assert!(
        store
            .publish_markdown(
                vault.path(),
                "notes/source.html",
                b"bad",
                JournalFault::None
            )
            .is_err()
    );
}

#[test]
fn nested_destination_directories_are_created_during_publish() {
    let (vault, store) = vault();
    store
        .publish_markdown(
            vault.path(),
            "Projects/AI/agents.md",
            b"# Agents",
            JournalFault::None,
        )
        .unwrap();
    assert!(vault.path().join("Projects/AI/agents.md").is_file());
}

#[test]
fn existing_destination_is_not_overwritten_during_recovery() {
    let (vault, store) = vault();
    store
        .publish_markdown(
            vault.path(),
            "Inbox/note.md",
            b"old",
            JournalFault::AfterPrepared,
        )
        .unwrap_err();
    fs::create_dir_all(vault.path().join("Inbox")).unwrap();
    fs::write(vault.path().join("Inbox/note.md"), b"new").unwrap();
    store.recover_writes(vault.path()).unwrap();
    assert_eq!(
        fs::read(vault.path().join("Inbox/note.md")).unwrap(),
        b"new"
    );
}

#[test]
fn trash_move_is_recoverable_and_preserves_bytes() {
    let (vault, store) = vault();
    fs::create_dir_all(vault.path().join("notes")).unwrap();
    fs::write(vault.path().join("notes/a.md"), b"recover me").unwrap();
    let record = store.move_to_trash(vault.path(), "notes/a.md").unwrap();
    assert!(!vault.path().join("notes/a.md").exists());
    assert_eq!(fs::read(record.trash_path).unwrap(), b"recover me");
    assert_eq!(record.original_path, "notes/a.md");
}

#[test]
fn trash_rejects_unknown_file_without_creating_trash() {
    let (vault, store) = vault();
    assert_eq!(
        store
            .move_to_trash(vault.path(), "notes/missing.md")
            .unwrap_err(),
        StorageError::NotFound("vault file")
    );
    assert!(!vault.path().join(".knowledge-os/trash").exists());
}

#[test]
fn trash_rejects_traversal() {
    let (vault, store) = vault();
    assert!(store.move_to_trash(vault.path(), "../outside.md").is_err());
}

#[test]
fn empty_publish_path_is_rejected() {
    let (vault, store) = vault();
    assert!(
        store
            .publish_markdown(vault.path(), "", b"bad", JournalFault::None)
            .is_err()
    );
}

#[test]
fn unicode_markdown_path_and_content_round_trip_exactly() {
    let (vault, store) = vault();
    let content = "# Reunião\n\nDecisão: manter o cofre local.\n".as_bytes();
    store
        .publish_markdown(
            vault.path(),
            "Projetos/Reunião.md",
            content,
            JournalFault::None,
        )
        .unwrap();
    assert_eq!(
        fs::read(vault.path().join("Projetos/Reunião.md")).unwrap(),
        content
    );
}
