/* Generated from canonical JSON Schema. Do not edit. */

export type KnowledgeEvent =
  | JobProgress
  | JobCompleted
  | JobFailed
  | DocumentChanged
  | IndexUpdated
  | AssistantRetrieval
  | AssistantCompleted
  | AssistantFailed;
export type JobState =
  | "PENDING"
  | "FETCHING"
  | "EXTRACTING"
  | "PROCESSING"
  | "INDEXING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface JobProgress {
  event: "job.progress";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    source_id: string;
    state: JobState;
    progress: number;
  };
}
export interface JobCompleted {
  event: "job.completed";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    source_id: string;
    document_id: string;
  };
}
export interface JobFailed {
  event: "job.failed";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    source_id: string;
    error: AppError;
  };
}
export interface AppError {
  code:
    | "VALIDATION_ERROR"
    | "NOT_FOUND"
    | "CONFLICT"
    | "UNAUTHORIZED_COMMAND"
    | "PROVIDER_UNAVAILABLE"
    | "BUDGET_EXCEEDED"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  field_details: {
    field: string;
    message: string;
  }[];
  operation_id?: string;
}
export interface DocumentChanged {
  event: "document.changed";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    document_id: string;
    revision: number;
  };
}
export interface IndexUpdated {
  event: "index.updated";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    document_id: string;
    index_version: string;
  };
}
export interface AssistantRetrieval {
  event: "assistant.retrieval";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    query_id: string;
    result_count: number;
  };
}
export interface AssistantCompleted {
  event: "assistant.completed";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    query_id: string;
    answer_id: string;
    citation_count: number;
  };
}
export interface AssistantFailed {
  event: "assistant.failed";
  operation_id: string;
  sequence: number;
  occurred_at: string;
  payload: {
    query_id: string;
    error: AppError;
  };
}
