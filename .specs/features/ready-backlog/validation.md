# Ready Backlog Validation

**Verdict: PASS** (after one fix task, below)

- Diff range: `89c528a..HEAD` on `feat/ready-backlog`
- Gates: `pnpm -r lint / typecheck / format:check / test`, `cargo clippy --workspace --all-targets -D warnings`, `cargo test --workspace`, `pnpm exec playwright test`, `pnpm -r build`, `cargo build --workspace` — all green
- Counts: 117 desktop unit tests, 12 UI, 21 contracts, 12 fixtures, 26 Playwright, full Rust workspace suite
- Verifier mode: standalone fresh-eyes pass (`validate.md`), not a sub-agent — the environment's standing rule is that sub-agents are only dispatched when the owner asks for them. Author and verifier are therefore the same actor; the discrimination sensor below is what carries the weight the separation normally would.

## Per-requirement evidence

| Req | AC | Evidence (`file:line` + assertion) | Spec outcome | Covered |
| --- | -- | ---------------------------------- | ------------ | ------- |
| MINI-01 | `context:` after `source_kind` | `crates/knowledge-ingestion/tests/deterministic_pipeline.rs` — `assert_eq!(lines[source_kind + 1], "context: \"…\"")` | field present, positioned | ✅ |
| MINI-01 | model value verbatim / deterministic fallback | `crates/knowledge-ingestion/tests/pipeline_integration.rs` — `enriched_note_uses_the_models_context_verbatim_and_falls_back_without_it` | verbatim, else first sentence | ✅ |
| MINI-01 | quotes/newlines stay parseable | `deterministic_pipeline.rs` — `context_field_stays_parseable_when_the_value_has_quotes_and_newlines` | one escaped line | ✅ |
| MINI-01 | concept notes carry it | `pipeline_integration.rs` — `concept_notes_carry_the_same_context_field` | same field | ✅ |
| ORG-01 | Folder overrides / None → Inbox | `apps/desktop/src-tauri/tests/knowledge_commands.rs` — `explicit_folder_placement_overrides_inference_and_none_files_to_inbox` | exact path prefixes | ✅ |
| ORG-01 | taxonomy reuse | same file — `auto_placement_reuses_an_existing_folder_instead_of_a_near_duplicate` (asserts the prompt saw the folder **and** the resulting path) | existing folder reused | ✅ |
| ORG-01 | control sends the mode | `apps/desktop/src/app/AppShell.test.tsx` — `sends the chosen organization mode with the capture`, `captures without enrichment when organization is declined` | `organize`/`organizeFolder` | ✅ |
| MENU-01 | rename moves file + drops stale hits | `knowledge_commands.rs` — `renaming_a_note_moves_the_file_and_drops_its_stale_search_hits` | new path only | ✅ |
| MENU-01 | refusals | `renaming_refuses_collisions_and_unsafe_names`, `deleting_a_folder_removes_its_contents_and_refuses_unsafe_paths` | Err, file untouched | ✅ |
| MENU-01 | menu actions + confirm + Escape | `AppShell.test.tsx` — `renames a note from the right-click menu`, `deletes a folder only after the confirmation is accepted`, `closes the context menu on Escape without acting` | per-AC behaviour | ✅ |
| DND-01 | drop moves | `AppShell.test.tsx` — `moves a note into the folder it is dropped on` | `moveEntry(path, folder)` | ✅ |
| DND-01 | pinned correction + self-nesting refusal | `knowledge_commands.rs` — `moving_a_note_relocates_it_and_records_a_pinned_correction`, `moving_refuses_self_nesting_and_collisions` | `recent_corrections == ["Docker"]` | ✅ |
| READ-01 | structure, metadata, wiki-links, raw HTML, unsaved edits | `apps/desktop/src/editor/MarkdownEditor.test.tsx` — five `reading view` tests | rendered elements, inert markup | ✅ |
| PANE-01 | drag + keyboard + persistence | `AppShell.test.tsx` — `resizes a pane by dragging its divider and persists the width` (asserts persisted `panes.explorer.width === 300`), `resizes a pane with the keyboard from the divider` | exact widths | ✅ |
| GRAPH-01 | no overlap, bounds, determinism, colouring | `apps/desktop/src/knowledge/forceLayout.test.ts` — six tests, dense-mesh separation | distance > r₁+r₂ | ✅ |
| CARD-01 | endpoint behind Advanced | `apps/desktop/src/settings/settings.test.tsx` — `hides the endpoint behind Advanced except for the compatible gateway` | not visible until expanded | ✅ |
| DEF-01 | default model, Main, privacy, notice, no Main theft | `settings.test.tsx` — `configures a usable default model, routing and privacy on connect`, `keeps an existing Main model when another provider connects` | exact configuration payload | ✅ |
| MIX-01 | segmentation, attachment, prose-only, framing section | `knowledge_commands.rs` — three `segment_capture` tests; `deterministic_pipeline.rs` — `framing_renders_in_its_own_section_and_is_omitted_when_absent` | exact split + section order | ✅ |
| LIB-01 | scope, summaries only, undo, threshold, refusals, suggestion | `apps/desktop/src-tauri/tests/librarian.rs` — six tests | moves inside target only; bodies never sent | ✅ |
| LIB-01 | UI report + undo | `AppShell.test.tsx` — `reorganizes a folder from the menu and offers a single undo` | report text + undo call | ✅ |

Spec-precision gaps: none outstanding. Two ACs were rewritten as assertions rather than left vague — the Librarian "reads only mini-summaries" AC is asserted on the request payload the fake port received, and the "no overlap" AC is asserted as a pairwise distance rather than a visual claim.

## Discrimination sensor

Behaviour-level faults injected in a scratch state, tests run, mutation discarded:

| # | Mutation | Result |
| - | -------- | ------ |
| M1 | `deterministic_context` cap widened past `MAX_CONTEXT_CHARACTERS` | **killed** (`deterministic_pipeline`) |
| M2 | vault path guard accepts dot-prefixed names | **killed** (`knowledge_commands`) |
| M3 | Librarian minimum-notes threshold disabled | **killed** (`librarian`) |
| M4 | graph collision resolution removed | **survived → fixed** (see below) |
| M5 | reading view renders node text as raw HTML | **killed** (`MarkdownEditor`) |

## Fix task raised by verification

**M4 exposed a real defect, not just a weak test.** The no-overlap requirement (GRAPH-01 AC 1) only held for sparse graphs; strengthening the test to a 60-node dense mesh made it fail against the *real* implementation — spring forces pulled nodes together faster than repulsion separated them, which is exactly the symptom #13 was filed for. Fixed in `5a888c6` with a bounded collision-only relaxation phase after the simulation; the strengthened test now fails when that phase is removed.

## Notes

- Pre-existing repo drift outside this feature: `cargo fmt --check` disagrees with five files this branch never touched (newer rustfmt), and that state predates this work.
