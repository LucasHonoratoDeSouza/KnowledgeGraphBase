import type { EditorClient, NoteDocument } from "../editor";
import type {
  AiConfiguration,
  FolderPicker,
  ProviderConnectRequest,
  ProviderId,
  SettingsClient,
  SettingsSnapshot,
} from "../settings";

const settingsKey = "knowledge-os:e2e:settings";
const noteKey = "knowledge-os:e2e:welcome-note";
const providerCallKey = "knowledge-os:e2e:provider-call-count";

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
