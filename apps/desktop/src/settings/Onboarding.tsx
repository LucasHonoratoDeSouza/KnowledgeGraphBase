import { useState, type SyntheticEvent } from "react";

import {
  ArrowRight,
  Check,
  Cloud,
  FolderOpen,
  FolderPlus,
  HardDrive,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldCheck,
} from "lucide-react";

import { ProductMark } from "@knowledge-os/ui";

import { DEFAULT_LAYOUT, serializeLayout } from "../workspace/layout";
import { tauriFolderPicker, type FolderPicker } from "./folderPicker";
import type { ProviderId, SettingsClient, SettingsSnapshot } from "./types";

interface OnboardingProps {
  client: SettingsClient;
  folderPicker?: FolderPicker;
  onComplete: (settings: SettingsSnapshot) => void;
}

const endpoints: Record<ProviderId, string> = {
  anthropic: "https://api.anthropic.com",
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com",
};

export function Onboarding({
  client,
  folderPicker = tauriFolderPicker,
  onComplete,
}: OnboardingProps) {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [vaultMode, setVaultMode] = useState<"create" | "open_existing">(
    "create",
  );
  const [parentPath, setParentPath] = useState("");
  const [vaultName, setVaultName] = useState("");
  const [existingVaultPath, setExistingVaultPath] = useState("");
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [credential, setCredential] = useState("");
  const [mainModelId, setMainModelId] = useState("");
  const [dailyBudgetCents, setDailyBudgetCents] = useState(0);
  const [monthlyBudgetCents, setMonthlyBudgetCents] = useState(0);
  const [error, setError] = useState("");

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const settings = await client.completeOnboarding({
        aiEnabled,
        credential: aiEnabled ? credential : null,
        dailyBudgetCents: aiEnabled ? dailyBudgetCents : 0,
        endpoint: aiEnabled ? endpoints[provider] : null,
        layoutJson: serializeLayout(DEFAULT_LAYOUT),
        mainModelId: aiEnabled ? mainModelId : null,
        monthlyBudgetCents: aiEnabled ? monthlyBudgetCents : 0,
        provider: aiEnabled ? provider : null,
        vault:
          vaultMode === "create"
            ? { kind: "create", parentPath, vaultName }
            : { kind: "open_existing", vaultPath: existingVaultPath },
      });
      onComplete(settings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCredential("");
    }
  }

  return (
    <main aria-label="Knowledge workspace" className="onboarding-gate">
      <section className="onboarding-story">
        <div className="onboarding-brand">
          <ProductMark />
          <span>DESKTOP KNOWLEDGE SYSTEM</span>
        </div>
        <div className="onboarding-story-copy">
          <div className="story-icon">
            <img alt="" src="/knowledge-os-icon.png" />
          </div>
          <h2>Built for the long term.</h2>
          <p>
            A local workspace for notes, sources, projects and the connections
            between them.
          </p>
          <ul>
            <li>
              <span>
                <Check aria-hidden="true" size={14} />
              </span>
              <div>
                <strong>Local by default</strong>
                <small>Plain Markdown and a folder you control.</small>
              </div>
            </li>
            <li>
              <span>
                <Check aria-hidden="true" size={14} />
              </span>
              <div>
                <strong>Connected automatically</strong>
                <small>Projects, concepts and sources form one graph.</small>
              </div>
            </li>
            <li>
              <span>
                <Check aria-hidden="true" size={14} />
              </span>
              <div>
                <strong>AI on your terms</strong>
                <small>Your providers, models, keys and budgets.</small>
              </div>
            </li>
          </ul>
        </div>
        <footer>
          <ShieldCheck aria-hidden="true" size={14} />
          <span>Your data stays yours.</span>
        </footer>
      </section>

      <form
        aria-label="Workspace setup"
        className="onboarding-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="onboarding-progress">
          <span>Workspace setup</span>
          <strong>1 of 2</strong>
          <div>
            <i />
          </div>
        </div>
        <header>
          <span className="eyebrow">LOCAL WORKSPACE</span>
          <h1>Set up your workspace</h1>
          <p>Create a new knowledge base or open a folder you already use.</p>
        </header>

        <fieldset className="vault-choice-fieldset">
          <legend className="visually-hidden">Local knowledge base</legend>
          <label
            className={`choice-card ${vaultMode === "create" ? "is-selected" : ""}`}
          >
            <input
              aria-label="Create local knowledge base"
              checked={vaultMode === "create"}
              name="vault-mode"
              onChange={() => {
                setVaultMode("create");
              }}
              type="radio"
            />
            <span className="choice-card-icon">
              <FolderPlus aria-hidden="true" size={20} />
            </span>
            <span>
              <strong>Create local knowledge base</strong>
              <small>Start with a clean, portable vault.</small>
            </span>
            <i className="choice-indicator" />
          </label>
          <label
            className={`choice-card ${vaultMode === "open_existing" ? "is-selected" : ""}`}
          >
            <input
              aria-label="Open existing vault"
              checked={vaultMode === "open_existing"}
              name="vault-mode"
              onChange={() => {
                setVaultMode("open_existing");
              }}
              type="radio"
            />
            <span className="choice-card-icon">
              <FolderOpen aria-hidden="true" size={20} />
            </span>
            <span>
              <strong>Open existing vault</strong>
              <small>Use an existing folder of notes.</small>
            </span>
            <i className="choice-indicator" />
          </label>
        </fieldset>

        <section aria-label="Vault location" className="vault-location-section">
          {vaultMode === "create" ? (
            <>
              <label className="field-label">
                Vault name
                <input
                  name="vault-name"
                  onChange={(event) => {
                    setVaultName(event.currentTarget.value);
                  }}
                  placeholder="My knowledge base"
                  required
                  value={vaultName}
                />
              </label>
              <label className="field-label">
                Parent location
                <div className="path-picker">
                  <HardDrive aria-hidden="true" size={15} />
                  <input
                    aria-label="Parent location"
                    name="parent-path"
                    placeholder="Choose a folder"
                    readOnly
                    required
                    value={parentPath}
                  />
                  <button
                    onClick={() => {
                      void folderPicker
                        .chooseParentLocation()
                        .then((selected) => {
                          if (selected !== null) setParentPath(selected);
                        });
                    }}
                    type="button"
                  >
                    Choose location
                  </button>
                </div>
              </label>
            </>
          ) : (
            <label className="field-label">
              Existing vault path
              <div className="path-picker">
                <FolderOpen aria-hidden="true" size={15} />
                <input
                  aria-label="Existing vault path"
                  name="vault-path"
                  placeholder="Choose an existing vault"
                  readOnly
                  required
                  value={existingVaultPath}
                />
                <button
                  onClick={() => {
                    void folderPicker.chooseExistingVault().then((selected) => {
                      if (selected !== null) setExistingVaultPath(selected);
                    });
                  }}
                  type="button"
                >
                  Choose existing vault
                </button>
              </div>
            </label>
          )}
        </section>

        <fieldset className="processing-fieldset">
          <legend>Intelligence</legend>
          <p>You can change this later in Settings.</p>
          <label
            className={`processing-option ${!aiEnabled ? "is-selected" : ""}`}
          >
            <input
              aria-label="Local only"
              checked={!aiEnabled}
              name="processing"
              onChange={() => {
                setAiEnabled(false);
              }}
              type="radio"
            />
            <span className="processing-icon">
              <LockKeyhole aria-hidden="true" size={18} />
            </span>
            <span>
              <strong>Local only</strong>
              <small>No account or API key required</small>
            </span>
            <b>Recommended</b>
          </label>
          <label
            className={`processing-option ${aiEnabled ? "is-selected" : ""}`}
          >
            <input
              aria-label="AI enabled"
              checked={aiEnabled}
              name="processing"
              onChange={() => {
                setAiEnabled(true);
              }}
              type="radio"
            />
            <span className="processing-icon">
              <Cloud aria-hidden="true" size={18} />
            </span>
            <span>
              <strong>AI enabled</strong>
              <small>Connect a provider during setup</small>
            </span>
          </label>
        </fieldset>

        {aiEnabled ? (
          <section aria-label="AI defaults" className="onboarding-ai-fields">
            <label className="field-label">
              Provider
              <select
                aria-label="Provider"
                onChange={(event) => {
                  setProvider(event.currentTarget.value as ProviderId);
                }}
                value={provider}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </label>
            <label className="field-label">
              Provider key
              <div className="secret-input">
                <KeyRound aria-hidden="true" size={15} />
                <input
                  autoComplete="off"
                  onChange={(event) => {
                    setCredential(event.currentTarget.value);
                  }}
                  required
                  type="password"
                  value={credential}
                />
              </div>
            </label>
            <label className="field-label">
              Main model
              <input
                onChange={(event) => {
                  setMainModelId(event.currentTarget.value);
                }}
                placeholder="e.g. gpt-4.1-mini"
                required
                value={mainModelId}
              />
            </label>
            <label className="field-label">
              Daily budget (cents)
              <input
                min="0"
                onChange={(event) => {
                  setDailyBudgetCents(event.currentTarget.valueAsNumber || 0);
                }}
                type="number"
                value={dailyBudgetCents}
              />
            </label>
            <label className="field-label">
              Monthly budget (cents)
              <input
                min="0"
                onChange={(event) => {
                  setMonthlyBudgetCents(event.currentTarget.valueAsNumber || 0);
                }}
                type="number"
                value={monthlyBudgetCents}
              />
            </label>
          </section>
        ) : null}

        {error ? (
          <p className="onboarding-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="onboarding-actions">
          <button
            className="text-button"
            onClick={() => {
              setAiEnabled(false);
            }}
            type="button"
          >
            Continue without account
          </button>
          <button className="primary-button onboarding-submit" type="submit">
            Open workspace
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </footer>
        <p className="onboarding-footnote">
          <Network aria-hidden="true" size={13} />
          Cloud account setup is optional; local mode remains fully available.
        </p>
      </form>
    </main>
  );
}
