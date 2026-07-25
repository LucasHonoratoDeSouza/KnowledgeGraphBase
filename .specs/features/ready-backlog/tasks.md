# Ready Backlog Tasks

## Gate Check Commands

| Gate | Command |
| ---- | ------- |
| Quick (Rust) | `cargo test -p <crate> --locked` |
| Quick (renderer) | `pnpm -C apps/desktop exec vitest run <file>` |
| Full | `pnpm -C apps/desktop test && cargo test --workspace --locked` |
| Build | `pnpm -r --if-present lint && pnpm -r --if-present typecheck && cargo clippy --workspace --all-targets --locked -- -D warnings && pnpm exec playwright test` |

## Test Coverage Matrix

| Layer | Coverage expectation |
| ----- | -------------------- |
| Rust vault mutations | Happy path + every documented refusal (traversal, absolute, dot, collision, self-nesting) + index consistency after the change |
| Rust rendering/enrichment | Asserted on the emitted Markdown/prompt string, not on the call |
| Renderer components | Each AC maps to a DOM/behaviour assertion; error paths asserted where the AC names one |
| e2e | One end-to-end loop per user-visible feature |

---

## Phase 1 — Organization foundations

- **T01** `context:` mini-summary in source notes — REQ MINI-01 — Rust — Gate: quick
  Done when: `render_markdown` emits `context:` after `source_kind`; AI value used verbatim; deterministic fallback ≤240 chars; quotes/newlines normalized.
- **T02** `context:` on concept notes — REQ MINI-01 — Rust — Gate: quick
  Done when: `render_concept_note` emits the same field from its definition line.
- **T03** `context` in the enrichment contract — REQ MINI-01 — Rust — Gate: quick
  Done when: `StructuredKnowledge` carries `context`, the Main-model schema/prompt asks for it, and a missing value falls back deterministically.
- **T04** Vault-aware enrichment prompt — REQ ORG-01 — Rust — Gate: quick
  Done when: prompt includes existing `Projects/`/`Areas/` names + recent corrections; case-insensitive match reuses the existing folder.
- **T05** `organize` mode on the capture request — REQ ORG-01 — Rust — Gate: quick
  Done when: `Auto` enriches; `Folder(x)` writes under `x` without enrichment override; `None` writes to `Inbox/` with no model call.
- **T06** Organize control in the composer — REQ ORG-01 — Renderer — Gate: quick
  Done when: the control lists Auto / existing folders / Don't organize and sends the chosen mode.

## Phase 2 — Vault mutations

- **T07** `entry_rename` command — REQ MENU-01 — Rust — Gate: quick
  Done when: renames file/folder, refuses traversal/absolute/dot/collision, returns the refreshed library, and search no longer returns the old path.
- **T08** `entry_delete` command — REQ MENU-01 — Rust — Gate: quick
  Done when: deletes file/folder recursively, drops the document rows, refuses unsafe paths, and search no longer returns the note.
- **T09** `entry_move` command — REQ DND-01 — Rust — Gate: quick
  Done when: moves into a folder, refuses self/descendant nesting and collisions, keeps the index consistent.
- **T10** Pinned correction on manual move — REQ DND-01 — Rust — Gate: quick
  Done when: a move records a pinned facet membership for the destination and `recent_corrections` returns it.
- **T11** Explorer context menu — REQ MENU-01 — Renderer — Gate: quick
  Done when: right-click opens a menu per row kind; rename reuses the inline row pre-filled; delete confirms; Escape closes.
- **T12** Drag-and-drop moves — REQ DND-01 — Renderer — Gate: quick
  Done when: dragging a row onto a folder calls the move client and refreshes; invalid drops are refused.

## Phase 3 — Editor and workspace

- **T13** Markdown renderer module — REQ READ-01 — Renderer — Gate: quick
  Done when: headings, emphasis, code, fences, lists, quotes, rules, links, wiki-links and frontmatter parse to elements; raw HTML stays text.
- **T14** Reading/Source toggle — REQ READ-01 — Renderer — Gate: quick
  Done when: the toggle switches views, preserves unsaved edits, and wiki-links open the target note.
- **T15** Draggable pane dividers — REQ PANE-01 — Renderer — Gate: quick
  Done when: pointer drag and arrow keys resize, clamped and persisted through `onLayoutChange`.

## Phase 4 — Graph and settings

- **T16** Force layout module — REQ GRAPH-01 — Renderer — Gate: quick
  Done when: settled layout has no overlapping pair and is deterministic for a given input.
- **T17** Interactive graph view — REQ GRAPH-01 — Renderer — Gate: quick
  Done when: nodes drag, colour encodes connectivity with a legend, reduced motion paints settled.
- **T18** Compact provider cards — REQ CARD-01 — Renderer — Gate: quick
  Done when: provider marks replace monograms and the endpoint sits behind `Advanced`, open for Compatible.
- **T19** AI defaults on connect — REQ DEF-01 — Renderer — Gate: quick
  Done when: default model added+enabled, Main assigned when unset, AI/privacy enabled on first connect, notice shown.

## Phase 5 — Mixed capture and Librarian

- **T20** Mixed-content segmentation — REQ MIX-01 — Rust — Gate: quick
  Done when: URL+prose and file+prose split into source + framing; extra URLs listed; prose-only unchanged.
- **T21** Framing in note and prompt — REQ MIX-01 — Rust — Gate: quick
  Done when: framing renders under `## Notes from you` and reaches the enrichment prompt.
- **T22** Librarian plan + apply — REQ LIB-01 — Rust — Gate: quick
  Done when: one folder scoped, mini-summaries only, moves applied as one batch, <8 notes declines, no model fails closed.
- **T23** Librarian undo — REQ LIB-01 — Rust — Gate: quick
  Done when: undo restores every moved file to its previous path.
- **T24** Librarian UI + suggestion — REQ LIB-01 — Renderer — Gate: full
  Done when: the folder menu offers Reorganize, the result reports moves with Undo, and a crowded folder shows a non-blocking suggestion.

## Phase 6 — Feature-level gates

- **T25** e2e loops — all REQ — Gate: build
  Done when: e2e covers rename via menu, drag move, reading toggle and divider drag, and the whole suite passes.

**Execution note:** 25 tasks ≈ 4 batches. Per the skill this is where the sub-agent offer applies; the owner's standing instruction for this repo has been inline execution, so tasks run inline in dependency order with one atomic commit each, followed by the independent Verifier pass.
