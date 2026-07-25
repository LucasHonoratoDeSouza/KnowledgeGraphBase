# Knowledge OS MVP Context

**Gathered:** 2026-07-24
**Spec:** `.specs/features/knowledge-os-mvp/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Deliver a local-first desktop knowledge workspace that captures common study/work sources, extracts useful and traceable knowledge, organizes it cumulatively through facets and a graph, and exposes retrieval plus a grounded RAG assistant. The product includes the seven MVP milestones; future infrastructure is represented by validated artifacts, not a provisioned production estate.

## Real Usage Profile

The primary user studies roughly four hours per day through YouTube, conducts several research projects, works as an AI engineer, attends meetings, and reads books and papers. The system must handle a continuous stream of heterogeneous knowledge across professional, research and personal contexts without making the user maintain a brittle folder hierarchy.

The desired daily loop is:

```text
YouTube / paper / book / meeting summary / note
  → paste link, text or file
  → useful content extracted in the background
  → concepts, projects, areas and relationships resolved
  → library organized automatically with provenance and undo
  → knowledge available through search, graph and grounded RAG
```

## Implementation Decisions

### Capture and Review

- The two top-level modes are `Ingest` and `Retrieve`, using recognizable AI/RAG language rather than generic `Chat`/`Work` labels.
- `Ingest` is intentionally sparse: one central composer similar to a modern AI chat input, accepting URL/text and drag/drop files, followed only by processing progress and the resulting destination.
- Quick capture must be globally easy to reach and accept a URL, pasted text or dropped file in one surface.
- YouTube URLs should default to transcript-first processing; meeting summaries enter as plain text or Markdown without requiring a specialized meeting integration.
- Standard processing is the normal mode. Expensive Deep processing is always an explicit user action.
- High-confidence organization applies automatically and remains undoable. Low-confidence items stay fully usable in Inbox with specific suggestions rather than blocking ingestion.

### Visual Language

- The approved information architecture remains fixed: top-level `Ingest`/`Retrieve`, sparse capture, and left/canvas/right retrieval.
- The visual character is a native desktop knowledge tool with retro/editorial restraint, informed by Obsidian, VS Code and PyCharm rather than an AI SaaS landing page.
- Surfaces are solid and compact. Gradients, glows, decorative halos, promotional pills and oversized marketing copy are excluded from product screens.
- The palette is nearly monochrome with a restrained aged-paper accent for focus, selection and primary action; the impossible-library drawing is the product mark.
- Visual review fixtures use the fictitious populated vault `teste n1` so density and hierarchy are judged as a returning user, not an empty demo.

### Flexible Organization

- Folders are a durable storage detail, not the only organization model.
- A document may belong to multiple projects and areas while linking to many canonical concepts, people, technologies and source types.
- The graph and faceted metadata are complementary: facets support predictable filtering; typed links support discovery and cross-domain connections.
- Categories are extensible user data, not a hard-coded taxonomy. System defaults may be renamed or augmented.
- User corrections override automatic decisions and update only affected indexes/links; the application never silently reorganizes the whole vault.

### Accumulated Intelligence

- More knowledge improves organization by enriching local aliases, concept resolution, graph neighborhoods and retrieval signals — not by repeatedly sending the entire vault to an LLM.
- New items compare against compact local candidates and existing summaries, then create incremental links with provenance and confidence.
- The system preserves conflicting project contexts instead of forcing one universal category.
- Every automatic filing/link has an audit explanation: which extracted signal, alias, similarity or user rule caused it.

### RAG and Retrieval

- Assistant answers must be grounded in the user's library and link back to exact passages, timestamps, pages or Markdown sections.
- Queries can span the complete vault or combine project, area, concept, source-type and time filters.
- Retrieval remains visible when generation is offline; lack of evidence must produce an honest “not found in your vault” response.
- Retrieval is deterministic-first: exact/FTS, optional vectors and graph expansion precede a single answer call.

### Retrieve Workspace Layout

- The left pane is an Explorer familiar to VS Code/Obsidian users, showing physical folders/files plus optional virtual views for projects, areas and concepts.
- The center is a tabbed canvas for Markdown, graph, PDF, source/transcript and search views.
- The right pane is a persistent Codex/Claude Code-like assistant with conversation history, a composer, citation state and an allowed-model selector.
- All three panes are resizable and collapsible; widths, tabs and the selected document/graph restore locally.
- The MVP assistant is read-only: it answers from retrieved knowledge and may explain its retrieval, but has no file mutation, terminal, autonomous research or action tools.
- Future agent tools must use an explicit permission/preview/approval model and are not to be implemented in this feature.

### First-Run Setup

- Before the primary modes, onboarding prominently offers `Continue without account`, then lets the user create a named local vault under a chosen parent folder or open an existing vault, in the same mental model as an Obsidian vault.
- Creating a vault is a native Rust operation that initializes the folder and local metadata without network access, cloud identity or provider credentials; invalid/colliding targets leave no partial vault behind.
- AI-enabled setup captures endpoint/provider, protected credentials, allowed models, default task policy and daily/monthly budgets.
- A cloud account may be offered for future remote features, but skipping it must preserve the complete local workflow.

### AI Settings and Model Roles

- Settings has a dedicated AI area rather than mixing credentials into general preferences.
- OpenAI, Anthropic and DeepSeek are separate provider connections; each has independent connect, masked status, test, rotate and remove actions.
- A new or rotated key exists only transiently in the password field and secure IPC request. Rust stores it in Stronghold, never reads it back into the renderer and never logs it.
- The local model catalog contains only models the user configured or explicitly enabled, with provider, capabilities, health and price metadata.
- Exactly one eligible model is visibly assigned as `Main`. It performs extraction, categorization and organization so automatic library behavior remains predictable.
- The assistant may select a different configured model per conversation and shows which model produced each answer.
- `Main` and assistant selections remain subject to capability and cost limits. A fallback is used only when the user configured it explicitly; the app does not silently replace `Main` with a cheaper or different model.

### Model and Cost Control

- Domain code depends on an internal AI contract, never directly on a vendor SDK.
- Design will compare LiteLLM with viable current alternatives, choosing a gateway that supports model/provider switching, usage accounting, budgets and fallbacks without coupling product logic.
- Policies are task-specific: cheap models for classification/extraction where adequate, stronger models only for synthesis that needs them.
- Every operation has input/output budgets, cache keys and visible token/cost metrics. A configured cost ceiling fails closed or asks for explicit Deep processing rather than silently overspending.

### Git and Review

- Existing commits are documentation/bootstrap only.
- Implementation remains uncommitted until the owner reviews the first working slice and requests commits.
- The agent does not merge or push implementation to `main`; `main` remains owner-controlled production.

### Agent's Discretion

- Exact visual tokens and component details within the flat, retro/editorial desktop direction fixed above.
- The confidence-calibration technique, as long as automatic actions are auditable, reversible and covered by tests.
- The concrete model gateway after documented comparison of current maintained options.
- Performance budgets grounded in benchmark evidence from the development environment.

### Declined / Undiscussed Gray Areas → Assumptions

- No specialized calendar, meeting-bot or corporate identity integration in MVP; meeting summaries are captured as text/Markdown.
- No automatic hierarchy-wide rewrite as the library grows; organization is incremental and affected-record scoped.
- No mandatory cloud sync or collaborative multi-user vault in MVP.

## Specific References

- Obsidian-like durable Markdown and backlinks, but with much lower manual maintenance.
- NotebookLM-like grounded questions over user-provided sources, with explicit local retrieval and provider cost control.
- LiteLLM is the user's suggested baseline for model interchangeability; the final selection may differ only with a documented technical advantage.

## Deferred Ideas

- Native meeting recording/transcription and calendar integrations.
- Multi-user collaboration and synchronized shared vaults.
- Automatic learning paths, quizzes, mastery scoring and autonomous agents.
- Codex/Claude Code-like tools for file changes, terminal execution, autonomous research and multi-step actions.
