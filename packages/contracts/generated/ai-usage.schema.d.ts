/* Generated from canonical JSON Schema. Do not edit. */

export interface AiUsage {
  invocation_id: string;
  operation: string;
  provider: string;
  model: string;
  pipeline_version: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  cache_hit: boolean;
  source_or_query_id: string;
}
