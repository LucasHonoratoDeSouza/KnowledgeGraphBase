use std::str::FromStr;

use crate::{
    AppError, AppErrorCode, EntityId, FieldDetail, NonEmptyString, ProcessingMode, Revision,
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
