use std::str::FromStr;

use crate::{
    AppError, AppErrorCode, Confidence, DomainError, EntityId, FieldDetail, KnowledgeEdge,
    NonEmptyString, ProcessingMode, ProcessingState, RelationType, Revision, SourceIdentity,
    SourceKind,
};
use serde_json::{Value, json};

const VALID_ID: &str = "018f47a7-7f4a-7d2c-a1b2-123456789abc";

#[test]
fn entity_id_normalizes_and_serializes_as_contract_uuid() {
    let id = EntityId::from_str("018F47A7-7F4A-7D2C-A1B2-123456789ABC").unwrap();

    assert_eq!(id.to_string(), VALID_ID);
    assert_eq!(serde_json::to_value(id).unwrap(), json!(VALID_ID));
}

#[test]
fn entity_id_rejects_non_uuid_text() {
    assert_eq!(
        EntityId::from_str("source-123").unwrap_err().to_string(),
        "entity id must be a canonical RFC 9562 UUID",
    );
}

#[test]
fn entity_id_rejects_uuid_outside_contract_variant_and_version() {
    assert!(EntityId::from_str("00000000-0000-0000-0000-000000000000").is_err());
}

#[test]
fn non_empty_string_preserves_valid_text() {
    let value = NonEmptyString::try_from("Knowledge graphs").unwrap();

    assert_eq!(value.as_str(), "Knowledge graphs");
}

#[test]
fn non_empty_string_rejects_blank_text() {
    assert_eq!(
        NonEmptyString::try_from("  \n").unwrap_err().to_string(),
        "value must not be blank",
    );
}

#[test]
fn revision_accepts_positive_values() {
    let revision = Revision::try_from(1_u64).unwrap();

    assert_eq!(revision.get(), 1);
}

#[test]
fn revision_rejects_zero() {
    assert_eq!(
        Revision::try_from(0_u64).unwrap_err().to_string(),
        "revision must be greater than zero",
    );
}

#[test]
fn every_source_kind_uses_the_contract_spelling() {
    let cases = [
        (SourceKind::YouTube, "youtube"),
        (SourceKind::Pdf, "pdf"),
        (SourceKind::Web, "web"),
        (SourceKind::Text, "text"),
        (SourceKind::Markdown, "markdown"),
        (SourceKind::Note, "note"),
    ];

    for (kind, expected) in cases {
        assert_eq!(serde_json::to_value(kind).unwrap(), json!(expected));
    }
}

#[test]
fn every_processing_mode_uses_the_contract_spelling() {
    let cases = [
        (ProcessingMode::Quick, "quick"),
        (ProcessingMode::Standard, "standard"),
        (ProcessingMode::Deep, "deep"),
    ];

    for (mode, expected) in cases {
        assert_eq!(serde_json::to_value(mode).unwrap(), json!(expected));
    }
}

#[test]
fn app_error_serializes_exactly_to_the_canonical_contract_fixture() {
    let expected: Value = serde_json::from_str(include_str!(
        "../../../packages/contracts/tests/fixtures/app-error.valid.json"
    ))
    .unwrap();
    let error = AppError::new(
        AppErrorCode::ValidationError,
        NonEmptyString::try_from("The source URL is invalid").unwrap(),
        false,
        vec![FieldDetail::new(
            NonEmptyString::try_from("url").unwrap(),
            NonEmptyString::try_from("Use http or https").unwrap(),
        )],
        Some(EntityId::from_str(VALID_ID).unwrap()),
    );

    assert_eq!(serde_json::to_value(error).unwrap(), expected);
}

#[test]
fn app_error_deserializes_from_the_canonical_contract_fixture() {
    let fixture = include_str!("../../../packages/contracts/tests/fixtures/app-error.valid.json");
    let error: AppError = serde_json::from_str(fixture).unwrap();

    assert_eq!(error.code(), AppErrorCode::ValidationError);
    assert!(!error.retryable());
    assert_eq!(error.field_details()[0].field().as_str(), "url");
}

#[test]
fn processing_happy_path_is_exact_and_monotonic() {
    let states = [
        ProcessingState::Pending,
        ProcessingState::Fetching,
        ProcessingState::Extracting,
        ProcessingState::Processing,
        ProcessingState::Indexing,
        ProcessingState::Completed,
    ];

    for pair in states.windows(2) {
        assert_eq!(pair[0].transition_to(pair[1]), Ok(pair[1]));
    }
}

#[test]
fn every_active_state_can_fail_or_cancel() {
    for state in [
        ProcessingState::Pending,
        ProcessingState::Fetching,
        ProcessingState::Extracting,
        ProcessingState::Processing,
        ProcessingState::Indexing,
    ] {
        assert_eq!(
            state.transition_to(ProcessingState::Failed),
            Ok(ProcessingState::Failed)
        );
        assert_eq!(
            state.transition_to(ProcessingState::Cancelled),
            Ok(ProcessingState::Cancelled)
        );
    }
}

#[test]
fn processing_cannot_skip_a_happy_path_state() {
    assert_eq!(
        ProcessingState::Pending.transition_to(ProcessingState::Processing),
        Err(DomainError::InvalidProcessingTransition {
            from: ProcessingState::Pending,
            to: ProcessingState::Processing,
        }),
    );
}

#[test]
fn processing_cannot_move_backwards() {
    assert!(
        ProcessingState::Indexing
            .transition_to(ProcessingState::Extracting)
            .is_err(),
    );
}

#[test]
fn terminal_processing_states_cannot_reenter_the_pipeline() {
    for state in [
        ProcessingState::Completed,
        ProcessingState::Failed,
        ProcessingState::Cancelled,
    ] {
        assert!(state.transition_to(ProcessingState::Pending).is_err());
    }
}

#[test]
fn processing_state_serialization_matches_persisted_contract() {
    let cases = [
        (ProcessingState::Pending, "PENDING"),
        (ProcessingState::Fetching, "FETCHING"),
        (ProcessingState::Extracting, "EXTRACTING"),
        (ProcessingState::Processing, "PROCESSING"),
        (ProcessingState::Indexing, "INDEXING"),
        (ProcessingState::Completed, "COMPLETED"),
        (ProcessingState::Failed, "FAILED"),
        (ProcessingState::Cancelled, "CANCELLED"),
    ];

    for (state, expected) in cases {
        assert_eq!(serde_json::to_value(state).unwrap(), json!(expected));
    }
}

#[test]
fn relation_types_use_the_closed_vocabulary() {
    let cases = [
        (RelationType::RelatedTo, "RELATED_TO"),
        (RelationType::IsA, "IS_A"),
        (RelationType::PartOf, "PART_OF"),
        (RelationType::Uses, "USES"),
        (RelationType::Requires, "REQUIRES"),
        (RelationType::AppliedTo, "APPLIED_TO"),
    ];

    for (relation, expected) in cases {
        assert_eq!(serde_json::to_value(relation).unwrap(), json!(expected));
    }
}

#[test]
fn confidence_accepts_closed_interval_boundaries() {
    assert_eq!(Confidence::try_from(0_u16).unwrap().basis_points(), 0);
    assert_eq!(
        Confidence::try_from(10_000_u16).unwrap().basis_points(),
        10_000
    );
}

#[test]
fn confidence_rejects_values_above_one() {
    assert_eq!(
        Confidence::try_from(10_001_u16),
        Err(DomainError::ConfidenceOutOfRange),
    );
}

#[test]
fn knowledge_edge_rejects_self_links() {
    let id = EntityId::from_str(VALID_ID).unwrap();
    let origin = EntityId::from_str("018f47a7-7f4a-7d2c-a1b2-123456789abd").unwrap();

    assert_eq!(
        KnowledgeEdge::new(
            id,
            id,
            RelationType::RelatedTo,
            Confidence::try_from(8_000_u16).unwrap(),
            origin,
        ),
        Err(DomainError::SelfEdge),
    );
}

#[test]
fn knowledge_edge_identity_deduplicates_same_typed_origin() {
    let source = EntityId::from_str(VALID_ID).unwrap();
    let target = EntityId::from_str("018f47a7-7f4a-7d2c-a1b2-123456789abd").unwrap();
    let origin = EntityId::from_str("018f47a7-7f4a-7d2c-a1b2-123456789abe").unwrap();
    let first = KnowledgeEdge::new(
        source,
        target,
        RelationType::Uses,
        Confidence::try_from(7_500_u16).unwrap(),
        origin,
    )
    .unwrap();
    let second = KnowledgeEdge::new(
        source,
        target,
        RelationType::Uses,
        Confidence::try_from(9_500_u16).unwrap(),
        origin,
    )
    .unwrap();

    assert_eq!(first.identity(), second.identity());
    assert_ne!(first.confidence(), second.confidence());
}

#[test]
fn reverse_edge_has_a_distinct_identity() {
    let source = EntityId::from_str(VALID_ID).unwrap();
    let target = EntityId::from_str("018f47a7-7f4a-7d2c-a1b2-123456789abd").unwrap();
    let origin = EntityId::from_str("018f47a7-7f4a-7d2c-a1b2-123456789abe").unwrap();
    let forward = KnowledgeEdge::new(
        source,
        target,
        RelationType::PartOf,
        Confidence::try_from(8_000_u16).unwrap(),
        origin,
    )
    .unwrap();
    let reverse = KnowledgeEdge::new(
        target,
        source,
        RelationType::PartOf,
        Confidence::try_from(8_000_u16).unwrap(),
        origin,
    )
    .unwrap();

    assert_ne!(forward.identity(), reverse.identity());
}

#[test]
fn source_identity_requires_all_versioned_deduplication_parts() {
    assert_eq!(
        SourceIdentity::new("https://example.com", "", "pipeline-v1"),
        Err(DomainError::BlankIdentityPart("content_hash")),
    );
}

#[test]
fn source_identity_is_stable_for_equal_normalized_inputs() {
    let first = SourceIdentity::new("https://example.com/a", "hash", "pipeline-v1").unwrap();
    let second = SourceIdentity::new("https://example.com/a", "hash", "pipeline-v1").unwrap();

    assert_eq!(first, second);
}

#[test]
fn source_identity_changes_with_content_or_pipeline_version() {
    let current = SourceIdentity::new("https://example.com/a", "hash-1", "pipeline-v1").unwrap();
    let changed = SourceIdentity::new("https://example.com/a", "hash-2", "pipeline-v1").unwrap();
    let upgraded = SourceIdentity::new("https://example.com/a", "hash-1", "pipeline-v2").unwrap();

    assert_ne!(current, changed);
    assert_ne!(current, upgraded);
}
