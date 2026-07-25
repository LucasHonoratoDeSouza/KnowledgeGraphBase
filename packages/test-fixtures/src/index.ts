import { readFile } from "node:fs/promises";

const SOURCE_KINDS = new Set([
  "youtube",
  "pdf",
  "web",
  "text",
  "markdown",
  "note",
]);

export type FixtureKind = "source" | "provider" | "vault";

export interface FixtureEnvelope {
  fixture_version: number;
  kind: FixtureKind;
  case: string;
  payload: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errorCode: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFixtureKind(value: unknown): value is FixtureKind {
  return value === "source" || value === "provider" || value === "vault";
}

function parseFixture(value: unknown): FixtureEnvelope {
  if (
    !isRecord(value) ||
    typeof value.fixture_version !== "number" ||
    !isFixtureKind(value.kind) ||
    typeof value.case !== "string" ||
    !isRecord(value.payload)
  ) {
    throw new TypeError("fixture does not match the versioned envelope");
  }

  return {
    fixture_version: value.fixture_version,
    kind: value.kind,
    case: value.case,
    payload: value.payload,
  };
}

export async function loadFixture(path: string): Promise<FixtureEnvelope> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseFixture(parsed);
}

function isSafeVaultPath(value: unknown): boolean {
  return (
    typeof value === "string" &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.split(/[\\/]/u).includes("..") &&
    value.endsWith(".md")
  );
}

export function validateFixture(fixture: FixtureEnvelope): ValidationResult {
  if (
    fixture.kind === "source" &&
    (typeof fixture.payload.source_kind !== "string" ||
      !SOURCE_KINDS.has(fixture.payload.source_kind))
  ) {
    return { valid: false, errorCode: "UNSUPPORTED_SOURCE_KIND" };
  }

  if (
    fixture.kind === "provider" &&
    Object.hasOwn(fixture.payload, "api_key")
  ) {
    return { valid: false, errorCode: "SECRET_FIELD" };
  }

  if (
    fixture.kind === "vault" &&
    !isSafeVaultPath(fixture.payload.markdown_path)
  ) {
    return { valid: false, errorCode: "UNSAFE_VAULT_PATH" };
  }

  return { valid: true, errorCode: null };
}
