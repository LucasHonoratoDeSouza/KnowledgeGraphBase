import json
from pathlib import Path
from typing import Any

import pytest
from knowledge_test_fixtures.loader import load_fixture, validate_fixture

FIXTURE_ROOT = Path(__file__).parents[2] / "fixtures"
MANIFEST: dict[str, Any] = json.loads((FIXTURE_ROOT / "manifest.json").read_text())


@pytest.mark.parametrize("test_case", MANIFEST["cases"], ids=lambda case: str(case["name"]))
def test_loads_and_validates_golden_fixture_identically(test_case: dict[str, Any]) -> None:
    fixture = load_fixture(FIXTURE_ROOT / test_case["path"])
    result = validate_fixture(fixture)

    assert fixture.case == test_case["name"]
    assert fixture.kind == test_case["kind"]
    assert result.valid is test_case["valid"]
    assert result.error_code == test_case["error"]
