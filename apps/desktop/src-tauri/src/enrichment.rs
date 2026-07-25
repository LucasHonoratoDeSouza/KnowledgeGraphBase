use std::collections::HashMap;

use knowledge_ai::{
    AiPort, AiProvider, AiRequest, NativeHttpAiPort, ProviderConnection, SecretResolver,
    StructuredKnowledge,
};
use knowledge_ingestion::{ConceptDefinition, ExtractedContent, KnowledgeEnrichment};
use knowledge_storage::SourceRecord;
use zeroize::Zeroizing;

use crate::knowledge::{EnrichmentContext, KnowledgeEnrichmentPort};

pub struct MainModelEnricher {
    model_id: String,
    ai: NativeHttpAiPort<MainSecretResolver>,
}

impl MainModelEnricher {
    pub fn new(
        model_id: String,
        provider: AiProvider,
        endpoint: String,
        secret: Zeroizing<String>,
    ) -> Result<Self, String> {
        let resolver = MainSecretResolver { provider, secret };
        let connections = HashMap::from([(
            model_id.clone(),
            ProviderConnection {
                provider,
                endpoint,
                model: model_id.clone(),
            },
        )]);
        Ok(Self {
            model_id,
            ai: NativeHttpAiPort::new(resolver, connections).map_err(command_error)?,
        })
    }
}

impl KnowledgeEnrichmentPort for MainModelEnricher {
    fn enrich(
        &self,
        source: &SourceRecord,
        content: &ExtractedContent,
        signals: &EnrichmentContext,
    ) -> Result<KnowledgeEnrichment, String> {
        let selected = bounded_source_selection(&content.body);
        let response = self
            .ai
            .complete(&AiRequest {
                model_id: self.model_id.clone(),
                system: r#"You organize a local personal knowledge base. Return only JSON matching exactly this shape, with no prose before or after it:
{"title": string, "context": string, "summary": string, "concepts": string[], "conceptDefinitions": [{"concept": string, "definition": string}], "relations": [{"source": string, "target": string, "relation": string}], "projects": string[], "areas": string[], "tags": string[]}
"context" is one short machine-readable sentence (max 240 characters) stating what this note is about, written for another model scanning hundreds of notes at once — not marketing copy, no "This note covers" preamble. "relations" entries must always be objects with exactly the "source", "target" and "relation" keys shown above — never a bare string. "conceptDefinitions" must contain exactly one entry per item in "concepts" (same "concept" text, matched exactly), each with a self-contained 1-2 sentence definition — these become each concept's own standalone note the first time it is ever seen, so write them so they make sense out of context, not as a fragment referring back to "the video" or "this source". Preserve nuance, decisions, evidence, caveats, examples, and actionable details in the summary; do not produce a tiny abstract. Use only the supplied source. The source material may be in any language, but you must always write every field — title, summary, concepts, conceptDefinitions, relations, projects, areas, and tags — in English, translating as needed, so the knowledge base stays in one consistent language regardless of source language."#.to_owned(),
                input: format!(
                    "Source kind: {:?}\nOriginal title: {}\n{}{}{}\nSelected source material:\n{}",
                    source.kind,
                    source.title,
                    vault_block(&signals.folders),
                    corrections_block(&signals.corrections),
                    framing_block(&signals.framing),
                    selected
                ),
                max_output_tokens: 3_000,
                temperature_milli: 0,
                schema_version: "knowledge-v1".to_owned(),
            })
            .map_err(command_error)?;
        let structured = StructuredKnowledge::parse(&response.content).map_err(command_error)?;
        Ok(KnowledgeEnrichment {
            title: structured.title,
            context: structured.context,
            summary: structured.summary,
            concepts: structured.concepts,
            concept_definitions: structured
                .concept_definitions
                .into_iter()
                .map(|entry| ConceptDefinition {
                    name: entry.concept,
                    definition: entry.definition,
                })
                .collect(),
            projects: structured.projects,
            areas: structured.areas,
            tags: structured.tags,
        })
    }
}

struct MainSecretResolver {
    provider: AiProvider,
    secret: Zeroizing<String>,
}

impl SecretResolver for MainSecretResolver {
    fn resolve(&self, provider: AiProvider) -> Result<Zeroizing<String>, knowledge_ai::AiError> {
        if provider == self.provider {
            Ok(Zeroizing::new((*self.secret).clone()))
        } else {
            Err(knowledge_ai::AiError::MissingCredential)
        }
    }
}

/// Existing categories, so the model reuses "Machine Learning" instead of
/// inventing "ML" beside it (#5).
fn vault_block(folders: &[String]) -> String {
    if folders.is_empty() {
        return String::new();
    }
    format!(
        "\nFolders that already exist in this vault — reuse one of these exact names when the source fits it, and only propose a new name when none of them do:\n{}\n",
        folders
            .iter()
            .map(|folder| format!("- {folder}"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

/// The user's own recent filing decisions outrank the model's inference
/// (KOS-051), so they are stated as preferences rather than suggestions.
fn corrections_block(corrections: &[String]) -> String {
    if corrections.is_empty() {
        return String::new();
    }
    format!(
        "\nThe user recently filed sources under these categories themselves; prefer them when the source plausibly fits:\n{}\n",
        corrections
            .iter()
            .map(|value| format!("- {value}"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

/// The user's framing typed alongside the link or file (#4) — their intent for
/// the source, which the model should weigh above its own reading of it.
fn framing_block(framing: &str) -> String {
    if framing.trim().is_empty() {
        return String::new();
    }
    format!("\nThe user's own words about this source (treat as their intent):\n{framing}\n")
}

fn bounded_source_selection(content: &str) -> String {
    const SECTION: usize = 10_000;
    const DIRECT: usize = SECTION * 3;
    if content.len() <= DIRECT {
        return content.to_owned();
    }
    let first_end = safe_boundary(content, SECTION);
    let middle_start = safe_boundary(content, content.len() / 2 - SECTION / 2);
    let middle_end = safe_boundary(content, (middle_start + SECTION).min(content.len()));
    let last_start = safe_boundary(content, content.len().saturating_sub(SECTION));
    format!(
        "[BEGINNING]\n{}\n\n[MIDDLE]\n{}\n\n[ENDING]\n{}",
        &content[..first_end],
        &content[middle_start..middle_end],
        &content[last_start..]
    )
}

fn safe_boundary(content: &str, mut index: usize) -> usize {
    index = index.min(content.len());
    while index > 0 && !content.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
