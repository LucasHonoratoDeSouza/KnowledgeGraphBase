#![allow(
    clippy::missing_errors_doc,
    reason = "public deterministic helpers share the typed IngestionError contract"
)]
//! Deterministic capture normalization, chunking, provenance, and Markdown rendering.

use std::fmt::Write as _;

use knowledge_storage::ChunkDraft;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

mod adapters;
mod capture;
mod pipeline;

pub use adapters::{
    ExtractedContent, NativeContentAdapter, TranscriptSegment, YouTubeTranscriptionFallback,
    extract_article_html, extract_youtube_page,
};
pub use capture::{CaptureReceipt, CaptureRequest, CaptureService};
pub use pipeline::{
    ConceptDefinition, DeterministicPipeline, KnowledgeEnrichment, PipelineResult, PlacementRequest,
};

pub const PIPELINE_VERSION: &str = "ingestion-v1";
pub const MAX_URL_LENGTH: usize = 2_048;
pub const MAX_TEXT_BYTES: usize = 20 * 1024 * 1024;
/// Upper bound for the `context:` mini-summary: long enough for one useful
/// sentence, short enough that a whole folder's worth stays cheap to send.
pub const MAX_CONTEXT_CHARACTERS: usize = 240;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum IngestionError {
    #[error("source URL is invalid")]
    InvalidUrl,
    #[error("source URL must use http or https")]
    UnsafeScheme,
    #[error("source URL exceeds 2048 characters")]
    UrlTooLong,
    #[error("source text exceeds 20 MiB")]
    TextTooLarge,
    #[error("source text must not be blank")]
    BlankText,
    #[error("generated Markdown frontmatter is unterminated")]
    UnterminatedFrontmatter,
    #[error("source type is unsupported")]
    UnsupportedSource,
    #[error("source file exceeds its documented bound")]
    FileTooLarge,
    #[error("remote source is not safe to fetch")]
    UnsafeRemoteAddress,
    #[error("remote source failed: {0}")]
    Remote(String),
    #[error("PDF has no usable text layer; OCR fallback is required")]
    MissingPdfText,
    #[error("YouTube transcript is unavailable; paste a transcript or configure transcription")]
    MissingTranscript,
    #[error("local knowledge storage failed: {0}")]
    Storage(String),
    #[error("the local ingestion queue is currently at capacity")]
    PipelineBusy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum SourceLocator {
    Pdf {
        page: u32,
        chunk: u32,
    },
    YouTube {
        start_seconds: u32,
        segment: String,
    },
    Web {
        url: String,
        section: String,
        retrieved_at: String,
    },
    Note {
        heading: String,
    },
}

impl SourceLocator {
    #[must_use]
    pub fn markdown_reference(&self) -> String {
        match self {
            Self::Pdf { page, chunk } => format!("PDF page {page}, chunk {chunk}"),
            Self::YouTube {
                start_seconds,
                segment,
            } => format!(
                "YouTube {}:{:02} — {segment}",
                start_seconds / 60,
                start_seconds % 60
            ),
            Self::Web {
                url,
                section,
                retrieved_at,
            } => format!("[{section}]({url}) — retrieved {retrieved_at}"),
            Self::Note { heading } => format!("Local note — {heading}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionArtifact {
    pub title: String,
    pub source_kind: String,
    pub original_uri: String,
    pub content_hash: String,
    /// One machine-oriented line describing what this note is about. Bulk
    /// features (vault-aware filing, the Librarian pass) read this instead of
    /// the body so their cost scales with note count, not note size.
    pub context: String,
    /// The user's own framing typed alongside the link or file, kept verbatim
    /// so their intent survives next to the extracted source (#4).
    pub framing: String,
    pub summary: String,
    pub concepts: Vec<String>,
    pub notes: Vec<String>,
    pub references: Vec<SourceLocator>,
    pub full_content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedMarkdown<'a> {
    pub frontmatter: Option<&'a str>,
    pub body: &'a str,
}

pub fn normalize_url(input: &str) -> Result<String, IngestionError> {
    if input.len() > MAX_URL_LENGTH {
        return Err(IngestionError::UrlTooLong);
    }
    let mut url = Url::parse(input.trim()).map_err(|_| IngestionError::InvalidUrl)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(IngestionError::UnsafeScheme);
    }
    url.set_fragment(None);
    if let Some(video_id) = youtube_video_id(&url) {
        return Ok(format!("https://www.youtube.com/watch?v={video_id}"));
    }
    let mut pairs = url
        .query_pairs()
        .filter(|(key, _)| {
            !matches!(
                key.as_ref(),
                "fbclid" | "gclid" | "mc_cid" | "mc_eid" | "ref" | "source"
            ) && !key.starts_with("utm_")
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    pairs.sort();
    url.set_query(None);
    if !pairs.is_empty() {
        url.query_pairs_mut().extend_pairs(pairs);
    }
    Ok(url.into())
}

fn youtube_video_id(url: &Url) -> Option<String> {
    let host = url.host_str()?.trim_start_matches("www.");
    if host == "youtu.be" {
        return url
            .path_segments()?
            .find(|segment| !segment.is_empty())
            .map(ToOwned::to_owned);
    }
    if matches!(host, "youtube.com" | "m.youtube.com") {
        if url.path() == "/watch" {
            return url
                .query_pairs()
                .find_map(|(key, value)| (key == "v").then(|| value.into_owned()));
        }
        if let Some(id) = url.path().strip_prefix("/shorts/") {
            return (!id.is_empty()).then(|| id.split('/').next().unwrap_or(id).to_owned());
        }
    }
    None
}

#[must_use]
pub fn content_hash(content: &[u8]) -> String {
    blake3::hash(content).to_hex().to_string()
}

pub fn validate_text(content: &str) -> Result<(), IngestionError> {
    if content.len() > MAX_TEXT_BYTES {
        Err(IngestionError::TextTooLarge)
    } else if content.trim().is_empty() {
        Err(IngestionError::BlankText)
    } else {
        Ok(())
    }
}

#[must_use]
pub fn chunk_text(content: &str, max_chars: usize) -> Vec<ChunkDraft> {
    if content.trim().is_empty() || max_chars == 0 {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut buffer = String::new();
    let mut section = "document".to_owned();
    let flush = |buffer: &mut String, section: &str, chunks: &mut Vec<ChunkDraft>| {
        let text = buffer.trim();
        if !text.is_empty() {
            let ordinal = u32::try_from(chunks.len()).unwrap_or(u32::MAX);
            chunks.push(ChunkDraft::new(
                ordinal,
                text,
                u32::try_from(text.split_whitespace().count()).unwrap_or(u32::MAX),
                format!("section:{section}"),
                content_hash(text.as_bytes()),
            ));
        }
        buffer.clear();
    };

    for line in content.lines() {
        if let Some(heading) = line.trim().strip_prefix('#') {
            if !buffer.trim().is_empty() {
                flush(&mut buffer, &section, &mut chunks);
            }
            heading
                .trim_start_matches('#')
                .trim()
                .clone_into(&mut section);
        }
        if buffer.len() + line.len() + 1 > max_chars && !buffer.trim().is_empty() {
            flush(&mut buffer, &section, &mut chunks);
        }
        if line.len() > max_chars {
            for slice in split_on_char_boundary(line, max_chars) {
                if !buffer.is_empty() {
                    flush(&mut buffer, &section, &mut chunks);
                }
                buffer.push_str(slice);
                flush(&mut buffer, &section, &mut chunks);
            }
        } else {
            buffer.push_str(line);
            buffer.push('\n');
        }
    }
    flush(&mut buffer, &section, &mut chunks);
    chunks
}

fn split_on_char_boundary(value: &str, max_chars: usize) -> Vec<&str> {
    let mut slices = Vec::new();
    let mut start = 0;
    while start < value.len() {
        let mut end = (start + max_chars).min(value.len());
        while end > start && !value.is_char_boundary(end) {
            end -= 1;
        }
        if end == start {
            end = value[start..]
                .char_indices()
                .nth(1)
                .map_or(value.len(), |(offset, _)| start + offset);
        }
        slices.push(&value[start..end]);
        start = end;
    }
    slices
}

#[must_use]
pub fn sanitize_html(html: &str) -> String {
    let without_blocks = remove_block(html, "script");
    let without_blocks = remove_block(&without_blocks, "style");
    let mut output = String::with_capacity(without_blocks.len());
    let mut inside_tag = false;
    for character in without_blocks.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => {
                inside_tag = false;
                output.push(' ');
            }
            _ if !inside_tag => output.push(character),
            _ => {}
        }
    }
    output
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn remove_block(input: &str, tag: &str) -> String {
    let mut output = input.to_owned();
    let opening = format!("<{tag}");
    let closing = format!("</{tag}>");
    loop {
        let lowercase = output.to_lowercase();
        let Some(start) = lowercase.find(&opening) else {
            break;
        };
        let Some(relative_end) = lowercase[start..].find(&closing) else {
            output.truncate(start);
            break;
        };
        let end = start + relative_end + closing.len();
        output.replace_range(start..end, " ");
    }
    output
}

#[must_use]
pub fn render_markdown(artifact: &ExtractionArtifact) -> String {
    let mut markdown = String::new();
    writeln!(markdown, "---").expect("writing a String cannot fail");
    writeln!(markdown, "title: {}", yaml_scalar(&artifact.title))
        .expect("writing a String cannot fail");
    writeln!(markdown, "source_kind: {}", artifact.source_kind)
        .expect("writing a String cannot fail");
    writeln!(
        markdown,
        "context: {}",
        yaml_scalar(&one_line(&artifact.context))
    )
    .expect("writing a String cannot fail");
    writeln!(markdown, "source: {}", yaml_scalar(&artifact.original_uri))
        .expect("writing a String cannot fail");
    writeln!(markdown, "content_hash: {}", artifact.content_hash)
        .expect("writing a String cannot fail");
    writeln!(markdown, "pipeline_version: {PIPELINE_VERSION}")
        .expect("writing a String cannot fail");
    writeln!(markdown, "---\n").expect("writing a String cannot fail");
    writeln!(markdown, "# {}\n", artifact.title).expect("writing a String cannot fail");
    writeln!(markdown, "## Summary\n\n{}\n", artifact.summary)
        .expect("writing a String cannot fail");
    if !artifact.framing.trim().is_empty() {
        writeln!(
            markdown,
            "## Notes from you\n\n{}\n",
            artifact.framing.trim()
        )
        .expect("writing a String cannot fail");
    }
    writeln!(markdown, "## Main Concepts\n").expect("writing a String cannot fail");
    for concept in &artifact.concepts {
        writeln!(markdown, "- [[{concept}]]").expect("writing a String cannot fail");
    }
    writeln!(markdown, "\n## Notes\n").expect("writing a String cannot fail");
    for note in &artifact.notes {
        writeln!(markdown, "- {note}").expect("writing a String cannot fail");
    }
    let content_heading = match artifact.source_kind.as_str() {
        "pdf" => "Full extracted document",
        "youtube" => "Full transcript",
        _ => "Full captured content",
    };
    writeln!(markdown, "\n## {content_heading}\n").expect("writing a String cannot fail");
    writeln!(markdown, "{}", artifact.full_content).expect("writing a String cannot fail");
    writeln!(markdown, "\n## Source\n").expect("writing a String cannot fail");
    for reference in &artifact.references {
        writeln!(markdown, "- {}", reference.markdown_reference())
            .expect("writing a String cannot fail");
    }
    markdown
}

fn yaml_scalar(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Collapses any whitespace run — including newlines — into single spaces so a
/// frontmatter scalar stays on one line whatever the model returned.
fn one_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Deterministic stand-in for the model's `context` line: the body's first
/// sentence, capped at [`MAX_CONTEXT_CHARACTERS`]. Notes captured with no AI
/// configured still carry a usable mini-summary (AD-009).
#[must_use]
pub fn deterministic_context(title: &str, body: &str) -> String {
    let normalized = one_line(body);
    let sentence = normalized
        .split_inclusive(['.', '!', '?'])
        .next()
        .unwrap_or(&normalized)
        .trim()
        .to_owned();
    let candidate = if sentence.is_empty() {
        one_line(title)
    } else {
        sentence
    };
    if candidate.chars().count() <= MAX_CONTEXT_CHARACTERS {
        return candidate;
    }
    let truncated: String = candidate
        .chars()
        .take(MAX_CONTEXT_CHARACTERS - 1)
        .collect::<String>()
        .trim_end()
        .to_owned();
    format!("{truncated}…")
}

pub fn parse_markdown(content: &str) -> Result<ParsedMarkdown<'_>, IngestionError> {
    if let Some(rest) = content.strip_prefix("---\n") {
        let Some(end) = rest.find("\n---\n") else {
            return Err(IngestionError::UnterminatedFrontmatter);
        };
        Ok(ParsedMarkdown {
            frontmatter: Some(&rest[..end]),
            body: &rest[end + 5..],
        })
    } else {
        Ok(ParsedMarkdown {
            frontmatter: None,
            body: content,
        })
    }
}
