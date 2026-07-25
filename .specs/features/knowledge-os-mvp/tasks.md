# Knowledge OS MVP Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules. The spec acceptance criteria are the source of truth; tests are written from those outcomes before implementation and may never be weakened, skipped or deleted to force a pass.

**Owner checkpoint release:** The owner approved the frontend and explicitly released commits on 2026-07-24. T01–T14 are consolidated as one reviewed baseline commit because their files and gates evolved together under the former no-commit checkpoint and splitting the final tree retroactively would create non-buildable commits. T15 onward returns to atomic implementation commits. `main` remains owner-only; work continues on `dev`.

**Design:** `.specs/features/knowledge-os-mvp/design.md`

**Status:** Active — frontend approved; execute from T15

## Execution Results

### Phase 3 — In progress

| Task | Evidence | Result |
| --- | --- | --- |
| T15 | `knowledge-domain` 26/26 tests; workspace Rust library gate passed | ✅ Complete |
| T16 | `knowledge-storage` 21/21 integration tests; `make test-full` passed including 19/19 desktop E2E | ✅ Complete |
| T17 | vault journal/trash 14/14 fault tests and Clippy passed | ✅ Complete |
| T18 | deterministic normalization/chunk/render 19/19 tests and Clippy passed | ✅ Complete |

### Batch 1 / Phase 1 — Complete, independently verified, uncommitted

| Tasks | Evidence | Result |
| --- | --- | --- |
| T01–T07 | Root `make check` after worker completion: contracts 21, shared TS fixtures 12, UI 4, Rust domain 11, Python 16, Tauri IPC 7 and shared Rust fixtures 12; all formatting, lint, typecheck and builds passed | ✅ 83 tests, 0 failures |

The native Tauri gate uses the documented temporary sysroot at `/tmp/knowledge-os-tauri-sysroot-20260724/root` because this host has runtime GTK/WebKit libraries but not the corresponding system development packages. No repository artifact depends on that temporary path.

### Batch 2 / Phase 2 — Complete, independently verified, uncommitted

| Tasks | Evidence | Result |
| --- | --- | --- |
| T08–T14 | Root reran `make check`: contracts 21, shared TS fixtures 12, UI primitives 12, desktop UI 77, Rust domain 11, IPC 8, Markdown 14, settings/security 30, shared Rust fixtures 12, Python 16 and Playwright 18; all format/lint/typecheck/build gates passed | ✅ 231 unique tests, 0 failures |

Owner review artifacts are in `artifacts/desktop-foundation/`. Work is intentionally frozen before T15 until the owner approves the frontend; review revisions remain part of Phase 2 and stay uncommitted.

## Test Coverage Matrix

> Generated from the empty codebase, approved spec/design and strong defaults. Guidelines found: `.specs/features/knowledge-os-mvp/spec.md`, `.specs/features/knowledge-os-mvp/design.md`; no pre-existing test suite or runner configuration exists. The owner delegated engineering choices by describing themselves as an app user rather than product/technical manager.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Rust domain/policies | unit + property | Every branch; 1:1 to applicable ACs and edge cases; >=90% line/branch | `crates/*/src/**` + `crates/*/tests/**/*_test.rs` | `make test-rust` |
| Rust storage/adapters/jobs | integration + fault injection | Every public path: happy, boundary, retry/error, concurrency/crash cases | `crates/*/tests/**/*_integration.rs` | `make test-rust-integration` |
| React components/state | unit + accessibility | Every visible state and keyboard interaction; >=85% line/branch/function | `apps/desktop/src/**/*.test.ts?(x)` | `make test-ui` |
| Tauri IPC/desktop flows | contract + e2e | Every command: happy + validation + error; every P1 vertical flow | `apps/desktop/src-tauri/tests/**`, `tests/e2e/**` | `make test-desktop-e2e` |
| Python API/domain/worker | unit + integration | Every route/activity: happy + all listed edge/error paths; >=90% domain coverage | `apps/{api,worker}/tests/**` | `make test-python` |
| Cross-language contracts | schema/golden | Rust, TypeScript and Python consume identical valid/invalid golden payloads | `packages/contracts/tests/**`, `packages/test-fixtures/**` | `make test-contracts` |
| Retrieval/performance | integration + benchmark | Exact ranking fixtures, filter combinations, fallback and KOS-024 p95 budget | `tests/integration/retrieval/**`, `tests/performance/**` | `make test-retrieval` |
| Infrastructure/config/schema | static/build | Parse, format, validate and policy-check every artifact; no runtime unit tests | `infra/**`, `ops/**`, `.github/workflows/**` | `make validate-infra` |
| Full product | e2e + restore + mutation | All P1 flows, backup/restore, offline degradation and discrimination sensor | `tests/e2e/**`, `tests/integration/**` | `make test-e2e` |

Tests may exceed numeric thresholds when required to cover every spec outcome; percentages are floors, never substitutes for AC mapping.

## Gate Check Commands

> These stable root commands are created in T01 and become authoritative before product code is written.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Unit/contract-only task | `make test-quick` |
| Full | Storage, adapter, IPC, integration or e2e task | `make test-full` |
| Build | Config-only task and every phase end | `make check` |

`make check` SHALL run format checks, lint, typecheck, Rust/TypeScript/Python tests, contract checks and all currently buildable artifacts. Infrastructure and OS-matrix checks join it as their phases are introduced.

## Tool Routing

| Code | Tools |
| --- | --- |
| `L` | Local filesystem, `rg`, `apply_patch`, native package/build/test commands |
| `D` | Official documentation research through web when a current API/version must be verified |
| `G` | Local Git/`gh` for CI/repository configuration; never merge or push implementation to `main` |
| `S` | `tlc-spec-driven` Execute flow, including per-task evidence and final independent Verifier |

Every task uses `L+S`; tasks marked `D` must follow codebase→project docs→official docs; tasks marked `G` use the GitHub publication/CI workflow where applicable. No additional MCP is required.

## Execution Plan

Phases execute strictly in order and each task depends on its immediate predecessor.

```text
Phase 1 Foundation (T01–T07)
  → Phase 2 Desktop (T08–T14)
  → Phase 3 Knowledge Model (T15–T21)
  → Phase 4 Ingestion (T22–T28)
  → Phase 5 AI + Organization (T29–T35)
  → Phase 6 Retrieval + Assistant (T36–T42)
  → Phase 7 Optional Server (T43–T49)
  → Phase 8 Production Engineering (T50–T58)
```

### Phase 1: Polyglot Foundation

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Root toolchain, ignore/editor config and stable Make gates: root manifests | KOS-040 | None | L+D+S | none / Build | pnpm/Cargo/uv locks are pinned; `make test-quick`, `test-full`, `check` exist and pass on empty suites |
| T02 | Canonical JSON Schemas and TS generation: `packages/contracts/` | KOS-006,014,028 | T01 | L+S | contract (>=12) / Quick | valid/invalid fixtures cover IDs, errors, source kinds, events and AI usage; generated TS is reproducible |
| T03 | Rust workspace boundaries and typed error core: `Cargo.toml`, `crates/knowledge-domain/` | KOS-014 | T02 | L+D+S | unit (>=8) / Quick | workspace compiles; ID/error/value types reject invalid states and serialize to contract fixtures |
| T04 | React/Vite workspace and test harness: `apps/desktop/`, `packages/ui/` | KOS-001 | T03 | L+D+S | UI smoke (>=4) / Quick | TS strict/typecheck, lint, Vitest and DOM accessibility harness pass |
| T05 | uv workspace and Python test harness: root `pyproject.toml`, `apps/api`, `apps/worker` | KOS-036 | T04 | L+D+S | Python smoke (>=4) / Quick | uv lock is reproducible; Ruff, mypy and pytest gates pass for both apps |
| T06 | Tauri 2 shell, IPC manifest and default-deny capability baseline: `apps/desktop/src-tauri/` | KOS-001,020 | T05 | L+D+S | IPC contract (>=5) / Full | native shell builds; only declared commands are invokable; unauthorized/unknown command fixtures fail closed |
| T07 | Golden source/provider/vault fixtures and cross-stack loaders: `packages/test-fixtures/` | all P1 | T06 | L+S | golden (>=12) / Build | TS/Rust/Python load identical fixtures; invalid fixtures fail identically; whole phase passes `make check` |

### Phase 2: Desktop Foundation

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T08 | Dense desktop design tokens and accessible primitives: `packages/ui/` | KOS-001,003 | T07 | L+S | UI unit (>=10) / Quick | dark-first tokens, focus, menus, buttons, panes and reduced-motion states meet snapshot/a11y outcomes |
| T09 | Main shell with onboarding gate and `Ingest`/`Retrieve` modes: `apps/desktop/src/app/` | KOS-001,005,054 | T08 | L+S | UI unit (>=10) / Quick | accessible mode switch, offline/local/index state and sparse Ingest vs workspace Retrieve layouts are exact; no dashboard cards |
| T10 | Serializable three-pane/tabs/splits/previews/pins layout model: `apps/desktop/src/workspace/` | KOS-004,056 | T09 | L+S | unit/property (>=14) / Quick | Explorer/canvas/assistant resize/collapse plus split/close/pin invariants hold; invalid saved layouts recover deterministically |
| T11 | Shared command registry and `Ctrl/Cmd+K` palette: `apps/desktop/src/commands/` | KOS-003 | T10 | L+S | UI/keyboard (>=12) / Quick | every specified command is searchable and executable without mouse; shortcut conflicts are rejected |
| T12 | Accountless create/open local-vault setup plus dedicated AI settings, SQLite layout persistence and Stronghold boundary | KOS-004,005,040,058–060,063 | T11 | L+D+S | integration/security (>=24) / Full | Continue without account atomically creates or opens an explicitly selected local vault offline; collisions leave no partial vault; provider connections support masked test/rotate/remove; stored plaintext/arbitrary paths never return to renderer |
| T13 | Markdown note I/O and CodeMirror editor: `editor/` + Rust commands | KOS-002 | T12 | L+D+S | unit+IPC (>=14) / Full | UTF-8/frontmatter/wiki links round-trip; malformed metadata yields diagnostics without data loss |
| T14 | Desktop-foundation e2e and keyboard/a11y audit: `tests/e2e/desktop-foundation/` | KOS-001–005,054–060,063 | T13 | L+S | e2e (>=16) / Build | accountless offline create/open local vault, provider/settings lifecycle, Ingest/Retrieve switch, three-pane restore, read-only agent boundary, note edit and offline restart pass |

### Phase 3: Knowledge Model and Graph

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T15 | Domain entities, relations and processing state machine: `knowledge-domain` | KOS-010,014,018 | T14 | L+S | unit/property (>=24) / Quick | all valid transitions/types pass; invalid transitions/self-edges/duplicate identities fail precisely |
| T16 | SQLite migrations and repositories for knowledge models: `knowledge-storage` | KOS-014,018 | T15 | L+D+S | integration (>=20) / Full | schema/indexes/FKs/unique keys persist every model and reject duplicate/invalid records transactionally |
| T17 | Recoverable vault staging journal and transactional delete/trash: storage | KOS-002,019,046 | T16 | L+S | fault integration (>=14) / Full | injected crash at every journal boundary recovers or cleans orphan; delete is indexed-consistent and recoverable |
| T18 | Deterministic Markdown parser/renderer and provenance locators: ingestion/storage | KOS-015,016 | T17 | L+S | golden/property (>=18) / Quick | schema result renders stable Markdown; parse/render preserves user content; PDF/YT/web locators resolve |
| T19 | Canonical concepts, aliases, typed edges/evidence and bounded traversal: graph crate | KOS-017–019,023 | T18 | L+S | unit+integration (>=22) / Full | exact/alias resolution and edge dedup preserve multi-source evidence; cyclic traversal stays bounded |
| T20 | Extensible facets, memberships and organization audit/undo repositories | KOS-048,050,051 | T19 | L+S | unit+integration (>=18) / Full | multi-project membership, pinned corrections, prior-state audit and atomic undo satisfy fixtures |
| T21 | Library, Inbox, backlinks, inspector and local graph UI: desktop features | KOS-019,023,048 | T20 | L+S | UI+e2e (>=18) / Build | facets overlap visibly; backlink/edge/evidence navigation opens exact source; empty/error states pass; phase gate passes |

### Phase 4: Deterministic Ingestion

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T22 | SQLite durable job queue, leases, retries, cancellation and progress events | KOS-006,010,011 | T21 | L+S | concurrency/fault (>=20) / Full | two-job limit, monotonic states, reclaim, three-attempt bound and same-key retry are empirically proven |
| T23 | Sparse Ingest composer + capture service with URL/file/text validation: UI + IPC | KOS-006,007,055 | T22 | L+S | UI+IPC (>=20) / Full | one composer handles six sources and drag/drop with progress; invalid inputs reject before persistence and remain editable |
| T24 | Plain text, Markdown and manual/meeting-note adapters | KOS-006,008 | T23 | L+S | adapter integration (>=15) / Full | normalization/hash/metadata are deterministic; meeting summaries enter the same scalable pipeline |
| T25 | Safe webpage fetch/readability/sanitization adapter | KOS-008,011,013 | T24 | L+D+S | adapter/security (>=18) / Full | redirect/SSRF/timeouts/retries and hostile HTML fixtures pass; no raw HTML reaches AI/index |
| T26 | PDF text-layer extraction, structure and bounded OCR fallback adapter | KOS-008,012 | T25 | L+D+S | adapter (>=16) / Full | text PDFs avoid OCR; image pages invoke only bounded fallback; pages/chunks remain traceable |
| T27 | YouTube metadata/transcript/timestamp adapter with transcription boundary | KOS-008,012 | T26 | L+D+S | adapter (>=16) / Full | normalized URLs dedup; usable transcript avoids audio; missing/disabled transcript yields typed fallback state |
| T28 | Structure-aware chunking, hashing, duplicate reuse and end-to-end deterministic pipeline | KOS-008–012,019 | T27 | L+S | integration/e2e (>=24) / Build | all source fixtures reach correct state; concurrent duplicates commit once; chunks honor bounds/locators; phase gate passes |

### Phase 5: AI Extraction and Adaptive Organization

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T29 | Internal AI port, deterministic fake, structured response schemas and artifact cache | KOS-025,027,029 | T28 | L+S | unit+contract (>=22) / Quick | cache key includes normalized input+versions+params; invalid schema never mutates canonical state |
| T30 | Versioned model catalog, `Main`/task assignments, explicit fallbacks, token/cost budgets and fail-closed selection | KOS-028,030,053,059,061–062 | T29 | L+D+S | unit/property (>=28) / Quick | exactly one eligible Main is stable for organization; assistant choices are configured/healthy; unknown/over-budget models fail; fallback/Deep require explicit opt-in |
| T31 | Stronghold provider connections plus OpenAI/DeepSeek, Anthropic and LiteLLM-compatible transports | KOS-005,028,053,059–060 | T30 | L+D+S | integration/security (>=22) / Full | independent masked credentials and test/rotate/remove work; stored keys never return to renderer/logs; native/compatible fallback and usage responses normalize |
| T32 | One-call structured extraction and bounded hierarchical large-source synthesis | KOS-025,026,029,030 | T31 | L+S | fake-provider integration (>=20) / Full | Standard small source uses one call; large input selects bounded sections; Quick/Deep modes execute exact scope |
| T33 | Cheap-first entity resolution with bounded local candidates and ambiguous AI fallback | KOS-017,049 | T32 | L+S | unit/integration (>=20) / Full | exact→alias→fuzzy→vector order holds; only unresolved ambiguity calls AI; whole vault is never serialized |
| T34 | Adaptive organization scoring, `Main` model execution, confidence bands, corrections and transactional undo | KOS-048–051,061 | T33 | L+S | unit/property (>=28) / Full | Main performs extraction/categorization/organization within budget; auto/suggest/Inbox thresholds are exact; audit explains signals; pinned correction wins later |
| T35 | AI ingestion integration: Main assignment, explicit fallback, render, graph, index, cache and cost dashboard | KOS-015–019,025–030,061 | T34 | L+S | e2e (>=20) / Build | YT/meeting/paper fixtures use Main, only explicit fallback, organize overlapping projects with provenance/cache/cost and pass the phase gate |

### Phase 6: Retrieval and Grounded Assistant

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T36 | FTS5 external-content index, exact/alias/BM25 search, snippets and rebuild | KOS-020,022,024 | T35 | L+D+S | integration/perf (>=24) / Full | ranking golden tests pass; transactional updates stay consistent; rebuild repairs drift; p95 target passes |
| T37 | Optional sqlite-vec embedding/version adapter and lexical fallback | KOS-021,022,026 | T36 | L+D+S | integration (>=18) / Full | unchanged hashes skip embedding; model version refreshes only stale rows; disabled adapter preserves results |
| T38 | Deterministic query planner, facet/time filters, graph expansion and rank fusion | KOS-020–023,031,052 | T37 | L+S | unit+integration (>=28) / Full | every routing heuristic/filter combination and stable RRF ordering match golden outcomes with zero router calls |
| T39 | Context compression/budget/citation builder | KOS-032,034 | T38 | L+S | unit/property (>=24) / Quick | 3–8 diverse chunks when available, 12k ceiling, dedup and retained resolvable locators are exact |
| T40 | Assistant use case with evidence threshold, one answer call and offline recovery | KOS-031–035 | T39 | L+S | integration (>=22) / Full | supported answer calls once; unsupported calls zero and cites none; invalid citation rejects; query survives outage |
| T41 | Retrieve three-pane Explorer/canvas/search/graph UX with scopes and source navigation | KOS-020–024,052,056 | T40 | L+S | UI/e2e (>=22) / Full | physical/virtual Explorer, tabbed canvas, compound scopes, ranking/provenance and persisted panes open exact source locations |
| T42 | Read-only assistant workspace, configured-model selector and grounded-RAG e2e | KOS-031–035,052–053,057,062 | T41 | L+S | e2e (>=22) / Build | only configured/healthy/policy-allowed models appear; conversation choice and answer model persist; stream/cancel/errors/citations/cost/offline pass; no mutation/research tool exists |

### Phase 7: Optional Server and Durable Workflows

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T43 | Versioned remote contracts and FastAPI feature-module application | KOS-036 | T42 | L+D+S | contract/route (>=24) / Full | source/document/knowledge/graph/retrieval/assistant/audit routes obey shared schemas and auth boundary |
| T44 | PostgreSQL/pgvector migrations and repository adapters | KOS-036 | T43 | L+D+S | DB integration (>=20) / Full | relational invariants match local model; vector/version queries and errors pass against disposable DB |
| T45 | Transactional outbox publisher and consumer idempotency | KOS-037 | T44 | L+S | transaction/fault (>=18) / Full | write+event are atomic; crash/redelivery produce one expensive operation and observable state |
| T46 | Worker parser/extractor/embedding/indexing activities | KOS-036,038 | T45 | L+S | unit+integration (>=20) / Full | activities are bounded/idempotent and return typed retry classification/progress |
| T47 | Temporal workflows with retry/backoff/cancel/resume visibility | KOS-038 | T46 | L+D+S | workflow integration (>=16) / Full | injected activity failure retries only eligible step; cancellation and replay remain deterministic |
| T48 | Desktop explicit remote mode with contract compatibility and local fallback | KOS-039 | T47 | L+S | IPC/e2e (>=16) / Full | switching is explicit; remote outage never blocks local workspace; no silent data-mode change |
| T49 | Optional server Compose profile and end-to-end outbox/workflow test | KOS-036–039 | T48 | L+S | e2e (>=10) / Build | profile health, acceptance, injected failure/retry/idempotency and stopped-profile desktop all pass |

### Phase 8: Production Engineering

| ID | Deliverable / location | Req. | Depends | Tools | Tests / Gate | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| T50 | One-command local development and documented Compose profiles | KOS-040 | T49 | L+D+S | smoke/static (>=8) / Full | `make dev` starts required healthy services; local-only/AI/server/observability profiles are explicit |
| T51 | Pinned multi-stage non-root API/worker images with health checks | KOS-042 | T50 | L+D+S | container (>=8) / Full | images build, scan, run non-root, become healthy and stop cleanly |
| T52 | OpenTelemetry/log/metric stack and privacy-safe cost dashboard | KOS-028,043 | T51 | L+D+S | integration/privacy (>=14) / Full | correlated desktop/API/worker/storage/AI telemetry appears; fixtures prove no keys/source bodies leak |
| T53 | Consistent local/cloud backup, snapshot and fixture restore tooling | KOS-046 | T52 | L+S | restore e2e (>=10) / Full | vault+attachments+DB restore to searchable consistent state; corrupt/incomplete backup fails safely |
| T54 | GitHub CI quality/build/security/dependency/SBOM matrix | KOS-041 | T53 | L+D+G+S | workflow/static / Build | PR workflows run all gates on supported OSes; exact successful check names are added to `main` protection |
| T55 | Terraform modules/environments with format, validation and policy checks | KOS-044 | T54 | L+D+S | infra static / Build | network/database/storage/compute/observability/secrets modules validate without provisioning |
| T56 | Kubernetes, Helm and GitOps staging artifacts | KOS-044 | T55 | L+D+S | schema/policy / Build | Deployment/Service/Ingress/config/secret refs/HPA/jobs/network policies render and pass policy checks |
| T57 | Cross-platform desktop build, signing gates, tag release and updater workflow | KOS-045 | T56 | L+D+G+S | workflow/build / Build | unsigned validation builds on Linux/Windows/macOS; publication fails closed without owner secrets |
| T58 | ADRs, operational runbooks and final fixture-backed system/UAT guide | KOS-047, all | T57 | L+S | docs links + e2e / Build | specified ADR/runbooks exist, commands are executable, all 63 requirements trace to evidence and full gate passes |

## Phase Execution Map

```text
T01 → T02 → T03 → ... → T57 → T58

P1 T01–T07 → P2 T08–T14 → P3 T15–T21 → P4 T22–T28
            → P5 T29–T35 → P6 T36–T42 → P7 T43–T49 → P8 T50–T58
```

Tasks are deliberately sequential because later layers consume contracts, gates and invariants from earlier ones. No phase is split across execution workers.

## Task Granularity Check

| Phase | Tasks | Atomic scope | Status |
| --- | --- | --- | --- |
| P1 | T01–T07 | one workspace/toolchain/contract/fixture boundary each | ✅ Granular |
| P2 | T08–T14 | one desktop component or one e2e acceptance boundary each | ✅ Granular |
| P3 | T15–T21 | one domain/storage/graph/library component each | ✅ Granular |
| P4 | T22–T28 | one job/capture/adapter/chunking boundary each | ✅ Granular |
| P5 | T29–T35 | one AI policy/adapter/extraction/organization boundary each | ✅ Granular |
| P6 | T36–T42 | one retrieval/context/assistant/UI boundary each | ✅ Granular |
| P7 | T43–T49 | one remote module/repository/workflow/integration boundary each | ✅ Granular |
| P8 | T50–T58 | one operations artifact class each | ✅ Granular |

Multi-file tasks are limited to a single cohesive component plus its co-located tests/generated output. Splitting them further would produce uncompilable or untestable artifacts.

## Diagram-Definition Cross-Check

The task bodies use a formal linear dependency invariant: `T01` depends on none; every `Tnn` for `nn > 01` depends only on `T(nn-1)`. The diagram shows the same complete linear chain and phase ranges.

| Tasks checked | Depends On (body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T01 | None | chain root | ✅ Match |
| T02–T07 | immediate predecessor | linear arrows inside P1 | ✅ Match (6/6) |
| T08–T14 | immediate predecessor, including T08←T07 | P1→P2 and linear P2 | ✅ Match (7/7) |
| T15–T21 | immediate predecessor, including T15←T14 | P2→P3 and linear P3 | ✅ Match (7/7) |
| T22–T28 | immediate predecessor, including T22←T21 | P3→P4 and linear P4 | ✅ Match (7/7) |
| T29–T35 | immediate predecessor, including T29←T28 | P4→P5 and linear P5 | ✅ Match (7/7) |
| T36–T42 | immediate predecessor, including T36←T35 | P5→P6 and linear P6 | ✅ Match (7/7) |
| T43–T49 | immediate predecessor, including T43←T42 | P6→P7 and linear P7 | ✅ Match (7/7) |
| T50–T58 | immediate predecessor, including T50←T49 | P7→P8 and linear P8 | ✅ Match (9/9) |

No task depends on a later phase; all 58 definitions are represented.

## Test Co-location Validation

| Tasks | Layer modified | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T01, T50–T58 config-only portions | config/infra/docs | static/build; e2e where behavior exists | Build plus explicit smoke/e2e | ✅ OK |
| T02, T07 | cross-language contracts/fixtures | schema/golden | contract/golden co-located | ✅ OK |
| T03, T10, T15, T18–T20, T29–T30, T33–T34, T38–T40 | domain/policies | unit/property, all branches/ACs | unit/property with AC/edge minima | ✅ OK |
| T04, T08–T11, T13–T14, T21, T23, T35, T41–T42 | React/desktop | UI unit+a11y and vertical e2e | UI/keyboard/IPC/e2e co-located | ✅ OK |
| T06, T12, T22, T31, T48 | Tauri IPC/security/jobs | contract+integration+error paths | IPC/integration/security/fault | ✅ OK |
| T16–T17, T24–T28, T32, T36–T37 | storage/adapters/retrieval | integration+fault/perf | integration/fault/perf co-located | ✅ OK |
| T05, T43–T47, T49 | Python/server/worker | unit+route/activity integration | Python contract/route/DB/workflow/e2e | ✅ OK |

Every task modifying executable behavior includes its required tests in the same task. `Tests: none` appears only in T01's empty-suite bootstrap; its Build gate proves the configured runners execute.

## Pre-Approval Verdict

- Granularity: **58/58 valid**; cohesive multi-file exceptions are self-testable components.
- Diagram-definition consistency: **58/58 match**.
- Test co-location: **58/58 conform** to the matrix.
- Requirement mapping: **63/63 requirements mapped**, plus all spec edge cases assigned to applicable task tests.
- Planned execution batches: **8 sequential whole-phase batches** with task counts `7, 7, 7, 7, 7, 7, 7, 9`.
