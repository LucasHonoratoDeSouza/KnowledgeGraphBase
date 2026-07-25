use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use knowledge_domain::{ProcessingState, RelationType, SourceKind};
use knowledge_storage::{
    ConceptDraft, DocumentDraft, DocumentRecord, EdgeDraft, JobState, JournalFault, KnowledgeStore,
};
use serde::{Deserialize, Serialize};

use crate::{
    CaptureReceipt, ExtractedContent, ExtractionArtifact, IngestionError, SourceLocator,
    chunk_text, content_hash, render_markdown, validate_text,
};

const WORKER: &str = "native-ingestion";
const CHUNK_CHARACTERS: usize = 3_200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineResult {
    pub document: DocumentRecord,
    pub reused: bool,
}

pub struct DeterministicPipeline<'a> {
    store: &'a KnowledgeStore,
    vault_root: PathBuf,
}

impl<'a> DeterministicPipeline<'a> {
    #[must_use]
    pub fn new(store: &'a KnowledgeStore, vault_root: impl AsRef<Path>) -> Self {
        Self {
            store,
            vault_root: vault_root.as_ref().to_path_buf(),
        }
    }

    pub fn process(
        &self,
        receipt: &CaptureReceipt,
        content: ExtractedContent,
    ) -> Result<PipelineResult, IngestionError> {
        validate_text(&content.body)?;
        if receipt.duplicate && receipt.source.state == ProcessingState::Completed {
            let document = self
                .store
                .document_for_source(&receipt.source.id)
                .map_err(storage_error)?
                .ok_or_else(|| {
                    IngestionError::Storage("completed source has no document".to_owned())
                })?;
            return Ok(PipelineResult {
                document,
                reused: true,
            });
        }
        if receipt.job.state == JobState::Completed {
            let document = self
                .store
                .document_for_source(&receipt.source.id)
                .map_err(storage_error)?
                .ok_or_else(|| {
                    IngestionError::Storage("completed job has no document".to_owned())
                })?;
            return Ok(PipelineResult {
                document,
                reused: true,
            });
        }
        let leased = self
            .store
            .lease_job(&receipt.job.id, WORKER, unix_seconds(), 120)
            .map_err(storage_error)?;
        if leased.is_none() {
            return Err(IngestionError::PipelineBusy);
        }
        match self.process_leased(receipt, content) {
            Ok(result) => Ok(result),
            Err(error) => {
                if self
                    .store
                    .source(&receipt.source.id)
                    .ok()
                    .flatten()
                    .is_some_and(|source| source.state.is_active())
                {
                    let _ = self
                        .store
                        .transition_source(&receipt.source.id, ProcessingState::Failed);
                }
                let _ = self
                    .store
                    .fail_job(&receipt.job.id, WORKER, &error.to_string());
                Err(error)
            }
        }
    }

    fn process_leased(
        &self,
        receipt: &CaptureReceipt,
        mut content: ExtractedContent,
    ) -> Result<PipelineResult, IngestionError> {
        self.transition(&receipt.source.id, ProcessingState::Fetching)?;
        self.transition(&receipt.source.id, ProcessingState::Extracting)?;
        self.transition(&receipt.source.id, ProcessingState::Processing)?;

        if content.title.trim().is_empty() {
            content.title.clone_from(&receipt.source.title);
        }
        if content.locators.is_empty() {
            content.locators.push(SourceLocator::Note {
                heading: content.title.clone(),
            });
        }
        let summary = summarize(&content.body);
        let concepts = concept_candidates(&content.title, &content.body);
        let mut chunks = chunk_text(&content.body, CHUNK_CHARACTERS);
        for (index, chunk) in chunks.iter_mut().enumerate() {
            let reference = &content.locators[index.min(content.locators.len() - 1)];
            chunk.locator = serde_json::to_string(reference)
                .map_err(|error| IngestionError::Storage(error.to_string()))?;
        }
        let artifact = ExtractionArtifact {
            title: content.title.clone(),
            source_kind: source_kind(receipt.source.kind).to_owned(),
            original_uri: receipt.source.original_uri.clone(),
            content_hash: receipt.source.content_hash.clone(),
            summary: summary.clone(),
            concepts: concepts.clone(),
            notes: chunks.iter().map(|chunk| chunk.text.clone()).collect(),
            references: content.locators,
        };
        let markdown = render_markdown(&artifact);
        let path = artifact_path(&content.title, &receipt.source.id);
        self.store
            .publish_markdown(
                &self.vault_root,
                &path,
                markdown.as_bytes(),
                JournalFault::None,
            )
            .map_err(storage_error)?;

        self.transition(&receipt.source.id, ProcessingState::Indexing)?;
        let document = self
            .store
            .save_document(
                &DocumentDraft {
                    source_id: receipt.source.id.clone(),
                    path,
                    title: content.title,
                    summary,
                    content_hash: content_hash(markdown.as_bytes()),
                },
                &chunks,
            )
            .map_err(storage_error)?;
        self.persist_graph(&concepts, &document)?;
        self.transition(&receipt.source.id, ProcessingState::Completed)?;
        self.store
            .complete_job(&receipt.job.id, WORKER)
            .map_err(storage_error)?;
        Ok(PipelineResult {
            document,
            reused: false,
        })
    }

    fn persist_graph(
        &self,
        concepts: &[String],
        document: &DocumentRecord,
    ) -> Result<(), IngestionError> {
        let records = concepts
            .iter()
            .map(|name| self.store.upsert_concept(&ConceptDraft::new(name)))
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage_error)?;
        if let Some(root) = records.first() {
            for related in records.iter().skip(1) {
                self.store
                    .add_edge(&EdgeDraft::new(
                        &root.id,
                        &related.id,
                        RelationType::RelatedTo,
                        6_000,
                        &document.id,
                    ))
                    .map_err(storage_error)?;
            }
        }
        Ok(())
    }

    fn transition(&self, source_id: &str, state: ProcessingState) -> Result<(), IngestionError> {
        self.store
            .transition_source(source_id, state)
            .map_err(storage_error)
    }
}

fn summarize(body: &str) -> String {
    let normalized = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut end = normalized.len().min(600);
    while end > 0 && !normalized.is_char_boundary(end) {
        end -= 1;
    }
    let excerpt = normalized[..end].trim();
    if end < normalized.len() {
        format!("{excerpt}…")
    } else {
        excerpt.to_owned()
    }
}

fn concept_candidates(title: &str, body: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "about", "after", "also", "and", "como", "com", "das", "dos", "for", "from", "into",
        "mais", "para", "que", "the", "this", "uma", "with",
    ];
    let mut scores = HashMap::<String, usize>::new();
    for word in body.split(|character: char| !character.is_alphanumeric() && character != '-') {
        let normalized = word.to_lowercase();
        if normalized.chars().count() >= 4 && !STOP.contains(&normalized.as_str()) {
            *scores.entry(normalized).or_default() += 1;
        }
    }
    let mut ranked = scores.into_iter().collect::<Vec<_>>();
    ranked.sort_by(|(left_word, left_score), (right_word, right_score)| {
        right_score
            .cmp(left_score)
            .then_with(|| left_word.cmp(right_word))
    });
    let mut concepts = vec![title.trim().to_owned()];
    concepts.extend(
        ranked
            .into_iter()
            .take(7)
            .map(|(word, _)| title_case(&word)),
    );
    concepts.sort();
    concepts.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    concepts.sort_by_key(|value| (value != title.trim(), value.clone()));
    concepts
}

fn title_case(value: &str) -> String {
    let mut characters = value.chars();
    characters.next().map_or_else(String::new, |first| {
        first.to_uppercase().collect::<String>() + characters.as_str()
    })
}

fn artifact_path(title: &str, source_id: &str) -> String {
    let slug = title
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("-");
    let short_id = source_id.get(..8).unwrap_or(source_id);
    format!(
        "Inbox/{}-{short_id}.md",
        if slug.is_empty() { "knowledge" } else { &slug }
    )
}

const fn source_kind(kind: SourceKind) -> &'static str {
    match kind {
        SourceKind::YouTube => "youtube",
        SourceKind::Pdf => "pdf",
        SourceKind::Web => "web",
        SourceKind::Text => "text",
        SourceKind::Markdown => "markdown",
        SourceKind::Note => "note",
    }
}

fn unix_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| {
            i64::try_from(duration.as_secs()).unwrap_or(i64::MAX)
        })
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned StorageError values"
)]
fn storage_error(error: knowledge_storage::StorageError) -> IngestionError {
    IngestionError::Storage(error.to_string())
}
