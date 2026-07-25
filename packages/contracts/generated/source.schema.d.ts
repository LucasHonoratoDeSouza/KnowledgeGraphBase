/* Generated from canonical JSON Schema. Do not edit. */

export type CaptureInput =
  YouTubeInput | PdfInput | WebInput | TextInput | MarkdownInput | NoteInput;
export type ProcessingMode = "quick" | "standard" | "deep";

export interface YouTubeInput {
  kind: "youtube";
  url: string;
  mode?: ProcessingMode;
}
export interface PdfInput {
  kind: "pdf";
  path: string;
  mode?: ProcessingMode;
}
export interface WebInput {
  kind: "web";
  url: string;
  mode?: ProcessingMode;
}
export interface TextInput {
  kind: "text";
  content: string;
  title?: string;
  mode?: ProcessingMode;
}
export interface MarkdownInput {
  kind: "markdown";
  path: string;
  mode?: ProcessingMode;
}
export interface NoteInput {
  kind: "note";
  content: string;
  title: string;
  mode?: ProcessingMode;
}
