import type { EditorClient, NoteDocument } from "../editor";
import type {
  AiConfiguration,
  FolderPicker,
  ProviderConnectRequest,
  ProviderId,
  SettingsClient,
  SettingsSnapshot,
} from "../settings";
import type { KnowledgeClient, LibrarySnapshot } from "../knowledge";

const settingsKey = "knowledge-os:e2e:settings";
const noteKey = "knowledge-os:e2e:welcome-note";
const providerCallKey = "knowledge-os:e2e:provider-call-count";
const libraryKey = "knowledge-os:e2e:library";

export const browserE2EFolderPicker: FolderPicker = {
  chooseParentLocation: () => Promise.resolve("/tmp/knowledge-os-e2e"),
  chooseExistingVault: () => Promise.resolve("/tmp/Existing Vault"),
};

const initialSettings: SettingsSnapshot = {
  setupComplete: false,
  vaultName: null,
  activeMode: "Ingest",
  layoutJson: "{}",
  aiEnabled: false,
  providers: [],
  ai: {
    models: [],
    routing: {
      mainModelId: null,
      assistantDefaultModelId: null,
      explicitFallbackModelId: null,
    },
    budgets: { dailyCents: 0, monthlyCents: 0 },
    privacy: { allowSourceContent: false, storePrompts: false },
  },
};

function readSettings(): SettingsSnapshot {
  const saved = localStorage.getItem(settingsKey);
  return saved
    ? (JSON.parse(saved) as SettingsSnapshot)
    : structuredClone(initialSettings);
}

function writeSettings(settings: SettingsSnapshot) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  return Promise.resolve(settings);
}

function requireProvider(settings: SettingsSnapshot, provider: ProviderId) {
  if (
    !settings.providers.some((connection) => connection.provider === provider)
  ) {
    throw new Error("Provider is not configured");
  }
}

function recordProviderCall() {
  const count = Number(localStorage.getItem(providerCallKey) ?? "0");
  localStorage.setItem(providerCallKey, String(count + 1));
}

export const browserE2ESettingsClient: SettingsClient = {
  getSettings: () => Promise.resolve(readSettings()),
  completeOnboarding: (request) => {
    if (request.vault.kind === "create") {
      if (
        !request.vault.parentPath.startsWith("/") ||
        !request.vault.vaultName.trim()
      ) {
        return Promise.reject(new Error("Invalid local vault target"));
      }
      if (request.vault.vaultName === "Existing") {
        return Promise.reject(
          new Error("A vault already exists at the requested location"),
        );
      }
    } else if (!request.vault.vaultPath.startsWith("/")) {
      return Promise.reject(new Error("Invalid existing vault path"));
    }
    const settings = readSettings();
    settings.setupComplete = true;
    settings.vaultName =
      request.vault.kind === "create"
        ? request.vault.vaultName
        : (request.vault.vaultPath.split("/").filter(Boolean).at(-1) ??
          "Vault");
    settings.aiEnabled = request.aiEnabled;
    settings.layoutJson = request.layoutJson;
    settings.ai.budgets = {
      dailyCents: request.dailyBudgetCents,
      monthlyCents: request.monthlyBudgetCents,
    };
    return writeSettings(settings);
  },
  connectProvider: (request: ProviderConnectRequest) => {
    recordProviderCall();
    const settings = readSettings();
    settings.providers = [
      ...settings.providers.filter(
        (connection) => connection.provider !== request.provider,
      ),
      {
        provider: request.provider,
        endpoint: request.endpoint,
        credentialStatus: "configured_masked",
        health: "untested",
      },
    ];
    return writeSettings(settings);
  },
  rotateProvider: (provider: ProviderId) => {
    recordProviderCall();
    const settings = readSettings();
    requireProvider(settings, provider);
    return writeSettings(settings);
  },
  saveAiConfiguration: (configuration: AiConfiguration) => {
    const settings = readSettings();
    settings.ai = configuration;
    return writeSettings(settings);
  },
  saveWorkspaceState: (activeMode, layoutJson) => {
    const settings = readSettings();
    settings.activeMode = activeMode;
    settings.layoutJson = layoutJson;
    return writeSettings(settings);
  },
  testProvider: (provider: ProviderId) => {
    recordProviderCall();
    const settings = readSettings();
    requireProvider(settings, provider);
    settings.providers = settings.providers.map((connection) =>
      connection.provider === provider
        ? { ...connection, health: "healthy" }
        : connection,
    );
    return writeSettings(settings);
  },
  removeProvider: (provider: ProviderId) => {
    recordProviderCall();
    const settings = readSettings();
    requireProvider(settings, provider);
    settings.providers = settings.providers.filter(
      (connection) => connection.provider !== provider,
    );
    return writeSettings(settings);
  },
};

function inspectMarkdown(content: string): NoteDocument["diagnostics"] {
  if (content.startsWith("---") && !content.slice(3).includes("---")) {
    return [
      {
        code: "malformed_frontmatter",
        message: "Frontmatter is not closed",
        line: 1,
      },
    ];
  }
  return [];
}

export const browserE2EEditorClient: EditorClient = {
  openNote: (path) => {
    const content = localStorage.getItem(noteKey);
    if (content === null)
      return Promise.reject(new Error("Note does not exist"));
    return Promise.resolve({
      path,
      content,
      diagnostics: inspectMarkdown(content),
    });
  },
  saveNote: (path, content) => {
    localStorage.setItem(noteKey, content);
    return Promise.resolve({
      path,
      content,
      diagnostics: inspectMarkdown(content),
    });
  },
};

function readLibrary(): LibrarySnapshot {
  const saved = localStorage.getItem(libraryKey);
  if (saved) return JSON.parse(saved) as LibrarySnapshot;
  return { entries: [], documents: [], sources: [], noteCount: 0 };
}

export const browserE2EKnowledgeClient: KnowledgeClient = {
  capture: (request) => {
    const library = readLibrary();
    const id = `source-${String(library.sources.length + 1)}`;
    const title = request.title || "Quick capture";
    const path = `Inbox/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id}.md`;
    const source = {
      id,
      kind: request.kind === "pdf" ? ("pdf" as const) : ("text" as const),
      originalUri: title,
      normalizedUri: `e2e:${id}`,
      contentHash: id,
      pipelineVersion: "ingestion-v1",
      state: "COMPLETED" as const,
      title,
    };
    const document = {
      id: `document-${id}`,
      sourceId: id,
      path,
      title,
      summary: request.content.slice(0, 200),
      revision: 1,
      contentHash: id,
    };
    library.sources.unshift(source);
    library.documents.unshift(document);
    library.noteCount += 1;
    library.entries = [
      {
        name: "Inbox",
        path: "Inbox",
        kind: "folder",
        children: library.documents.map((item) => ({
          name: `${item.title}.md`,
          path: item.path,
          kind: "markdown",
          children: [],
        })),
      },
    ];
    localStorage.setItem(libraryKey, JSON.stringify(library));
    localStorage.setItem(noteKey, `# ${title}\n\n${request.content}`);
    return Promise.resolve({ source, document, reused: false });
  },
  getLibrary: () => Promise.resolve(readLibrary()),
  getGraph: () => {
    const documents = readLibrary().documents;
    return Promise.resolve({
      concepts: documents.map((document) => ({
        id: document.id,
        normalizedName: document.title.toLowerCase(),
        displayName: document.title,
      })),
      edges: [],
      truncated: false,
    });
  },
  search: (query) => {
    const lowered = query.toLowerCase();
    const hits = readLibrary()
      .documents.filter(
        (document) =>
          document.title.toLowerCase().includes(lowered) ||
          document.summary.toLowerCase().includes(lowered),
      )
      .map((document) => ({
        sourceId: document.sourceId,
        documentId: document.id,
        chunkId: `${document.id}-chunk`,
        title: document.title,
        snippet: document.summary,
        locator: "section:document",
        path: document.path,
        score: 1,
      }));
    return Promise.resolve({
      plan: { lexicalQuery: query, filters: {}, expandGraph: false },
      hits,
      lexicalFallback: true,
    });
  },
  ask: (question, modelId) =>
    Promise.resolve({
      answer: `Grounded response to: ${question}`,
      citations: [],
      modelId,
      usage: { inputTokens: 10, outputTokens: 8 },
      supported: false,
    }),
};
