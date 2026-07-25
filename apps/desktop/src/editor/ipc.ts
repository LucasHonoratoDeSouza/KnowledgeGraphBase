import { invoke } from "@tauri-apps/api/core";

import type { NoteDocument } from "./MarkdownEditor";

export interface EditorClient {
  openNote(path: string): Promise<NoteDocument>;
  saveNote(path: string, content: string): Promise<NoteDocument>;
}

export const ipcEditorClient: EditorClient = {
  openNote: (path) => invoke<NoteDocument>("document_open", { path }),
  saveNote: (path, content) =>
    invoke<NoteDocument>("document_save", { path, content }),
};
