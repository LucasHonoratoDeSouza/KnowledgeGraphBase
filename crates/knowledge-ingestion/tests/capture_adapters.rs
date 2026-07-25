use knowledge_ingestion::{
    CaptureRequest, CaptureService, IngestionError, extract_article_html, extract_youtube_page,
};
use knowledge_storage::{JobState, KnowledgeStore};

#[test]
fn text_capture_persists_pending_source_and_queued_job() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::Text {
            title: "Meeting summary",
            content: "We decided to use local retrieval.",
        })
        .unwrap();
    assert_eq!(
        receipt.source.state,
        knowledge_domain::ProcessingState::Pending
    );
    assert_eq!(receipt.job.state, JobState::Queued);
    assert!(!receipt.duplicate);
}

#[test]
fn identical_text_capture_reuses_source_and_job() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let service = CaptureService::new(&store);
    let request = || CaptureRequest::Text {
        title: "Note",
        content: "same content",
    };
    let first = service.capture(request()).unwrap();
    let second = service.capture(request()).unwrap();
    assert_eq!(first.source.id, second.source.id);
    assert_eq!(first.job.id, second.job.id);
    assert!(second.duplicate);
}

#[test]
fn invalid_text_creates_no_source_or_job() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    assert_eq!(
        CaptureService::new(&store).capture(CaptureRequest::Text {
            title: "Blank",
            content: " ",
        }),
        Err(IngestionError::BlankText)
    );
    assert_eq!(store.count("sources").unwrap(), 0);
    assert_eq!(store.count("ingestion_jobs").unwrap(), 0);
}

#[test]
fn meeting_note_uses_same_scalable_pipeline() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::MeetingNote {
            title: "AI team sync",
            content: "Action item: benchmark retrieval.",
        })
        .unwrap();
    assert_eq!(receipt.source.kind, knowledge_domain::SourceKind::Note);
    assert!(receipt.job.idempotency_key.contains(":process:"));
}

#[test]
fn markdown_capture_rejects_wrong_extension_before_persistence() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    assert_eq!(
        CaptureService::new(&store).capture(CaptureRequest::Markdown {
            file_name: "note.txt",
            content: "# Note",
        }),
        Err(IngestionError::UnsupportedSource)
    );
    assert_eq!(store.count("sources").unwrap(), 0);
}

#[test]
fn pdf_capture_rejects_empty_file_before_persistence() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    assert_eq!(
        CaptureService::new(&store).capture(CaptureRequest::Pdf {
            file_name: "paper.pdf",
            bytes: &[],
        }),
        Err(IngestionError::UnsupportedSource)
    );
}

#[test]
fn youtube_url_is_classified_and_normalized_before_enqueue() {
    let store = KnowledgeStore::open_in_memory().unwrap();
    let receipt = CaptureService::new(&store)
        .capture(CaptureRequest::Url("https://youtu.be/abc123?t=90"))
        .unwrap();
    assert_eq!(receipt.source.kind, knowledge_domain::SourceKind::YouTube);
    assert_eq!(
        receipt.source.normalized_uri,
        "https://www.youtube.com/watch?v=abc123"
    );
}

#[test]
fn article_extraction_prefers_article_over_navigation_and_scripts() {
    let extracted = extract_article_html(
        "https://example.com/paper",
        "<html><head><title>Paper</title></head><body><nav>Noise</nav><article><h1>Core</h1><p>Useful evidence.</p></article><script>bad()</script></body></html>",
    );
    assert_eq!(extracted.title, "Paper");
    assert_eq!(extracted.body, "Core Useful evidence.");
    assert!(!extracted.body.contains("Noise"));
}

#[test]
fn article_extraction_falls_back_to_main() {
    let extracted = extract_article_html(
        "https://example.com",
        "<title>Title</title><main>Primary text</main><footer>Footer</footer>",
    );
    assert_eq!(extracted.body, "Primary text");
}

#[test]
fn youtube_page_extracts_caption_track_without_audio_fallback() {
    let page = r#"<title>Agents - YouTube</title><script>var x={"captionTracks":[{"baseUrl":"https://captions.example/track?x=1","languageCode":"en"}]};</script>"#;
    let (title, url) = extract_youtube_page(page).unwrap();
    assert_eq!(title, "Agents");
    assert_eq!(url, "https://captions.example/track?x=1");
}

#[test]
fn youtube_page_without_captions_yields_typed_manual_fallback() {
    assert_eq!(
        extract_youtube_page("<title>No captions - YouTube</title>"),
        Err(IngestionError::MissingTranscript)
    );
}
