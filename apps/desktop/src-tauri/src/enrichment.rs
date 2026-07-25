use std::collections::HashMap;

use knowledge_ai::{
    AiPort, AiProvider, AiRequest, NativeHttpAiPort, ProviderConnection, SecretResolver,
    StructuredKnowledge,
};
use knowledge_ingestion::{ExtractedContent, KnowledgeEnrichment};
use knowledge_storage::SourceRecord;
use zeroize::Zeroizing;

use crate::knowledge::KnowledgeEnrichmentPort;

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
    ) -> Result<KnowledgeEnrichment, String> {
        let selected = bounded_source_selection(&content.body);
        let response = self
            .ai
            .complete(&AiRequest {
                model_id: self.model_id.clone(),
                system: "You organize a local personal knowledge base. Return only JSON with title, detailed summary, concepts, relations, projects, areas, and tags. Preserve nuance, decisions, evidence, caveats, examples, and actionable details; do not produce a tiny abstract. Use only the supplied source.".to_owned(),
                input: format!(
                    "Source kind: {:?}\nOriginal title: {}\n\nSelected source material:\n{}",
                    source.kind, source.title, selected
                ),
                max_output_tokens: 3_000,
                temperature_milli: 0,
                schema_version: "knowledge-v1".to_owned(),
            })
            .map_err(command_error)?;
        let structured = StructuredKnowledge::parse(&response.content).map_err(command_error)?;
        Ok(KnowledgeEnrichment {
            title: structured.title,
            summary: structured.summary,
            concepts: structured.concepts,
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
