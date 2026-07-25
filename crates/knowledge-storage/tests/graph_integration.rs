use knowledge_domain::{RelationType, SourceKind};
use knowledge_storage::{
    ConceptDraft, DocumentDraft, EdgeDraft, KnowledgeStore, SourceDraft, StorageError,
};


fn seeded() -> (KnowledgeStore, Vec<String>, String) {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let source = store
        .create_source(&SourceDraft {
            kind: SourceKind::Note,
            original_uri: "meeting".to_owned(),
            normalized_uri: "meeting".to_owned(),
            content_hash: "meeting-hash".to_owned(),
            pipeline_version: "v1".to_owned(),
            title: "Meeting".to_owned(),
        })
        .unwrap();
    let document = store
        .save_document(
            &DocumentDraft {
                source_id: source.id,
                path: "Projects/meeting.md".to_owned(),
                title: "Meeting".to_owned(),
                summary: "Agents use RAG.".to_owned(),
                content_hash: "doc-hash".to_owned(),
            },
            &[],
        )
        .unwrap();
    let ids = ["Agents", "RAG", "Embeddings", "Systems"]
        .map(|name| store.upsert_concept(&ConceptDraft::new(name)).unwrap().id)
        .to_vec();
    for (source, target, relation) in [
        (0, 1, RelationType::Uses),
        (1, 2, RelationType::Requires),
        (2, 3, RelationType::PartOf),
        (3, 0, RelationType::RelatedTo),
    ] {
        store
            .add_edge(&EdgeDraft::new(
                &ids[source],
                &ids[target],
                relation,
                8_000,
                &document.id,
            ))
            .unwrap();
    }
    (store, ids, document.id)
}

#[test]
fn zero_depth_returns_only_root() {
    let (store, ids, _) = seeded();
    let graph = store.graph_view(&ids[0], 0, 20).unwrap();
    assert_eq!(graph.concepts.len(), 1);
    assert!(graph.edges.is_empty());
}

#[test]
fn one_hop_contains_inbound_and_outbound_neighbors() {
    let (store, ids, _) = seeded();
    let graph = store.graph_view(&ids[0], 1, 20).unwrap();
    assert_eq!(graph.concepts.len(), 3);
    assert_eq!(graph.edges.len(), 2);
}

#[test]
fn cyclic_graph_traversal_terminates_without_duplicate_concepts() {
    let (store, ids, _) = seeded();
    let graph = store.graph_view(&ids[0], 20, 20).unwrap();
    assert_eq!(graph.concepts.len(), 4);
    assert_eq!(graph.edges.len(), 4);
}

#[test]
fn node_limit_truncates_graph_deterministically() {
    let (store, ids, _) = seeded();
    let graph = store.graph_view(&ids[0], 20, 2).unwrap();
    assert_eq!(graph.concepts.len(), 2);
    assert!(graph.truncated);
}

#[test]
fn zero_node_limit_returns_explicitly_truncated_empty_view() {
    let (store, ids, _) = seeded();
    let graph = store.graph_view(&ids[0], 1, 0).unwrap();
    assert!(graph.concepts.is_empty());
    assert!(graph.truncated);
}

#[test]
fn unknown_root_is_a_typed_not_found() {
    let (store, _, _) = seeded();
    assert_eq!(
        store.graph_view("missing", 1, 10).unwrap_err(),
        StorageError::NotFound("concept")
    );
}

#[test]
fn graph_edge_exposes_relation_confidence_and_origin_evidence() {
    let (store, ids, document_id) = seeded();
    let graph = store.graph_view(&ids[0], 1, 10).unwrap();
    let uses = graph
        .edges
        .iter()
        .find(|edge| edge.relation == RelationType::Uses)
        .unwrap();
    assert_eq!(uses.confidence_basis_points, 8_000);
    assert_eq!(uses.origin_document_ids, [document_id]);
}

#[test]
fn backlinks_open_the_exact_origin_document_path() {
    let (store, ids, document_id) = seeded();
    let backlinks = store.backlinks_for_concept(&ids[1]).unwrap();
    assert_eq!(backlinks.len(), 1);
    assert_eq!(backlinks[0].document_id, document_id);
    assert_eq!(backlinks[0].path, "Projects/meeting.md");
}

#[test]
fn concept_without_edges_has_no_backlinks() {
    let (store, _, _) = seeded();
    let isolated = store
        .upsert_concept(&ConceptDraft::new("Isolated"))
        .unwrap();
    assert!(
        store
            .backlinks_for_concept(&isolated.id)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn graph_output_order_is_stable_across_repeated_queries() {
    let (store, ids, _) = seeded();
    assert_eq!(
        store.graph_view(&ids[0], 3, 20).unwrap(),
        store.graph_view(&ids[0], 3, 20).unwrap()
    );
}

#[test]
fn a_new_concept_has_no_note_until_one_is_recorded() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let concept = store.upsert_concept(&ConceptDraft::new("Docker")).unwrap();
    assert_eq!(concept.note_path, None);

    store
        .set_concept_note_path(&concept.id, "Concepts/docker.md")
        .unwrap();

    let resolved = store.resolve_concept("Docker").unwrap().unwrap();
    assert_eq!(resolved.note_path, Some("Concepts/docker.md".to_owned()));
    // Re-upserting the same concept (as a later capture mentioning it would)
    // must not clear or reset the note path already recorded.
    let reupserted = store.upsert_concept(&ConceptDraft::new("Docker")).unwrap();
    assert_eq!(reupserted.note_path, Some("Concepts/docker.md".to_owned()));
}
