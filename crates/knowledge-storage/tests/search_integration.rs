use knowledge_domain::SourceKind;
use knowledge_storage::{ChunkDraft, DocumentDraft, KnowledgeStore, SourceDraft, StorageError};

fn indexed_store() -> (KnowledgeStore, String, String) {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let rag = store
        .create_source(&SourceDraft {
            kind: SourceKind::Text,
            original_uri: "rag".to_owned(),
            normalized_uri: "text:rag".to_owned(),
            content_hash: "rag-hash".to_owned(),
            pipeline_version: "v1".to_owned(),
            title: "Grounded RAG".to_owned(),
        })
        .unwrap();
    let agents = store
        .create_source(&SourceDraft {
            kind: SourceKind::Note,
            original_uri: "agents".to_owned(),
            normalized_uri: "text:agents".to_owned(),
            content_hash: "agents-hash".to_owned(),
            pipeline_version: "v1".to_owned(),
            title: "AI agents".to_owned(),
        })
        .unwrap();
    store
        .save_document(
            &DocumentDraft {
                source_id: rag.id.clone(),
                path: "Research/rag.md".to_owned(),
                title: "Grounded RAG".to_owned(),
                summary: "Retrieval with citations".to_owned(),
                content_hash: "doc-rag".to_owned(),
            },
            &[ChunkDraft::new(
                0,
                "Retrieval augmented generation grounds answers in source evidence and citations.",
                10,
                r#"{"kind":"note","heading":"Evidence"}"#,
                "chunk-rag",
            )],
        )
        .unwrap();
    store
        .save_document(
            &DocumentDraft {
                source_id: agents.id.clone(),
                path: "Work/agents.md".to_owned(),
                title: "AI agents".to_owned(),
                summary: "Tools and planning".to_owned(),
                content_hash: "doc-agent".to_owned(),
            },
            &[ChunkDraft::new(
                0,
                "Agents use planning and tools. Retrieval gives an agent reliable context.",
                10,
                r#"{"kind":"note","heading":"Agents"}"#,
                "chunk-agent",
            )],
        )
        .unwrap();
    (store, rag.id, agents.id)
}

#[test]
fn lexical_search_returns_ranked_resolvable_hits() {
    let (store, rag, _) = indexed_store();
    let hits = store.search_chunks("source evidence citations", 8).unwrap();
    assert_eq!(hits[0].source_id, rag);
    assert_eq!(hits[0].path, "Research/rag.md");
    assert!(hits[0].snippet.contains("<mark>"));
    assert!(hits[0].locator.contains("Evidence"));
}

#[test]
fn prefix_search_handles_partial_terms() {
    let (store, _, _) = indexed_store();
    assert_eq!(store.search_chunks("retriev", 8).unwrap().len(), 2);
}

#[test]
fn punctuation_only_query_fails_without_sql_syntax_leak() {
    let (store, _, _) = indexed_store();
    assert!(matches!(
        store.search_chunks("!?()", 8),
        Err(StorageError::Constraint(_))
    ));
}

#[test]
fn query_operators_are_treated_as_text_tokens() {
    let (store, _, _) = indexed_store();
    let hits = store.search_chunks("retrieval OR citations", 8).unwrap();
    assert!(!hits.is_empty());
}

#[test]
fn result_limit_is_enforced() {
    let (store, _, _) = indexed_store();
    assert_eq!(store.search_chunks("retrieval", 1).unwrap().len(), 1);
}

#[test]
fn source_delete_removes_search_rows_transactionally() {
    let (store, rag, _) = indexed_store();
    store.delete_source(&rag).unwrap();
    let hits = store.search_chunks("citations", 8).unwrap();
    assert!(hits.is_empty());
}

#[test]
fn rebuild_repairs_a_complete_index_and_reports_rows() {
    let (store, _, _) = indexed_store();
    assert_eq!(store.rebuild_search_index().unwrap(), 2);
    assert_eq!(store.search_chunks("retrieval", 8).unwrap().len(), 2);
}

#[test]
fn unicode_terms_search_without_ascii_only_fallback() {
    let (store, _, _) = indexed_store();
    assert!(store.search_chunks("geração", 8).unwrap().is_empty());
}
