import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadFixture, validateFixture } from "../src/index.ts";

interface ManifestCase {
  name: string;
  path: string;
  kind: "source" | "provider" | "vault";
  valid: boolean;
  error: string | null;
}

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);
const manifest = JSON.parse(
  await readFile(join(fixtureRoot, "manifest.json"), "utf8"),
) as {
  cases: ManifestCase[];
};

describe("golden fixture loader", () => {
  it.each(manifest.cases)(
    "loads and validates $name identically",
    async (testCase) => {
      const fixture = await loadFixture(join(fixtureRoot, testCase.path));
      const result = validateFixture(fixture);

      expect(fixture.case).toBe(testCase.name);
      expect(fixture.kind).toBe(testCase.kind);
      expect(result.valid).toBe(testCase.valid);
      expect(result.errorCode).toBe(testCase.error);
    },
  );
});
