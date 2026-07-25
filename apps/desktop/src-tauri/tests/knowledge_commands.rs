use std::fs;

use knowledge_os_desktop_lib::knowledge::{
    CaptureCommandRequest, CaptureKind, capture_in_vault, graph_in_vault, library_in_vault,
    search_in_vault,
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
    let graph = graph_in_vault(vault.path()).unwrap();
    assert!(graph.concepts.len() >= 2);
    assert!(!graph.edges.is_empty());
    let library = library_in_vault(vault.path()).unwrap();
    assert_eq!(library.documents.len(), 2);
    assert_eq!(library.sources.len(), 2);
    assert_eq!(library.note_count, 2);
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
