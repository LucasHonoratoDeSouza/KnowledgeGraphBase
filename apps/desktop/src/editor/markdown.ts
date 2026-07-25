/**
 * A small Markdown reader for the note reading view (#10).
 *
 * Deliberately hand-rolled rather than pulled from npm: the app must build and
 * run offline (AD-011), and this only needs the subset the vault's own notes
 * use. It emits a typed tree, never HTML strings, so raw markup inside a note
 * can only ever be shown as text.
 */

export interface InlineText {
  kind: "text" | "code" | "strong" | "emphasis";
  value: string;
}

export interface InlineLink {
  kind: "link" | "wikiLink";
  value: string;
  href: string;
}

export type InlineNode = InlineText | InlineLink;

export type MarkdownBlock =
  | { kind: "heading"; level: number; content: InlineNode[] }
  | { kind: "paragraph"; content: InlineNode[] }
  | { kind: "list"; ordered: boolean; items: InlineNode[][] }
  | { kind: "quote"; content: InlineNode[] }
  | { kind: "code"; language: string; value: string }
  | { kind: "rule" };

export interface ParsedNote {
  /** Frontmatter keys in file order, presented as metadata, never as body. */
  metadata: { key: string; value: string }[];
  blocks: MarkdownBlock[];
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED = /^[-*+]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;

export function parseNote(content: string): ParsedNote {
  const { metadata, body } = splitFrontmatter(content);
  return { metadata, blocks: parseBlocks(body) };
}

function splitFrontmatter(content: string) {
  const metadata: { key: string; value: string }[] = [];
  if (!content.startsWith("---\n")) return { metadata, body: content };
  const end = content.indexOf("\n---", 3);
  if (end < 0) return { metadata, body: content };
  for (const line of content.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    metadata.push({
      key: line.slice(0, separator).trim(),
      value: unquote(line.slice(separator + 1).trim()),
    });
  }
  return { metadata, body: content.slice(end + 4).replace(/^\n+/, "") };
}

function unquote(value: string) {
  return value.startsWith('"') && value.endsWith('"') && value.length > 1
    ? value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    : value;
}

function parseBlocks(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = body.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const collected: string[] = [];
      index += 1;
      while (
        index < lines.length &&
        !(lines[index] ?? "").trim().startsWith("```")
      ) {
        collected.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", language, value: collected.join("\n") });
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s+/g, ""))) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length,
        content: parseInline(heading[2] ?? ""),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const collected: string[] = [];
      while (
        index < lines.length &&
        (lines[index] ?? "").trim().startsWith(">")
      ) {
        collected.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", content: parseInline(collected.join(" ")) });
      continue;
    }

    const listKind = UNORDERED.exec(trimmed)
      ? "unordered"
      : ORDERED.exec(trimmed)
        ? "ordered"
        : null;
    if (listKind) {
      const items: InlineNode[][] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? "").trim();
        const match =
          listKind === "unordered"
            ? UNORDERED.exec(candidate)
            : ORDERED.exec(candidate);
        if (!match) break;
        items.push(parseInline(match[1] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "list", ordered: listKind === "ordered", items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index] ?? "";
      if (
        !candidate.trim() ||
        candidate.trim().startsWith("```") ||
        candidate.trim().startsWith(">") ||
        HEADING.test(candidate.trim()) ||
        UNORDERED.test(candidate.trim()) ||
        ORDERED.test(candidate.trim())
      ) {
        break;
      }
      paragraph.push(candidate.trim());
      index += 1;
    }
    blocks.push({
      kind: "paragraph",
      content: parseInline(paragraph.join(" ")),
    });
  }

  return blocks;
}

const INLINE =
  /(`[^`]+`)|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)/;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;

  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) break;
    if (match.index > 0) {
      nodes.push({ kind: "text", value: rest.slice(0, match.index) });
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push({ kind: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("[[")) {
      const target = token.slice(2, -2).trim();
      nodes.push({ kind: "wikiLink", value: target, href: target });
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("](") + 2, -1);
      nodes.push({ kind: "link", value: label, href });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push({ kind: "strong", value: token.slice(2, -2) });
    } else {
      nodes.push({ kind: "emphasis", value: token.slice(1, -1) });
    }
    rest = rest.slice(match.index + token.length);
  }

  if (rest) nodes.push({ kind: "text", value: rest });
  return nodes;
}
