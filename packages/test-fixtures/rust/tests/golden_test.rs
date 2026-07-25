use std::{fs, path::PathBuf};

use knowledge_test_fixtures::{Manifest, load_fixture, validate_fixture};

fn assert_case(case_name: &str) {
    let fixture_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures");
    let manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(fixture_root.join("manifest.json")).unwrap())
            .unwrap();
    let expected = manifest
        .cases
        .iter()
        .find(|candidate| candidate.name == case_name)
        .unwrap();
    let fixture = load_fixture(fixture_root.join(&expected.path)).unwrap();
    let result = validate_fixture(&fixture);

    assert_eq!(fixture.case, expected.name);
    assert_eq!(fixture.kind, expected.kind);
    assert_eq!(result.valid, expected.valid);
    assert_eq!(result.error_code.as_deref(), expected.error.as_deref());
}

macro_rules! fixture_case {
    ($test_name:ident, $case_name:literal) => {
        #[test]
        fn $test_name() {
            assert_case($case_name);
        }
    };
}

fixture_case!(source_youtube, "source-youtube");
fixture_case!(source_pdf, "source-pdf");
fixture_case!(source_web, "source-web");
fixture_case!(source_text, "source-text");
fixture_case!(source_markdown, "source-markdown");
fixture_case!(source_note, "source-note");
fixture_case!(provider_extraction, "provider-extraction");
fixture_case!(provider_usage, "provider-usage");
fixture_case!(vault_document, "vault-document");
fixture_case!(invalid_source_kind, "invalid-source-kind");
fixture_case!(invalid_provider_secret, "invalid-provider-secret");
fixture_case!(invalid_vault_path, "invalid-vault-path");
