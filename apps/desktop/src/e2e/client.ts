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
const notesKey = "knowledge-os:e2e:notes";
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
  setAiEnabled: (enabled: boolean) => {
    const settings = readSettings();
    settings.aiEnabled = enabled;
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

function readNotes(): Record<string, string> {
  const saved = localStorage.getItem(notesKey);
  return saved ? (JSON.parse(saved) as Record<string, string>) : {};
}

export const browserE2EEditorClient: EditorClient = {
  openNote: (path) => {
    const content = readNotes()[path] ?? localStorage.getItem(noteKey);
    if (content === null)
      return Promise.reject(new Error("Note does not exist"));
    return Promise.resolve({
      path,
      content,
      diagnostics: inspectMarkdown(content),
    });
  },
  saveNote: (path, content) => {
    localStorage.setItem(
      notesKey,
      JSON.stringify({ ...readNotes(), [path]: content }),
    );
    localStorage.setItem(noteKey, content);
    addLibraryEntry(path, "markdown");
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
  return {
    entries: [
      { name: "Inbox", path: "Inbox", kind: "folder", children: [] },
      {
        name: "Projects",
        path: "Projects",
        kind: "folder",
        children: [
          {
            name: "Knowledge OS.md",
            path: "Projects/Knowledge OS.md",
            kind: "markdown",
            children: [],
          },
          {
            name: "AI Research.md",
            path: "Projects/AI Research.md",
            kind: "markdown",
            children: [],
          },
        ],
      },
      { name: "Areas", path: "Areas", kind: "folder", children: [] },
      { name: "Research", path: "Research", kind: "folder", children: [] },
      { name: "Books", path: "Books", kind: "folder", children: [] },
      { name: "Papers", path: "Papers", kind: "folder", children: [] },
      { name: "Sources", path: "Sources", kind: "folder", children: [] },
    ],
    documents: [
      {
        id: "document-knowledge-os",
        sourceId: "source-knowledge-os",
        path: "Projects/Knowledge OS.md",
        title: "Knowledge OS",
        summary: "Local-first retrieval, organization and grounded knowledge.",
        revision: 1,
        contentHash: "knowledge-os",
      },
      {
        id: "document-ai-research",
        sourceId: "source-ai-research",
        path: "Projects/AI Research.md",
        title: "AI Research",
        summary: "Research notes about agents, RAG and language models.",
        revision: 1,
        contentHash: "ai-research",
      },
    ],
    sources: [
      {
        id: "source-knowledge-os",
        kind: "markdown",
        originalUri: "Projects/Knowledge OS.md",
        normalizedUri: "file:Projects/Knowledge OS.md",
        contentHash: "knowledge-os",
        pipelineVersion: "ingestion-v1-local-file",
        state: "COMPLETED",
        title: "Knowledge OS",
      },
      {
        id: "source-ai-research",
        kind: "markdown",
        originalUri: "Projects/AI Research.md",
        normalizedUri: "file:Projects/AI Research.md",
        contentHash: "ai-research",
        pipelineVersion: "ingestion-v1-local-file",
        state: "COMPLETED",
        title: "AI Research",
      },
    ],
    noteCount: 2,
  };
}

/**
 * Mirrors the native vault's directory scan: a saved note or created folder
 * shows up in the Explorer tree at its own path, creating missing parents.
 */
function addLibraryEntry(path: string, kind: "folder" | "markdown") {
  const library = readLibrary();
  const segments = path.split("/").filter(Boolean);
  let siblings = library.entries;
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    const entryPath = segments.slice(0, index + 1).join("/");
    const existing = siblings.find((entry) => entry.path === entryPath);
    if (existing) {
      siblings = existing.children;
      return;
    }
    const entry = {
      name: segment,
      path: entryPath,
      kind: last ? kind : ("folder" as const),
      children: [],
    };
    siblings.push(entry);
    siblings = entry.children;
  });
  if (kind === "markdown") library.noteCount += 1;
  localStorage.setItem(libraryKey, JSON.stringify(library));
  return library;
}

function removeEntry(
  entries: LibrarySnapshot["entries"],
  path: string,
): boolean {
  const index = entries.findIndex((entry) => entry.path === path);
  if (index >= 0) {
    entries.splice(index, 1);
    return true;
  }
  return entries.some((entry) => removeEntry(entry.children, path));
}

function findEntry(
  entries: LibrarySnapshot["entries"],
  path: string,
): LibrarySnapshot["entries"][number] | undefined {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    const nested = findEntry(entry.children, path);
    if (nested) return nested;
  }
  return undefined;
}

export const browserE2EKnowledgeClient: KnowledgeClient = {
  deleteEntry: (path) => {
    const library = readLibrary();
    if (!removeEntry(library.entries, path))
      return Promise.reject(new Error("the item no longer exists"));
    localStorage.setItem(libraryKey, JSON.stringify(library));
    return Promise.resolve(library);
  },
  moveEntry: (path, destination) => {
    const library = readLibrary();
    const entry = findEntry(library.entries, path);
    if (!entry) return Promise.reject(new Error("the item no longer exists"));
    if (destination === path || destination.startsWith(`${path}/`))
      return Promise.reject(
        new Error("a folder cannot be moved inside itself"),
      );
    removeEntry(library.entries, path);
    const moved = {
      ...entry,
      path: destination ? `${destination}/${entry.name}` : entry.name,
    };
    const parent = destination
      ? findEntry(library.entries, destination)
      : undefined;
    if (destination && !parent)
      return Promise.reject(new Error("the destination folder does not exist"));
    (parent ? parent.children : library.entries).push(moved);
    localStorage.setItem(libraryKey, JSON.stringify(library));
    return Promise.resolve(library);
  },
  renameEntry: (path, name) => {
    const library = readLibrary();
    const entry = findEntry(library.entries, path);
    if (!entry) return Promise.reject(new Error("the item no longer exists"));
    const isNote = entry.kind === "markdown";
    const nextName = isNote && !name.endsWith(".md") ? `${name}.md` : name;
    const parent = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    entry.name = nextName;
    entry.path = parent ? `${parent}/${nextName}` : nextName;
    localStorage.setItem(libraryKey, JSON.stringify(library));
    return Promise.resolve(library);
  },
  reorganizeFolder: (folder) =>
    Promise.resolve({
      folder,
      moves: [],
      skipped: [],
      library: readLibrary(),
    }),
  undoReorganization: () =>
    Promise.reject(new Error("there is no reorganization to undo")),
  crowdedFolders: () => Promise.resolve([]),
  createFolder: (path) => {
    const existing = readLibrary();
    const taken = (entries: LibrarySnapshot["entries"]): boolean =>
      entries.some((entry) => entry.path === path || taken(entry.children));
    if (taken(existing.entries))
      return Promise.reject(
        new Error("a folder with that name already exists"),
      );
    return Promise.resolve(addLibraryEntry(path, "folder"));
  },
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
        children: library.documents
          .filter((item) => item.path.startsWith("Inbox/"))
          .map((item) => ({
            name: `${item.title}.md`,
            path: item.path,
            kind: "markdown",
            children: [],
          })),
      },
      ...library.entries.filter((entry) => entry.path !== "Inbox"),
    ];
    localStorage.setItem(libraryKey, JSON.stringify(library));
    localStorage.setItem(noteKey, `# ${title}\n\n${request.content}`);
    return Promise.resolve({ source, document, reused: false });
  },
  getLibrary: () => Promise.resolve(readLibrary()),
  getOrganization: () =>
    Promise.resolve({
      facets: [],
      memberships: [],
    }),
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
