/**
 * Observable UI for the vault compatibility check wired into the Rust
 * startup/vault-open path (`migration::check_vault_compatibility`, T19/T20).
 *
 * `rebuilding` renders a non-modal, non-blocking progress indicator (no
 * dialog role, no `aria-modal`, no focus trap) — the window stays
 * interactive rather than freezing while an older vault's cache is brought
 * up to date (MVP-52 AC5: "an observable progress state, not a frozen
 * window").
 */

export type VaultCompatibilityStatus =
  | { kind: "ready" }
  | { kind: "rebuilding" }
  | { kind: "refused"; message: string };

export function VaultCompatibilityNotice({
  status,
}: {
  status: VaultCompatibilityStatus;
}) {
  if (status.kind === "rebuilding") {
    return (
      <div role="status" aria-live="polite" className="vault-compat-notice">
        Preparing your vault…
      </div>
    );
  }

  if (status.kind === "refused") {
    return (
      <div role="alert" className="vault-compat-notice vault-compat-notice--refused">
        {status.message}
      </div>
    );
  }

  return null;
}
