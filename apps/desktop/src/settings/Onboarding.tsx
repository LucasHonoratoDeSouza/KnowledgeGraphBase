import { useEffect, useState, type SyntheticEvent } from "react";

import {
  ArrowRight,
  Check,
  FolderOpen,
  FolderPlus,
  ShieldCheck,
} from "lucide-react";

import { ProductMark } from "@knowledge-os/ui";

import { DEFAULT_LAYOUT, serializeLayout } from "../workspace/layout";
import { tauriFolderPicker, type FolderPicker } from "./folderPicker";
import type { SettingsClient, SettingsSnapshot } from "./types";

interface OnboardingProps {
  client: SettingsClient;
  folderPicker?: FolderPicker;
  onComplete: (settings: SettingsSnapshot) => void;
}

/**
 * Setup is local-only and one step (#37): pick a folder you already use, or
 * name a new vault and let it land in the default location. There is no
 * account, no provider and no key here — AI is opt-in later from Settings, so
 * nothing about starting out depends on the network.
 */
export function Onboarding({
  client,
  folderPicker = tauriFolderPicker,
  onComplete,
}: OnboardingProps) {
  const [vaultMode, setVaultMode] = useState<"create" | "open_existing">(
    "create",
  );
  const [parentPath, setParentPath] = useState("");
  const [vaultName, setVaultName] = useState("");
  const [existingVaultPath, setExistingVaultPath] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Resolving the default up front is what lets "start fresh" be a single
  // field: the location is already decided by the time the form is readable.
  useEffect(() => {
    let cancelled = false;
    void folderPicker
      .defaultParentLocation()
      .then((location) => {
        if (!cancelled && location) setParentPath(location);
      })
      .catch(() => {
        // Leaves the location empty, so the form asks for one instead.
      });
    return () => {
      cancelled = true;
    };
  }, [folderPicker]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    // The location has no field of its own, so nothing else would catch it
    // when no default resolved.
    if (vaultMode === "create" && !parentPath) {
      setError("Choose where the vault should live.");
      return;
    }
    setSaving(true);
    try {
      const settings = await client.completeOnboarding({
        aiEnabled: false,
        credential: null,
        dailyBudgetCents: 0,
        endpoint: null,
        layoutJson: serializeLayout(DEFAULT_LAYOUT),
        mainModelId: null,
        monthlyBudgetCents: 0,
        provider: null,
        vault:
          vaultMode === "create"
            ? { kind: "create", parentPath, vaultName }
            : { kind: "open_existing", vaultPath: existingVaultPath },
      });
      onComplete(settings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
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
                <strong>No account needed</strong>
                <small>Nothing to sign up for, nothing to sync.</small>
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
        <header>
          <span className="eyebrow">LOCAL WORKSPACE</span>
          <h1>Set up your workspace</h1>
          <p>Name a new knowledge base, or open a folder you already use.</p>
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
              <strong>Start fresh</strong>
              <small>A new, clean vault. Just give it a name.</small>
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
              <strong>Open a folder</strong>
              <small>Use a folder of notes you already have.</small>
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
                  autoFocus
                  name="vault-name"
                  onChange={(event) => {
                    setVaultName(event.currentTarget.value);
                  }}
                  placeholder="My knowledge base"
                  required
                  value={vaultName}
                />
              </label>
              <p className="vault-destination">
                <span>
                  Saved in
                  <strong>
                    {parentPath ? `${parentPath}/${vaultName || "…"}` : "…"}
                  </strong>
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    void folderPicker
                      .chooseParentLocation()
                      .then((selected) => {
                        if (selected !== null) setParentPath(selected);
                      });
                  }}
                  type="button"
                >
                  Change location
                </button>
              </p>
            </>
          ) : (
            <label className="field-label">
              Existing vault path
              <div className="path-picker">
                <FolderOpen aria-hidden="true" size={15} />
                <input
                  aria-label="Existing vault path"
                  name="vault-path"
                  placeholder="Choose an existing folder"
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
                  Choose folder
                </button>
              </div>
            </label>
          )}
        </section>

        {error ? (
          <p className="onboarding-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="onboarding-actions">
          <button
            className="primary-button onboarding-submit"
            disabled={saving}
            type="submit"
          >
            Open workspace
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </footer>
        <p className="onboarding-footnote">
          <ShieldCheck aria-hidden="true" size={13} />
          Everything stays on this machine. AI is optional and off until you
          turn it on in Settings.
        </p>
      </form>
    </main>
  );
}
