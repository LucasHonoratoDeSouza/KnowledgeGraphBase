/* Generated from canonical JSON Schema. Do not edit. */

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
