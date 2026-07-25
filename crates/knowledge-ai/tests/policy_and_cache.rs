use knowledge_ai::{
    AiError, AiPort, AiProvider, AiRequest, AiResponse, ArtifactCache, BudgetSnapshot, CacheKey,
    FakeAiPort, ModelCatalog, ModelDefinition, ModelRouting, StructuredKnowledge, TaskKind,
    TokenUsage,
};

fn model(id: &str, healthy: bool) -> ModelDefinition {
    ModelDefinition {
        id: id.to_owned(),
        provider: AiProvider::OpenAi,
        remote_name: id.to_owned(),
        enabled: true,
        healthy,
        input_microusd_per_million: 100,
        output_microusd_per_million: 200,
        max_context_tokens: 32_000,
        deep_allowed: id == "deep",
    }
}

fn budget() -> BudgetSnapshot {
    BudgetSnapshot {
        daily_limit_microusd: 10_000,
        monthly_limit_microusd: 100_000,
        spent_today_microusd: 100,
        spent_month_microusd: 1_000,
    }
}

fn request(input: &str) -> AiRequest {
    AiRequest {
        model_id: "cheap".to_owned(),
        system: "Return JSON".to_owned(),
        input: input.to_owned(),
        max_output_tokens: 500,
        temperature_milli: 0,
        schema_version: "knowledge-v1".to_owned(),
    }
}

fn response() -> AiResponse {
    AiResponse {
        content: r#"{"title":"RAG","summary":"Grounded retrieval","concepts":["RAG"]}"#.to_owned(),
        usage: TokenUsage {
            input_tokens: 20,
            output_tokens: 10,
        },
    }
}

#[test]
fn organization_always_uses_exact_main_model() {
    let catalog = ModelCatalog::new(
        vec![model("cheap", true), model("deep", true)],
        ModelRouting {
            main_model_id: Some("cheap".to_owned()),
            assistant_default_model_id: Some("deep".to_owned()),
            explicit_fallback_model_id: None,
        },
    );
    assert_eq!(
        catalog
            .select(TaskKind::Organization, Some("deep"), false, 10, budget())
            .unwrap()
            .id,
        "cheap"
    );
}

#[test]
fn assistant_can_select_configured_healthy_model() {
    let catalog = ModelCatalog::new(vec![model("cheap", true)], ModelRouting::default());
    assert_eq!(
        catalog
            .select(TaskKind::Assistant, Some("cheap"), false, 10, budget())
            .unwrap()
            .id,
        "cheap"
    );
}

#[test]
fn unknown_model_fails_closed() {
    let catalog = ModelCatalog::new(vec![], ModelRouting::default());
    assert_eq!(
        catalog.select(TaskKind::Assistant, Some("missing"), false, 10, budget()),
        Err(AiError::ModelNotConfigured)
    );
}

#[test]
fn unhealthy_model_fails_closed() {
    let catalog = ModelCatalog::new(vec![model("cheap", false)], ModelRouting::default());
    assert_eq!(
        catalog.select(TaskKind::Assistant, Some("cheap"), false, 10, budget()),
        Err(AiError::ModelUnavailable)
    );
}

#[test]
fn over_daily_budget_fails_before_selection() {
    let catalog = ModelCatalog::new(vec![model("cheap", true)], ModelRouting::default());
    assert_eq!(
        catalog.select(TaskKind::Assistant, Some("cheap"), false, 10_000, budget()),
        Err(AiError::BudgetExceeded)
    );
}

#[test]
fn fallback_requires_explicit_opt_in() {
    let catalog = ModelCatalog::new(
        vec![model("fallback", true)],
        ModelRouting {
            main_model_id: Some("fallback".to_owned()),
            assistant_default_model_id: None,
            explicit_fallback_model_id: Some("fallback".to_owned()),
        },
    );
    assert_eq!(
        catalog.select(TaskKind::Extraction, None, false, 10, budget()),
        Err(AiError::FallbackNotExplicit)
    );
    assert_eq!(
        catalog
            .select(TaskKind::Extraction, None, true, 10, budget())
            .unwrap()
            .id,
        "fallback"
    );
}

#[test]
fn deep_analysis_requires_deep_allowed_model() {
    let catalog = ModelCatalog::new(
        vec![model("cheap", true), model("deep", true)],
        ModelRouting::default(),
    );
    assert_eq!(
        catalog.select(TaskKind::DeepAnalysis, Some("cheap"), false, 10, budget()),
        Err(AiError::ModelUnavailable)
    );
    assert_eq!(
        catalog
            .select(TaskKind::DeepAnalysis, Some("deep"), false, 10, budget())
            .unwrap()
            .id,
        "deep"
    );
}

#[test]
fn assistant_list_contains_only_healthy_enabled_models_in_stable_order() {
    let mut disabled = model("disabled", true);
    disabled.enabled = false;
    let catalog = ModelCatalog::new(
        vec![
            model("z", true),
            disabled,
            model("a", true),
            model("bad", false),
        ],
        ModelRouting::default(),
    );
    assert_eq!(
        catalog
            .assistant_models()
            .into_iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>(),
        vec!["a", "z"]
    );
}

#[test]
fn cache_key_normalizes_whitespace_but_includes_versions_and_parameters() {
    let first = CacheKey::for_request(&request("one   two\nthree"), "prompt-v1");
    let second = CacheKey::for_request(&request("one two three"), "prompt-v1");
    assert_eq!(first, second);
    assert_ne!(
        first,
        CacheKey::for_request(&request("one two three"), "prompt-v2")
    );
    let mut changed = request("one two three");
    changed.max_output_tokens += 1;
    assert_ne!(first, CacheKey::for_request(&changed, "prompt-v1"));
}

#[test]
fn cached_completion_calls_provider_once() {
    let fake = FakeAiPort::with_responses(vec![response()]);
    let cache = ArtifactCache::default();
    let (first, first_hit) = cache
        .complete_cached(&fake, &request("knowledge"), "v1")
        .unwrap();
    let (second, second_hit) = cache
        .complete_cached(&fake, &request("knowledge"), "v1")
        .unwrap();
    assert_eq!(first, second);
    assert!(!first_hit);
    assert!(second_hit);
    assert_eq!(fake.requests().unwrap().len(), 1);
}

#[test]
fn fake_records_exact_request() {
    let fake = FakeAiPort::with_responses(vec![response()]);
    let expected = request("exact source");
    fake.complete(&expected).unwrap();
    assert_eq!(fake.requests().unwrap(), vec![expected]);
}

#[test]
fn fake_without_response_returns_typed_error() {
    let error = FakeAiPort::default()
        .complete(&request("source"))
        .unwrap_err();
    assert!(matches!(error, AiError::Transport(_)));
}

#[test]
fn structured_output_accepts_required_fields_and_defaults_lists() {
    let parsed = StructuredKnowledge::parse(&response().content).unwrap();
    assert_eq!(parsed.title, "RAG");
    assert!(parsed.relations.is_empty());
    assert!(parsed.projects.is_empty());
}

#[test]
fn malformed_json_is_rejected() {
    assert!(matches!(
        StructuredKnowledge::parse("not-json"),
        Err(AiError::InvalidStructuredOutput(_))
    ));
}

#[test]
fn blank_required_fields_are_rejected() {
    let invalid = r#"{"title":"","summary":"ok","concepts":["RAG"]}"#;
    assert!(matches!(
        StructuredKnowledge::parse(invalid),
        Err(AiError::InvalidStructuredOutput(_))
    ));
}

#[test]
fn malformed_relation_entries_are_dropped_without_failing_the_whole_response() {
    let payload = r#"{
        "title": "Docker basics",
        "summary": "ok",
        "concepts": ["Docker"],
        "relations": [
            "Docker vs Virtual Machines",
            {"source": "Docker", "target": "Container", "relation": "USES"}
        ]
    }"#;
    let parsed = StructuredKnowledge::parse(payload).unwrap();
    assert_eq!(parsed.relations.len(), 1);
    assert_eq!(parsed.relations[0].source, "Docker");
}

#[test]
fn malformed_concept_definition_entries_are_dropped_without_failing_the_whole_response() {
    let payload = r#"{
        "title": "Docker basics",
        "summary": "ok",
        "concepts": ["Docker", "Container"],
        "conceptDefinitions": [
            "Docker is a containerization platform.",
            {"concept": "Container", "definition": "An isolated, runnable unit of software."}
        ]
    }"#;
    let parsed = StructuredKnowledge::parse(payload).unwrap();
    assert_eq!(parsed.concept_definitions.len(), 1);
    assert_eq!(parsed.concept_definitions[0].concept, "Container");
}

#[test]
fn empty_concepts_are_rejected() {
    let invalid = r#"{"title":"RAG","summary":"ok","concepts":[]}"#;
    assert!(matches!(
        StructuredKnowledge::parse(invalid),
        Err(AiError::InvalidStructuredOutput(_))
    ));
}

#[test]
fn budget_overflow_fails_closed() {
    let impossible = BudgetSnapshot {
        daily_limit_microusd: u64::MAX,
        monthly_limit_microusd: u64::MAX,
        spent_today_microusd: u64::MAX,
        spent_month_microusd: u64::MAX,
    };
    assert!(!impossible.permits(1));
}
