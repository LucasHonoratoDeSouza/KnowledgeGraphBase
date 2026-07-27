# Security Policy

## Supported versions

Only the **latest stable release** (the `main`-branch, non-prerelease build — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch model) is supported with security
fixes. This is a solo-maintained project; older stable releases and the `dev`
prerelease channel do not receive backported security fixes — please upgrade to the
latest stable release first (the app self-updates on that channel) before reporting.

## Reporting a vulnerability

Please report security vulnerabilities **privately**, using GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability):
open the repository's **Security** tab and click **"Report a vulnerability"**. This
opens a private draft security advisory visible only to the maintainer, so disclosure
doesn't happen in the open before a fix exists.

Do not open a public issue for a suspected vulnerability.

### Response time

This is a solo-maintained project, not a company with an on-call security team.
Honest expectation: an initial acknowledgment within **7 days**, and a best-effort
fix or mitigation plan within **30 days** for confirmed vulnerabilities, depending on
severity and complexity. If you haven't heard back in a week, it's fine to follow up
on the same advisory thread.

### Scope

In scope:

- The Knowledge OS desktop app (`apps/desktop`) and the Rust crates it depends on
  (`crates/*`) — including the update mechanism, vault/credential handling
  (Stronghold), and the installer (`install.sh`).
- The release pipeline (`.github/workflows/*.yml`) — e.g. a way to get an
  unsigned or tampered artifact published as if it were legitimate.

Out of scope:

- The optional `apps/api`/`apps/worker` services — these are for a future
  remote/sync mode and are not deployed or used by the local-first desktop app
  described in the README.
- Findings that require physical access to an already-compromised machine, or
  that rely purely on a vulnerability in an upstream dependency with no
  Knowledge-OS-specific exploitation path (please report those upstream instead).

## Signing-key threat model and rotation

Every release artifact (AppImage, `.deb`, `latest.json`, `SHA256SUMS`) is signed with
a [minisign](https://jedisct1.github.io/minisign/) keypair. The public key is
published in the [README](README.md#verifying-a-downloaded-release) and embedded in
`apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) and `install.sh`,
so the app and the installer both refuse to accept an artifact not signed by it.

**Where the private key lives:** the private key and its passphrase are stored as
GitHub Actions repository secrets, `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. They are not committed to the repository and
are not present on any developer machine.

**Who can access it:** only workflow runs the repository owner triggers (pushes to
`main`/`dev` — see the fork-safety audit below) can read these secrets at runtime;
GitHub Actions secrets are never exposed to workflow runs triggered by a `pull_request`
from a fork, and neither release workflow in this repository is triggered by
`pull_request` at all (see below).

**Threat model:** the realistic risk is the secret leaking via a compromised
maintainer account, a misconfigured workflow that echoes it into logs, or a workflow
made reachable from an untrusted `pull_request`/`pull_request_target` event. A leaked
key would let an attacker sign a malicious artifact that the app's own updater and
`install.sh`'s verification would accept as genuine.

**Rotation procedure, if the key is ever suspected of leaking:**

1. Generate a new minisign keypair: `minisign -G` (this produces a new
   `minisign.pub`/`minisign.key`).
2. Update the `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   repository secrets to the new key material (Settings → Secrets and variables →
   Actions).
3. Update the embedded public key in three places so old and new installs keep
   working with the new signature going forward: `apps/desktop/src-tauri/tauri.conf.json`
   (`plugins.updater.pubkey`), `install.sh`'s embedded public key, and the README's
   verification section.
4. Publish a new stable release signed with the new key. Existing installs will
   receive it as a normal update **only if** the old key is still trusted for that
   one transition release, or if users are instructed to reinstall via `install.sh`
   — a full key rotation is a breaking change for the update chain and needs a
   deliberate transition plan, not a silent swap.
5. Treat every artifact signed with the old key as untrusted from the moment of
   rotation; do not republish or re-sign anything with it.

## Fork-safety audit of workflows using the signing secret

Both workflows that reference `TAURI_SIGNING_PRIVATE_KEY`/
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` were audited for their trigger conditions:

| Workflow | Trigger | Reachable from a fork's `pull_request`? |
| --- | --- | --- |
| `.github/workflows/release-stable.yml` | `push` to `main` only | No |
| `.github/workflows/release-dev.yml` | `push` to `dev` only | No |

Neither workflow declares `pull_request` or `pull_request_target` anywhere in its
`on:` block, and neither is invoked by `.github/workflows/ci.yml` (which does trigger
on `pull_request`, but never references the signing secrets — it only runs
`make lock-check format lint typecheck`, `make test-quick`, `make test-rust-integration`,
and `make test-desktop-e2e`). A pull request, including one from a fork, cannot cause
either signing secret to be read.
