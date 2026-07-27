# Linux MVP: One-Line Install and Self-Updating Releases — Specification

Tracks GitHub Epic #39. Source issues: #40–#56 (17 issues, `LucasHonoratoDeSouza/KnowledgeGraphBase`).

## Problem Statement

The app builds and runs, but there is no way for a stranger to install it (only clone-and-build), no CI ever runs a test, every push to `dev` publishes an unverified signed release that self-installs on every user's machine, there is no license, and the `dev` release has grown to 61 assets / ~1.4 GB. The goal is a Linux-only MVP: a stranger can install with one pasted command, and pushing to `main` updates their installed app on next launch, all without introducing custom infrastructure (no Cloudflare, no servers — GitHub hosts everything).

## Goals

- [ ] A contributor with a clean Ubuntu machine can go from `curl | sh` to a running, launcher-visible app.
- [ ] Every pull request and push to `main`/`dev` runs the full `make check` gate (lint, typecheck, format, unit, integration, e2e); a red run blocks merge and blocks release.
- [ ] `main` produces real, versioned, changelogged stable releases on a stable updater channel; `dev` continues to produce prerelease builds on a separate channel. Stable installs never receive a `dev` build.
- [ ] The self-update path (download → verify → install → relaunch) is proven to actually upgrade a running install, not just proven to produce artifacts.
- [ ] A newer app version never silently loses or corrupts a user's vault or index when it opens data from an older version.

## Out of Scope

| Feature | Reason |
| --- | --- |
| macOS / Windows builds, notarization, Authenticode | Epic explicitly scopes MVP to Linux only; these are long-lead, paid items (#39). |
| aarch64/arm64 builds | Deferred per owner decision (#51) — small audience, cross-compiling `webkit2gtk` is fiddly. Revisit post-MVP. |
| Custom domain / Cloudflare / self-hosted infra for the installer or updater | Epic explicitly rules this out; GitHub Releases + `raw.githubusercontent.com` is sufficient (#39, #49). |
| Automated crash telemetry / opt-in remote crash reporting | #55 explicitly scopes MVP to local-first rotating log only; remote reporting is a later opt-in feature, not built now. |
| Third-party package channels (AUR, Flathub, Homebrew) submissions | License (#40) and SHA256SUMS (#50) unblock these but submitting packages to each ecosystem is separate future work. |
| Required PR review gate on `main` | Owner decision: required CI checks only, no mandatory approving review (solo maintainer, avoids self-approval theater) (#42). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| License | MIT | Owner decision. Maximum adoption, no downstream obligations. | y |
| Stable release trigger | Every push to `main`; workflow no-ops if `tauri.conf.json` version is unchanged from the last published stable tag | Owner decision. Matches the epic's literal goal ("push to main updates installed apps"); avoids a manual tagging step. | y |
| aarch64 | Deferred for MVP | Owner decision. Installer/README must state amd64-only and fail clearly on other architectures. | y |
| `main` branch protection | Required status checks only, no required review | Owner decision for a solo maintainer. | y |
| Stable updater endpoint shape | `https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/releases/latest/download/latest.json` — GitHub's `/releases/latest/download/<asset>` route redirects to the newest **non-prerelease** release that has that asset, so every stable release can keep its own semver tag (satisfying #46's "stable keeps every version") while the updater always resolves forward. `dev` keeps a fixed `dev` tag whose assets are replaced in place (already true today). | Not previously decided anywhere in the issues; this is the one artifact baked into every shipped binary forever, so it is derived here from GitHub's documented release-asset routing rather than invented. | y — owner approved |
| Release trigger vs. version bump discipline | The `release.yml` workflow reads `tauri.conf.json`'s `version` and compares it against the latest published stable GitHub release tag; if equal, it no-ops (build/test still run, no publish step) | Directly required by #45's acceptance criteria ("pushing to main without a version bump publishes nothing"). | y (derived from issue AC, not a new decision) |
| Crash reporting scope for MVP | Local rotating log file only, reachable from Settings; no remote/opt-in reporting built yet | #55 explicitly says "start with local logging... carries most of the value and none of the privacy cost" and scopes opt-in remote reporting as optional/future. | y (derived from issue text) |
| Migration policy on schema mismatch | Newer app opening an older vault: automatic, observable cache rebuild from Markdown (never silent, never blocking-frozen). Newer vault opened by older app: refuse to open with a clear message, no mutation attempted. | #52's proposal section states this directly as the intended behavior. | y (derived from issue text) |
| Vulnerability advisory policy (no fix available) | Scheduled scan opens/updates a tracking issue rather than failing CI, since failing a build on an unfixable transitive advisory tends to get the check disabled entirely | #54 raises this as an open call and recommends this shape ("a scheduled scan that files an issue is usually more durable"). | y (derived from issue text) |
| `.deb` package updater behavior | `.deb` installs are not self-updating (no updater wiring) and are documented as the "no auto-update" alternative to the AppImage; installer script (#49) only ever delivers the AppImage | #49 states plainly "only the AppImage self-updates... the installer must place the AppImage." | y (derived from issue text) |

**Open questions:** none — all resolved and confirmed above, including the stable updater endpoint route (owner-approved, 2026-07-26).

---

## Phase 1 — Foundation (P1, blocking everything else)

### P1.1: License clears legal blocker

**User Story**: As a prospective contributor or packager, I want a real license in the repo so that I can legally redistribute, fork, or package the app.

**Why P1**: Blocks the one-line installer (piping a script is redistributing binaries with undefined terms) and all package-channel submissions.

**Acceptance Criteria**:

1. WHEN the repository root is inspected THEN system SHALL contain a `LICENSE` file with the full MIT license text and correct copyright holder/year.
2. WHEN `README.md`'s "License" section is read THEN system SHALL state MIT with a link to the `LICENSE` file, replacing the current "Not yet set."
3. WHEN `apps/desktop/src-tauri/Cargo.toml`, the workspace `Cargo.toml`, the root `package.json`, and each published workspace package are inspected THEN system SHALL each declare `license = "MIT"` (Cargo) / `"license": "MIT"` (npm).
4. WHEN the README is read THEN system SHALL include a short note on what MIT means for redistributing the AppImage.

**Independent Test**: `grep -r MIT LICENSE Cargo.toml package.json` finds the license in every required location; README no longer says "Not yet set."

---

### P1.2: CI runs the full check gate on every PR and push

**User Story**: As the maintainer, I want every pull request and push to `main`/`dev` to run `make check` so that broken code cannot merge or release unverified.

**Why P1**: Today nothing runs the test suite in CI at all; every `dev` push publishes a signed, self-installing release built from unverified code.

**Acceptance Criteria**:

1. WHEN a pull request is opened or updated THEN system SHALL run a `ci.yml` workflow covering: static (`lock-check`, `format`, `lint`, `typecheck`), unit (`test-quick`: contracts, UI, Rust unit, Python), integration (`test-rust-integration`), and e2e (`test-desktop-e2e`, Playwright).
2. WHEN a push lands on `main` or `dev` THEN system SHALL run the same `ci.yml` workflow.
3. WHEN the Linux system dependencies (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libgtk-3-dev`) are needed by both `ci.yml` and `dev-build.yml` THEN system SHALL source them from one composite action shared by both workflows, not duplicated inline.
4. WHEN a deliberately broken lint rule or failing test is pushed to a branch THEN system SHALL fail the corresponding CI job.
5. WHEN a Playwright e2e job fails THEN system SHALL upload traces/screenshots as retrievable CI artifacts.
6. WHEN two pushes land on the same ref in quick succession THEN system SHALL cancel the earlier in-progress run for that ref (`concurrency` + `cancel-in-progress`).
7. WHEN CI runs with a warm cache (Rust cache, pnpm store cache both hit) THEN system SHALL complete total wall time under ~10 minutes.

**Independent Test**: Open a PR with one intentionally failing unit test; confirm the `unit` job goes red and the PR shows a failing required check.

**Depends on**: P1.4 (the failing e2e test must be resolved first, or this gate starts permanently red).

---

### P1.3: Releases are gated on green CI, branches are protected

**User Story**: As the maintainer, I want publication to only happen after CI passes, and `main`/`dev` to reject force-pushes and unchecked merges, so a broken build can never reach a user's auto-updater.

**Why P1**: Today `dev-build.yml` publishes unconditionally on every push to `dev`, with no verification gate in front of it.

**Acceptance Criteria**:

1. WHEN the release/publish job would run THEN system SHALL only run it if it `needs:` the CI jobs and they succeeded (no publish step is reachable on a red run).
2. WHEN a pull request targeting `main` or `dev` has a failing required status check THEN system SHALL block that PR from merging (branch protection: required status checks, require branches up to date before merging).
3. WHEN someone attempts a force-push or branch deletion against `main` or `dev` THEN system SHALL reject it (branch protection: disallow force pushes and deletion).
4. WHEN a pull request lacks a required review THEN system SHALL still allow merge once required checks pass — per owner decision, `main` requires checks only, not review.
5. WHEN `CONTRIBUTING.md` (P4.6) is read THEN system SHALL document the exact branch-protection settings in force, so they can be restored if lost.

**Independent Test**: Attempt `git push --force` to `main` from a local clone; confirm it is rejected. Open a PR with a failing check; confirm the merge button is disabled.

---

### P1.4: The failing Explorer divider e2e test is resolved

**User Story**: As the maintainer, I want the one consistently-failing e2e test fixed or explicitly triaged so that a new CI gate does not start permanently red and train everyone to ignore it.

**Why P1**: `desktop-foundation.spec.ts` → "resizes the Explorer by dragging its divider and keeps it after restart" fails on every run, confirmed pre-existing (reproduces on a clean stashed tree).

**Acceptance Criteria**:

1. WHEN the root cause is investigated THEN system SHALL document, in the issue or the fixing commit, whether the drag persists the wrong value or persists correctly while the restore path (`PANE_BOUNDS` clamping in `apps/desktop/src/workspace/layout.ts`) rounds/clamps it away.
2. WHEN a fix is possible THEN system SHALL make the product behavior correct and the existing test pass **unchanged** (the assertion is not weakened to match broken behavior).
3. WHEN a fix is not possible in this pass THEN system SHALL mark the test `test.fixme()` with a comment linking back to issue #43 — never delete or silently `.skip()` it.
4. WHEN the full Playwright suite is run after this task THEN system SHALL report zero failing (non-fixme) tests.

**Independent Test**: `pnpm test:e2e` (or the Makefile equivalent) run twice in a row both show the suite green (or the one test explicitly marked fixme with a linked reason, not silently absent).

---

## Phase 2 — Release Channels (P1, hard to change after users install)

### P2.1: Updater is split into stable and dev channels

**User Story**: As a user on the stable channel, I want to never silently receive a `dev` prerelease, so my installed app only changes on deliberate stable releases.

**Why P1**: The updater endpoint is hardcoded to `.../releases/download/dev/latest.json` today — every build ever shipped, forever, points at `dev`. This is irreversible per-install once shipped.

**Acceptance Criteria**:

1. WHEN a build is produced from `main` THEN system SHALL bake in the stable endpoint `https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/releases/latest/download/latest.json` (see Assumptions: pending explicit owner sign-off before this ships).
2. WHEN a build is produced from `dev` THEN system SHALL bake in the existing dev endpoint (`.../releases/download/dev/latest.json`), unchanged.
3. WHEN a stable install checks for updates THEN system SHALL never be offered or install a prerelease-tagged release.
4. WHEN a user opens Settings → About THEN system SHALL display which channel (`stable` or `dev`) the running build is on.
5. WHEN this endpoint is documented THEN system SHALL note in-repo (README or `CONTRIBUTING.md`) that it is load-bearing and must not be changed casually once the first stable release ships.

**Independent Test**: Build once with the `main` config and once with the `dev` config; inspect each binary's compiled `tauri.conf.json` (or the built `updater` plugin config) and confirm the endpoints differ as specified.

**Depends on**: P1.1–P1.3 (foundation must exist before channel logic is meaningful).

---

### P2.2: Stable releases publish from `main` with semver and a changelog

**User Story**: As the maintainer, I want pushing a version bump to `main` to publish a real, versioned, changelogged release, so users and bug reports can reference a meaningful version.

**Why P1**: Today's `dev` version scheme (`0.1.<run_number>`) is monotonic but meaningless and cannot express a deliberate `0.2.0`.

**Acceptance Criteria**:

1. WHEN a push to `main` changes `apps/desktop/src-tauri/tauri.conf.json`'s `version` field to a value not already published as a stable GitHub release THEN system SHALL build and publish a signed stable release tagged with that version.
2. WHEN a push to `main` does not change the version (already published) THEN system SHALL run CI but publish no release and upload no new release assets.
3. WHEN a stable release is published THEN system SHALL attach the AppImage, the `.deb`, each artifact's `.sig`, and `latest.json`.
4. WHEN a stable release is published THEN system SHALL update `CHANGELOG.md` and populate the GitHub release notes from Conventional Commits since the previous stable tag.
5. WHEN the publish step is reached THEN system SHALL only run downstream of the green CI run from P1.3 (no independent bypass path).

**Independent Test**: Bump `version` in `tauri.conf.json` and push to `main`; confirm exactly one new stable release is created with the right tag, assets, and a populated changelog. Push again with no version change; confirm no new release appears.

**Depends on**: P1.3, P2.1.

---

### P2.3: `dev` release assets are pruned; stable releases retain full history

**User Story**: As the maintainer, I want the `dev` release to hold only its most recent build (not 61 accumulated artifacts) while every stable version stays available to pin or roll back to.

**Why P1**: The `dev` tag grows ~100 MB per push, unbounded, and already sits at ~1.4 GB across 61 assets.

**Acceptance Criteria**:

1. WHEN a new `dev` build is published THEN system SHALL delete the previous `dev` release's assets before or as part of uploading the new ones, so the `dev` release holds only the latest build afterward.
2. WHEN the existing accumulated `dev` assets (0.1.0 through the current build) are inspected after this task ships THEN system SHALL show them pruned down to just the current build (one-time cleanup, done manually or by the same automation).
3. WHEN a stable release is published (P2.2) THEN system SHALL never delete any other stable release's assets — every stable version remains downloadable.
4. WHEN the pruning workflow step runs THEN system SHALL scope its deletion explicitly to the `dev` tag (verified by code review / a test asserting the delete call targets only `dev`), so a bug can never delete a stable release's assets.

**Independent Test**: Push twice to `dev`; confirm the `dev` release lists only the second push's assets. Inspect a stable release from before and after a `dev` push; confirm its assets are untouched.

---

### P2.4: The self-updater is proven to actually upgrade a running install

**User Story**: As the maintainer, I want an automated or checklist-based proof that version N becomes version N+1 on next launch, so the highest-consequence, least-tested path in the product (unattended binary replacement) is not shipped on faith.

**Why P1**: Nothing today confirms the update actually applies — only that artifacts exist and are signed.

**Acceptance Criteria**:

1. WHEN an automated CI test builds version A, publishes it to a scratch release, installs it in a container, builds and publishes version B, and launches A headless THEN system SHALL assert the running app ends up at version B.
2. WHEN signature verification is exercised THEN system SHALL prove a correctly-signed update installs, AND prove a deliberately mis-signed update is rejected (not silently accepted).
3. WHEN version ordering is exercised across a two-digit boundary (e.g. `0.1.9` → `0.1.10`) THEN system SHALL correctly treat `0.1.10` as newer.
4. WHEN `check_for_updates` (`apps/desktop/src-tauri/src/lib.rs`) encounters an error at any stage THEN system SHALL log it (see P4.4) rather than silently discard it via `let _ =`.
5. IF full CI automation of the upgrade path proves disproportionate THEN system SHALL instead ship a documented manual checklist that is actually run and recorded in every stable release PR — never skipped silently.

**Independent Test**: Run the CI job (or execute the manual checklist) once; confirm the recorded evidence shows A becoming B, a rejected bad signature, and a correctly-ordered two-digit version comparison.

**Depends on**: P2.1 (must test against the real channel split, not a real user-facing channel).

---

## Phase 3 — Distribution (P1, the user-facing deliverable)

### P3.1: One-line Linux installer

**User Story**: As a stranger with a fresh Ubuntu machine, I want to run one pasted command and get a launchable, self-updating app, with no `git clone` and no manual dependency hunting.

**Why P1**: This is the literal product goal of the epic.

**Acceptance Criteria**:

1. WHEN `curl -fsSL https://raw.githubusercontent.com/LucasHonoratoDeSouza/KnowledgeGraphBase/main/install.sh | sh` is run on a clean, supported Ubuntu container THEN system SHALL produce a launchable app with no other steps.
2. WHEN the script resolves a release THEN system SHALL fetch the latest **stable** (non-prerelease) release via the GitHub API, never the `dev` prerelease.
3. WHEN the script downloads the AppImage and its `.sig` THEN system SHALL verify the minisign signature (public key embedded in the script) and verify the checksum before installing, and SHALL refuse to install and report the failure if either check fails.
4. WHEN installation completes THEN system SHALL place the executable AppImage at `~/.local/bin/knowledge-os` (`chmod +x`), write a `.desktop` entry and icon under `~/.local/share/applications` and `~/.local/share/icons`, and run `update-desktop-database`.
5. WHEN `~/.local/bin` is not already on `PATH` THEN system SHALL print a warning with the exact line to add.
6. WHEN `libfuse2` is missing THEN system SHALL detect it and print precisely what to install (distro-appropriate), rather than let the AppImage fail with a baffling generic error.
7. WHEN the architecture is not `amd64` THEN system SHALL exit with a clear, specific unsupported-architecture message (aarch64 deferred per Assumptions).
8. WHEN the same install command is run a second time THEN system SHALL upgrade the existing install in place, not duplicate it (idempotent).
9. WHEN the script is run with `--uninstall` THEN system SHALL remove the binary, `.desktop` entry, and icon, tell the user where their vault lives, and SHALL NOT touch the vault.
10. WHEN the script runs at any step THEN system SHALL never invoke or require `sudo`.
11. WHEN installation succeeds THEN system SHALL print the installed version and how to launch the app.

**Independent Test**: Run the installer in a clean Docker container twice in a row (fresh install, then re-run as an upgrade); confirm idempotency, launcher visibility, and that a corrupted/tampered download is rejected in a separate run with a bit-flipped asset.

**Depends on**: P2.1, P2.2 (needs a real stable release and channel to install from).

---

### P3.2: SHA256SUMS published alongside every release

**User Story**: As a user or packager verifying a manual download, I want a conventional checksum file, without needing to install `minisign` and locate the public key.

**Why P1**: Blocks third-party packaging (AUR/Homebrew/Nix all pin by hash) and gives mirrors something to validate against.

**Acceptance Criteria**:

1. WHEN a release (stable or dev) is published THEN system SHALL generate `SHA256SUMS` covering every published artifact and upload it as a release asset.
2. WHEN `SHA256SUMS` is published THEN system SHALL also publish `SHA256SUMS.sig` (minisign-signed), so the checksum list itself is not an unsigned weak link.
3. WHEN `sha256sum -c SHA256SUMS --ignore-missing` is run against the downloaded artifacts THEN system SHALL pass.
4. WHEN the README is read THEN system SHALL document both verification paths (`sha256sum -c` and `minisign -Vm ... -P <public key>`), including the public key text itself (not only embedded in the app).

**Independent Test**: Download a release's assets and `SHA256SUMS`; run `sha256sum -c` and confirm it passes; flip one byte in a downloaded asset and confirm it now fails.

---

### P3.3: aarch64 decision is recorded, and unsupported architectures fail clearly

**User Story**: As a maintainer, I want the aarch64 question to be a recorded decision rather than a silent omission, and as an aarch64 user, I want a clear failure rather than a downloaded binary that cannot run.

**Why P1** (of the *decision*, not the builds): Owner has decided to defer building aarch64 for the MVP; this story is about making that decision explicit and safe, which is required now.

**Acceptance Criteria**:

1. WHEN the README's supported-platforms section is read THEN system SHALL state that only `amd64` Linux is supported for this MVP, with aarch64 explicitly noted as deferred.
2. WHEN the installer (P3.1 AC7) detects a non-`amd64` architecture THEN system SHALL exit with a clear, specific message rather than attempting to download an incompatible binary.
3. WHEN this decision needs revisiting THEN system SHALL be traceable to issue #51 for the future cost/benefit re-evaluation (GitHub ARM runners vs. cross-compiled `webkit2gtk` sysroot).

**Independent Test**: Run the installer under an emulated non-amd64 architecture (e.g. `arch=arm64` container); confirm it exits early with the specific message instead of downloading anything.

---

## Phase 4 — Professional Finish

### P4.1: Vault and index migration is safe across versions (P1 — high stakes)

**User Story**: As a user whose app silently self-updates, I want a newer app version to never lose or corrupt my vault or index, and never silently open data from a version it shouldn't.

**Why P1** (elevated from the epic's "Phase 4" grouping): the epic itself calls this "the most damaging defect the product can have" precisely because the delivery mechanism (silent auto-update) is already live from Phase 2 onward. It must land before or alongside the first real stable rollout that mixes versions in the wild.

**Acceptance Criteria**:

1. WHEN SQLite is written THEN system SHALL persist a schema version, and WHEN the vault is written THEN system SHALL persist a vault-format version.
2. WHEN the app opens a vault on startup THEN system SHALL compare the persisted versions against what the running binary expects and take one explicit branch: already current, migrate, rebuild cache from Markdown, or refuse to open.
3. WHEN a newer app opens a vault last written by an older app THEN system SHALL handle it non-destructively (migrate or rebuild cache) — verified by an automated test using a fixture vault from an older schema.
4. WHEN an older app opens a vault last written by a newer app THEN system SHALL refuse to open, state the reason plainly to the user, and SHALL NOT mutate the vault.
5. WHEN a cache rebuild from Markdown is triggered THEN system SHALL show an observable progress state (not a frozen window) and SHALL complete correctly on a vault of realistic size (verified by an automated test).
6. WHEN any migration step would touch Markdown content directly (not just the SQLite cache) THEN system SHALL create a recoverable backup first, and this is verified by a test that confirms the backup exists and is restorable.
7. WHEN the vault layout and data locations are documented THEN system SHALL let a user recover by hand without the app, using only that documentation.

**Independent Test**: Open a fixture vault created by a simulated "older" schema version with the current app; confirm automatic, observable, non-destructive migration. Open a fixture vault stamped with a future schema version; confirm the app refuses to open it with a clear message and leaves the fixture byte-for-byte unchanged.

---

### P4.2: SECURITY.md and private vulnerability reporting

**User Story**: As a security researcher, I want a private channel to report a vulnerability, so disclosure doesn't happen in the open before a fix exists.

**Acceptance Criteria**:

1. WHEN the repository is inspected THEN system SHALL contain a `SECURITY.md` covering supported versions (latest stable only), the private reporting channel, an honestly-stated response time for a solo maintainer, and scope (what counts as a vulnerability here).
2. WHEN the repository's GitHub settings are inspected THEN system SHALL have private vulnerability reporting enabled, and the "Report a vulnerability" button SHALL be visible.
3. WHEN `SECURITY.md` or an adjacent doc is read THEN system SHALL describe where `TAURI_SIGNING_PRIVATE_KEY` lives, who can access it, and the rotation procedure if it leaks.
4. WHEN any workflow with access to the signing secret is inspected THEN system SHALL confirm it cannot be triggered by a `pull_request` event from a fork.
5. WHEN the published minisign public key is looked up THEN system SHALL find it documented in the repo (not only embedded in built binaries).

**Independent Test**: Visit the repo's Security tab; confirm the vulnerability-reporting button and policy are present. Inspect workflow trigger conditions for any job referencing the signing secret; confirm none run on `pull_request_target` from forks or unguarded `pull_request`.

---

### P4.3: Dependency auditing — Dependabot, vulnerability scanning, SBOM

**User Story**: As the maintainer, I want to know when a dependency in any of the three ecosystems (Rust, npm, Python) has a known vulnerability, since strict version pinning means patches never arrive on their own.

**Acceptance Criteria**:

1. WHEN `.github/dependabot.yml` is inspected THEN system SHALL configure updates for `cargo`, `npm`, `pip`/`uv`, and `github-actions`.
2. WHEN the scheduled scan workflow runs (on a cron schedule, not only on PRs) THEN system SHALL run `cargo audit` (or `cargo deny`), `pnpm audit`, and `pip-audit`/`uv`-equivalent for Python members.
3. WHEN a known-vulnerable dependency is deliberately introduced in a test run THEN system SHALL be detected by the scan.
4. WHEN an advisory has no available fix THEN system SHALL open or update a tracking issue rather than fail the build (per Assumptions).
5. WHEN a stable release is published THEN system SHALL attach a CycloneDX or SPDX SBOM as a release asset.

**Independent Test**: Temporarily pin a dependency to a version with a known CVE in a scratch branch; confirm the scheduled scan job flags it.

---

### P4.4: Local crash and error logging

**User Story**: As a user whose app crashes or hits an unrecoverable error, I want something I can find and attach to a bug report, without the app phoning home.

**Acceptance Criteria**:

1. WHEN the app panics or hits an unrecoverable error THEN system SHALL write it to a rotating local log file in the app data directory.
2. WHEN Settings is opened THEN system SHALL provide an action to open or copy the log file, and the log location SHALL be documented.
3. WHEN log contents are inspected THEN system SHALL never contain note content, vault contents, or provider credentials — verified by an explicit automated test that exercises credential- and content-touching code paths and asserts none of that data reaches the log.
4. WHEN a user needs to file a bug report THEN system SHALL have a documented path telling them what to attach.
5. IF opt-in remote crash reporting is added later (out of scope for this MVP) THEN it SHALL be off by default and SHALL show the exact payload before sending — not required for this spec's completion.

**Independent Test**: Trigger a deliberate panic in a debug build; confirm the log file records it. Run the credential/content-leakage test and confirm it fails if a log statement is changed to include raw note text (mutation check).

---

### P4.5: Self-updates are observable

**User Story**: As a user, I want to know when an update has been silently installed and a restart is needed, when updates are failing, and what version/channel I'm running — without the update becoming intrusive.

**Acceptance Criteria**:

1. WHEN an update has downloaded and installed in the background THEN system SHALL show a quiet, non-modal, non-blocking indicator with a "Restart now" action.
2. WHEN update checks fail repeatedly THEN system SHALL surface that in Settings → About rather than swallowing the error (ties to P2.4 AC4's logging requirement).
3. WHEN Settings → About is opened THEN system SHALL display the current version and channel (stable/dev).
4. WHEN the app starts THEN system SHALL NOT block startup on the update check/download.
5. WHEN update attempts occur (success or failure) THEN system SHALL log the attempt and outcome to the file from P4.4.

**Independent Test**: Simulate a pending-restart state and a failing update check in a dev build; confirm the non-modal indicator appears for the former and Settings → About surfaces the latter.

---

### P4.6: Linux dependencies, install paths, and contributing are documented

**User Story**: As a new contributor on a clean machine, I want the README alone to get me from clone to a running app, and CONTRIBUTING.md to tell me the branch model and local gate.

**Acceptance Criteria**:

1. WHEN the README is read THEN system SHALL include a "Linux system dependencies" block with the exact `apt` install line (sourced from the same composite action as CI, per P1.2 AC3 — one shared source of truth) plus notes for non-Debian distros.
2. WHEN the README is read THEN system SHALL document both install paths side by side (one-line installer and building from source), supported distributions/architectures, where the vault and app data live, and how to uninstall.
3. WHEN `CONTRIBUTING.md` is read THEN system SHALL document the branch model (`main`, `dev`, `feat/*`), where PRs go, Conventional Commits (since the changelog is generated from them), `make check` as the local gate and which parts CI enforces, and the branch-protection settings from P1.3.
4. WHEN the repository's issue/PR templates are inspected THEN system SHALL contain a bug report template (asking for version and channel), a feature request template, and a pull request checklist template.
5. WHEN a contributor on a clean Ubuntu install follows only the README THEN system SHALL be able to reach a running app with no other source of information.

**Independent Test**: Follow the README step-by-step in a clean container with no prior knowledge of the project; confirm a running app is reached without consulting any file the README doesn't link to.

---

## Edge Cases

- WHEN a `dev`-channel install and a `stable`-channel install exist on the same machine THEN system SHALL keep their update checks fully independent (each only ever considers its own channel's `latest.json`).
- WHEN the CI check gate itself is broken (e.g. a runner outage) THEN system SHALL fail closed — no publish step SHALL run without an explicit green result, never on absence-of-red.
- WHEN the installer is re-run while the app is currently running THEN system SHALL still be able to replace the binary (verify this doesn't require killing the process, or document that it does).
- WHEN `install.sh` is fetched over a flaky connection and only partially downloads THEN system SHALL fail the signature/checksum verification rather than install a truncated binary.
- WHEN a release is created with an identical version to an existing stable tag (race between two pushes) THEN system SHALL not publish a duplicate/overwriting release — the no-op check in P2.2 AC2 must be safe under concurrent workflow runs.

---

## Requirement Traceability

| Requirement ID | Story | Source Issue | Phase | Status |
| --- | --- | --- | --- | --- |
| MVP-40 | P1.1 License | #40 | Foundation | ✅ Verified |
| MVP-41 | P1.2 CI check gate | #41 | Foundation | ⚠️ Verified, live-run proof deferred to owner (AC4, AC7) |
| MVP-42 | P1.3 Gated releases + branch protection | #42 | Foundation | ✅ Verified (live) |
| MVP-43 | P1.4 Fix flaky/failing e2e test | #43 | Foundation | ✅ Verified |
| MVP-44 | P2.1 Stable/dev updater channel split | #44 | Release Channels | ✅ Verified (AC5 gap fixed post-verification) |
| MVP-45 | P2.2 Stable release workflow, semver, changelog | #45 | Release Channels | ✅ Verified |
| MVP-46 | P2.3 Asset retention/pruning | #46 | Release Channels | ⚠️ Verified, one-time cleanup deferred to owner (AC2) |
| MVP-47 | P2.4 End-to-end updater verification | #47 | Release Channels | ⚠️ Verified, real A→B upgrade deferred to owner (AC1) |
| MVP-49 | P3.1 One-line installer | #49 | Distribution | ✅ Verified |
| MVP-50 | P3.2 SHA256SUMS | #50 | Distribution | ⚠️ Verified, live dry run deferred to owner (AC3) |
| MVP-51 | P3.3 aarch64 decision | #51 | Distribution | ✅ Verified |
| MVP-52 | P4.1 Vault/index migration | #52 | Professional Finish | ✅ Verified (AC5 realistic-size test added post-verification) |
| MVP-53 | P4.2 SECURITY.md | #53 | Professional Finish | ✅ Verified (live) |
| MVP-54 | P4.3 Dependency auditing/SBOM | #54 | Professional Finish | ⚠️ Verified, live scan run deferred to owner (AC3) |
| MVP-55 | P4.4 Crash/error logging | #55 | Professional Finish | ✅ Verified |
| MVP-48 | P4.5 Observable self-updates | #48 | Professional Finish | ✅ Verified |
| MVP-56 | P4.6 Documentation/contributing | #56 | Professional Finish | ⚠️ Verified, spec-precision gap noted (AC5) |

**ID format:** `MVP-[issue number]` — chosen to keep 1:1 traceability with the already-numbered GitHub issues this epic tracks.

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 17 total, 17 mapped to phases above, 0 unmapped.

---

## Success Criteria

- [ ] A stranger on a clean Ubuntu machine installs with one pasted command and sees the app in their launcher.
- [ ] A pull request with a failing test cannot merge; a red CI run publishes nothing.
- [ ] A real stable release with a real semver tag and changelog exists on GitHub, separate from `dev`.
- [ ] An installed stable build proven to upgrade itself to a newer stable build, end to end.
- [ ] Zero data loss across a documented older-vault/newer-app and newer-vault/older-app test matrix.
- [ ] `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and issue/PR templates all exist and are internally consistent with each other.
