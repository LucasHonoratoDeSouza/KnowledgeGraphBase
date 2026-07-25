use std::path::Path;

use knowledge_domain::SourceKind;
use knowledge_storage::{IngestionJob, KnowledgeStore, SourceDraft, SourceRecord};
use serde::{Deserialize, Serialize};

use crate::{IngestionError, PIPELINE_VERSION, content_hash, normalize_url, validate_text};

const MAX_PDF_BYTES: usize = 250 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureRequest<'a> {
    Url(&'a str),
    Text {
        title: &'a str,
        content: &'a str,
    },
    Markdown {
        file_name: &'a str,
        content: &'a str,
    },
    MeetingNote {
        title: &'a str,
        content: &'a str,
    },
    Pdf {
        file_name: &'a str,
        bytes: &'a [u8],
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureReceipt {
    pub source: SourceRecord,
    pub job: IngestionJob,
    pub duplicate: bool,
}

pub struct CaptureService<'a> {
    store: &'a KnowledgeStore,
}

impl<'a> CaptureService<'a> {
    #[must_use]
    pub const fn new(store: &'a KnowledgeStore) -> Self {
        Self { store }
    }

    /// Validates and persists one source plus its idempotent processing job.
    pub fn capture(&self, request: CaptureRequest<'_>) -> Result<CaptureReceipt, IngestionError> {
        let (draft, operation) = match request {
            CaptureRequest::Url(input) => {
                let normalized = normalize_url(input)?;
                let kind = if normalized.starts_with("https://www.youtube.com/watch") {
                    SourceKind::YouTube
                } else {
                    SourceKind::Web
                };
                let title = if kind == SourceKind::YouTube {
                    "YouTube source"
                } else {
                    "Web source"
                };
                (
                    SourceDraft {
                        kind,
                        original_uri: input.trim().to_owned(),
                        normalized_uri: normalized.clone(),
                        content_hash: content_hash(normalized.as_bytes()),
                        pipeline_version: PIPELINE_VERSION.to_owned(),
                        title: title.to_owned(),
                    },
                    "fetch",
                )
            }
            CaptureRequest::Text { title, content } => {
                validate_text(content)?;
                text_draft(SourceKind::Text, title, content, "text")?
            }
            CaptureRequest::MeetingNote { title, content } => {
                validate_text(content)?;
                text_draft(SourceKind::Note, title, content, "meeting")?
            }
            CaptureRequest::Markdown { file_name, content } => {
                validate_text(content)?;
                if Path::new(file_name)
                    .extension()
                    .and_then(|value| value.to_str())
                    != Some("md")
                {
                    return Err(IngestionError::UnsupportedSource);
                }
                text_draft(SourceKind::Markdown, file_name, content, "markdown")?
            }
            CaptureRequest::Pdf { file_name, bytes } => {
                if bytes.len() > MAX_PDF_BYTES {
                    return Err(IngestionError::FileTooLarge);
                }
                if bytes.is_empty()
                    || Path::new(file_name)
                        .extension()
                        .and_then(|value| value.to_str())
                        != Some("pdf")
                {
                    return Err(IngestionError::UnsupportedSource);
                }
                let hash = content_hash(bytes);
                (
                    SourceDraft {
                        kind: SourceKind::Pdf,
                        original_uri: file_name.to_owned(),
                        normalized_uri: format!("pdf:{hash}"),
                        content_hash: hash,
                        pipeline_version: PIPELINE_VERSION.to_owned(),
                        title: file_name.trim_end_matches(".pdf").to_owned(),
                    },
                    "extract",
                )
            }
        };
        let previous = self
            .store
            .source_by_identity_parts(
                &draft.normalized_uri,
                &draft.content_hash,
                &draft.pipeline_version,
            )
            .map_err(storage_error)?;
        let source = self.store.create_source(&draft).map_err(storage_error)?;
        let key = format!("{}:{operation}:{}", source.id, source.pipeline_version);
        let job = self
            .store
            .enqueue_job(&source.id, &key)
            .map_err(storage_error)?;
        Ok(CaptureReceipt {
            source,
            job,
            duplicate: previous.is_some(),
        })
    }
}

fn text_draft(
    kind: SourceKind,
    title: &str,
    content: &str,
    prefix: &str,
) -> Result<(SourceDraft, &'static str), IngestionError> {
    if title.trim().is_empty() {
        return Err(IngestionError::BlankText);
    }
    let hash = content_hash(content.as_bytes());
    Ok((
        SourceDraft {
            kind,
            original_uri: title.to_owned(),
            normalized_uri: format!("{prefix}:{hash}"),
            content_hash: hash,
            pipeline_version: PIPELINE_VERSION.to_owned(),
            title: title.trim().to_owned(),
        },
        "process",
    ))
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned StorageError values"
)]
fn storage_error(error: knowledge_storage::StorageError) -> IngestionError {
    IngestionError::Storage(error.to_string())
}
