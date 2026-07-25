use knowledge_ingestion::{
    ExtractionArtifact, IngestionError, MAX_CONTEXT_CHARACTERS, MAX_TEXT_BYTES, PIPELINE_VERSION,
    SourceLocator, chunk_text, content_hash, deterministic_context, normalize_url, parse_markdown,
    render_markdown, sanitize_html, validate_text,
};

#[test]
fn normalizes_host_fragment_tracking_and_query_order() {
    assert_eq!(
        normalize_url("HTTPS://Example.COM/a?utm_source=x&b=2&a=1#part").unwrap(),
        "https://example.com/a?a=1&b=2"
    );
}

#[test]
fn normalizes_youtube_watch_and_short_links_to_one_identity() {
    let watch = normalize_url("https://youtube.com/watch?v=abc123&utm_source=x").unwrap();
    let short = normalize_url("https://youtu.be/abc123?t=90").unwrap();
    assert_eq!(watch, "https://www.youtube.com/watch?v=abc123");
    assert_eq!(watch, short);
}

#[test]
fn normalizes_youtube_shorts_identity() {
    assert_eq!(
        normalize_url("https://www.youtube.com/shorts/abc123").unwrap(),
        "https://www.youtube.com/watch?v=abc123"
    );
}

#[test]
fn rejects_non_http_url_scheme() {
    assert_eq!(
        normalize_url("file:///etc/passwd"),
        Err(IngestionError::UnsafeScheme)
    );
}

#[test]
fn rejects_malformed_url() {
    assert_eq!(normalize_url("not a url"), Err(IngestionError::InvalidUrl));
}

#[test]
fn content_hash_is_stable_and_content_sensitive() {
    assert_eq!(content_hash(b"same"), content_hash(b"same"));
    assert_ne!(content_hash(b"same"), content_hash(b"different"));
    assert_eq!(content_hash(b"same").len(), 64);
}

#[test]
fn text_validation_rejects_blank_without_persistence() {
    assert_eq!(validate_text(" \n"), Err(IngestionError::BlankText));
}

#[test]
fn text_validation_enforces_twenty_mebibyte_boundary() {
    assert!(validate_text(&"a".repeat(MAX_TEXT_BYTES)).is_ok());
    assert_eq!(
        validate_text(&"a".repeat(MAX_TEXT_BYTES + 1)),
        Err(IngestionError::TextTooLarge)
    );
}

#[test]
fn chunking_preserves_heading_locators_and_order() {
    let chunks = chunk_text("# Intro\nAlpha beta.\n# Details\nGamma delta.", 30);
    assert_eq!(chunks.len(), 2);
    assert_eq!(chunks[0].ordinal, 0);
    assert_eq!(chunks[0].locator, "section:Intro");
    assert_eq!(chunks[1].locator, "section:Details");
}

#[test]
fn chunking_respects_character_bound_for_long_lines() {
    let chunks = chunk_text("abcdefghij", 4);
    assert_eq!(
        chunks
            .iter()
            .map(|chunk| chunk.text.as_str())
            .collect::<Vec<_>>(),
        ["abcd", "efgh", "ij"]
    );
}

#[test]
fn chunking_never_splits_inside_utf8_code_point() {
    let chunks = chunk_text("áéíóú", 3);
    assert_eq!(chunks.concat_text_for_test(), "áéíóú");
}

#[test]
fn sanitization_removes_scripts_styles_and_tags() {
    let clean = sanitize_html(
        "<nav>Menu</nav><article>Hello <b>world</b></article><script>alert(1)</script><style>x{}</style>",
    );
    assert_eq!(clean, "Menu Hello world");
    assert!(!clean.contains("alert"));
}

#[test]
fn sanitization_decodes_basic_text_entities() {
    assert_eq!(sanitize_html("A&nbsp;&amp;&nbsp;B"), "A & B");
}

fn artifact() -> ExtractionArtifact {
    ExtractionArtifact {
        title: "PPO Explained".to_owned(),
        source_kind: "youtube".to_owned(),
        original_uri: "https://www.youtube.com/watch?v=ppo".to_owned(),
        content_hash: content_hash(b"transcript"),
        context: "Explains how PPO constrains policy updates in RL training.".to_owned(),
        framing: String::new(),
        summary: "PPO constrains policy updates.".to_owned(),
        concepts: vec!["PPO".to_owned(), "Reinforcement Learning".to_owned()],
        notes: vec!["Clipping stabilizes training.".to_owned()],
        references: vec![SourceLocator::YouTube {
            start_seconds: 125,
            segment: "Clipped objective".to_owned(),
        }],
        full_content: "[02:05] The clipped objective preserves stable policy updates.".to_owned(),
    }
}

#[test]
fn rendering_is_byte_stable_for_equal_artifacts() {
    assert_eq!(render_markdown(&artifact()), render_markdown(&artifact()));
}

#[test]
fn rendered_markdown_contains_versioned_frontmatter_and_wiki_links() {
    let markdown = render_markdown(&artifact());
    assert!(markdown.contains(&format!("pipeline_version: {PIPELINE_VERSION}")));
    assert!(markdown.contains("- [[PPO]]"));
    assert!(markdown.contains("YouTube 2:05 — Clipped objective"));
    assert!(markdown.contains("## Full transcript"));
}

#[test]
fn pdf_locator_contains_page_and_chunk() {
    assert_eq!(
        SourceLocator::Pdf { page: 7, chunk: 2 }.markdown_reference(),
        "PDF page 7, chunk 2"
    );
}

#[test]
fn web_locator_contains_url_section_and_retrieval_date() {
    let locator = SourceLocator::Web {
        url: "https://example.com/paper".to_owned(),
        section: "Methods".to_owned(),
        retrieved_at: "2026-07-24".to_owned(),
    };
    assert_eq!(
        locator.markdown_reference(),
        "[Methods](https://example.com/paper) — retrieved 2026-07-24"
    );
}

#[test]
fn parser_preserves_frontmatter_and_body_bytes() {
    let input = "---\ntitle: Test\n---\n# Body\n\n[[Link]]\n";
    let parsed = parse_markdown(input).unwrap();
    assert_eq!(parsed.frontmatter, Some("title: Test"));
    assert_eq!(parsed.body, "# Body\n\n[[Link]]\n");
}

#[test]
fn parser_keeps_malformed_frontmatter_readable_as_typed_error() {
    assert_eq!(
        parse_markdown("---\ntitle: Test\n# Body").unwrap_err(),
        IngestionError::UnterminatedFrontmatter
    );
}

trait ChunkText {
    fn concat_text_for_test(&self) -> String;
}

impl ChunkText for Vec<knowledge_storage::ChunkDraft> {
    fn concat_text_for_test(&self) -> String {
        self.iter().map(|chunk| chunk.text.as_str()).collect()
    }
}

#[test]
fn rendered_note_carries_a_one_line_context_field_after_source_kind() {
    let markdown = render_markdown(&artifact());
    let frontmatter = parse_markdown(&markdown).unwrap().frontmatter.unwrap();
    let lines: Vec<&str> = frontmatter.lines().collect();
    let source_kind = lines
        .iter()
        .position(|line| line.starts_with("source_kind:"))
        .unwrap();
    assert_eq!(
        lines[source_kind + 1],
        "context: \"Explains how PPO constrains policy updates in RL training.\""
    );
}

#[test]
fn context_field_stays_parseable_when_the_value_has_quotes_and_newlines() {
    let mut noisy = artifact();
    noisy.context = "Covers \"clipping\"\nand trust regions.".to_owned();
    let markdown = render_markdown(&noisy);
    let frontmatter = parse_markdown(&markdown).unwrap().frontmatter.unwrap();
    assert!(frontmatter.contains(r#"context: "Covers \"clipping\" and trust regions.""#));
    assert_eq!(
        frontmatter
            .lines()
            .filter(|line| line.starts_with("context:"))
            .count(),
        1
    );
}

#[test]
fn deterministic_context_takes_the_first_sentence_and_caps_it() {
    assert_eq!(
        deterministic_context("Docker", "Docker packages apps. It uses images."),
        "Docker packages apps."
    );
    let long = "x".repeat(400);
    let capped = deterministic_context("Title", &long);
    assert_eq!(capped.chars().count(), MAX_CONTEXT_CHARACTERS);
    assert!(capped.ends_with('…'));
}

#[test]
fn deterministic_context_falls_back_to_the_title_for_an_empty_body() {
    assert_eq!(deterministic_context("Reading list", "   "), "Reading list");
}

#[test]
fn framing_renders_in_its_own_section_and_is_omitted_when_absent() {
    let plain = render_markdown(&artifact());
    assert!(!plain.contains("## Notes from you"));

    let mut framed = artifact();
    framed.framing = "assisti esse video para o projeto de RL".to_owned();
    let markdown = render_markdown(&framed);
    let notes = markdown
        .split("## Notes from you\n\n")
        .nth(1)
        .expect("framing section is rendered");
    assert!(notes.starts_with("assisti esse video para o projeto de RL"));
    assert!(
        markdown.find("## Summary").unwrap() < markdown.find("## Notes from you").unwrap(),
        "framing follows the human summary"
    );
}
