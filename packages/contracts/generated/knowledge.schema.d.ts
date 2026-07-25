/* Generated from canonical JSON Schema. Do not edit. */

export interface KnowledgeBundle {
  source: SourceRecord;
  document: Document;
  concepts: Concept[];
  edges: KnowledgeEdge[];
  chunks: Chunk[];
}
export interface SourceRecord {
  id: string;
  kind: "youtube" | "pdf" | "web" | "text" | "markdown" | "note";
  original_location: string;
  status:
    | "PENDING"
    | "FETCHING"
    | "EXTRACTING"
    | "PROCESSING"
    | "INDEXING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";
  current_revision: number;
  created_at: string;
  updated_at: string;
}
export interface Document {
  id: string;
  source_id: string;
  revision: number;
  markdown_path: string;
  title: string;
  summary: string;
  language: string;
  pipeline_version: string;
  prompt_version: string;
  model_version: string;
}
export interface Concept {
  id: string;
  name: string;
  normalized_name: string;
  slug: string;
  description?: string;
}
export interface KnowledgeEdge {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation:
    "RELATED_TO" | "IS_A" | "PART_OF" | "USES" | "REQUIRES" | "APPLIED_TO";
  confidence: number;
  origin_document_id: string;
}
export interface Chunk {
  id: string;
  document_id: string;
  position: number;
  heading?: string;
  text: string;
  token_count: number;
  content_hash: string;
  source_locator:
    | {
        kind: "pdf";
        page: number;
        chunk: number;
      }
    | {
        kind: "youtube";
        timestamp_seconds: number;
        segment: number;
      }
    | {
        kind: "web";
        url: string;
        section: string;
        retrieved_at: string;
      }
    | {
        kind: "text" | "markdown" | "note";
        section: string;
      };
}
