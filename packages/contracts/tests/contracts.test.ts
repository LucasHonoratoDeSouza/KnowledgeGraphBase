import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { findOutdatedGeneratedFiles } from "../scripts/generate.ts";
import {
  aiUsage,
  errors,
  events,
  ids,
  invalidCaptureInputs,
  knowledgeBundle,
  validCaptureInputs,
} from "./fixtures.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = join(packageRoot, "schemas");

async function createValidator(): Promise<Ajv2020> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const files = (await readdir(schemaDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  for (const file of files) {
    ajv.addSchema(
      JSON.parse(await readFile(join(schemaDirectory, file), "utf8")) as object,
    );
  }
  return ajv;
}

const ajv = await createValidator();
const valid = (reference: string, value: unknown): boolean => {
  const validator = ajv.getSchema(reference);
  if (validator === undefined) throw new Error(`Missing schema ${reference}`);
  return validator(value) as boolean;
};

describe("canonical contracts", () => {
  it("accepts a UUID entity identifier", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/common.schema.json#/$defs/EntityId",
        ids.valid,
      ),
    ).toBe(true);
  });

  it("rejects a non-UUID entity identifier", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/common.schema.json#/$defs/EntityId",
        ids.invalid,
      ),
    ).toBe(false);
  });

  it("accepts a typed application error with field details", () => {
    expect(
      valid("https://knowledge-os.dev/schemas/error.schema.json", errors.valid),
    ).toBe(true);
  });

  it("rejects an application error without retryability", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/error.schema.json",
        errors.missingRetryable,
      ),
    ).toBe(false);
  });

  it.each(validCaptureInputs)("accepts the $kind source kind", (capture) => {
    expect(
      valid("https://knowledge-os.dev/schemas/source.schema.json", capture),
    ).toBe(true);
  });

  it("rejects an unsupported source kind", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/source.schema.json",
        invalidCaptureInputs.unsupportedKind,
      ),
    ).toBe(false);
  });

  it("rejects a source without its kind-specific payload", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/source.schema.json",
        invalidCaptureInputs.missingPayload,
      ),
    ).toBe(false);
  });

  it("accepts an ordered job progress event", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/event.schema.json",
        events.jobProgress,
      ),
    ).toBe(true);
  });

  it("accepts an ordered assistant completion event", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/event.schema.json",
        events.assistantCompleted,
      ),
    ).toBe(true);
  });

  it("rejects an event without its monotonic sequence", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/event.schema.json",
        events.missingSequence,
      ),
    ).toBe(false);
  });

  it("rejects an undeclared event type", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/event.schema.json",
        events.unknown,
      ),
    ).toBe(false);
  });

  it("accepts complete privacy-safe AI usage metadata", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/ai-usage.schema.json",
        aiUsage.valid,
      ),
    ).toBe(true);
  });

  it("rejects negative AI token counts", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/ai-usage.schema.json",
        aiUsage.negativeTokens,
      ),
    ).toBe(false);
  });

  it("rejects raw provider secrets from AI usage metadata", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/ai-usage.schema.json",
        aiUsage.secretLeak,
      ),
    ).toBe(false);
  });

  it("accepts versioned Source, Document, Concept, Edge and Chunk records", () => {
    expect(
      valid(
        "https://knowledge-os.dev/schemas/knowledge.schema.json",
        knowledgeBundle.valid,
      ),
    ).toBe(true);
  });

  it("keeps generated TypeScript reproducible", async () => {
    expect(await findOutdatedGeneratedFiles()).toEqual([]);
  });
});
