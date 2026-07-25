# Ready Backlog Specification

## Problem Statement

Eleven issues sit in `Ready` on the project board after the owner's live testing of the dev build. They span three areas: the organization system (mini-summaries, incremental filing, the Librarian pass, mixed-content capture), the Explorer/editor surface (context menu, drag-and-drop, Markdown preview, pane dividers, graph layout), and AI setup (provider cards, sensible defaults). Together they are what stands between "the app runs" and "the app is usable daily".

## Goals

- [ ] Every Ready issue (#4, #5, #7, #10, #12, #13, #14, #15, #17, #18, #29) closed with tests
- [ ] No new runtime dependency added — the lockfile check stays green and the app keeps building offline
- [ ] Every native mutation stays inside the granted vault and keeps SQLite consistent with the files
- [ ] `make check` stays green (minus the pre-existing rustfmt/prettier drift on files this feature does not touch)

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Full WYSIWYG editing (Obsidian "Live Preview") | #10 asks for a toggle between source and rendered reading view; inline editing of rendered content is a separate, much larger feature |
| Multi-file / multi-select drag in the Explorer | #7 describes single-item moves; batch selection is unrequested scope |
| Undo UI beyond the Librarian pass | #18 requires the Librarian's own batched undo; a general vault-wide undo stack is not requested |
| Automatic Librarian runs on capture | #18 explicitly forbids it — manual action + non-blocking suggestion only |
| Server-side / remote anything | AD-011: the deliverable is the local Tauri app |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Which model each provider defaults to (#15) | OpenAI `gpt-4.1-mini`, Anthropic `claude-sonnet-4-5`, DeepSeek `deepseek-chat`, Groq `llama-3.3-70b-versatile`, Compatible = none (user must add) | Cheap, current, general-purpose default per provider; the user can change it in one click afterwards | n |
| Whether connecting a provider silently enables AI processing and source-content privacy (#15) | Yes, applied automatically on the first successful connection, and stated in the UI where it happens | The issue asks for "paste key → connect" to already work; hiding it would repeat the reported support cost. Reversible in the same screen | n |
| Librarian model policy (#18) | Reuses the Main model unless the user picked an explicit `Librarian` model in Models & Routing | AD-004/AD-006 forbid silently choosing a pricier model; the issue's "may spend more tokens" becomes an explicit opt-in role | n |
| Librarian undo scope (#18) | One batched undo of the last pass, restoring every moved file to its previous path | The issue asks for "undone in one action"; a full history stack is unrequested | n |
| Mini-summary source when no AI is configured (#17) | Deterministic fallback: first sentence of the extracted body, truncated to 240 chars | Notes must carry `context:` even in the offline/no-AI path (AD-009), otherwise the Librarian and filer degrade silently | n |
| Mixed capture segmentation (#4) | Deterministic segmentation (URL scan + attachments + remaining prose as framing), no extra LLM call | The parts are unambiguous from the input itself; spending a model call to find URLs contradicts AD-006's "local/deterministic first" | n |
| Rendered preview link behavior (#10) | Wiki-links open the target note in the editor; external links are rendered but inert | Opening a browser from a reading view is unrequested and crosses the local-first boundary without a decision | n |
| Drag-and-drop correction feedback (#7) | Records a pinned facet membership for the destination folder and feeds the last 10 corrections to the enrichment prompt | Matches KOS-051 and the issue's "favor consistent placement over time" without inventing a learning system | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Machine-readable mini-summary on every note (#17) ⭐ MVP

**User Story**: As the organization system, I want one short `context:` line at the top of every generated note so that bulk features can read hundreds of notes cheaply.

**Why P1**: #5 and #18 both depend on it.

**Acceptance Criteria**:

1. WHEN a source capture is rendered THEN the note SHALL contain a `context:` frontmatter field placed after the existing metadata fields and before the body heading.
2. WHEN the Main model returns a `context` value THEN the note SHALL use it verbatim (trimmed, single line).
3. WHEN no AI enrichment is available THEN the note SHALL still carry a `context:` field derived deterministically from the body's first sentence, truncated to 240 characters.
4. WHEN a concept note is rendered THEN it SHALL carry the same `context:` field, sourced from its one-line definition.
5. WHEN a `context` value contains a quote or newline THEN the emitted frontmatter SHALL stay parseable (escaped/normalized to one line).

**Independent Test**: Capture a note with the fake AI port and assert the rendered Markdown's frontmatter contains the expected `context:` line.

---

### P1: Auto organize actually organizes (#5) ⭐ MVP

**User Story**: As a user capturing a source, I want to choose how it gets filed and have "Auto" respect the folders I already have.

**Acceptance Criteria**:

1. WHEN the composer's organize control is set to `Auto` THEN capture SHALL run Main-model enrichment as today.
2. WHEN it is set to a specific existing folder THEN the note SHALL be written under that folder and enrichment SHALL NOT override its placement.
3. WHEN it is set to `Don't organize` THEN the note SHALL be written to `Inbox/` with no enrichment call.
4. WHEN Main-model enrichment runs THEN the prompt SHALL include the vault's existing `Projects/` and `Areas/` folder names.
5. WHEN an existing folder name matches the model's proposal case-insensitively THEN the existing folder SHALL be reused rather than a near-duplicate created.

**Independent Test**: Capture with each of the three modes and assert the resulting document path and whether the fake AI port was called.

---

### P1: Explorer context menu (#29) ⭐ MVP

**Acceptance Criteria**:

1. WHEN a tree row is right-clicked THEN a context menu SHALL open at the cursor with the actions valid for that row kind.
2. WHEN `Rename` is chosen THEN the inline naming row SHALL open pre-filled with the current name, and confirming SHALL move the file/folder and refresh the tree.
3. WHEN `Delete` is chosen THEN the user SHALL confirm first, and the file/folder SHALL be removed from disk and from the tree.
4. WHEN a note is renamed or deleted THEN searching for its content SHALL NOT return the old path.
5. WHEN Escape is pressed or focus leaves THEN the menu SHALL close without acting.
6. WHEN a rename or delete targets a path outside the vault THEN the native command SHALL refuse it.

**Independent Test**: Rename a note through the menu and assert the new path exists, the old one does not, and search returns the new path.

---

### P2: Drag-and-drop reorganization (#7)

**Acceptance Criteria**:

1. WHEN a note row is dragged onto a folder row THEN it SHALL move into that folder and the tree SHALL refresh.
2. WHEN a folder is dragged onto another folder THEN it SHALL be nested inside it.
3. WHEN a folder is dragged onto itself or its own descendant THEN the move SHALL be refused without changing anything.
4. WHEN a manual move completes THEN it SHALL be recorded as a pinned organization correction for the destination folder.
5. WHEN Main-model enrichment runs afterwards THEN the prompt SHALL include the most recent corrections.

**Independent Test**: Drag `A/x.md` onto `B` and assert the file, the DB path and the pinned membership.

---

### P2: Markdown reading view (#10)

**Acceptance Criteria**:

1. WHEN a note is open THEN a view-mode control SHALL offer `Source` and `Reading`.
2. WHEN `Reading` is selected THEN headings, bold, italic, inline code, code blocks, lists, quotes, rules and links SHALL render as formatted HTML.
3. WHEN the note contains `[[Wiki Link]]` THEN reading view SHALL render it as a link that opens that note.
4. WHEN the note has frontmatter THEN reading view SHALL present it as note metadata, not as body text.
5. WHEN switching back to `Source` THEN unsaved edits SHALL be preserved.
6. WHEN the Markdown contains raw HTML THEN it SHALL be rendered as text, never as live markup.

**Independent Test**: Open a note with mixed Markdown and assert the rendered DOM has the expected elements.

---

### P2: Draggable pane dividers (#12)

**Acceptance Criteria**:

1. WHEN the divider between Explorer and Canvas is dragged THEN the Explorer width SHALL follow the pointer.
2. WHEN the divider between Canvas and Assistant is dragged THEN the Assistant width SHALL follow the pointer.
3. WHEN a drag ends THEN the new width SHALL be persisted through the same `WorkspaceLayout` path as the existing buttons.
4. WHEN a drag would push a pane below its minimum or above its maximum THEN the width SHALL clamp to the existing layout bounds.
5. WHEN the divider is focused THEN Left/Right arrows SHALL resize it by one step.

**Independent Test**: Drag the separator in the app and assert the persisted layout width changed.

---

### P2: Readable, interactive graph (#13)

**Acceptance Criteria**:

1. WHEN the graph opens THEN node positions SHALL come from a force simulation with repulsion, spring edges and collision so no two nodes overlap at rest.
2. WHEN a node is dragged THEN it SHALL follow the pointer and the simulation SHALL settle around it.
3. WHEN nodes are rendered THEN their color SHALL encode connectivity, with a legend explaining it.
4. WHEN reduced motion is requested THEN the layout SHALL settle without visible animation.
5. WHEN the graph is empty THEN the existing empty state SHALL still show.

**Independent Test**: Run the simulation over a known graph and assert no pair of nodes is closer than the sum of their radii.

---

### P3: Compact provider cards (#14)

**Acceptance Criteria**:

1. WHEN the provider list renders THEN each card SHALL show a provider mark instead of a monogram letter.
2. WHEN a provider is not the Compatible entry THEN the endpoint field SHALL be hidden behind an `Advanced` disclosure.
3. WHEN the Compatible entry renders THEN its endpoint field SHALL be visible without opening the disclosure.
4. WHEN the disclosure is opened THEN the endpoint SHALL be editable exactly as before.

**Independent Test**: Render settings and assert the endpoint input is absent until `Advanced` is expanded, except for Compatible.

---

### P3: Sensible AI defaults (#15)

**Acceptance Criteria**:

1. WHEN a provider connects successfully and no model is configured for it THEN a default model for that provider SHALL be added and enabled.
2. WHEN no Main model is assigned THEN the newly added model SHALL become Main.
3. WHEN the first provider connects THEN AI processing and source-content privacy SHALL be enabled.
4. WHEN a Main model already exists THEN connecting another provider SHALL NOT reassign Main.
5. WHEN defaults are applied THEN the UI SHALL state what was configured.

**Independent Test**: Connect a provider in settings and assert model, routing, enablement and the visible notice.

---

### P3: Mixed-content capture (#4)

**Acceptance Criteria**:

1. WHEN the composer content contains a URL plus prose THEN capture SHALL fetch the URL as the source and keep the prose as the user's framing.
2. WHEN a file is attached alongside prose THEN the file SHALL be the source and the prose SHALL be kept as framing.
3. WHEN framing text is present THEN the note SHALL carry it in a dedicated `## Notes from you` section.
4. WHEN framing text is present THEN it SHALL be included in the enrichment prompt.
5. WHEN the content contains several URLs THEN the first SHALL be the source and the rest SHALL be listed under the framing section.
6. WHEN the content is only prose THEN behavior SHALL be unchanged from today.

**Independent Test**: Capture "watched <url> and it explains X" and assert the source is the URL and the note contains the prose.

---

### P3: Librarian pass (#18)

**Acceptance Criteria**:

1. WHEN `Reorganize this folder` is invoked on a folder THEN exactly that folder's notes SHALL be considered.
2. WHEN the pass runs THEN the model SHALL receive only each note's `context:` mini-summary plus folder names, never full bodies.
3. WHEN the plan is applied THEN every move SHALL be executed inside the target folder and recorded as one batched, undoable operation.
4. WHEN the result is reported THEN an `Undo` action SHALL restore every moved file to its previous path.
5. WHEN a folder holds fewer than 8 notes THEN the action SHALL decline with an explanation instead of calling the model.
6. WHEN no Main/Librarian model is configured THEN the action SHALL fail closed with a clear message.
7. WHEN a folder's note count crosses the threshold THEN a non-blocking suggestion SHALL appear; it SHALL never reorganize on its own.

**Independent Test**: Run the pass against a fake AI port over a folder of 10 notes, assert files moved into proposed sub-folders and that undo restores them.

---

## Edge Cases

- WHEN a rename target already exists THEN the command SHALL refuse rather than overwrite.
- WHEN a moved note is currently open in the editor THEN the open tab SHALL follow the new path.
- WHEN a drag is dropped on empty space THEN nothing SHALL change.
- WHEN the graph has one node THEN the simulation SHALL still settle and render it centered.
- WHEN reading view renders a note with no body THEN it SHALL show the metadata and an empty body without error.
- WHEN the Librarian plan references a file that disappeared mid-run THEN that move SHALL be skipped and reported, and the rest SHALL still apply.

---

## Requirement Traceability

| Requirement ID | Story | Issue | Status |
| -------------- | ----- | ----- | ------ |
| MINI-01 | P1 mini-summary | #17 | Verified |
| ORG-01 | P1 auto organize | #5 | Verified |
| MENU-01 | P1 context menu | #29 | Verified |
| DND-01 | P2 drag and drop | #7 | Verified |
| READ-01 | P2 reading view | #10 | Verified |
| PANE-01 | P2 pane dividers | #12 | Verified |
| GRAPH-01 | P2 graph layout | #13 | Verified |
| CARD-01 | P3 provider cards | #14 | Verified |
| DEF-01 | P3 AI defaults | #15 | Verified |
| MIX-01 | P3 mixed capture | #4 | Verified |
| LIB-01 | P3 Librarian | #18 | Verified |

---

## Success Criteria

- [ ] Each of the eleven issues can be demonstrated in the running app by its Independent Test
- [ ] Unit/integration/e2e suites all green, with new tests per requirement
- [ ] No new dependency in `package.json` / `Cargo.toml`
- [ ] Every native path mutation refuses traversal, absolute and dot-prefixed paths
