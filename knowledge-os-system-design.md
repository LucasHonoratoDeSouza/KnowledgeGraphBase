# Knowledge OS
## Product Vision & System Design — MVP

**Status:** Architecture Specification v1  
**Product type:** Desktop application  
**Primary experience:** Visual, local-first knowledge workspace  
**Primary content format:** Markdown  
**Target platforms:** Linux, macOS and Windows  
**Primary architecture goal:** Professional system design with minimal LLM token consumption

---

# 1. Vision

Knowledge OS is a desktop application for registering, organizing, connecting and recovering everything the user learns.

The core flow is:

```text
Consume knowledge
      ↓
Add source
      ↓
Extract useful content
      ↓
Generate structured Markdown
      ↓
Connect concepts
      ↓
Index locally
      ↓
Recover later through search, graph or assistant
```

The product should combine the strongest characteristics of:

- Obsidian — Markdown, backlinks, local knowledge and graph navigation;
- NotebookLM — AI grounded in user-provided sources;
- IDEs — dense, professional and keyboard-driven workspace;
- search engines — fast retrieval across a large personal knowledge base.

It must **not** feel like:

- a website;
- a SaaS dashboard;
- a CRUD admin interface;
- a generic chatbot;
- a collection of cards;
- a browser application wrapped in a desktop shell.

The product should feel like a real desktop tool designed specifically for knowledge work.

---

# 2. MVP Scope

The MVP has four responsibilities.

## 2.1 Capture sources

Initial supported sources:

```text
YouTube URL
PDF
plain text
Markdown file
web page
manual note
```

Additional source types can be added later through adapters.

---

## 2.2 Convert sources into structured knowledge

Each source is processed into a Markdown document containing only useful information.

Example:

```markdown
---
id: src_01J...
type: source
source_type: youtube
title: PPO Explained
url: https://youtube.com/...
created_at: 2026-07-24
---

# PPO Explained

## Summary

Concise explanation of the source.

## Main Concepts

- [[Proximal Policy Optimization]]
- [[Policy Gradient]]
- [[Advantage Function]]

## Notes

Structured explanation of the important ideas.

## Source

Original YouTube URL.
```

The source document remains traceable to the original material.

---

## 2.3 Build an interconnected graph

Knowledge OS automatically identifies relationships between concepts.

Example:

```text
Reinforcement Learning
        ↓
Policy Gradient
        ↓
PPO
       ↙   ↘
Actor-Critic
Advantage Function
```

The graph is not a visualization generated independently from the notes.

It is another representation of the same underlying knowledge model.

---

## 2.4 Recover knowledge

Knowledge can be recovered through:

```text
exact search
full-text search
semantic search
graph navigation
backlinks
assistant
```

Example:

```text
User:
What did I study about PPO?

System:
retrieve relevant notes
→ retrieve relevant source excerpts
→ build compact context
→ call LLM once
→ answer with references
```

---

# 3. Explicitly Out of Scope

The MVP should **not** include:

```text
knowledge gap detection
mastery scores
skill estimation
learning-level estimation
automatic quizzes
spaced repetition
contradiction detection
automatic learning paths
personal knowledge scoring
complex agent systems
multi-agent orchestration
```

These are potential future layers.

The first version should become excellent at:

> capture → structure → connect → retrieve

before expanding beyond this loop.

---

# 4. Product Principles

## 4.1 Local-first

The knowledge base belongs to the user.

Core features should work locally:

```text
open notes
edit notes
browse graph
search
navigate backlinks
inspect sources
```

The application should not become unusable because a remote service is unavailable.

---

## 4.2 Markdown as the durable knowledge format

Knowledge should remain exportable as normal Markdown.

Example vault:

```text
vault/
├── notes/
├── sources/
├── concepts/
├── attachments/
└── .knowledge-os/
```

The user should never be permanently locked into a proprietary storage format.

---

## 4.3 AI is an accelerator, not the database

The LLM should help transform and retrieve knowledge.

It should not become the authoritative storage layer.

Canonical information lives in:

```text
Markdown
+
structured metadata
+
local database indexes
```

---

## 4.4 AI output must be traceable

Generated summaries and explanations should maintain a link to the source.

For PDF:

```text
source
page
chunk
```

For YouTube:

```text
source
timestamp
transcript segment
```

For webpages:

```text
URL
section
retrieval date
```

---

## 4.5 Minimal maintenance

The user should not spend more time organizing knowledge than consuming it.

Adding a source should require almost no manual classification.

---

# 5. Desktop Product Architecture

The primary client should be a desktop application.

Recommended stack:

```text
Tauri
React
TypeScript
Vite
Rust
```

Why Tauri:

```text
native desktop window
filesystem access
small binary size
Rust native layer
OS integration
secure IPC
multi-platform builds
lower runtime overhead than Electron
```

The desktop application is the primary product.

A web interface is not required for the MVP.

---

# 6. Visual Direction

The product should have a distinct interface identity.

Reference categories:

```text
Obsidian
Linear
VS Code
Figma
Arc
Raycast
professional IDEs
creative desktop software
```

The UI should prioritize:

```text
high information density
precise spacing
subtle borders
careful typography
fast navigation
keyboard-first interaction
resizable panels
contextual actions
minimal visual noise
```

Avoid:

```text
generic SaaS cards
huge dashboard metrics
random gradients
excessive glassmorphism
large marketing-style headings
generic blue UI
mobile-first visual conventions
```

---

# 7. Main Application Shell

Conceptual layout:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Knowledge OS       Search...                           Sync ●     ⌘K     │
├──────────────┬────────────────────────────────────────┬─────────────────┤
│              │                                        │                 │
│ LIBRARY      │                                        │ INSPECTOR       │
│              │                                        │                 │
│ Inbox        │                                        │ Connections     │
│ Sources      │              WORKSPACE                 │ Backlinks       │
│ Concepts     │                                        │ Source          │
│ Graph        │                                        │ Metadata        │
│              │                                        │ AI Actions      │
│ Projects     │                                        │                 │
│              │                                        │                 │
├──────────────┴────────────────────────────────────────┴─────────────────┤
│ Local ●     Indexed ✓     4,218 notes     9,812 links                  │
└─────────────────────────────────────────────────────────────────────────┘
```

The center is a workspace, not a webpage.

---

# 8. Workspace System

The application should support multiple view types.

```text
Markdown editor
Graph canvas
PDF viewer
Source reader
YouTube transcript viewer
Search results
Assistant
Concept explorer
```

Views can appear in:

```text
tabs
split panes
temporary previews
pinned panels
```

Example:

```text
┌──────────────────────────────┬───────────────────────────────┐
│ PPO.md                       │ Local Graph                   │
│                              │                               │
│ # PPO                        │      Policy Gradient          │
│                              │             │                 │
│ PPO is...                    │             ▼                 │
│                              │            PPO                │
│ [[Advantage Function]]       │          ↙     ↘              │
│ [[Actor-Critic]]             │     GAE       TRPO            │
└──────────────────────────────┴───────────────────────────────┘
```

---

# 9. Navigation Model

Primary sections:

```text
Inbox
Library
Graph
Search
Assistant
```

## Inbox

Recently captured sources waiting for processing or review.

## Library

All notes, concepts and sources.

## Graph

Visual exploration of connections.

## Search

Global retrieval.

## Assistant

Conversational access to the knowledge base.

---

# 10. Command Palette

Shortcut:

```text
Ctrl/Cmd + K
```

Commands:

```text
Add Source
Open Note
Open Graph
Search Knowledge
Ask Knowledge
Open Source
Show Backlinks
Show Connections
Create Note
Export Vault
Switch Workspace
```

The application should be usable primarily through keyboard navigation.

---

# 11. Source Capture UX

Adding knowledge should require almost no navigation.

Example:

```text
Ctrl/Cmd + Shift + V
```

opens:

```text
┌─────────────────────────────────────────────┐
│ Add Knowledge                               │
│                                             │
│ Paste URL, text or drop a file              │
│                                             │
│ youtube.com/watch?v=...                     │
│                                             │
│                                Add          │
└─────────────────────────────────────────────┘
```

After submission:

```text
Source added

Fetch content          ✓
Extract text           ✓
Structure knowledge    processing
Create links           pending
Index                   pending
```

Processing happens asynchronously.

---

# 12. Source Model

A source is the original material.

Example entities:

```text
YouTube video
PDF
paper
article
web page
Markdown document
manual text
```

Minimal source schema:

```text
Source

id
type
title
original_uri
local_path
content_hash
created_at
processed_at
status
metadata
```

---

# 13. Document Model

A processed source produces a document.

```text
Document

id
source_id
title
markdown
summary
language
created_at
updated_at
pipeline_version
```

The Markdown representation remains readable independently from the application.

---

# 14. Concept Model

Concepts are canonical entities referenced from notes.

Example:

```text
PPO
Policy Gradient
Actor-Critic
Large Deviations
Hawkes Process
```

Schema:

```text
Concept

id
name
slug
description
aliases
created_at
updated_at
```

---

# 15. Relationship Model

Relationships create the knowledge graph.

Minimal relationship types for the MVP:

```text
RELATED_TO
IS_A
PART_OF
USES
REQUIRES
APPLIED_TO
```

Do not introduce dozens of relation types initially.

Schema:

```text
KnowledgeEdge

id
source_concept_id
target_concept_id
relationship_type
confidence
origin_document_id
created_at
```

---

# 16. Graph Architecture

A dedicated graph database is unnecessary initially.

Use relational storage:

```text
PostgreSQL
or
SQLite locally
```

Example table:

```sql
knowledge_edges(
    id,
    source_id,
    target_id,
    relation_type,
    confidence,
    origin_document_id
)
```

Indexes:

```text
(source_id)
(target_id)
(source_id, relation_type)
(target_id, relation_type)
(source_id, target_id)
```

A dedicated graph database should only be introduced after real query patterns justify the operational cost.

---

# 17. Local Data Architecture

Recommended local database:

```text
SQLite
```

SQLite stores:

```text
sources
documents
concepts
knowledge_edges
document_chunks
embedding_metadata
workspace_state
sync_state
recent_items
settings
```

Markdown and binary files remain on disk.

Example:

```text
~/KnowledgeOS/
├── vault/
│   ├── notes/
│   ├── sources/
│   └── attachments/
│
└── .knowledge-os/
    ├── knowledge.db
    ├── index/
    └── cache/
```

---

# 18. Cloud Architecture

The MVP can operate primarily locally.

Cloud infrastructure is used only where beneficial:

```text
LLM inference
embedding inference if remote
optional synchronization
optional backup
heavy document processing
```

Recommended future server architecture:

```text
FastAPI
PostgreSQL
pgvector
Temporal
Object Storage
Redis
Workers
```

The local-first design allows cloud infrastructure to remain optional during the earliest MVP stage.

---

# 19. High-Level Architecture

```text
                    ┌─────────────────────────────┐
                    │      Knowledge OS App       │
                    │                             │
                    │ Tauri + React + TypeScript  │
                    └──────────────┬──────────────┘
                                   │
                                   │ IPC
                                   ▼
                    ┌─────────────────────────────┐
                    │       Local Runtime         │
                    │                             │
                    │ Rust                        │
                    │ SQLite                      │
                    │ Filesystem                  │
                    │ Search Index                │
                    │ Local Cache                 │
                    └──────────────┬──────────────┘
                                   │
                     only when AI is needed
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │       AI Gateway/API        │
                    └──────────────┬──────────────┘
                                   │
                      ┌────────────┼────────────┐
                      ▼            ▼            ▼
                     LLM       Embeddings    Parsers
```

The architecture deliberately avoids sending every user interaction to an LLM.

---

# 20. Token-Efficiency as an Architectural Requirement

LLM token consumption should be treated as an infrastructure cost.

The system should optimize:

```text
number of LLM calls
input tokens
output tokens
duplicate processing
unnecessary context
model size
reprocessing frequency
```

Token efficiency must be designed into the architecture rather than optimized later.

---

# 21. Rule 1 — Never Send the Entire Knowledge Base

The assistant should never receive:

```text
all notes
all concepts
all sources
```

Instead:

```text
Query
  ↓
Local retrieval
  ↓
Top relevant chunks
  ↓
Compact context
  ↓
LLM
```

Typical target:

```text
3–8 relevant chunks
```

rather than thousands of documents.

---

# 22. Rule 2 — Retrieval Before Generation

Search should happen locally first.

Pipeline:

```text
User question
      ↓
FTS / BM25
      ↓
optional vector search
      ↓
graph expansion
      ↓
deduplication
      ↓
reranking
      ↓
compact context
      ↓
ONE LLM call
```

The LLM is the final reasoning layer.

It is not the retrieval engine.

---

# 23. Rule 3 — Deterministic Processing Before LLM Processing

Never use an LLM for operations that normal code can perform.

Examples that should be deterministic:

```text
PDF text extraction
HTML parsing
YouTube transcript retrieval
Markdown parsing
URL normalization
duplicate detection
hashing
chunking
metadata extraction
date parsing
exact search
graph traversal
filesystem organization
```

Use LLM only for tasks requiring semantic interpretation.

---

# 24. Rule 4 — Hash Everything

Each source receives a content hash.

Example:

```text
SHA-256(normalized_content)
```

Before processing:

```text
new source
    ↓
calculate hash
    ↓
hash already exists?
   ↙             ↘
 yes             no
 ↓               ↓
reuse          process
```

This prevents paying twice for the same content.

---

# 25. Rule 5 — Pipeline Versioning

Store:

```text
content_hash
pipeline_version
model_version
prompt_version
```

Example:

```text
pipeline_version = 3
prompt_version = summary-v2
model_version = model-x
```

Reprocess only when necessary.

A UI change must never accidentally trigger AI processing again.

---

# 26. Rule 6 — One Extraction Call per Source When Possible

Avoid:

```text
LLM summarize
LLM extract concepts
LLM generate title
LLM classify topic
LLM generate links
```

as five separate calls.

Prefer one structured request:

```text
Source content
     ↓
single LLM extraction call
     ↓
{
  "summary": ...,
  "concepts": [...],
  "relationships": [...],
  "structured_notes": ...
}
```

This reduces:

```text
duplicated prompt tokens
duplicated source tokens
latency
cost
failure surface
```

---

# 27. Rule 7 — Structured Output

The ingestion LLM should return machine-readable structured output.

Example:

```json
{
  "summary": "...",
  "concepts": [
    {
      "name": "Proximal Policy Optimization",
      "aliases": ["PPO"]
    }
  ],
  "relationships": [
    {
      "from": "Proximal Policy Optimization",
      "type": "USES",
      "to": "Advantage Function"
    }
  ],
  "notes": [
    {
      "heading": "Core Idea",
      "content": "..."
    }
  ]
}
```

The application generates Markdown deterministically from this object.

Do not ask the LLM to repeatedly format the same knowledge.

---

# 28. Rule 8 — Small Models for Cheap Tasks

Different tasks should use different model classes.

Example:

```text
simple classification
→ small inexpensive model

concept extraction
→ small/medium model

complex source synthesis
→ stronger model only when necessary

assistant reasoning
→ selected model according to query complexity
```

Do not use the strongest model for every operation.

---

# 29. Rule 9 — Token Budgets

Each AI operation gets an explicit budget.

Example:

```text
Source metadata:
max output 150 tokens

Summary:
max output 400 tokens

Concept extraction:
max output 500 tokens

Assistant:
dynamic context budget
```

No prompt should have unlimited context by default.

---

# 30. Rule 10 — Hierarchical Processing for Large Sources

Large PDFs should not be sent whole to the LLM.

Pipeline:

```text
PDF
 ↓
local extraction
 ↓
sections
 ↓
chunks
 ↓
cheap relevance filtering
 ↓
selected sections
 ↓
LLM synthesis
```

For a 300-page book, the system should not automatically summarize all 300 pages through an expensive model.

---

# 31. Rule 11 — Reuse Existing Summaries

Store intermediate artifacts.

Example:

```text
raw text
chunk summaries
document summary
concept extraction
embeddings
```

Later operations reuse those artifacts.

Never regenerate a summary merely because another feature needs it.

---

# 32. Rule 12 — Cache AI Results

Cache key:

```text
hash(
  normalized_input
  + prompt_version
  + model
  + parameters
)
```

If the same semantic operation already exists, return the cached result.

---

# 33. Rule 13 — Local Search First

SQLite FTS5 can provide excellent full-text search locally.

Pipeline:

```text
SQLite FTS5
    ↓
candidate documents
```

Vector search should only augment lexical search.

Not every query requires embeddings.

---

# 34. Rule 14 — Hybrid Retrieval Without an LLM Router

Do not initially call an LLM just to decide how to search.

Use deterministic heuristics.

Example:

```text
quoted phrase
→ lexical search

exact concept
→ concept lookup + graph

natural-language question
→ lexical + semantic

"What is related to X?"
→ graph traversal
```

This saves an entire model call for every question.

---

# 35. Rule 15 — Graph Expansion is Free

After retrieving one relevant concept:

```text
PPO
```

the database can retrieve:

```text
neighbors
backlinks
related sources
parent concepts
```

without any LLM call.

Graph structure should reduce dependence on semantic inference.

---

# 36. Rule 16 — Context Compression

Before sending context to the LLM:

```text
remove duplicate chunks
remove repeated metadata
remove navigation text
remove boilerplate
remove irrelevant sections
```

Source metadata should use compact serialization.

Bad:

```text
The following document has the title...
The author of this document is...
```

Better:

```text
[source:42 title="PPO Explained" timestamp="12:41"]
...
```

---

# 37. Rule 17 — Store Source-Level Summaries

Every processed source receives a compact summary.

Assistant retrieval can initially search summaries.

Only if needed should it retrieve original chunks.

Architecture:

```text
query
 ↓
summary retrieval
 ↓
likely relevant source
 ↓
detailed chunk retrieval
```

This is a two-stage retrieval process that can dramatically reduce context size.

---

# 38. Rule 18 — Incremental Updates

Adding one new video should not regenerate an entire topic.

Example:

```text
existing concept: PPO
new source: PPO video
```

The system should:

```text
extract new information
compare locally
append references
create only new edges
```

It must not ask an LLM to rewrite every existing note by default.

---

# 39. Rule 19 — User-Controlled Deep Processing

Default ingestion should be inexpensive.

Possible modes:

```text
Quick
Standard
Deep
```

### Quick

```text
metadata
transcript/text
basic summary
basic concepts
```

### Standard

```text
summary
concepts
relationships
structured notes
embeddings
```

### Deep

Reserved for explicit user action.

Potentially:

```text
section-by-section analysis
technical derivations
large-document synthesis
cross-source comparison
```

The expensive mode should never happen silently.

---

# 40. Rule 20 — LLM Calls Must Be Observable

Record:

```text
operation
model
input_tokens
output_tokens
estimated_cost
latency
cache_hit
source_id
```

Metrics:

```text
llm_requests_total
llm_input_tokens_total
llm_output_tokens_total
llm_cost_total
llm_cache_hits_total
tokens_per_source
tokens_per_assistant_query
```

Token consumption becomes measurable engineering data.

---

# 41. Token-Efficient Ingestion Pipeline

Recommended pipeline:

```text
Add Source
   ↓
Normalize URI
   ↓
Calculate Hash
   ↓
Duplicate?
   ├── yes → reuse
   │
   └── no
        ↓
Deterministic Content Extraction
        ↓
Normalize Text
        ↓
Remove Boilerplate
        ↓
Structural Segmentation
        ↓
Local Keyword / Entity Candidates
        ↓
Size Check
        │
        ├── small source
        │      ↓
        │   ONE structured LLM call
        │
        └── large source
               ↓
          section filtering
               ↓
          selective extraction
               ↓
          compact synthesis
        ↓
Structured Result
        ↓
Deterministic Markdown Generator
        ↓
Entity Resolution
        ↓
Create Graph Edges
        ↓
Generate Embeddings if required
        ↓
Index
        ↓
Cache Results
```

---

# 42. Token-Efficient Assistant Pipeline

```text
User Query
    ↓
Normalize Query
    ↓
Exact Concept Lookup
    ↓
SQLite FTS5
    ↓
Vector Search when useful
    ↓
Graph Expansion
    ↓
Rank Candidates
    ↓
Deduplicate
    ↓
Context Budget Enforcement
    ↓
ONE LLM answer call
    ↓
Answer + references
```

The target should usually be:

```text
0 LLM calls for search/navigation
1 LLM call for a semantic answer
```

---

# 43. Embeddings Strategy

Embeddings should also be treated as a compute cost.

Do not embed:

```text
duplicate text
navigation boilerplate
tiny metadata fields
every graph edge
unchanged documents
```

Embed:

```text
meaningful chunks
document summaries
concept descriptions
```

Store embedding version:

```text
embedding_model
embedding_version
content_hash
```

Regenerate only when required.

---

# 44. Chunking Strategy

Chunking should preserve semantic structure.

Prefer:

```text
heading
section
paragraph groups
transcript topic boundaries
```

Avoid blindly splitting every N characters.

Typical representation:

```text
Chunk

id
document_id
position
heading
text
token_count
content_hash
```

Token count should be precomputed once and reused.

---

# 45. YouTube Pipeline

```text
URL
 ↓
metadata
 ↓
existing transcript?
 ↓
yes → download transcript
 ↓
normalize timestamps
 ↓
segment by topic
 ↓
structured extraction
 ↓
Markdown + concepts + graph
```

Do not download/transcribe audio when a usable transcript already exists.

Transcription is a fallback.

---

# 46. PDF Pipeline

```text
PDF
 ↓
text layer exists?
 ├── yes → extract locally
 └── no  → OCR fallback
 ↓
detect structure
 ↓
remove headers/footers
 ↓
sections
 ↓
token-efficient extraction
 ↓
Markdown + concepts + graph
```

OCR should only happen where necessary.

---

# 47. Web Page Pipeline

```text
URL
 ↓
download HTML
 ↓
readability extraction
 ↓
remove:
  navigation
  ads
  footer
  scripts
  related links
 ↓
clean article text
 ↓
hash
 ↓
structured extraction
```

Sending raw HTML to an LLM is prohibited.

---

# 48. Markdown Generation

The LLM returns semantic data.

The application formats Markdown.

Example:

```text
LLM JSON
   ↓
Markdown Renderer
   ↓
.md
```

Advantages:

```text
consistent formatting
lower output tokens
easy migrations
less prompt complexity
less hallucinated structure
```

---

# 49. Entity Resolution Strategy

Entity resolution should be cheap-first.

Pipeline:

```text
new concept candidate
      ↓
exact normalized match
      ↓
alias match
      ↓
local fuzzy match
      ↓
embedding similarity
      ↓
only if ambiguous:
LLM resolution
```

The LLM should be the final fallback, not the first step.

---

# 50. Repository Architecture

Use a monorepo.

```text
knowledge-os/
│
├── apps/
│   ├── desktop/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── ui/
│   ├── contracts/
│   ├── knowledge-schema/
│   ├── retrieval/
│   ├── graph/
│   ├── ingestion/
│   └── ai/
│
├── infra/
│   ├── docker/
│   ├── terraform/
│   ├── kubernetes/
│   └── helm/
│
├── ops/
│   ├── grafana/
│   ├── prometheus/
│   ├── loki/
│   └── otel/
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── diagrams/
│   ├── product/
│   └── runbooks/
│
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── performance/
│
├── scripts/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── Makefile
├── README.md
└── CONTRIBUTING.md
```

---

# 51. Desktop Application Structure

```text
apps/desktop/
├── src/
│   ├── app/
│   ├── workspace/
│   ├── editor/
│   ├── graph/
│   ├── library/
│   ├── search/
│   ├── assistant/
│   ├── sources/
│   ├── commands/
│   └── settings/
│
├── src-tauri/
│   ├── src/
│   ├── capabilities/
│   └── tauri.conf.json
│
└── package.json
```

Use feature-first organization.

---

# 52. Backend Structure

```text
apps/api/src/
├── identity/
├── sources/
├── documents/
├── ingestion/
├── knowledge/
├── graph/
├── retrieval/
├── assistant/
├── sync/
└── audit/
```

Avoid using only:

```text
controllers/
services/
models/
utils/
```

as the top-level architecture.

---

# 53. Worker Structure

```text
apps/worker/src/
├── workflows/
├── activities/
├── parsers/
├── extractors/
├── embeddings/
├── llm/
└── indexing/
```

Workers handle long-running or expensive operations.

---

# 54. Modular Monolith

The initial backend should be a modular monolith.

Physical services:

```text
1 API
1 worker application
```

Logical modules remain isolated.

Do not introduce microservices solely for architectural appearance.

Benefits:

```text
simple deployment
simple debugging
low network overhead
easy local development
clear module boundaries
future extraction path
```

---

# 55. Async Processing

Long-running source ingestion should not block UI requests.

Flow:

```text
Desktop
   ↓
Create Source
   ↓
immediate response
   ↓
background processing
   ↓
progress events
   ↓
Desktop updates status
```

---

# 56. Durable Workflows

If cloud/background processing becomes significant, use Temporal.

Example:

```text
ExtractContent      ✓
Normalize           ✓
AIExtraction        failed
```

The workflow can retry only the failed step.

Useful capabilities:

```text
retries
timeouts
backoff
durable state
workflow visibility
failure recovery
```

---

# 57. Idempotency

Every expensive operation should be idempotent.

Key example:

```text
source_hash
+
operation
+
pipeline_version
```

Retrying the same operation should not generate duplicates or additional unnecessary LLM calls.

---

# 58. Transactional Outbox

For server-side event publication:

```text
BEGIN

INSERT source
INSERT outbox_event

COMMIT
```

A separate process publishes the event.

This prevents:

```text
database write succeeds
event publish fails
```

from leaving inconsistent state.

---

# 59. Explicit Processing States

Use state machines.

Example:

```text
PENDING
FETCHING
EXTRACTING
PROCESSING
INDEXING
COMPLETED
FAILED
CANCELLED
```

Avoid a single:

```text
processed = true/false
```

flag.

---

# 60. Observability

Recommended stack:

```text
OpenTelemetry
Prometheus
Grafana
Loki
Tempo
Sentry
```

Observability covers:

```text
desktop errors
API requests
worker jobs
database latency
LLM requests
token costs
pipeline latency
cache performance
```

---

# 61. Structured Logging

Example:

```json
{
  "level": "info",
  "event": "source_processed",
  "source_id": "src_123",
  "content_hash": "...",
  "pipeline_version": 2,
  "llm_input_tokens": 2840,
  "llm_output_tokens": 412,
  "cache_hit": false,
  "duration_ms": 2418
}
```

---

# 62. Cost Observability

Create a dedicated dashboard.

Metrics:

```text
tokens/day
tokens/source
tokens/model
cost/day
cost/source
cost/query
cache hit rate
LLM calls/source
LLM calls/query
largest token consumers
```

A professional AI system should make inference cost visible.

---

# 63. Local Development

One command:

```bash
make dev
```

should start the development environment.

Possible infrastructure:

```text
PostgreSQL
pgvector
Redis
MinIO
Temporal
API
Worker
OpenTelemetry Collector
```

The desktop client runs separately through Tauri development mode.

For the first local-only milestone, most of this infrastructure can remain optional.

---

# 64. Docker Strategy

Backend images:

```text
knowledge-api
knowledge-worker
```

Best practices:

```text
multi-stage builds
pinned dependencies
non-root runtime
health checks
small production images
```

The desktop app is distributed as a native binary, not a container.

---

# 65. Infrastructure as Code

Use Terraform for cloud infrastructure.

```text
infra/terraform/
├── modules/
│   ├── network/
│   ├── database/
│   ├── object-storage/
│   ├── compute/
│   ├── observability/
│   └── secrets/
│
└── environments/
    ├── staging/
    └── production/
```

---

# 66. Kubernetes Strategy

Do not make Kubernetes necessary for the MVP.

Learning path:

```text
Docker Compose
      ↓
kind / k3d
      ↓
staging Kubernetes
      ↓
production Kubernetes if justified
```

The services should still be Kubernetes-ready.

This allows practicing:

```text
Deployment
Service
Ingress
ConfigMap
Secret
HPA
Job
CronJob
NetworkPolicy
```

without making the product unnecessarily complex.

---

# 67. GitOps

Future deployment model:

```text
GitHub
  ↓
GitHub Actions
  ↓
Container Registry
  ↓
GitOps manifests
  ↓
ArgoCD
  ↓
Kubernetes
```

CI builds artifacts.

ArgoCD handles cluster reconciliation.

---

# 68. CI

Every pull request should run:

```text
lint
format check
typecheck
unit tests
integration tests
security scan
dependency scan
desktop build validation
API build
worker build
```

Protected branches should require successful checks.

---

# 69. Desktop Release Pipeline

```text
Git tag
   ↓
GitHub Actions
   ↓
build Linux
build Windows
build macOS
   ↓
sign artifacts
   ↓
publish release
   ↓
Tauri updater
```

---

# 70. ADRs

Maintain Architecture Decision Records.

```text
docs/adr/

0001-use-tauri.md
0002-local-first.md
0003-use-sqlite-locally.md
0004-use-markdown.md
0005-use-modular-monolith.md
0006-use-postgresql-cloud.md
0007-use-pgvector.md
0008-token-efficiency-strategy.md
0009-use-temporal-for-durable-workflows.md
```

Each ADR should contain:

```text
Status
Context
Decision
Alternatives
Consequences
```

---

# 71. Runbooks

Operational documentation:

```text
docs/runbooks/

llm-provider-outage.md
worker-not-processing.md
database-unavailable.md
high-token-usage.md
restore-database.md
rollback-deployment.md
sync-failure.md
```

---

# 72. Security

Minimum architecture:

```text
no committed secrets
encrypted HTTPS communication
strict Tauri capabilities
local filesystem scope restrictions
safe URL validation
sanitized HTML
limited parser permissions
dependency scanning
LLM API keys never exposed to renderer code
```

The desktop renderer should not directly hold privileged cloud credentials.

---

# 73. Secrets

Local development:

```text
.env
```

Production:

```text
cloud secret manager
```

Never store production secrets in Git.

---

# 74. Backups

For local-first storage:

```text
user-controlled vault backups
optional automatic snapshots
```

For cloud:

```text
PostgreSQL snapshots
object storage versioning
infrastructure in Git
```

Backups should eventually be tested through real restore procedures.

---

# 75. MVP System Flow

Complete example:

```text
User pastes YouTube URL
          ↓
Desktop creates local Source
          ↓
URL normalized
          ↓
content hash generated
          ↓
duplicate check
          ↓
transcript fetched
          ↓
transcript cleaned locally
          ↓
sections detected
          ↓
single structured AI extraction
          ↓
summary
concepts
relationships
notes
          ↓
Markdown generated locally
          ↓
concept aliases resolved
          ↓
graph edges inserted
          ↓
content indexed
          ↓
optional embeddings generated
          ↓
UI updates
```

---

# 76. Assistant System Flow

```text
User asks a question
        ↓
normalize query
        ↓
exact concept lookup
        ↓
local full-text search
        ↓
optional semantic search
        ↓
graph expansion
        ↓
rank results
        ↓
remove duplicates
        ↓
enforce context token budget
        ↓
one LLM call
        ↓
answer with source references
```

---

# 77. Initial Technical Stack

| Area | Choice |
|---|---|
| Desktop | Tauri |
| UI | React + TypeScript |
| Build | Vite |
| Native layer | Rust |
| Local DB | SQLite |
| Local full-text search | SQLite FTS5 |
| Knowledge format | Markdown |
| Backend | FastAPI + Python |
| Cloud DB | PostgreSQL |
| Vector extension | pgvector |
| Object storage | S3 / MinIO |
| Cache | Redis |
| Workflows | Temporal |
| AI | Provider abstraction |
| Observability | OpenTelemetry |
| Metrics | Prometheus |
| Dashboards | Grafana |
| Logs | Loki |
| Traces | Tempo |
| Errors | Sentry |
| CI/CD | GitHub Actions |
| IaC | Terraform |
| Containers | Docker |
| Future orchestration | Kubernetes |
| Future GitOps | ArgoCD |
| Repository | Monorepo |

---

# 78. MVP Milestones

## Milestone 1 — Desktop Foundation

Build:

```text
Tauri shell
custom window
workspace
sidebar
tabs
split panes
command palette
Markdown editor
SQLite
vault
```

No AI required.

---

## Milestone 2 — Knowledge Model

Build:

```text
sources
documents
concepts
relationships
Markdown persistence
backlinks
local graph
```

No complex AI orchestration required.

---

## Milestone 3 — Source Ingestion

Build:

```text
PDF import
Markdown import
text import
web page import
YouTube transcript import
hashing
deduplication
processing state
```

---

## Milestone 4 — AI Extraction

Add:

```text
one structured extraction call
summary
concept extraction
relationship extraction
structured notes
AI result cache
token metrics
```

---

## Milestone 5 — Retrieval

Build:

```text
SQLite FTS5
concept search
source search
graph navigation
semantic search
```

---

## Milestone 6 — Assistant

Build:

```text
retrieval pipeline
context builder
token budget
one-call answer generation
source citations
```

---

## Milestone 7 — Production Engineering

Add:

```text
CI
Docker
staging
observability
Terraform
automated releases
security scanning
```

---

# 79. Architecture Philosophy

The MVP should optimize for four properties:

```text
LOCAL
FAST
STRUCTURED
CHEAP
```

### Local

The knowledge base remains usable independently of cloud infrastructure.

### Fast

Navigation, search and graph exploration do not require an LLM.

### Structured

Sources become Markdown, concepts and typed relationships.

### Cheap

LLMs are invoked only when semantic reasoning materially improves the result.

---

# 80. Final Architecture Principle

The system should never ask:

> Can an LLM do this?

The engineering question should be:

> Is an LLM the cheapest and most reliable component capable of doing this?

If normal code, SQL, graph traversal, parsing, search, hashing, caching or deterministic rules can solve the problem, use them first.

The intended architecture is therefore:

```text
Deterministic systems
        ↓
Retrieval systems
        ↓
Knowledge graph
        ↓
Caching
        ↓
Small models
        ↓
Large models only when necessary
```

This allows Knowledge OS to grow into a sophisticated AI knowledge application without making every interaction expensive, slow or dependent on model inference.
