# Ready Backlog Design

## Constraints inherited

- AD-001/AD-011: everything lands in the Tauri app — Rust for privileged work, React for the renderer.
- AD-002: Markdown files stay canonical; SQLite must be re-derived, never diverge.
- AD-006: deterministic/local first; a model call happens only where the decision genuinely needs one.
- AD-010: retro/editorial desktop language, no SaaS gloss.
- No new dependencies (lockfile check runs with `--frozen-lockfile`, and the app must build offline).

## New native surface

One vault-mutation module extends `knowledge.rs`, all paths flowing through the existing `resolve_vault_child` guard (traversal / absolute / dot-prefixed refused):

| Command | Purpose | Issue |
| ------- | ------- | ----- |
| `entry_rename(path, name)` | Rename a note or folder in place | #29 |
| `entry_delete(path)` | Delete a note or folder (recursive for folders) | #29 |
| `entry_move(path, destination)` | Move a note/folder into a folder | #7, #29 |
| `librarian_plan_apply(folder)` | Run and apply one scoped reorganization | #18 |
| `librarian_undo()` | Restore the last applied plan | #18 |

Every mutation ends by re-running `library_in_vault`, which already re-syncs documents, chunks, `chunk_fts` and the graph from the files on disk — so path changes cannot leave stale search hits. Deletions additionally drop the document row so FTS loses the note immediately.

## Mini-summary (#17)

`StructuredKnowledge` gains `context: String`. `render_markdown` writes `context: "..."` into frontmatter after `source_kind`, normalizing to one line and escaping quotes. When enrichment is absent, `deterministic_context()` takes the body's first sentence (≤240 chars). Concept notes reuse their definition line. This is the only field the Librarian and the filer read in bulk.

## Organization (#5, #7, #18)

- `CaptureCommandRequest` gains `organize: Organize` (`Auto` | `Folder(String)` | `None`) and `framing: String` (#4).
- `MainModelEnricher` gains a taxonomy block in its prompt: existing `Projects/`/`Areas/` folder names plus the last 10 pinned corrections. A case-insensitive match against existing folders wins over a new near-duplicate.
- The Librarian reads `(file name, context)` pairs for one folder, sends one structured call, applies moves through `entry_move`'s internals inside a single journal batch recorded in `organization_audit`, and keeps the batch id so `librarian_undo` can invert it.

## Renderer

| Area | Approach |
| ---- | -------- |
| Reading view (#10) | A self-contained Markdown→React renderer in `apps/desktop/src/editor/markdown.ts`: block scan (frontmatter, heading, fence, quote, list, rule, paragraph) then an inline pass (code, bold, italic, wiki-link, link). Emits React elements only — raw HTML is never interpreted, satisfying the "render as text" AC. |
| Pane dividers (#12) | Two `role="separator"` handles inside the retrieve grid, pointer events + arrow keys, clamped by the existing `resizePane` bounds and persisted through `onLayoutChange`. |
| Graph (#13) | A small velocity-Verlet simulation in `apps/desktop/src/knowledge/forceLayout.ts` (repulsion, spring, centering, collision), run to convergence on load and stepped during pointer drags via `requestAnimationFrame`. Reduced motion skips the animated steps and paints the settled layout. Colour scales with degree. |
| Context menu (#29) | A single menu component driven by `onContextMenu` on tree rows, reusing the inline naming row for rename and a confirm row for delete. |
| Provider cards (#14) | Inline SVG marks per provider, endpoint moved into a `<details>` `Advanced` disclosure, open by default only for the Compatible entry. |
| AI defaults (#15) | `DEFAULT_MODELS` map in settings; on a successful connect with no model for that provider, add + enable it, assign Main when unset, and enable AI + source-content privacy on the first connection, with a visible notice. |

## Testing strategy

| Layer | What it proves |
| ----- | -------------- |
| Rust unit/integration | Native path guards, rename/delete/move consistency with search, mini-summary rendering, Librarian plan + undo, mixed-capture segmentation |
| Vitest (renderer) | Organize control wiring, context menu actions, reading view output, divider persistence, force layout separation, provider cards, AI defaults |
| Playwright e2e | The user-visible loops: rename via menu, drag to move, reading toggle, divider drag |
