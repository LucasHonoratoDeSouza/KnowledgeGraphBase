use knowledge_ai::{AiResponse, FakeAiPort, TokenUsage};
use knowledge_domain::SourceKind;
use knowledge_retrieval::{
    GroundedAssistant, RetrievalEngine, RetrievalError, build_context, plan_query,
};
use knowledge_storage::{ChunkDraft, DocumentDraft, KnowledgeStore, SourceDraft};

fn store() -> KnowledgeStore {
    let store = KnowledgeStore::open_in_memory().unwrap();
    for (index, (path, title, text)) in [
        (
            "Projects/Knowledge OS/rag.md",
            "RAG design",
            "Retrieval augmented generation grounds AI answers with evidence and citations.",
        ),
        (
            "Areas/Work/agents.md",
            "Agent notes",
            "AI agents use tools, planning, and retrieval context.",
        ),
        (
            "Books/Systems.md",
            "Systems",
            "Reliable systems expose provenance and recover from failure.",
        ),
    ]
    .into_iter()
    .enumerate()
    {
        let source = store
            .create_source(&SourceDraft {
                kind: SourceKind::Text,
                original_uri: title.to_owned(),
                normalized_uri: format!("text:{index}"),
                content_hash: format!("source-{index}"),
                pipeline_version: "v1".to_owned(),
                title: title.to_owned(),
            })
            .unwrap();
        store
            .save_document(
                &DocumentDraft {
                    source_id: source.id,
                    path: path.to_owned(),
                    title: title.to_owned(),
                    summary: text.to_owned(),
                    content_hash: format!("document-{index}"),
                },
                &[ChunkDraft::new(
                    0,
                    text,
                    12,
                    format!("section:{title}"),
                    format!("chunk-{index}"),
                )],
            )
            .unwrap();
    }
    store
}

#[test]
fn planner_extracts_filters_without_model_call() {
    let plan = plan_query("how does retrieval work path:Projects project:Knowledge_OS tag:rag");
    assert_eq!(plan.lexical_query, "how does retrieval work");
    assert_eq!(plan.filters.path_prefix.as_deref(), Some("Projects"));
    assert_eq!(plan.filters.project.as_deref(), Some("Knowledge OS"));
    assert_eq!(plan.filters.tags, vec!["rag"]);
}

#[test]
fn planner_marks_relationship_questions_for_graph_expansion() {
    assert!(plan_query("how do agents connect to retrieval").expand_graph);
    assert!(!plan_query("summarize agents").expand_graph);
}

#[test]
fn search_applies_path_scope_after_fts_ranking() {
    let store = store();
    let result = RetrievalEngine::new(&store)
        .search("retrieval path:Projects", 8)
        .unwrap();
    assert_eq!(result.hits.len(), 1);
    assert!(result.hits[0].path.starts_with("Projects"));
    assert!(result.lexical_fallback);
}

#[test]
fn blank_or_filters_only_query_is_rejected() {
    let store = store();
    assert_eq!(
        RetrievalEngine::new(&store).search("path:Projects", 8),
        Err(RetrievalError::BlankQuery)
    );
}

#[test]
fn context_keeps_resolvable_path_locator_and_stable_numbers() {
    let store = store();
    let hits = RetrievalEngine::new(&store)
        .search("retrieval", 8)
        .unwrap()
        .hits;
    let context = build_context(&hits);
    assert_eq!(context.citations[0].number, 1);
    assert!(context.prompt.contains("[SOURCE 1]"));
    assert!(!context.citations[0].path.is_empty());
    assert!(!context.citations[0].locator.is_empty());
}

#[test]
fn context_dedicated_limit_never_exceeds_eight_chunks() {
    let store = store();
    let hits = RetrievalEngine::new(&store)
        .search("retrieval evidence provenance agents systems", 100)
        .unwrap()
        .hits;
    assert!(build_context(&hits).citations.len() <= 8);
}

#[test]
fn supported_answer_calls_provider_once_and_resolves_citation() {
    let store = store();
    let fake = FakeAiPort::with_responses(vec![AiResponse {
        content:
            r#"{"answer":"RAG grounds answers in retrieved evidence.","citation_numbers":[1]}"#
                .to_owned(),
        usage: TokenUsage {
            input_tokens: 50,
            output_tokens: 12,
        },
    }]);
    let answer = GroundedAssistant::new(&store, &fake)
        .ask("retrieval evidence", "cheap")
        .unwrap();
    assert!(answer.supported);
    assert_eq!(answer.citations.len(), 1);
    assert_eq!(fake.requests().unwrap().len(), 1);
    assert_eq!(answer.usage.input_tokens, 50);
}

#[test]
fn unsupported_answer_calls_provider_zero_times() {
    let store = store();
    let fake = FakeAiPort::default();
    let answer = GroundedAssistant::new(&store, &fake)
        .ask("quantum chromodynamics", "cheap")
        .unwrap();
    assert!(!answer.supported);
    assert!(answer.citations.is_empty());
    assert!(fake.requests().unwrap().is_empty());
}

#[test]
fn hallucinated_citation_is_rejected() {
    let store = store();
    let fake = FakeAiPort::with_responses(vec![AiResponse {
        content: r#"{"answer":"Unsupported","citation_numbers":[99]}"#.to_owned(),
        usage: TokenUsage::default(),
    }]);
    assert_eq!(
        GroundedAssistant::new(&store, &fake).ask("retrieval", "cheap"),
        Err(RetrievalError::InvalidCitation)
    );
}

#[test]
fn malformed_answer_is_rejected() {
    let store = store();
    let fake = FakeAiPort::with_responses(vec![AiResponse {
        content: "plain text".to_owned(),
        usage: TokenUsage::default(),
    }]);
    assert_eq!(
        GroundedAssistant::new(&store, &fake).ask("retrieval", "cheap"),
        Err(RetrievalError::InvalidAnswer)
    );
}

#[test]
fn empty_answer_is_rejected() {
    let store = store();
    let fake = FakeAiPort::with_responses(vec![AiResponse {
        content: r#"{"answer":" ","citation_numbers":[]}"#.to_owned(),
        usage: TokenUsage::default(),
    }]);
    assert_eq!(
        GroundedAssistant::new(&store, &fake).ask("retrieval", "cheap"),
        Err(RetrievalError::InvalidAnswer)
    );
}

#[test]
fn assistant_prompt_contains_only_retrieved_context_and_question() {
    let store = store();
    let fake = FakeAiPort::with_responses(vec![AiResponse {
        content: r#"{"answer":"Grounded.","citation_numbers":[1]}"#.to_owned(),
        usage: TokenUsage::default(),
    }]);
    GroundedAssistant::new(&store, &fake)
        .ask("retrieval", "cheap")
        .unwrap();
    let requests = fake.requests().unwrap();
    assert!(requests[0].input.contains("Question: retrieval"));
    assert!(requests[0].input.contains("[SOURCE 1]"));
    assert!(!requests[0].input.contains("quantum chromodynamics"));
}
