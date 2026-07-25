import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compileFromFile } from "json-schema-to-typescript";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = join(packageRoot, "schemas");
const generatedDirectory = join(packageRoot, "generated");

const generationOptions = {
  bannerComment: "/* Generated from canonical JSON Schema. Do not edit. */",
  cwd: schemaDirectory,
  style: {
    bracketSpacing: true,
    printWidth: 80,
    semi: true,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "all" as const,
    useTabs: false,
  },
};

function generatedIndex(schemaFiles: string[]): string {
  const exports = schemaFiles.map((file) => {
    const namespace = file
      .replace(/\.schema\.json$/, "")
      .split("-")
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join("");
    return `export type * as ${namespace}Contracts from "./${file.replace(/\.json$/, ".js")}";`;
  });
  return `${exports.join("\n")}\n`;
}

export async function findOutdatedGeneratedFiles(): Promise<string[]> {
  const schemaFiles = (await readdir(schemaDirectory))
    .filter((file) => file.endsWith(".schema.json"))
    .sort();
  const outdated: string[] = [];

  for (const schemaFile of schemaFiles) {
    const outputFile = schemaFile.replace(/\.json$/, ".d.ts");
    const expected = await compileFromFile(
      join(schemaDirectory, schemaFile),
      generationOptions,
    );
    let actual = "";
    try {
      actual = await readFile(join(generatedDirectory, outputFile), "utf8");
    } catch {
      // A missing output is intentionally reported by filename below.
    }
    if (actual !== expected) outdated.push(outputFile);
  }

  const index = generatedIndex(schemaFiles);
  let actualIndex = "";
  try {
    actualIndex = await readFile(join(generatedDirectory, "index.ts"), "utf8");
  } catch {
    // A missing index is intentionally reported below.
  }
  if (actualIndex !== index) outdated.push("index.ts");

  return outdated;
}

async function writeGeneratedFiles(): Promise<void> {
  const schemaFiles = (await readdir(schemaDirectory))
    .filter((file) => file.endsWith(".schema.json"))
    .sort();
  await mkdir(generatedDirectory, { recursive: true });

  for (const schemaFile of schemaFiles) {
    const outputFile = schemaFile.replace(/\.json$/, ".d.ts");
    const generated = await compileFromFile(
      join(schemaDirectory, schemaFile),
      generationOptions,
    );
    await writeFile(join(generatedDirectory, outputFile), generated, "utf8");
  }

  const index = generatedIndex(schemaFiles);
  await writeFile(join(generatedDirectory, "index.ts"), index, "utf8");
}

const mode = process.argv[2];
if (mode === "--write") {
  await writeGeneratedFiles();
} else if (mode === "--check") {
  const outdated = await findOutdatedGeneratedFiles();
  if (outdated.length > 0) {
    throw new Error(`Generated contracts are stale: ${outdated.join(", ")}`);
  }
} else if (basename(process.argv[1] ?? "") === "generate.ts") {
  throw new Error("Expected --write or --check");
}
