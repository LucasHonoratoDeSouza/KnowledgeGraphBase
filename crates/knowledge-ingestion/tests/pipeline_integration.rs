use std::fs;

use knowledge_domain::{ProcessingState, SourceKind};
use knowledge_ingestion::{
    CaptureRequest, CaptureService, DeterministicPipeline, ExtractedContent, SourceLocator,
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
    assert!(store.count("concepts").unwrap() >= 2);
    let markdown = fs::read_to_string(directory.path().join(&result.document.path)).unwrap();
    assert!(markdown.contains("# RAG architecture"));
    assert!(markdown.contains("## Summary"));
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
