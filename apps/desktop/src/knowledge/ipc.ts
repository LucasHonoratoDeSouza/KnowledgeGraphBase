import { invoke } from "@tauri-apps/api/core";

import type {
  AssistantAnswer,
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
  getLibrary: () => invoke<LibrarySnapshot>("library_get"),
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
