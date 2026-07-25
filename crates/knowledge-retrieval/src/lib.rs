#![allow(
    clippy::missing_errors_doc,
    reason = "the retrieval boundary uses one typed RetrievalError contract"
)]
//! Deterministic local retrieval, context budgeting, citations, and one-call assistant.

use std::fmt::Write as _;

use knowledge_ai::{AiPort, AiRequest, TokenUsage};
use knowledge_storage::{KnowledgeStore, SearchHit};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const MAX_CONTEXT_TOKENS: u32 = 12_000;
const MAX_CONTEXT_CHUNKS: usize = 8;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum RetrievalError {
    #[error("search query must not be blank")]
    BlankQuery,
    #[error("local search failed: {0}")]
    Storage(String),
    #[error("assistant failed: {0}")]
    Ai(String),
    #[error("assistant returned invalid citations")]
    InvalidCitation,
    #[error("assistant returned invalid structured output")]
    InvalidAnswer,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryFilters {
    pub path_prefix: Option<String>,
    pub source_kind: Option<String>,
    pub project: Option<String>,
    pub area: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPlan {
    pub lexical_query: String,
    pub filters: QueryFilters,
    pub expand_graph: bool,
}

#[must_use]
pub fn plan_query(input: &str) -> QueryPlan {
    let mut filters = QueryFilters::default();
    let mut terms = Vec::new();
    for token in input.split_whitespace() {
        let Some((key, value)) = token.split_once(':') else {
            terms.push(token);
            continue;
        };
        if value.is_empty() {
            terms.push(token);
            continue;
        }
        match key.to_ascii_lowercase().as_str() {
            "path" => filters.path_prefix = Some(value.replace('_', " ")),
            "kind" => filters.source_kind = Some(value.to_ascii_lowercase()),
            "project" => filters.project = Some(value.replace('_', " ")),
            "area" => filters.area = Some(value.replace('_', " ")),
            "tag" => filters.tags.push(value.replace('_', " ")),
            _ => terms.push(token),
        }
    }
    let lexical_query = terms.join(" ").trim().to_owned();
    let lower = lexical_query.to_lowercase();
    QueryPlan {
        expand_graph: lower.contains("related")
            || lower.contains("relationship")
            || lower.contains("connect"),
        lexical_query,
        filters,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalResult {
    pub plan: QueryPlan,
    pub hits: Vec<SearchHit>,
    pub lexical_fallback: bool,
}

pub struct RetrievalEngine<'a> {
    store: &'a KnowledgeStore,
}

impl<'a> RetrievalEngine<'a> {
    #[must_use]
    pub const fn new(store: &'a KnowledgeStore) -> Self {
        Self { store }
    }

    pub fn search(&self, input: &str, limit: u32) -> Result<RetrievalResult, RetrievalError> {
        let plan = plan_query(input);
        if plan.lexical_query.trim().is_empty() {
            return Err(RetrievalError::BlankQuery);
        }
        let mut hits = self
            .store
            .search_chunks(&plan.lexical_query, limit.saturating_mul(3).clamp(1, 100))
            .map_err(storage_error)?;
        if let Some(prefix) = &plan.filters.path_prefix {
            let normalized = prefix.to_lowercase();
            hits.retain(|hit| hit.path.to_lowercase().starts_with(&normalized));
        }
        hits.truncate(usize::try_from(limit.clamp(1, 100)).unwrap_or(100));
        Ok(RetrievalResult {
            plan,
            hits,
            lexical_fallback: true,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub number: u32,
    pub title: String,
    pub path: String,
    pub locator: String,
    pub snippet: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextBundle {
    pub prompt: String,
    pub citations: Vec<Citation>,
    pub estimated_tokens: u32,
}

#[must_use]
pub fn build_context(hits: &[SearchHit]) -> ContextBundle {
    let mut prompt = String::new();
    let mut citations = Vec::new();
    let mut tokens = 0_u32;
    for hit in hits.iter().take(MAX_CONTEXT_CHUNKS) {
        let plain = hit.snippet.replace("<mark>", "").replace("</mark>", "");
        let estimate = u32::try_from(plain.split_whitespace().count()).unwrap_or(u32::MAX);
        if !citations.is_empty() && tokens.saturating_add(estimate) > MAX_CONTEXT_TOKENS {
            break;
        }
        let number = u32::try_from(citations.len() + 1).unwrap_or(u32::MAX);
        write!(
            prompt,
            "[SOURCE {number}]\nTitle: {}\nPath: {}\nLocator: {}\nContent: {plain}\n\n",
            hit.title, hit.path, hit.locator
        )
        .expect("writing to a String cannot fail");
        tokens = tokens.saturating_add(estimate);
        citations.push(Citation {
            number,
            title: hit.title.clone(),
            path: hit.path.clone(),
            locator: hit.locator.clone(),
            snippet: plain,
        });
    }
    ContextBundle {
        prompt,
        citations,
        estimated_tokens: tokens,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantAnswer {
    pub answer: String,
    pub citations: Vec<Citation>,
    pub model_id: String,
    pub usage: TokenUsage,
    pub supported: bool,
}

#[derive(Debug, Deserialize)]
struct RawAnswer {
    answer: String,
    citation_numbers: Vec<u32>,
}

pub struct GroundedAssistant<'a> {
    retrieval: RetrievalEngine<'a>,
    ai: &'a dyn AiPort,
}

impl<'a> GroundedAssistant<'a> {
    #[must_use]
    pub fn new(store: &'a KnowledgeStore, ai: &'a dyn AiPort) -> Self {
        Self {
            retrieval: RetrievalEngine::new(store),
            ai,
        }
    }

    pub fn ask(&self, question: &str, model_id: &str) -> Result<AssistantAnswer, RetrievalError> {
        if question.trim().is_empty() {
            return Err(RetrievalError::BlankQuery);
        }
        let retrieval = self.retrieval.search(question, 8)?;
        if retrieval.hits.is_empty() {
            return Ok(AssistantAnswer {
                answer: "I don't have enough evidence in this vault to answer that yet.".to_owned(),
                citations: Vec::new(),
                model_id: model_id.to_owned(),
                usage: TokenUsage::default(),
                supported: false,
            });
        }
        let context = build_context(&retrieval.hits);
        let response = self
            .ai
            .complete(&AiRequest {
                model_id: model_id.to_owned(),
                system: "Answer only from the supplied vault sources. Return JSON with answer and citation_numbers. If evidence is insufficient, say so and return no citations.".to_owned(),
                input: format!("Question: {question}\n\nVault evidence:\n{}", context.prompt),
                max_output_tokens: 1_200,
                temperature_milli: 0,
                schema_version: "grounded-answer-v1".to_owned(),
            })
            .map_err(|error| RetrievalError::Ai(error.to_string()))?;
        let raw: RawAnswer =
            serde_json::from_str(&response.content).map_err(|_| RetrievalError::InvalidAnswer)?;
        if raw.answer.trim().is_empty() {
            return Err(RetrievalError::InvalidAnswer);
        }
        let citations = raw
            .citation_numbers
            .into_iter()
            .map(|number| {
                context
                    .citations
                    .iter()
                    .find(|citation| citation.number == number)
                    .cloned()
                    .ok_or(RetrievalError::InvalidCitation)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(AssistantAnswer {
            answer: raw.answer,
            supported: !citations.is_empty(),
            citations,
            model_id: model_id.to_owned(),
            usage: response.usage,
        })
    }
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "map_err adapters receive owned StorageError values"
)]
fn storage_error(error: knowledge_storage::StorageError) -> RetrievalError {
    RetrievalError::Storage(error.to_string())
}
