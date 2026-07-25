import { useState } from "react";

import {
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  Coins,
  KeyRound,
  LockKeyhole,
  Network,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import type { ProviderId, SettingsClient, SettingsSnapshot } from "./types";

const providers: Array<{
  accent: string;
  description: string;
  endpoint: string;
  id: ProviderId;
  label: string;
  monogram: string;
}> = [
  {
    accent: "provider-openai",
    description: "GPT models for reasoning, extraction and embeddings.",
    endpoint: "https://api.openai.com/v1",
    id: "openai",
    label: "OpenAI",
    monogram: "O",
  },
  {
    accent: "provider-anthropic",
    description: "Claude models for long context and careful synthesis.",
    endpoint: "https://api.anthropic.com/v1",
    id: "anthropic",
    label: "Anthropic",
    monogram: "A",
  },
  {
    accent: "provider-deepseek",
    description: "Cost-efficient reasoning and general language models.",
    endpoint: "https://api.deepseek.com",
    id: "deepseek",
    label: "DeepSeek",
    monogram: "D",
  },
  {
    accent: "provider-groq",
    description: "Fast open-weight inference with a free tier.",
    endpoint: "https://api.groq.com/openai/v1",
    id: "groq",
    label: "Groq",
    monogram: "G",
  },
  {
    accent: "provider-compatible",
    description: "LiteLLM or another OpenAI-compatible gateway you control.",
    endpoint: "http://127.0.0.1:4000/v1",
    id: "compatible",
    label: "Compatible / LiteLLM",
    monogram: "L",
  },
];

interface AISettingsProps {
  client: SettingsClient;
  initial: SettingsSnapshot;
  onChange?: (settings: SettingsSnapshot) => void;
}

export function AISettings({ client, initial, onChange }: AISettingsProps) {
  const [settings, setSettings] = useState(initial);
  const [keys, setKeys] = useState<Record<ProviderId, string>>({
    anthropic: "",
    compatible: "",
    deepseek: "",
    groq: "",
    openai: "",
  });
  const [providerEndpoints, setProviderEndpoints] = useState<
    Record<ProviderId, string>
  >({
    anthropic:
      initial.providers.find(({ provider }) => provider === "anthropic")
        ?.endpoint ?? "https://api.anthropic.com/v1",
    compatible:
      initial.providers.find(({ provider }) => provider === "compatible")
        ?.endpoint ?? "http://127.0.0.1:4000/v1",
    deepseek:
      initial.providers.find(({ provider }) => provider === "deepseek")
        ?.endpoint ?? "https://api.deepseek.com",
    groq:
      initial.providers.find(({ provider }) => provider === "groq")?.endpoint ??
      "https://api.groq.com/openai/v1",
    openai:
      initial.providers.find(({ provider }) => provider === "openai")
        ?.endpoint ?? "https://api.openai.com/v1",
  });
  const [newModelId, setNewModelId] = useState("");
  const [newModelProvider, setNewModelProvider] =
    useState<ProviderId>("openai");

  function clearKey(provider: ProviderId) {
    setKeys((current) => ({ ...current, [provider]: "" }));
  }

  function accept(next: SettingsSnapshot) {
    setSettings(next);
    onChange?.(next);
  }

  async function connect(provider: ProviderId, endpoint: string) {
    try {
      accept(
        await client.connectProvider({
          credential: keys[provider],
          endpoint,
          provider,
        }),
      );
    } finally {
      clearKey(provider);
    }
  }

  async function rotate(provider: ProviderId) {
    try {
      accept(await client.rotateProvider(provider, keys[provider]));
    } finally {
      clearKey(provider);
    }
  }

  function updateRouting(
    field: keyof SettingsSnapshot["ai"]["routing"],
    value: string,
  ) {
    setSettings((current) => ({
      ...current,
      ai: {
        ...current.ai,
        routing: { ...current.ai.routing, [field]: value || null },
      },
    }));
  }

  function addModel() {
    const id = newModelId.trim();
    if (!id) return;
    setSettings((current) => ({
      ...current,
      ai: {
        ...current.ai,
        models: [
          ...current.ai.models.filter((model) => model.id !== id),
          {
            id,
            provider: newModelProvider,
            displayName: id,
            enabled: true,
          },
        ],
      },
    }));
    setNewModelId("");
  }

  function removeModel(id: string) {
    setSettings((current) => ({
      ...current,
      ai: {
        ...current.ai,
        models: current.ai.models.filter((model) => model.id !== id),
        routing: Object.fromEntries(
          Object.entries(current.ai.routing).map(([role, modelId]) => [
            role,
            modelId === id ? null : modelId,
          ]),
        ) as SettingsSnapshot["ai"]["routing"],
      },
    }));
  }

  return (
    <section aria-label="AI settings workspace" className="settings-layout">
      <nav aria-label="AI settings" className="settings-navigation">
        <div className="settings-nav-heading">
          <span className="settings-nav-icon">
            <img alt="" src="/knowledge-os-icon.png" />
          </span>
          <div>
            <strong>AI Settings</strong>
            <small>Workspace preferences</small>
          </div>
        </div>
        <div className="settings-nav-group-label">ARTIFICIAL INTELLIGENCE</div>
        <a className="settings-nav-active" href="#providers">
          <Network aria-hidden="true" size={16} />
          <span>AI Providers</span>
          <ChevronRight aria-hidden="true" size={14} />
        </a>
        <a href="#models">
          <BrainCircuit aria-hidden="true" size={16} />
          <span>Models &amp; Routing</span>
          <ChevronRight aria-hidden="true" size={14} />
        </a>
        <a href="#costs">
          <Coins aria-hidden="true" size={16} />
          <span>Costs &amp; Usage</span>
          <ChevronRight aria-hidden="true" size={14} />
        </a>
        <a href="#privacy">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>Privacy</span>
          <ChevronRight aria-hidden="true" size={14} />
        </a>
        <div className="settings-security-note">
          <LockKeyhole aria-hidden="true" size={16} />
          <div>
            <strong>Local secret vault</strong>
            <p>Keys are encrypted and never shown again.</p>
          </div>
        </div>
      </nav>

      <div className="settings-content">
        <header className="settings-page-header">
          <div>
            <span className="eyebrow">WORKSPACE / AI</span>
            <h1>AI Settings</h1>
            <p>
              Connect providers and decide exactly which models power your
              knowledge system.
            </p>
          </div>
          <span className="security-badge">
            <ShieldCheck aria-hidden="true" size={14} />
            Stronghold protected
          </span>
        </header>

        <section
          aria-labelledby="providers-heading"
          className="settings-section"
          id="providers"
        >
          <div className="settings-section-heading">
            <div>
              <h2 id="providers-heading">Model connections</h2>
              <p>Each provider keeps an independent encrypted credential.</p>
            </div>
            <span>{settings.providers.length} connected</span>
          </div>
          <div className="provider-grid">
            {providers.map((provider) => {
              const connection = settings.providers.find(
                (candidate) => candidate.provider === provider.id,
              );
              const connected = Boolean(connection);
              return (
                <fieldset
                  className={`provider-card ${provider.accent}`}
                  data-provider-state={connected ? "connected" : "disconnected"}
                  key={provider.id}
                >
                  <legend className="visually-hidden">
                    {provider.label} connection
                  </legend>
                  <div className="provider-card-header">
                    <span className="provider-monogram">
                      {provider.monogram}
                    </span>
                    <div>
                      <h3>{provider.label}</h3>
                      <p>{provider.description}</p>
                    </div>
                    <span
                      className={`connection-pill ${connected ? "is-connected" : ""}`}
                    >
                      {connected ? (
                        <Check aria-hidden="true" size={12} />
                      ) : null}
                      {connected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  <div className="provider-meta">
                    <span>
                      {connection ? "Configured ••••••••" : "Not configured"}
                    </span>
                    <span>Health: {connection?.health ?? "untested"}</span>
                  </div>
                  <label className="field-label">
                    Endpoint
                    <input
                      aria-label={`${provider.label} endpoint`}
                      onChange={(event) => {
                        const endpoint = event.currentTarget.value;
                        setProviderEndpoints((current) => ({
                          ...current,
                          [provider.id]: endpoint,
                        }));
                      }}
                      value={providerEndpoints[provider.id]}
                    />
                  </label>
                  <label className="field-label">
                    API key
                    <div className="secret-input">
                      <KeyRound aria-hidden="true" size={15} />
                      <input
                        aria-label={`New ${provider.label} key`}
                        autoComplete="off"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setKeys((current) => ({
                            ...current,
                            [provider.id]: value,
                          }));
                        }}
                        placeholder={
                          connected
                            ? "Enter a new key to rotate"
                            : "Paste your key"
                        }
                        type="password"
                        value={keys[provider.id]}
                      />
                    </div>
                  </label>
                  <div className="provider-actions">
                    {connection ? (
                      <>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            void rotate(provider.id);
                          }}
                          type="button"
                        >
                          <RotateCw aria-hidden="true" size={14} />
                          Rotate {provider.label} key
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            void client.testProvider(provider.id).then(accept);
                          }}
                          type="button"
                        >
                          Test {provider.label}
                        </button>
                        <button
                          className="danger-icon-button"
                          onClick={() => {
                            void client
                              .removeProvider(provider.id)
                              .then(accept);
                          }}
                          title={`Remove ${provider.label}`}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={15} />
                          <span className="visually-hidden">
                            Remove {provider.label}
                          </span>
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={() => {
                          void connect(
                            provider.id,
                            providerEndpoints[provider.id],
                          );
                        }}
                        type="button"
                      >
                        Connect {provider.label}
                      </button>
                    )}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="models-heading"
          className="settings-section"
          id="models"
        >
          <div className="settings-section-heading">
            <div>
              <h2 id="models-heading">Models &amp; Routing</h2>
              <p>Stable roles keep automatic organization predictable.</p>
            </div>
          </div>
          <div className="model-catalog">
            <div className="model-add-row">
              <label className="field-label">
                Provider
                <select
                  aria-label="New model provider"
                  onChange={(event) => {
                    setNewModelProvider(
                      event.currentTarget.value as ProviderId,
                    );
                  }}
                  value={newModelProvider}
                >
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label model-id-field">
                Model identifier
                <input
                  aria-label="New model identifier"
                  onChange={(event) => {
                    setNewModelId(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addModel();
                    }
                  }}
                  placeholder="e.g. gpt-4.1-mini, claude-sonnet-4-5"
                  value={newModelId}
                />
              </label>
              <button
                className="secondary-button model-add-button"
                disabled={!newModelId.trim()}
                onClick={addModel}
                type="button"
              >
                <Plus aria-hidden="true" size={14} /> Add model
              </button>
            </div>
            <div aria-label="Configured models" className="configured-models">
              {settings.ai.models.map((model) => (
                <div className="configured-model-row" key={model.id}>
                  <label>
                    <input
                      aria-label={`Enable ${model.displayName}`}
                      checked={model.enabled}
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked;
                        setSettings((current) => ({
                          ...current,
                          ai: {
                            ...current.ai,
                            models: current.ai.models.map((candidate) =>
                              candidate.id === model.id
                                ? { ...candidate, enabled }
                                : candidate,
                            ),
                          },
                        }));
                      }}
                      type="checkbox"
                    />
                    <span>
                      <strong>{model.displayName}</strong>
                      <small>{model.provider}</small>
                    </span>
                  </label>
                  <button
                    aria-label={`Remove ${model.displayName}`}
                    className="bare-icon-button"
                    onClick={() => {
                      removeModel(model.id);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </div>
              ))}
              {settings.ai.models.length === 0 ? (
                <p>No models configured yet.</p>
              ) : null}
            </div>
          </div>
          <div className="routing-grid">
            <label className="routing-card">
              <span className="routing-icon routing-main">
                <BrainCircuit aria-hidden="true" size={17} />
              </span>
              <strong>Main model</strong>
              <small>Extraction, categorization and organization</small>
              <select
                aria-label="Main model"
                onChange={(event) => {
                  updateRouting("mainModelId", event.currentTarget.value);
                }}
                value={settings.ai.routing.mainModelId ?? ""}
              >
                <option value="">Not assigned</option>
                {settings.ai.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="routing-card">
              <span className="routing-icon">
                <Bot aria-hidden="true" size={17} />
              </span>
              <strong>Assistant default model</strong>
              <small>Questions and grounded synthesis</small>
              <select
                aria-label="Assistant default model"
                onChange={(event) => {
                  updateRouting(
                    "assistantDefaultModelId",
                    event.currentTarget.value,
                  );
                }}
                value={settings.ai.routing.assistantDefaultModelId ?? ""}
              >
                <option value="">Not assigned</option>
                {settings.ai.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="routing-card">
              <span className="routing-icon">
                <RotateCw aria-hidden="true" size={17} />
              </span>
              <strong>Explicit fallback model</strong>
              <small>Used only when you allow it</small>
              <select
                aria-label="Explicit fallback model"
                onChange={(event) => {
                  updateRouting(
                    "explicitFallbackModelId",
                    event.currentTarget.value,
                  );
                }}
                value={settings.ai.routing.explicitFallbackModelId ?? ""}
              >
                <option value="">No fallback</option>
                {settings.ai.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section
          aria-labelledby="costs-heading"
          className="settings-section compact-settings-section"
          id="costs"
        >
          <div className="settings-section-heading">
            <div>
              <h2 id="costs-heading">Costs &amp; Usage</h2>
              <p>Hard limits fail closed before a provider can overspend.</p>
            </div>
          </div>
          <div className="budget-grid">
            <label className="field-label">
              Daily budget (cents)
              <input
                aria-label="Daily budget (cents)"
                min="0"
                onChange={(event) => {
                  const dailyCents = event.currentTarget.valueAsNumber || 0;
                  setSettings((current) => ({
                    ...current,
                    ai: {
                      ...current.ai,
                      budgets: { ...current.ai.budgets, dailyCents },
                    },
                  }));
                }}
                type="number"
                value={settings.ai.budgets.dailyCents}
              />
            </label>
            <label className="field-label">
              Monthly budget (cents)
              <input
                aria-label="Monthly budget (cents)"
                min="0"
                onChange={(event) => {
                  const monthlyCents = event.currentTarget.valueAsNumber || 0;
                  setSettings((current) => ({
                    ...current,
                    ai: {
                      ...current.ai,
                      budgets: { ...current.ai.budgets, monthlyCents },
                    },
                  }));
                }}
                type="number"
                value={settings.ai.budgets.monthlyCents}
              />
            </label>
          </div>
          <p className="usage-note">
            <Coins aria-hidden="true" size={14} />
            Usage is recorded per provider and model after provider adapters are
            enabled.
          </p>
        </section>

        <section
          aria-labelledby="privacy-heading"
          className="settings-section compact-settings-section"
          id="privacy"
        >
          <div className="settings-section-heading">
            <div>
              <h2 id="privacy-heading">Privacy</h2>
              <p>Control what can leave your local vault.</p>
            </div>
          </div>
          <div className="privacy-grid">
            <label className="toggle-row">
              <input
                aria-label="Allow source content"
                checked={settings.ai.privacy.allowSourceContent}
                onChange={(event) => {
                  const allowSourceContent = event.currentTarget.checked;
                  setSettings((current) => ({
                    ...current,
                    ai: {
                      ...current.ai,
                      privacy: { ...current.ai.privacy, allowSourceContent },
                    },
                  }));
                }}
                type="checkbox"
              />
              <span>
                <strong>Allow source content</strong>
                <small>Send selected excerpts to configured providers.</small>
              </span>
            </label>
            <label className="toggle-row">
              <input
                checked={settings.ai.privacy.storePrompts}
                onChange={(event) => {
                  const storePrompts = event.currentTarget.checked;
                  setSettings((current) => ({
                    ...current,
                    ai: {
                      ...current.ai,
                      privacy: { ...current.ai.privacy, storePrompts },
                    },
                  }));
                }}
                type="checkbox"
              />
              <span>
                <strong>Store prompts</strong>
                <small>Keep local prompt history for debugging.</small>
              </span>
            </label>
          </div>
        </section>

        <footer className="settings-save-bar">
          <span>Changes stay local until you save.</span>
          <button
            className="primary-button save-settings-button"
            onClick={() => {
              void client.saveAiConfiguration(settings.ai).then(accept);
            }}
            type="button"
          >
            Save AI settings
          </button>
        </footer>
      </div>
    </section>
  );
}
