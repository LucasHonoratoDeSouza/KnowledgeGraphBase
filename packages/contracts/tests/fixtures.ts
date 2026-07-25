const id = "018f47a7-7f4a-7d2c-a1b2-123456789abc";
const createdAt = "2026-07-24T20:00:00Z";

export const ids = {
  valid: id,
  invalid: "source-123",
};

export const errors = {
  valid: {
    code: "VALIDATION_ERROR",
    message: "The source URL is invalid",
    retryable: false,
    field_details: [{ field: "url", message: "Use http or https" }],
    operation_id: id,
  },
  missingRetryable: {
    code: "VALIDATION_ERROR",
    message: "The source URL is invalid",
    field_details: [],
  },
};

export const validCaptureInputs = [
  {
    kind: "youtube",
    url: "https://www.youtube.com/watch?v=fixture",
    mode: "standard",
  },
  { kind: "pdf", path: "attachments/paper.pdf", mode: "standard" },
  { kind: "web", url: "https://example.com/article", mode: "quick" },
  { kind: "text", content: "A meeting summary", title: "Weekly meeting" },
  { kind: "markdown", path: "inbox/research.md", mode: "standard" },
  { kind: "note", content: "A manual note", title: "Idea", mode: "deep" },
] as const;

export const invalidCaptureInputs = {
  unsupportedKind: { kind: "audio", path: "meeting.mp3" },
  missingPayload: { kind: "text", title: "Empty" },
};

export const events = {
  jobProgress: {
    event: "job.progress",
    operation_id: id,
    sequence: 3,
    occurred_at: createdAt,
    payload: { source_id: id, state: "PROCESSING", progress: 0.65 },
  },
  assistantCompleted: {
    event: "assistant.completed",
    operation_id: id,
    sequence: 8,
    occurred_at: createdAt,
    payload: { query_id: id, answer_id: id, citation_count: 2 },
  },
  missingSequence: {
    event: "job.progress",
    operation_id: id,
    occurred_at: createdAt,
    payload: { source_id: id, state: "PROCESSING", progress: 0.65 },
  },
  unknown: {
    event: "job.unknown",
    operation_id: id,
    sequence: 1,
    occurred_at: createdAt,
    payload: {},
  },
};

export const aiUsage = {
  valid: {
    invocation_id: id,
    operation: "extract.standard",
    provider: "fake",
    model: "fixture-model",
    pipeline_version: "ingestion-v1",
    prompt_version: "extract-v1",
    input_tokens: 320,
    output_tokens: 96,
    estimated_cost_usd: 0,
    latency_ms: 12,
    cache_hit: false,
    source_or_query_id: id,
  },
  negativeTokens: {
    invocation_id: id,
    operation: "extract.standard",
    provider: "fake",
    model: "fixture-model",
    pipeline_version: "ingestion-v1",
    prompt_version: "extract-v1",
    input_tokens: -1,
    output_tokens: 96,
    estimated_cost_usd: 0,
    latency_ms: 12,
    cache_hit: false,
    source_or_query_id: id,
  },
  secretLeak: {
    invocation_id: id,
    operation: "extract.standard",
    provider: "fake",
    model: "fixture-model",
    pipeline_version: "ingestion-v1",
    prompt_version: "extract-v1",
    input_tokens: 320,
    output_tokens: 96,
    estimated_cost_usd: 0,
    latency_ms: 12,
    cache_hit: false,
    source_or_query_id: id,
    api_key: "must-not-cross-the-contract",
  },
};

export const knowledgeBundle = {
  valid: {
    source: {
      id,
      kind: "pdf",
      original_location: "attachments/paper.pdf",
      status: "COMPLETED",
      current_revision: 1,
      created_at: createdAt,
      updated_at: createdAt,
    },
    document: {
      id,
      source_id: id,
      revision: 1,
      markdown_path: "notes/paper.md",
      title: "Fixture paper",
      summary: "A deterministic fixture.",
      language: "en",
      pipeline_version: "ingestion-v1",
      prompt_version: "extract-v1",
      model_version: "fixture-model-v1",
    },
    concepts: [
      {
        id,
        name: "Knowledge graphs",
        normalized_name: "knowledge graphs",
        slug: "knowledge-graphs",
      },
    ],
    edges: [],
    chunks: [
      {
        id,
        document_id: id,
        position: 0,
        text: "Knowledge graphs connect concepts.",
        token_count: 5,
        content_hash: "sha256:fixture",
        source_locator: { kind: "pdf", page: 2, chunk: 0 },
      },
    ],
  },
};
