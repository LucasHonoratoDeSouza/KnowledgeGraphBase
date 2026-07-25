import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

type FixtureKind = Literal["source", "provider", "vault"]

SOURCE_KINDS = frozenset({"youtube", "pdf", "web", "text", "markdown", "note"})


@dataclass(frozen=True)
class FixtureEnvelope:
    fixture_version: int
    kind: FixtureKind
    case: str
    payload: dict[str, object]


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    error_code: str | None


def load_fixture(path: Path) -> FixtureEnvelope:
    value: object = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise TypeError("fixture does not match the versioned envelope")

    fixture_version = value.get("fixture_version")
    kind = value.get("kind")
    case = value.get("case")
    payload = value.get("payload")
    if (
        not isinstance(fixture_version, int)
        or kind not in {"source", "provider", "vault"}
        or not isinstance(case, str)
        or not isinstance(payload, dict)
    ):
        raise TypeError("fixture does not match the versioned envelope")

    return FixtureEnvelope(
        fixture_version=fixture_version,
        kind=cast("FixtureKind", kind),
        case=case,
        payload=cast("dict[str, object]", payload),
    )


def _is_safe_vault_path(value: object) -> bool:
    return (
        isinstance(value, str)
        and not value.startswith(("/", "\\"))
        and ".." not in value.replace("\\", "/").split("/")
        and value.endswith(".md")
    )


def validate_fixture(fixture: FixtureEnvelope) -> ValidationResult:
    if fixture.kind == "source" and fixture.payload.get("source_kind") not in SOURCE_KINDS:
        return ValidationResult(valid=False, error_code="UNSUPPORTED_SOURCE_KIND")

    if fixture.kind == "provider" and "api_key" in fixture.payload:
        return ValidationResult(valid=False, error_code="SECRET_FIELD")

    if fixture.kind == "vault" and not _is_safe_vault_path(fixture.payload.get("markdown_path")):
        return ValidationResult(valid=False, error_code="UNSAFE_VAULT_PATH")

    return ValidationResult(valid=True, error_code=None)
