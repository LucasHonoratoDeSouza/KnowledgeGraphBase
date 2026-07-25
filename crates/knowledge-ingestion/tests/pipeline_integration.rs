use std::fs;

use knowledge_domain::{ProcessingState, SourceKind};
use knowledge_ingestion::{
    CaptureRequest, CaptureService, ConceptDefinition, DeterministicPipeline, ExtractedContent,
    KnowledgeEnrichment, SourceLocator,
};
use knowledge_storage::{JobState, KnowledgeStore};
use tempfile::tempdir;

fn text_content(title: &str) -> ExtractedContent {
    ExtractedContent {
        title: title.to_owned(),
        body: "Retrieval augmented generation connects search evidence to reliable AI answers. Knowledge graphs preserve concepts, relationships, and provenance.".to_owned(),
        locators: vec![SourceLocator::Note {
            heading: title.to_owned(),
        }],
        used_fallback: false,
    }
}

fn content_with(title: &str, body: &str) -> ExtractedContent {
    ExtractedContent {
        title: title.to_owned(),
        body: body.to_owned(),
        locators: vec![SourceLocator::Note {
            heading: title.to_owned(),
        }],
        used_fallback: false,
    }
}

fn seeded_store() -> (KnowledgeStore, tempfile::TempDir) {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    (store, directory)
}

fn capture_text(
    store: &KnowledgeStore,
    title: &str,
    content: &str,
) -> knowledge_ingestion::CaptureReceipt {
    CaptureService::new(store)
        .capture(CaptureRequest::Text { title, content })
        .unwrap()
}

#[test]
fn text_capture_reaches_completed_and_publishes_traceable_markdown() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::Text {
            title: "RAG architecture",
            content: &text_content("RAG architecture").body,
        })
        .unwrap();

    let result = DeterministicPipeline::new(&store, directory.path())
        .process(&receipt, text_content("RAG architecture"))
        .unwrap();

    assert!(!result.reused);
    assert_eq!(
        store.source(&receipt.source.id).unwrap().unwrap().state,
        ProcessingState::Completed
    );
    assert_eq!(
        store.job(&receipt.job.id).unwrap().unwrap().state,
        JobState::Completed
    );
    assert_eq!(store.count("documents").unwrap(), 1);
    assert!(store.count("chunks").unwrap() >= 1);
    // Unenriched captures (no Main model run) stay out of the knowledge graph —
    // only Main-model-organized content populates concepts/edges.
    assert_eq!(store.count("concepts").unwrap(), 0);
    let markdown = fs::read_to_string(directory.path().join(&result.document.path)).unwrap();
    assert!(markdown.contains("# RAG architecture"));
    assert!(markdown.contains("## Summary"));
    assert!(markdown.contains("## Full captured content"));
    assert!(
        markdown.contains("Knowledge graphs preserve concepts, relationships, and provenance.")
    );
    assert!(markdown.contains("Local note — RAG architecture"));
}

#[test]
fn completed_duplicate_reuses_artifacts_without_processing_again() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let capture = CaptureService::new(&store);
    let request = CaptureRequest::MeetingNote {
        title: "Architecture sync",
        content: "The team chose local first retrieval and cited answers.",
    };
    let first = capture.capture(request).unwrap();
    let pipeline = DeterministicPipeline::new(&store, directory.path());
    let original = pipeline
        .process(&first, text_content("Architecture sync"))
        .unwrap();
    let duplicate = capture.capture(request).unwrap();
    let reused = pipeline
        .process(&duplicate, text_content("Architecture sync"))
        .unwrap();

    assert!(duplicate.duplicate);
    assert!(reused.reused);
    assert_eq!(reused.document.id, original.document.id);
    assert_eq!(store.count("documents").unwrap(), 1);
    assert_eq!(store.job(&duplicate.job.id).unwrap().unwrap().attempt, 1);
}

#[test]
fn web_pdf_and_youtube_content_share_one_deterministic_pipeline() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let capture = CaptureService::new(&store);
    let sources = [
        (
            capture
                .capture(CaptureRequest::Url("https://example.com/paper"))
                .unwrap(),
            SourceKind::Web,
            SourceLocator::Web {
                url: "https://example.com/paper".to_owned(),
                section: "Article".to_owned(),
                retrieved_at: "fixture".to_owned(),
            },
        ),
        (
            capture
                .capture(CaptureRequest::Pdf {
                    file_name: "paper.pdf",
                    bytes: b"fixture-pdf",
                })
                .unwrap(),
            SourceKind::Pdf,
            SourceLocator::Pdf { page: 4, chunk: 0 },
        ),
        (
            capture
                .capture(CaptureRequest::Url("https://youtu.be/abc123"))
                .unwrap(),
            SourceKind::YouTube,
            SourceLocator::YouTube {
                start_seconds: 75,
                segment: "Graph retrieval".to_owned(),
            },
        ),
    ];
    let pipeline = DeterministicPipeline::new(&store, directory.path());
    for (receipt, kind, locator) in sources {
        assert_eq!(receipt.source.kind, kind);
        let result = pipeline
            .process(
                &receipt,
                ExtractedContent {
                    title: format!("{kind:?} knowledge"),
                    body: "Graph retrieval connects sources and concepts with visible evidence."
                        .to_owned(),
                    locators: vec![locator],
                    used_fallback: false,
                },
            )
            .unwrap();
        assert!(directory.path().join(result.document.path).is_file());
    }
    assert_eq!(store.count("documents").unwrap(), 3);
}

#[test]
fn pdf_markdown_preserves_complete_extracted_body_without_truncation() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::Pdf {
            file_name: "complete-paper.pdf",
            bytes: b"fixture-pdf",
        })
        .unwrap();
    let full_text = (0..200)
        .map(|index| format!("Page material {index}: evidence and methodology are preserved."))
        .collect::<Vec<_>>()
        .join("\n");
    let result = DeterministicPipeline::new(&store, directory.path())
        .process(
            &receipt,
            ExtractedContent {
                title: "PDF document".to_owned(),
                body: full_text.clone(),
                locators: vec![SourceLocator::Pdf { page: 1, chunk: 0 }],
                used_fallback: false,
            },
        )
        .unwrap();
    let markdown = fs::read_to_string(directory.path().join(result.document.path)).unwrap();
    assert_eq!(result.document.title, "complete-paper");
    assert!(markdown.contains("## Full extracted document"));
    assert!(markdown.contains(&full_text));
}

#[test]
fn main_model_enrichment_controls_summary_concepts_and_overlapping_facets() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::MeetingNote {
            title: "Weekly sync",
            content: "The Knowledge OS project uses retrieval and graph evidence.",
        })
        .unwrap();
    let result = DeterministicPipeline::new(&store, directory.path())
        .process_enriched(
            &receipt,
            text_content("Weekly sync"),
            Some(&KnowledgeEnrichment {
                context: String::new(),
                title: "Knowledge OS weekly sync".to_owned(),
                summary: "Detailed decisions, evidence, open questions, and follow-up actions from the weekly architecture discussion.".to_owned(),
                concepts: vec!["Knowledge OS".to_owned(), "Retrieval".to_owned(), "Knowledge Graph".to_owned()],
                concept_definitions: vec![
                    ConceptDefinition { name: "Knowledge OS".to_owned(), definition: "A local-first personal knowledge management application.".to_owned() },
                    ConceptDefinition { name: "Retrieval".to_owned(), definition: "The process of finding relevant stored information in response to a query.".to_owned() },
                    ConceptDefinition { name: "Knowledge Graph".to_owned(), definition: "A network of typed entities and relationships representing structured knowledge.".to_owned() },
                ],
                projects: vec!["Knowledge OS".to_owned()],
                areas: vec!["AI Engineering".to_owned()],
                tags: vec!["meeting".to_owned(), "rag".to_owned()],
            }),
        )
        .unwrap();
    assert_eq!(result.document.title, "Knowledge OS weekly sync");
    assert!(result.document.summary.starts_with("Detailed decisions"));
    assert_eq!(store.count("facets").unwrap(), 4);
    assert_eq!(store.count("facet_memberships").unwrap(), 4);
    assert_eq!(store.count("organization_audit").unwrap(), 1);
    assert!(result.document.path.starts_with("Projects/Knowledge OS/"));
    assert!(directory.path().join(&result.document.path).is_file());
    let concept = store.resolve_concept("Knowledge OS").unwrap().unwrap();
    let note_path = concept
        .note_path
        .expect("a first-seen concept gets its own note");
    assert!(note_path.starts_with("Concepts/"));
    let note = fs::read_to_string(directory.path().join(&note_path)).unwrap();
    assert!(note.contains("local-first personal knowledge management application"));
}

#[test]
fn enrichment_without_a_project_falls_back_to_its_first_area() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::MeetingNote {
            title: "Area only",
            content: "The team discussed retrieval evaluation without a named project.",
        })
        .unwrap();
    let result = DeterministicPipeline::new(&store, directory.path())
        .process_enriched(
            &receipt,
            text_content("Area only"),
            Some(&KnowledgeEnrichment {
                context: String::new(),
                title: "Area only".to_owned(),
                summary: "Retrieval evaluation notes without a named project.".to_owned(),
                concepts: vec!["Retrieval".to_owned()],
                concept_definitions: vec![],
                projects: vec![],
                areas: vec!["AI Engineering".to_owned()],
                tags: vec![],
            }),
        )
        .unwrap();
    assert!(result.document.path.starts_with("Areas/AI Engineering/"));
}

#[test]
fn enrichment_without_project_or_area_stays_in_inbox() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::Text {
            title: "Untagged",
            content: "No project or area was identified for this capture.",
        })
        .unwrap();
    let result = DeterministicPipeline::new(&store, directory.path())
        .process_enriched(
            &receipt,
            text_content("Untagged"),
            Some(&KnowledgeEnrichment {
                context: String::new(),
                title: "Untagged".to_owned(),
                summary: "No project or area was identified.".to_owned(),
                concepts: vec![],
                concept_definitions: vec![],
                projects: vec![],
                areas: vec![],
                tags: vec!["misc".to_owned()],
            }),
        )
        .unwrap();
    assert!(result.document.path.starts_with("Inbox/"));
}

#[test]
fn enriched_capture_populates_the_concept_graph_while_unenriched_does_not() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let capture = CaptureService::new(&store);

    let raw = capture
        .capture(CaptureRequest::Text {
            title: "Raw capture",
            content: "No Main model configured, so this stays unenriched.",
        })
        .unwrap();
    DeterministicPipeline::new(&store, directory.path())
        .process(&raw, text_content("Raw capture"))
        .unwrap();
    assert_eq!(store.count("concepts").unwrap(), 0);

    let enriched = capture
        .capture(CaptureRequest::Text {
            title: "Enriched capture",
            content: "The Main model organized this into the knowledge graph.",
        })
        .unwrap();
    DeterministicPipeline::new(&store, directory.path())
        .process_enriched(
            &enriched,
            text_content("Enriched capture"),
            Some(&KnowledgeEnrichment {
                context: String::new(),
                title: "Enriched capture".to_owned(),
                summary: "Organized summary.".to_owned(),
                concepts: vec!["Knowledge Graph".to_owned(), "Retrieval".to_owned()],
                concept_definitions: vec![],
                projects: vec!["Knowledge OS".to_owned()],
                areas: vec![],
                tags: vec![],
            }),
        )
        .unwrap();
    assert!(store.count("concepts").unwrap() >= 2);
}

#[test]
fn a_concept_mentioned_by_a_second_source_keeps_its_first_note_untouched() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open(directory.path().join("index.sqlite3")).unwrap();
    let capture = CaptureService::new(&store);
    let pipeline = DeterministicPipeline::new(&store, directory.path());

    let first = capture
        .capture(CaptureRequest::Text {
            title: "Docker basics",
            content: "An introduction to Docker containers.",
        })
        .unwrap();
    pipeline
        .process_enriched(
            &first,
            text_content("Docker basics"),
            Some(&KnowledgeEnrichment {
                context: String::new(),
                title: "Docker basics".to_owned(),
                summary: "An introduction to Docker.".to_owned(),
                concepts: vec!["Docker".to_owned()],
                concept_definitions: vec![ConceptDefinition {
                    name: "Docker".to_owned(),
                    definition: "The original Docker definition, written first.".to_owned(),
                }],
                projects: vec![],
                areas: vec![],
                tags: vec![],
            }),
        )
        .unwrap();
    let concept = store.resolve_concept("Docker").unwrap().unwrap();
    let note_path = concept.note_path.clone().unwrap();
    let original_note = fs::read_to_string(directory.path().join(&note_path)).unwrap();
    assert!(original_note.contains("The original Docker definition, written first."));

    let second = capture
        .capture(CaptureRequest::Text {
            title: "Docker networking",
            content: "A follow-up video that also mentions Docker.",
        })
        .unwrap();
    pipeline
        .process_enriched(
            &second,
            text_content("Docker networking"),
            Some(&KnowledgeEnrichment {
                context: String::new(),
                title: "Docker networking".to_owned(),
                summary: "Docker networking concepts.".to_owned(),
                concepts: vec!["Docker".to_owned()],
                concept_definitions: vec![ConceptDefinition {
                    name: "Docker".to_owned(),
                    definition: "A different definition that must NOT overwrite the first one."
                        .to_owned(),
                }],
                projects: vec![],
                areas: vec![],
                tags: vec![],
            }),
        )
        .unwrap();

    let unchanged_note = fs::read_to_string(directory.path().join(&note_path)).unwrap();
    assert_eq!(original_note, unchanged_note);
    let concept_again = store.resolve_concept("Docker").unwrap().unwrap();
    assert_eq!(concept_again.note_path, Some(note_path));
}

#[test]
fn blank_extraction_is_rejected_without_leasing_or_state_mutation() {
    let directory = tempdir().unwrap();
    let store = KnowledgeStore::open_in_memory().unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::Text {
            title: "Valid",
            content: "valid input",
        })
        .unwrap();
    let error = DeterministicPipeline::new(&store, directory.path())
        .process(
            &receipt,
            ExtractedContent {
                title: "Valid".to_owned(),
                body: "  ".to_owned(),
                locators: vec![],
                used_fallback: false,
            },
        )
        .unwrap_err();
    assert!(error.to_string().contains("must not be blank"));
    assert_eq!(
        store.source(&receipt.source.id).unwrap().unwrap().state,
        ProcessingState::Pending
    );
    assert_eq!(store.job(&receipt.job.id).unwrap().unwrap().attempt, 0);
}

#[test]
fn concept_notes_carry_the_same_context_field() {
    let (store, directory) = seeded_store();
    let receipt = capture_text(
        &store,
        "Optimizers",
        "Adam adapts the learning rate per weight.",
    );
    DeterministicPipeline::new(&store, directory.path())
        .process_enriched(
            &receipt,
            content_with("Optimizers", "Adam adapts the learning rate per weight."),
            Some(&KnowledgeEnrichment {
                context: "Compares Adam and SGD for training stability.".to_owned(),
                title: "Optimizers".to_owned(),
                summary: "A detailed comparison of Adam and SGD covering stability, tuning and convergence behaviour.".to_owned(),
                concepts: vec!["Adam".to_owned()],
                concept_definitions: vec![ConceptDefinition {
                    name: "Adam".to_owned(),
                    definition: "An optimizer that adapts the learning rate per parameter. It combines momentum with RMSProp.".to_owned(),
                }],
                projects: vec!["Machine Learning".to_owned()],
                areas: Vec::new(),
                tags: Vec::new(),
            }),
        )
        .unwrap();

    let concept = store.resolve_concept("Adam").unwrap().unwrap();
    let note_path = concept.note_path.expect("a first-seen concept gets a note");
    let note = fs::read_to_string(directory.path().join(&note_path)).unwrap();
    assert!(
        note.contains("context: \"An optimizer that adapts the learning rate per parameter.\""),
        "concept note frontmatter was: {note}"
    );
}

#[test]
fn enriched_note_uses_the_models_context_verbatim_and_falls_back_without_it() {
    let (store, directory) = seeded_store();
    let receipt = capture_text(
        &store,
        "Routing",
        "Model routing balances cost and quality.",
    );
    let enriched = DeterministicPipeline::new(&store, directory.path())
        .process_enriched(
            &receipt,
            content_with("Routing", "Model routing balances cost and quality."),
            Some(&KnowledgeEnrichment {
                context: "Explains how model routing trades cost against answer quality."
                    .to_owned(),
                title: "Routing".to_owned(),
                summary:
                    "A detailed look at routing policies, budgets and fallbacks across providers."
                        .to_owned(),
                concepts: vec!["Routing".to_owned()],
                concept_definitions: Vec::new(),
                projects: Vec::new(),
                areas: Vec::new(),
                tags: Vec::new(),
            }),
        )
        .unwrap();
    let note = fs::read_to_string(directory.path().join(&enriched.document.path)).unwrap();
    assert!(
        note.contains(
            "context: \"Explains how model routing trades cost against answer quality.\""
        )
    );

    let plain_receipt = capture_text(&store, "Budgets", "Budgets cap spending. They fail closed.");
    let plain = DeterministicPipeline::new(&store, directory.path())
        .process_enriched(
            &plain_receipt,
            content_with("Budgets", "Budgets cap spending. They fail closed."),
            None,
        )
        .unwrap();
    let plain_note = fs::read_to_string(directory.path().join(&plain.document.path)).unwrap();
    assert!(
        plain_note.contains("context: \"Budgets cap spending.\""),
        "unenriched note frontmatter was: {plain_note}"
    );
}
