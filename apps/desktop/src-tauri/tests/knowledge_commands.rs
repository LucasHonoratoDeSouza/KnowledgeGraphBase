use std::fs;

use knowledge_os_desktop_lib::knowledge::{
    CaptureCommandRequest, CaptureKind, capture_in_vault, create_folder_in_vault,
    delete_entry_in_vault, graph_in_vault, library_in_vault, move_entry_in_vault,
    recent_corrections, rename_entry_in_vault, search_in_vault,
};
use tempfile::tempdir;

#[test]
fn native_text_capture_is_searchable_and_visible_in_graph_and_library() {
    let vault = tempdir().unwrap();
    fs::create_dir(vault.path().join("Projects")).unwrap();
    fs::write(
        vault.path().join("Projects/Existing.md"),
        "# Existing local note",
    )
    .unwrap();
    let captured = capture_in_vault(
        vault.path(),
        &CaptureCommandRequest {
            kind: CaptureKind::Text,
            title: "Grounded retrieval".to_owned(),
            content:
                "Retrieval augmented generation connects evidence, citations, and knowledge graphs."
                    .to_owned(),
            file_name: String::new(),
            bytes: Vec::new(),
        },
    )
    .unwrap();

    assert!(vault.path().join(&captured.document.path).is_file());
    let search = search_in_vault(vault.path(), "evidence citations").unwrap();
    assert_eq!(search.hits[0].document_id, captured.document.id);
    let library = library_in_vault(vault.path()).unwrap();
    assert_eq!(library.documents.len(), 2);
    assert_eq!(library.sources.len(), 2);
    assert_eq!(library.note_count, 2);
    // A capture with no Main model enrichment stays fully searchable and
    // filed, but it does not enter the concept graph — only Main-model
    // organized content does. The manually-added "Existing.md" note (synced
    // by title/heading/wiki-link during the library scan above, not through
    // capture) is the only concept here.
    let graph = graph_in_vault(vault.path()).unwrap();
    assert_eq!(
        graph
            .concepts
            .iter()
            .map(|c| c.display_name.as_str())
            .collect::<Vec<_>>(),
        ["Existing local note"]
    );
    assert_eq!(
        search_in_vault(vault.path(), "existing local note")
            .unwrap()
            .hits[0]
            .path,
        "Projects/Existing.md"
    );
}

#[test]
fn auto_capture_infers_plain_text_without_network_access() {
    let vault = tempdir().unwrap();
    let response = capture_in_vault(
        vault.path(),
        &CaptureCommandRequest {
            kind: CaptureKind::Auto,
            title: String::new(),
            content: "A local meeting summary about model routing and cost controls.".to_owned(),
            file_name: String::new(),
            bytes: Vec::new(),
        },
    )
    .unwrap();
    assert_eq!(response.document.title, "Quick capture");
}

#[test]
fn library_scan_hides_internal_metadata_and_common_build_directories() {
    let vault = tempdir().unwrap();
    fs::create_dir(vault.path().join(".knowledge-os")).unwrap();
    fs::create_dir(vault.path().join("node_modules")).unwrap();
    fs::create_dir(vault.path().join("Notes")).unwrap();
    fs::write(vault.path().join("Notes/Visible.md"), "visible").unwrap();
    fs::write(vault.path().join(".knowledge-os/private.md"), "hidden").unwrap();
    let snapshot = library_in_vault(vault.path()).unwrap();
    assert_eq!(snapshot.note_count, 1);
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].name, "Notes");
}

#[test]
fn edited_local_markdown_replaces_the_search_revision_without_stale_hits() {
    let vault = tempdir().unwrap();
    let note = vault.path().join("Research.md");
    fs::write(&note, "# Research\n\nOld semaphore finding.").unwrap();
    let first = library_in_vault(vault.path()).unwrap();
    let first_document = &first.documents[0];
    assert_eq!(first_document.revision, 1);
    assert_eq!(
        search_in_vault(vault.path(), "semaphore")
            .unwrap()
            .hits
            .len(),
        1
    );

    fs::write(&note, "# Research revised\n\nNew transformer evidence.").unwrap();
    let refreshed = library_in_vault(vault.path()).unwrap();
    let document = &refreshed.documents[0];
    assert_eq!(document.id, first_document.id);
    assert_eq!(document.revision, 2);
    assert!(
        search_in_vault(vault.path(), "semaphore")
            .unwrap()
            .hits
            .is_empty()
    );
    assert_eq!(
        search_in_vault(vault.path(), "transformer")
            .unwrap()
            .hits
            .len(),
        1
    );
}

#[test]
fn folder_creation_shows_the_new_folder_and_refuses_unsafe_names() {
    let vault = tempdir().unwrap();
    fs::create_dir(vault.path().join("Projects")).unwrap();

    let snapshot = create_folder_in_vault(vault.path(), "Projects/Reading list").unwrap();
    assert!(vault.path().join("Projects/Reading list").is_dir());
    let projects = snapshot
        .entries
        .iter()
        .find(|entry| entry.name == "Projects")
        .unwrap();
    assert!(
        projects
            .children
            .iter()
            .any(|child| child.name == "Reading list")
    );

    assert!(create_folder_in_vault(vault.path(), "Projects/Reading list").is_err());
    assert!(create_folder_in_vault(vault.path(), "../escape").is_err());
    assert!(create_folder_in_vault(vault.path(), "/etc/passwd").is_err());
    assert!(create_folder_in_vault(vault.path(), ".hidden").is_err());
    assert!(create_folder_in_vault(vault.path(), "   ").is_err());
    assert!(!vault.path().parent().unwrap().join("escape").exists());
}

#[test]
fn renaming_a_note_moves_the_file_and_drops_its_stale_search_hits() {
    let vault = tempdir().unwrap();
    fs::create_dir(vault.path().join("Research")).unwrap();
    fs::write(
        vault.path().join("Research/Draft.md"),
        "# Draft\n\nA note about semaphores.",
    )
    .unwrap();
    library_in_vault(vault.path()).unwrap();
    assert_eq!(
        search_in_vault(vault.path(), "semaphores").unwrap().hits[0].path,
        "Research/Draft.md"
    );

    let snapshot = rename_entry_in_vault(vault.path(), "Research/Draft.md", "Final").unwrap();

    assert!(vault.path().join("Research/Final.md").is_file());
    assert!(!vault.path().join("Research/Draft.md").exists());
    assert_eq!(snapshot.note_count, 1);
    let hits = search_in_vault(vault.path(), "semaphores").unwrap().hits;
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].path, "Research/Final.md");
}

#[test]
fn renaming_refuses_collisions_and_unsafe_names() {
    let vault = tempdir().unwrap();
    fs::write(vault.path().join("One.md"), "# One").unwrap();
    fs::write(vault.path().join("Two.md"), "# Two").unwrap();

    assert!(rename_entry_in_vault(vault.path(), "One.md", "Two").is_err());
    assert!(rename_entry_in_vault(vault.path(), "One.md", "../escape").is_err());
    assert!(rename_entry_in_vault(vault.path(), "One.md", "Nested/Name").is_err());
    assert!(rename_entry_in_vault(vault.path(), "One.md", "   ").is_err());
    assert!(rename_entry_in_vault(vault.path(), "Missing.md", "Any").is_err());
    assert!(vault.path().join("One.md").is_file());
}

#[test]
fn deleting_removes_the_file_and_its_index_rows() {
    let vault = tempdir().unwrap();
    fs::create_dir(vault.path().join("Notes")).unwrap();
    fs::write(
        vault.path().join("Notes/Temp.md"),
        "# Temp\n\nA disposable idea about kubernetes.",
    )
    .unwrap();
    library_in_vault(vault.path()).unwrap();

    let snapshot = delete_entry_in_vault(vault.path(), "Notes/Temp.md").unwrap();

    assert!(!vault.path().join("Notes/Temp.md").exists());
    assert_eq!(snapshot.note_count, 0);
    assert!(
        search_in_vault(vault.path(), "kubernetes")
            .unwrap()
            .hits
            .is_empty()
    );
}

#[test]
fn deleting_a_folder_removes_its_contents_and_refuses_unsafe_paths() {
    let vault = tempdir().unwrap();
    fs::create_dir_all(vault.path().join("Projects/Old")).unwrap();
    fs::write(vault.path().join("Projects/Old/One.md"), "# One").unwrap();

    assert!(delete_entry_in_vault(vault.path(), "../..").is_err());
    assert!(delete_entry_in_vault(vault.path(), ".knowledge-os").is_err());
    delete_entry_in_vault(vault.path(), "Projects/Old").unwrap();

    assert!(!vault.path().join("Projects/Old").exists());
    assert!(vault.path().join("Projects").is_dir());
}

#[test]
fn moving_a_note_relocates_it_and_records_a_pinned_correction() {
    let vault = tempdir().unwrap();
    fs::create_dir_all(vault.path().join("Inbox")).unwrap();
    fs::create_dir_all(vault.path().join("Projects/Docker")).unwrap();
    fs::write(
        vault.path().join("Inbox/Containers.md"),
        "# Containers\n\nImages, layers and registries.",
    )
    .unwrap();
    library_in_vault(vault.path()).unwrap();

    move_entry_in_vault(vault.path(), "Inbox/Containers.md", "Projects/Docker").unwrap();

    assert!(vault.path().join("Projects/Docker/Containers.md").is_file());
    assert!(!vault.path().join("Inbox/Containers.md").exists());
    assert_eq!(
        search_in_vault(vault.path(), "registries").unwrap().hits[0].path,
        "Projects/Docker/Containers.md"
    );
    assert_eq!(recent_corrections(vault.path(), 10).unwrap(), ["Docker"]);
}

#[test]
fn moving_refuses_self_nesting_and_collisions() {
    let vault = tempdir().unwrap();
    fs::create_dir_all(vault.path().join("Projects/Inner")).unwrap();
    fs::create_dir_all(vault.path().join("Areas")).unwrap();
    fs::write(vault.path().join("Areas/Note.md"), "# Note").unwrap();
    fs::write(vault.path().join("Projects/Note.md"), "# Other note").unwrap();

    assert!(move_entry_in_vault(vault.path(), "Projects", "Projects/Inner").is_err());
    assert!(move_entry_in_vault(vault.path(), "Projects", "Projects").is_err());
    assert!(move_entry_in_vault(vault.path(), "Areas/Note.md", "Projects").is_err());
    assert!(move_entry_in_vault(vault.path(), "Areas/Note.md", "Missing").is_err());
    assert!(vault.path().join("Areas/Note.md").is_file());
    assert!(vault.path().join("Projects/Inner").is_dir());
}
