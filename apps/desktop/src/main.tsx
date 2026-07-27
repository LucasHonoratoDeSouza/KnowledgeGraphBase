import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import {
  browserE2EAboutClient,
  browserE2EEditorClient,
  browserE2EFolderPicker,
  browserE2EKnowledgeClient,
  browserE2ESettingsClient,
  browserE2EWindowChrome,
} from "./e2e/client";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing desktop root element");
const e2eClients = import.meta.env.VITE_E2E
  ? {
      aboutClient: browserE2EAboutClient,
      editorClient: browserE2EEditorClient,
      folderPicker: browserE2EFolderPicker,
      knowledgeClient: browserE2EKnowledgeClient,
      online: localStorage.getItem("knowledge-os:e2e:offline") !== "true",
      settingsClient: browserE2ESettingsClient,
      windowChrome: browserE2EWindowChrome,
    }
  : {};

createRoot(root).render(
  <StrictMode>
    <App {...e2eClients} />
  </StrictMode>,
);
