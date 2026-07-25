export type ProcessingState =
  | "PENDING"
  | "FETCHING"
  | "EXTRACTING"
  | "PROCESSING"
  | "INDEXING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface SourceRecord {
  id: string;
  kind: "youtube" | "pdf" | "web" | "text" | "markdown" | "note";
  originalUri: string;
  normalizedUri: string;
  contentHash: string;
  pipelineVersion: string;
  state: ProcessingState;
  title: string;
}

export interface DocumentRecord {
  id: string;
  sourceId: string;
  path: string;
  title: string;
  summary: string;
  revision: number;
  contentHash: string;
}

export interface CaptureRequest {
  kind: "auto" | "url" | "text" | "meeting_note" | "markdown" | "pdf";
  title: string;
  content: string;
  fileName: string;
  bytes: number[];
}

export interface CaptureResponse {
  source: SourceRecord;
  document: DocumentRecord;
  reused: boolean;
}

export interface LibraryEntry {
  name: string;
  path: string;
  kind: "folder" | "markdown" | "attachment";
  children: LibraryEntry[];
}

export interface LibrarySnapshot {
  entries: LibraryEntry[];
  documents: DocumentRecord[];
  sources: SourceRecord[];
  noteCount: number;
}

export interface GraphConcept {
  id: string;
  normalizedName: string;
  displayName: string;
}

export interface GraphEdge {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relation: string;
  confidenceBasisPoints: number;
  originDocumentIds: string[];
}

export interface GraphView {
  concepts: GraphConcept[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface SearchHit {
  sourceId: string;
  documentId: string;
  chunkId: string;
  title: string;
  snippet: string;
  locator: string;
  path: string;
  score: number;
}

export interface RetrievalResult {
  plan: {
    lexicalQuery: string;
    filters: Record<string, unknown>;
    expandGraph: boolean;
  };
  hits: SearchHit[];
  lexicalFallback: boolean;
}

export interface Citation {
  number: number;
  title: string;
  path: string;
  locator: string;
  snippet: string;
}

export interface AssistantAnswer {
  answer: string;
  citations: Citation[];
  modelId: string;
  usage: { inputTokens: number; outputTokens: number };
  supported: boolean;
}

export interface KnowledgeClient {
  capture(request: CaptureRequest): Promise<CaptureResponse>;
  getLibrary(): Promise<LibrarySnapshot>;
  getGraph(): Promise<GraphView>;
  search(query: string): Promise<RetrievalResult>;
  ask(question: string, modelId: string): Promise<AssistantAnswer>;
}
