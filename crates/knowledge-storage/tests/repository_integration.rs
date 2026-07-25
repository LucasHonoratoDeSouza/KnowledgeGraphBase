use knowledge_domain::{ProcessingState, RelationType, SourceKind};
use knowledge_storage::{
    ChunkDraft, ConceptDraft, DocumentDraft, EdgeDraft, FacetDraft, KnowledgeStore, SourceDraft,
    StorageError,
};

fn source(uri: &str, hash: &str) -> SourceDraft {
    SourceDraft {
        kind: SourceKind::Web,
        original_uri: uri.to_owned(),
        normalized_uri: uri.to_lowercase(),
        content_hash: hash.to_owned(),
        pipeline_version: "pipeline-v1".to_owned(),
        title: "A source".to_owned(),
    }
}

fn document(source_id: &str, path: &str) -> DocumentDraft {
    DocumentDraft {
        source_id: source_id.to_owned(),
        path: path.to_owned(),
        title: "Knowledge graphs".to_owned(),
        summary: "A connected model of durable notes.".to_owned(),
        content_hash: "document-hash".to_owned(),
    }
}

#[test]
fn migration_is_idempotent_and_reaches_latest_version() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    store.migrate().unwrap();
    assert_eq!(store.schema_version().unwrap(), 1);
}

#[test]
fn connection_enables_foreign_keys_and_wal_compatible_mode() {
    let directory = tempfile::tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    assert!(store.foreign_keys_enabled().unwrap());
    assert_eq!(store.journal_mode().unwrap(), "wal");
}

#[test]
fn source_round_trips_every_identity_field() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/A", "hash-a"))
        .unwrap();
    let loaded = store.source(&saved.id).unwrap().unwrap();
    assert_eq!(loaded.kind, SourceKind::Web);
    assert_eq!(loaded.normalized_uri, "https://example.com/a");
    assert_eq!(loaded.content_hash, "hash-a");
    assert_eq!(loaded.pipeline_version, "pipeline-v1");
    assert_eq!(loaded.state, ProcessingState::Pending);
}

#[test]
fn duplicate_source_identity_resolves_to_existing_record() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let first = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let second = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(store.count("sources").unwrap(), 1);
}

#[test]
fn same_uri_with_new_content_creates_a_new_source_version() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let first = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let second = store
        .create_source(&source("https://example.com/a", "hash-b"))
        .unwrap();
    assert_ne!(first.id, second.id);
    assert_eq!(store.count("sources").unwrap(), 2);
}

#[test]
fn state_transition_persists_only_valid_next_state() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    store
        .transition_source(&saved.id, ProcessingState::Fetching)
        .unwrap();
    assert_eq!(
        store.source(&saved.id).unwrap().unwrap().state,
        ProcessingState::Fetching
    );
}

#[test]
fn invalid_state_transition_leaves_persisted_state_unchanged() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    assert!(
        store
            .transition_source(&saved.id, ProcessingState::Indexing)
            .is_err()
    );
    assert_eq!(
        store.source(&saved.id).unwrap().unwrap().state,
        ProcessingState::Pending
    );
}

#[test]
fn document_requires_an_existing_source() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let result = store.save_document(&document("missing", "Projects/missing.md"), &[]);
    assert!(matches!(result, Err(StorageError::Constraint(_))));
}

#[test]
fn document_and_chunks_commit_atomically() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let chunks = vec![
        ChunkDraft::new(0, "First section", 2, "section:intro", "chunk-a"),
        ChunkDraft::new(1, "Second section", 2, "section:body", "chunk-b"),
    ];
    let note = store
        .save_document(&document(&saved.id, "Projects/graph.md"), &chunks)
        .unwrap();
    assert_eq!(
        store.document(&note.id).unwrap().unwrap().path,
        "Projects/graph.md"
    );
    assert_eq!(store.chunks_for_document(&note.id).unwrap(), chunks);
}

#[test]
fn duplicate_document_path_is_rejected_without_partial_chunks() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let note = document(&saved.id, "Projects/graph.md");
    store
        .save_document(&note, &[ChunkDraft::new(0, "First", 1, "s:1", "a")])
        .unwrap();
    let result = store.save_document(&note, &[ChunkDraft::new(0, "Other", 1, "s:2", "b")]);
    assert!(matches!(result, Err(StorageError::Constraint(_))));
    assert_eq!(store.count("chunks").unwrap(), 1);
}

#[test]
fn duplicate_chunk_ordinal_is_transactionally_rejected() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let chunks = [
        ChunkDraft::new(0, "First", 1, "s:1", "a"),
        ChunkDraft::new(0, "Duplicate", 1, "s:2", "b"),
    ];
    assert!(
        store
            .save_document(&document(&saved.id, "graph.md"), &chunks)
            .is_err()
    );
    assert_eq!(store.count("documents").unwrap(), 0);
}

#[test]
fn canonical_concept_reuses_normalized_identity() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let first = store
        .upsert_concept(&ConceptDraft::new("AI Agents"))
        .unwrap();
    let second = store
        .upsert_concept(&ConceptDraft::new("  ai   agents "))
        .unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(store.count("concepts").unwrap(), 1);
}

#[test]
fn alias_resolves_to_its_canonical_concept() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let concept = store
        .upsert_concept(&ConceptDraft::new("Retrieval augmented generation"))
        .unwrap();
    store.add_alias(&concept.id, "RAG").unwrap();
    assert_eq!(
        store.resolve_concept("rag").unwrap().unwrap().id,
        concept.id
    );
}

#[test]
fn duplicate_alias_cannot_point_to_two_concepts() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let first = store.upsert_concept(&ConceptDraft::new("First")).unwrap();
    let second = store.upsert_concept(&ConceptDraft::new("Second")).unwrap();
    store.add_alias(&first.id, "shared").unwrap();
    assert!(matches!(
        store.add_alias(&second.id, "shared"),
        Err(StorageError::Constraint(_))
    ));
}

#[test]
fn typed_edge_requires_existing_concepts_and_origin_document() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let edge = EdgeDraft::new(
        "missing-a",
        "missing-b",
        RelationType::Uses,
        8_000,
        "missing-doc",
    );
    assert!(matches!(
        store.add_edge(&edge),
        Err(StorageError::Constraint(_))
    ));
}

#[test]
fn duplicate_typed_edge_reuses_one_record_and_keeps_evidence() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let note = store
        .save_document(&document(&saved.id, "graph.md"), &[])
        .unwrap();
    let first = store.upsert_concept(&ConceptDraft::new("Agents")).unwrap();
    let second = store.upsert_concept(&ConceptDraft::new("Tools")).unwrap();
    let edge = EdgeDraft::new(&first.id, &second.id, RelationType::Uses, 8_000, &note.id);
    let a = store.add_edge(&edge).unwrap();
    let b = store.add_edge(&edge).unwrap();
    assert_eq!(a.id, b.id);
    assert_eq!(store.count("knowledge_edges").unwrap(), 1);
    assert_eq!(store.count("edge_evidence").unwrap(), 1);
}

#[test]
fn edge_self_link_is_rejected_before_sql_mutation() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let edge = EdgeDraft::new("same", "same", RelationType::RelatedTo, 8_000, "origin");
    assert_eq!(store.add_edge(&edge).unwrap_err(), StorageError::SelfEdge);
    assert_eq!(store.count("knowledge_edges").unwrap(), 0);
}

#[test]
fn facet_membership_supports_multiple_overlapping_dimensions() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let saved = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let project = store
        .upsert_facet(&FacetDraft::new("project", "Knowledge OS"))
        .unwrap();
    let area = store
        .upsert_facet(&FacetDraft::new("area", "AI Engineering"))
        .unwrap();
    store.add_membership(&saved.id, &project.id, true).unwrap();
    store.add_membership(&saved.id, &area.id, false).unwrap();
    let memberships = store.memberships_for_source(&saved.id).unwrap();
    assert_eq!(memberships.len(), 2);
    assert!(
        memberships
            .iter()
            .any(|item| item.facet_id == project.id && item.pinned)
    );
}

#[test]
fn deleting_source_cascades_only_its_derived_documents_and_chunks() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let first = store
        .create_source(&source("https://example.com/a", "hash-a"))
        .unwrap();
    let second = store
        .create_source(&source("https://example.com/b", "hash-b"))
        .unwrap();
    store
        .save_document(
            &document(&first.id, "first.md"),
            &[ChunkDraft::new(0, "A", 1, "a", "a")],
        )
        .unwrap();
    store
        .save_document(
            &document(&second.id, "second.md"),
            &[ChunkDraft::new(0, "B", 1, "b", "b")],
        )
        .unwrap();
    store.delete_source(&first.id).unwrap();
    assert_eq!(store.count("sources").unwrap(), 1);
    assert_eq!(store.count("documents").unwrap(), 1);
    assert_eq!(store.count("chunks").unwrap(), 1);
}

#[test]
fn unknown_source_delete_is_a_typed_not_found() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    assert_eq!(
        store.delete_source("missing").unwrap_err(),
        StorageError::NotFound("source")
    );
}

#[test]
fn table_count_rejects_unlisted_identifiers() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    assert_eq!(
        store.count("sources; DROP TABLE sources").unwrap_err(),
        StorageError::InvalidTable
    );
}
