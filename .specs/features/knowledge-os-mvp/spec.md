# Knowledge OS MVP Specification

**Source of truth:** `knowledge-os-system-design.md`

**Status:** Draft — awaiting owner confirmation

**Scope:** Complex, multi-component product

## Problem Statement

Knowledge workers accumulate videos, PDFs, web pages and notes in disconnected places, then cannot recover or connect what they learned without repetitive manual organization. Knowledge OS shall provide a professional local-first desktop workspace that turns those sources into durable, traceable Markdown, a navigable knowledge graph and grounded retrieval, while keeping LLM use observable and deliberately small.

## Goals

- [ ] Deliver the complete seven-milestone MVP described by the source design as independently testable vertical slices.
- [ ] Keep capture, editing, graph navigation, backlinks and lexical search usable without cloud availability.
- [ ] Make every generated claim traceable to an original source location and every expensive operation idempotent, cached and observable.
- [ ] Ship a maintainable monorepo with deterministic local development, CI, release validation and production-ready infrastructure artifacts.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Knowledge-gap detection, mastery or skill scoring | Explicitly excluded by the product design |
| Quizzes, spaced repetition and automatic learning paths | Explicitly excluded from the capture→structure→connect→retrieve loop |
| Contradiction detection and personal knowledge scoring | Deferred product layer |
| Autonomous or multi-agent product workflows | Explicitly excluded from the MVP |
| Mandatory cloud account or cloud dependency | Conflicts with local-first operation |
| Live production cluster, paid cloud resources and DNS | Require owner credentials, budget and environment choices; repository will contain validated IaC/templates only |
| Production code-signing/notarization | Requires owner-held platform certificates; CI will expose explicit credential gates |
| Fully implemented synchronization | The source design marks synchronization optional/future; the MVP preserves sync boundaries without pretending data is synchronized |

---

## Assumptions & Open Questions

Every ambiguity is resolved to a documented default. Approving this specification confirms these defaults.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Meaning of “implement the document completely” | Implement Milestones 1–7; future-only cloud/Kubernetes/GitOps items become buildable, validated repository artifacts rather than a live deployment | Matches the document's MVP/future boundary and is locally verifiable | No |
| User model | Single-user, one local vault per workspace; no login is required for local use | No identity UX is specified and local-first is primary | No |
| Remote backend | Functional optional FastAPI modular monolith and worker boundaries; desktop core never depends on them | Preserves the specified repository/production architecture without violating offline use | No |
| AI provider | Provider-neutral contract, one OpenAI-compatible HTTP adapter, and a deterministic fake provider for tests | Avoids vendor lock-in and makes the system testable without secrets | No |
| AI processing modes | Quick and Standard are complete MVP behaviors; Deep is an explicit, user-triggered extension point and never runs silently | The document defines Deep as potential behavior rather than a closed feature set | No |
| Semantic search | Optional, locally feature-flagged augmentation; lexical/concept/graph retrieval always works without it | Embeddings are explicitly an augmentation, not a prerequisite | No |
| Source limits | URL ≤ 2,048 characters; pasted text/Markdown ≤ 20 MiB; PDF ≤ 250 MiB; larger input is rejected before processing with a typed error | Provides deterministic validation and protects desktop resources | No |
| Network retry policy | Connect/read timeout of 30 seconds, at most 3 attempts with bounded exponential backoff; retries reuse the same idempotency key | Gives precise failure behavior without duplicate cost | No |
| Processing concurrency | At most 2 ingestion jobs per workspace and one AI extraction per source/version tuple | Bounds local resource use and duplicate inference | No |
| Deletion/lifecycle | No automatic expiry; explicit source deletion removes derived indexes/edges in one transaction and moves owned files to a recoverable trash location | User owns the data and accidental loss must be recoverable | No |
| Supported validation host | Linux is the local development host; Windows and macOS are validated through CI build jobs | Cross-platform signing/runtime access is not available in this workspace | No |
| Git governance | `main` is production-only; `dev` is integration; implementation uses task commits on `dev` (or short-lived `agent/*` branches when PRs are needed); only the owner merges/promotes to `main` | Enforces the requested ownership boundary | No |
| Visual implementation | Dense dark-first desktop UI, restrained neutral palette, resizable panes, keyboard-first controls and no generic dashboard cards | Directly reflects the visual direction in the design | No |

**Open questions:** none — all current ambiguities are logged as defaults above; owner approval confirms or replaces them.

---

## User Stories

### P1: Local Desktop Workspace ⭐ MVP

**User Story:** As a knowledge worker, I want a native desktop workspace so that I can navigate and edit my knowledge without depending on a web service.

**Acceptance Criteria:**

1. **KOS-001** — WHEN the desktop starts with a valid workspace THEN it SHALL render the library sidebar, tab/split-pane workspace, inspector and local/index status without making a required network request.
2. **KOS-002** — WHEN the user opens or edits a Markdown note THEN it SHALL read/write ordinary UTF-8 Markdown inside the vault and preserve valid frontmatter and wiki links.
3. **KOS-003** — WHEN the user invokes `Ctrl/Cmd+K` THEN the command palette SHALL expose the commands named in the source design and execute them by keyboard.
4. **KOS-004** — WHEN panes or tabs are resized, split, pinned or restored THEN workspace state SHALL persist locally and restore on the next launch.
5. **KOS-005** — WHEN the remote API or AI provider is unavailable THEN notes, editing, lexical search, backlinks and graph navigation SHALL remain usable.

**Independent Test:** Launch against a temporary vault with networking disabled; create/edit a note, split a pane, search it, follow a backlink, restart and verify workspace restoration.

### P1: Source Capture and Deterministic Ingestion ⭐ MVP

**User Story:** As a user, I want to add common learning sources with minimal navigation so that useful knowledge is processed in the background.

**Acceptance Criteria:**

1. **KOS-006** — WHEN the user pastes or drops a YouTube URL, PDF, web URL, plain text, Markdown file or manual note within the documented bounds THEN the system SHALL create a Source immediately with state `PENDING` and enqueue processing without blocking the UI.
2. **KOS-007** — WHEN input is unsupported, malformed or exceeds its bound THEN the system SHALL reject it before persistence with a typed validation error and SHALL enqueue no job.
3. **KOS-008** — WHEN content is processed THEN URI normalization, extraction, cleanup, hashing, structure-aware chunking, metadata parsing and duplicate detection SHALL run deterministically before any LLM call.
4. **KOS-009** — WHEN an identical normalized content hash and pipeline version already exists THEN ingestion SHALL reuse prior artifacts and SHALL make zero additional extraction calls.
5. **KOS-010** — WHEN processing progresses THEN the source SHALL transition only through `PENDING→FETCHING→EXTRACTING→PROCESSING→INDEXING→COMPLETED`, or from an active state to `FAILED`/`CANCELLED`, and the UI SHALL show the persisted current state.
6. **KOS-011** — WHEN a remote fetch fails transiently THEN the workflow SHALL make no more than three attempts with the same idempotency key; final failure SHALL preserve completed artifacts and a retryable typed error.
7. **KOS-012** — WHEN a usable YouTube transcript or PDF text layer exists THEN the system SHALL use it and SHALL not invoke audio transcription or OCR; fallback SHALL be limited to missing content.
8. **KOS-013** — WHEN a webpage is ingested THEN scripts, navigation, ads and unsafe HTML SHALL be removed before cleaned article text can reach indexing or AI.

**Independent Test:** Import one fixture of every source type, a duplicate, an oversize fixture and transient-failure fixtures; inspect states, artifacts and AI-call counters.

### P1: Durable Knowledge Model and Graph ⭐ MVP

**User Story:** As a user, I want processed sources represented as portable notes and canonical concepts so that the graph is another view of the same knowledge.

**Acceptance Criteria:**

1. **KOS-014** — WHEN extraction succeeds THEN the system SHALL persist Source, Document, Concept, KnowledgeEdge and Chunk records with the fields and version metadata defined in the source design.
2. **KOS-015** — WHEN semantic extraction returns valid structured data THEN deterministic rendering SHALL create readable Markdown with source frontmatter, summary, concepts, notes and original-source references.
3. **KOS-016** — WHEN a generated note references source material THEN PDF references SHALL include page/chunk, YouTube references timestamp/segment, and webpages URL/section/retrieval date.
4. **KOS-017** — WHEN concept candidates arrive THEN resolution SHALL try normalized exact name, alias, local fuzzy match and optional embedding similarity in that order, using an LLM only for unresolved ambiguity.
5. **KOS-018** — WHEN relationships are stored THEN their type SHALL be one of `RELATED_TO`, `IS_A`, `PART_OF`, `USES`, `REQUIRES`, `APPLIED_TO`, with confidence and origin document, and duplicate edges SHALL not be created.
6. **KOS-019** — WHEN a note or edge changes THEN backlinks, graph neighbors and affected indexes SHALL update incrementally without rewriting unrelated notes.

**Independent Test:** Process a deterministic extraction fixture, open its Markdown outside the app, then query concepts, typed edges, origins, backlinks and incremental-update effects.

### P1: Local Retrieval and Graph Exploration ⭐ MVP

**User Story:** As a user, I want fast exact, full-text, graph and optional semantic retrieval so that I can recover knowledge without paying for an LLM call.

**Acceptance Criteria:**

1. **KOS-020** — WHEN the user searches an exact title, alias or quoted phrase THEN local exact/SQLite FTS5 retrieval SHALL return ranked matching notes and source references with zero LLM calls.
2. **KOS-021** — WHEN a natural-language query is submitted and semantic search is enabled THEN retrieval SHALL merge lexical and semantic candidates, expand graph neighbors, deduplicate and return a stable ranked set.
3. **KOS-022** — WHEN semantic search is unavailable THEN the same query SHALL degrade to lexical, concept and graph retrieval without preventing results.
4. **KOS-023** — WHEN a concept is opened in graph view THEN its inbound/outbound typed edges, backlinks and originating documents SHALL be navigable to the underlying Markdown/source.
5. **KOS-024** — WHEN the retrieval index contains 10,000 representative documents THEN the repository benchmark SHALL demonstrate local lexical search within the documented performance budget agreed in Design.

**Independent Test:** Seed the benchmark/fixture vault, execute exact, quoted, natural-language and graph queries with AI disabled, and verify ranking, references, fallback and call counts.

### P1: Token-Efficient, Traceable AI ⭐ MVP

**User Story:** As a cost-conscious user, I want AI used only for semantic work so that results remain affordable, inspectable and reproducible.

**Acceptance Criteria:**

1. **KOS-025** — WHEN Standard ingestion needs semantic extraction THEN it SHALL prefer one schema-validated extraction request per source and return summary, concepts, relationships and notes in one structured result.
2. **KOS-026** — WHEN source size exceeds the configured input budget THEN the system SHALL segment structurally, filter locally and synthesize only selected sections rather than send the whole source.
3. **KOS-027** — WHEN the same normalized input, prompt version, model and parameters recur THEN the cache SHALL return the prior result and mark `cache_hit=true` without provider invocation.
4. **KOS-028** — WHEN any LLM or embedding request occurs THEN operation, model, versions, input/output tokens, estimated cost, latency, cache status and source/query identifier SHALL be recorded without raw secret values.
5. **KOS-029** — WHEN an extraction response violates its schema or token budget THEN it SHALL not mutate canonical knowledge and SHALL produce a retryable typed failure.
6. **KOS-030** — WHEN Quick, Standard or Deep processing is requested THEN the executed work SHALL match the approved mode; Deep SHALL require explicit user action.

**Independent Test:** Run fake-provider fixtures for cache miss/hit, oversize input, invalid schema and each mode; assert provider call count, canonical state and metrics.

### P1: Grounded Assistant ⭐ MVP

**User Story:** As a user, I want to ask about my own knowledge so that I receive a concise answer grounded in sources I can inspect.

**Acceptance Criteria:**

1. **KOS-031** — WHEN a question is asked THEN deterministic routing SHALL perform exact/concept, FTS5, optional vector and graph retrieval before generation, without an LLM router call.
2. **KOS-032** — WHEN candidates are assembled THEN the context builder SHALL remove duplicates/boilerplate, prefer stored summaries, include 3–8 relevant chunks when available and enforce the configured token budget.
3. **KOS-033** — WHEN sufficient grounded context exists THEN the assistant SHALL make at most one answer-generation call and return an answer whose citations resolve to the exact stored source locations used.
4. **KOS-034** — WHEN no supported evidence exists THEN the assistant SHALL state that it cannot answer from the vault and SHALL not fabricate a citation.
5. **KOS-035** — WHEN the provider is offline THEN retrieval results SHALL remain visible and the generation failure SHALL be recoverable without losing the query.

**Independent Test:** Ask fixture questions with supported, unsupported and offline cases; inspect retrieval trace, context budget, call count and citation targets.

### P2: Optional Backend and Durable Workflows

**User Story:** As an operator, I want clean API/worker boundaries so that expensive processing can move off-device without turning the MVP into microservices.

**Acceptance Criteria:**

1. **KOS-036** — WHEN optional server mode is enabled THEN one FastAPI modular monolith and one worker SHALL expose isolated source, document, knowledge, retrieval, assistant and audit boundaries through versioned contracts.
2. **KOS-037** — WHEN a server-side source is accepted THEN source and outbox event SHALL commit atomically, and repeat delivery with the same source/operation/pipeline key SHALL not duplicate work.
3. **KOS-038** — WHEN an activity fails THEN the durable workflow SHALL retry only the eligible failed activity according to policy and SHALL expose persisted progress/failure state.
4. **KOS-039** — WHEN server mode is absent or unavailable THEN the desktop SHALL continue to operate on the local runtime.

**Independent Test:** Start the optional Compose profile, process an idempotent job with an injected worker failure/retry, and then repeat core desktop operations with the profile stopped.

### P2: Production Engineering and Operations

**User Story:** As the repository owner, I want reproducible quality and operations artifacts so that releases can be promoted safely.

**Acceptance Criteria:**

1. **KOS-040** — WHEN `make dev` runs on a documented clean host THEN required local services SHALL become healthy and the desktop development command SHALL be documented separately.
2. **KOS-041** — WHEN a pull request targets `dev` or `main` THEN CI SHALL run formatting, lint, typecheck, unit, integration, security/dependency scans and desktop/API/worker build validation.
3. **KOS-042** — WHEN backend images build THEN they SHALL use pinned multi-stage, non-root runtimes with health checks.
4. **KOS-043** — WHEN observability is enabled THEN structured logs, traces and metrics SHALL cover desktop errors, API, workers, storage, cache and AI cost without recording source bodies or secrets.
5. **KOS-044** — WHEN Terraform/Kubernetes/Helm/GitOps artifacts are validated THEN formatting, static validation and policy checks SHALL pass without provisioning live infrastructure.
6. **KOS-045** — WHEN a release tag is created with owner-provided signing secrets THEN CI SHALL build platform artifacts and publish only after all required checks; without secrets it SHALL fail closed before publication.
7. **KOS-046** — WHEN backup/restore procedures run on fixtures THEN Markdown, attachments and databases SHALL restore to a consistent searchable workspace.
8. **KOS-047** — WHEN operators face the documented failure classes THEN versioned ADRs and runbooks SHALL provide reproducible diagnosis, rollback and restore steps.

**Independent Test:** Execute the repository quality gate, Compose health checks, IaC static checks and a fixture backup/restore; inspect CI job dependencies and secret gates.

---

## Edge Cases and Implicit-Requirement Closure

| Dimension | Required behavior |
| --- | --- |
| Input validation & bounds | Enforce the explicit URL/text/Markdown/PDF limits before persistence; reject unsafe schemes and paths outside the granted workspace |
| Failure / partial failure | Persist the last valid processing state and completed artifacts; never expose partially generated canonical Markdown |
| Idempotency / retries / duplicates | Key expensive operations by content hash + operation + pipeline/prompt/model version; retries and duplicate imports reuse artifacts |
| Auth boundaries & rate limits | Local core is single-user; renderer never receives privileged provider/cloud keys; optional remote endpoints require configured bearer/OIDC boundary; two ingestion jobs/workspace maximum |
| Concurrency / ordering | Transactional state transitions, unique deduplication keys and ordered per-source processing prevent duplicate/out-of-order writes |
| Data lifecycle / expiry | No automatic expiry; explicit deletion is transactional for derived state and recoverable for owned files; cache cleanup never deletes canonical Markdown |
| Observability | Correlation IDs connect UI→runtime→provider/workflow; logs/metrics exclude secret values and raw source bodies |
| External-dependency failure | Local core continues offline; network work uses bounded timeout/retry and ends in a visible retryable failure |
| State-transition integrity | Only the state graph in KOS-010 is accepted; completed/cancelled work cannot silently re-enter processing without an explicit new version/retry command |

Additional edge cases:

- WHEN two processes import identical content concurrently THEN exactly one canonical artifact set SHALL be committed and both callers SHALL resolve to it.
- WHEN the application crashes between file and database writes THEN recovery SHALL either complete the staged transaction or remove the orphaned staging artifact on next startup.
- WHEN a source changes at the same URI THEN the new content hash SHALL create a new version while retaining provenance to the URI.
- WHEN a Markdown file contains malformed frontmatter or wiki links THEN it SHALL remain readable and the indexer SHALL report a typed diagnostic without data loss.
- WHEN graph edges form cycles or self-links THEN traversal SHALL remain bounded; invalid self-links SHALL be rejected unless explicitly allowed by a future relation rule.
- WHEN an embedding model/version changes THEN only stale embedding records SHALL regenerate; Markdown, summaries and unchanged chunks SHALL remain untouched.
- WHEN context candidates exceed the token budget THEN deterministic ranking SHALL trim lowest-ranked chunks and SHALL preserve citation metadata for retained chunks.
- WHEN a parser handles hostile PDF/HTML content THEN execution SHALL remain within sandbox/capability limits and sanitized output SHALL contain no executable content.

---

## Requirement Traceability

| Requirement range | Story / subsystem | Design | Tasks | Status |
| --- | --- | --- | --- | --- |
| KOS-001…005 | Desktop workspace and offline core | Pending | Unmapped | Pending |
| KOS-006…013 | Capture and ingestion | Pending | Unmapped | Pending |
| KOS-014…019 | Knowledge model and graph | Pending | Unmapped | Pending |
| KOS-020…024 | Retrieval and graph exploration | Pending | Unmapped | Pending |
| KOS-025…030 | AI extraction, cache and cost | Pending | Unmapped | Pending |
| KOS-031…035 | Grounded assistant | Pending | Unmapped | Pending |
| KOS-036…039 | Optional backend/workflows | Pending | Unmapped | Pending |
| KOS-040…047 | Production engineering | Pending | Unmapped | Pending |

**Coverage:** 47 requirements total, 0 mapped to tasks, 47 pending Design.

## Success Criteria

- [ ] All 47 requirements have passing automated evidence or an explicitly documented owner-only external gate.
- [ ] A new user can capture each supported source, obtain traceable Markdown, navigate the resulting graph and recover it through local search.
- [ ] A grounded assistant answer uses no router call, at most one answer call and resolvable citations; unsupported questions produce no fabricated evidence.
- [ ] Offline loss of every optional service leaves the local core usable.
- [ ] Duplicate/retry fixtures demonstrate no duplicate artifacts or extra AI calls.
- [ ] The full repository quality gate, fixture backup/restore and independent discrimination sensor pass before the implementation is called complete.
