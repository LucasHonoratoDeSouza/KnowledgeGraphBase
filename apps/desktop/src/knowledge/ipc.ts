import { invoke } from "@tauri-apps/api/core";

import type {
  AssistantAnswer,
  LibrarianOutcome,
  CaptureRequest,
  CaptureResponse,
  GraphView,
  KnowledgeClient,
  LibrarySnapshot,
  OrganizationSnapshot,
  RetrievalResult,
} from "./types";

export const ipcKnowledgeClient: KnowledgeClient = {
  capture: (request: CaptureRequest) =>
    invoke<CaptureResponse>("source_capture", { request }),
  createFolder: (path: string) =>
    invoke<LibrarySnapshot>("folder_create", { path }),
  deleteEntry: (path: string) =>
    invoke<LibrarySnapshot>("entry_delete", { path }),
  getLibrary: () => invoke<LibrarySnapshot>("library_get"),
  moveEntry: (path: string, destination: string) =>
    invoke<LibrarySnapshot>("entry_move", { path, destination }),
  renameEntry: (path: string, name: string) =>
    invoke<LibrarySnapshot>("entry_rename", { path, name }),
  reorganizeFolder: (folder: string) =>
    invoke<LibrarianOutcome>("librarian_reorganize", { folder }),
  undoReorganization: () => invoke<LibrarianOutcome>("librarian_undo"),
  crowdedFolders: () => invoke<string[]>("librarian_suggestions"),
  getOrganization: () => invoke<OrganizationSnapshot>("organization_get"),
  getGraph: () => invoke<GraphView>("graph_get"),
  search: async (query: string) => {
    const response = await invoke<{ result: RetrievalResult }>(
      "search_execute",
      {
        query,
      },
    );
    return response.result;
  },
  ask: (question: string, modelId: string) =>
    invoke<AssistantAnswer>("assistant_ask", { question, modelId }),
};
