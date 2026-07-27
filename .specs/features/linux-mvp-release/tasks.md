# Linux MVP: One-Line Install and Self-Updating Releases — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/linux-mvp-release/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase sampling (`Makefile`, `apps/desktop/package.json`, existing `*.test.tsx`/`tests/*.rs`/`tests/e2e/**`). No `AGENTS.md`/`CLAUDE.md`/testing-standards doc found in the repo — strong defaults applied where no guideline exists.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| GitHub Actions workflows / composite actions | none (lint gate) | Valid YAML, `actionlint` clean; commands inside match `Makefile` targets verbatim | `.github/workflows/*.yml`, `.github/actions/**/action.yml` | `actionlint .github/workflows/*.yml .github/actions/*/action.yml` (fallback: `yamllint` if `actionlint` unavailable) |
| Rust domain logic (compatibility decision function, log redaction guard, updater error propagation) | unit | All branches; 1:1 to spec ACs; every listed edge case (schema<, format<, vault-newer-than-binary, etc.) has a test | `apps/desktop/src-tauri/src/*.rs` `#[cfg(test)] mod tests`, `crates/*/src/*.rs` | `make test-rust` (`cargo test --workspace --lib --locked`) |
| Rust integration (vault fixtures across schema/format versions, DB open flows, log-sink content assertions) | integration | Key flows: older-vault-open, newer-vault-refuse, rebuild-cache-correctness, credential/content redaction end-to-end | `apps/desktop/src-tauri/tests/*.rs`, `crates/knowledge-storage/tests/*.rs` | `make test-rust-integration` (`cargo test --workspace --tests --locked`) |
| React components (Settings → About, update-state indicator) | unit | 1:1 to spec ACs for P4.5/P2.1 (version/channel display, pending-restart, failure surfacing) | `apps/desktop/src/settings/*.test.tsx` | `make test-ui` (`pnpm --filter @knowledge-os/ui --filter @knowledge-os/desktop test`) |
| Playwright e2e (divider fix, About UI, pending-restart indicator visibility) | e2e | Happy path + the specific regression each task fixes | `tests/e2e/desktop-foundation/*.spec.ts` | `make test-desktop-e2e` (`pnpm exec playwright test`) |
| `install.sh` (shell script) | e2e (container-based) | Happy path, idempotent re-run, tamper rejection, missing-`libfuse2`, non-`amd64` guard, `--uninstall` | new `scripts/test-install.sh` driving a disposable Ubuntu Docker container | new Makefile target `test-installer` (added in the task that creates it) |
| Config/entity/doc files (`LICENSE`, `package.json`/`Cargo.toml` license fields, `tauri.conf.json`, `CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates, `CHANGELOG.md`, `dependabot.yml`) | none | — (build gate only) | repo root, `.github/**` | `make check` (build gate only) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only (Rust or React) | `make lock-check format lint typecheck test-quick` |
| Full | After tasks with integration/e2e (Rust integration, Playwright, installer container test) | `make test-quick test-rust-integration test-desktop-e2e` (+ `make test-installer` when the task touches `install.sh`) |
| Build | End of every task regardless of layer (final acceptance for config/doc-only tasks; also required before every commit per the skill's Execution Contract) | `make check` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order. Phase 4 is split into two sub-phases (4a, 4b) because it holds 11 tasks (>10, the split threshold), cut at the genuine seam between data-safety/observability work and compliance/documentation work.

### Phase 1: Foundation

```
T1 → T2 → T3 → T4 → T5 → T6 → T7
```

### Phase 2: Release Channels

```
T8 → T9 → T10 → T11 → T12 → T13 → T14
```

### Phase 3: Distribution

```
T15 → T16 → T17 → T18
```

### Phase 4a: Data Safety & Observability

```
T19 → T20 → T21 → T22 → T23
```

### Phase 4b: Compliance & Documentation

```
T24 → T25 → T26 → T27 → T28 → T29
```

---

## Task Breakdown

### T1: Fix the Explorer divider persistence bug (#43)

**What**: Root-cause and fix `desktop-foundation.spec.ts`'s "resizes the Explorer by dragging its divider and keeps it after restart" test — the resized pane width is not round-tripping through whatever persists workspace layout across `page.reload()`.
**Where**: `apps/desktop/src/app/AppShell.tsx` (persistence call site — likely `localStorage.setItem`/`getItem` around `serializeLayout`/`restoreLayout`), `apps/desktop/src/workspace/layout.ts` (if the clamp in `resizePane` is the actual culprit, `PANE_BOUNDS` at L32-36 or clamp at L69-77).
**Depends on**: None
**Reuses**: existing `serializeLayout`/`restoreLayout` (`layout.ts:170-172, 257-268`)
**Requirement**: MVP-43

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Root cause is written in the commit message (which value is wrong: the persisted one, or the restore-path clamp/rounding).
- [x] Either the product bug is fixed and `tests/e2e/desktop-foundation/desktop-foundation.spec.ts:752-781` passes unchanged, OR (only if genuinely unfixable now) the test is marked `test.fixme()` with a comment linking to issue #43 — never `.skip()` or deleted.
- [x] Full Playwright suite run shows zero non-fixme failures.
- [x] Gate check passes: `make test-desktop-e2e`

**Tests**: e2e
**Gate**: full

**Commit**: `fix(desktop): persist Explorer divider width across reload (#43)`

---

### T2: Add MIT LICENSE and license metadata

**What**: Add the `LICENSE` file, update README's License section, and set `license` fields in `package.json` files (Cargo side is already `MIT` via `[workspace.package]`).
**Where**: `LICENSE` (new, root), `README.md` (License section), root `package.json`, `packages/contracts/package.json`, `packages/ui/package.json`, `packages/test-fixtures/package.json`, `apps/desktop/package.json`.
**Depends on**: None
**Reuses**: existing `Cargo.toml` `[workspace.package] license = "MIT"` (already correct, no change needed there)
**Requirement**: MVP-40

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `LICENSE` exists at repo root with full MIT text and correct copyright holder/year.
- [x] README's "License" section states MIT and links to `LICENSE` (replacing "Not yet set.").
- [x] Every `package.json` listed above declares `"license": "MIT"` (note: these are all `"private": true` — set regardless, per design's Risks table; do not treat "publish to npm" as in scope).
- [x] README includes a short note on what MIT means for redistributing the AppImage.
- [x] Gate check passes: `make check`

**Tests**: none (config/doc)
**Gate**: build

**Commit**: `docs(license): add MIT LICENSE and wire license metadata (#40)`

---

### T3: Composite action for Tauri Linux build setup

**What**: Extract the node/corepack/rust-toolchain/rust-cache/apt-deps/pnpm-install steps from `dev-build.yml` into a reusable composite action so CI and release workflows share one definition.
**Where**: `.github/actions/setup-tauri-build/action.yml` (new)
**Depends on**: None
**Reuses**: exact step list from `.github/workflows/dev-build.yml:17-38`
**Requirement**: MVP-41 (AC3), MVP-56 (AC1, single source of truth)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Composite action defined with the same steps (checkout is NOT included — remains the caller's first step), producing an identical toolchain state to today's `dev-build.yml`.
- [ ] `actionlint` (or `yamllint` fallback) reports no errors on the new file.
- [ ] Gate check passes: `make check` (no functional app code changed, build gate only)

**Tests**: none (CI config)
**Gate**: build

**Commit**: `ci: extract shared Tauri Linux build setup into a composite action`

---

### T4: `ci.yml` — static and unit jobs

**What**: Create `.github/workflows/ci.yml` triggered on `pull_request` and push to `main`/`dev`, with `static` (`make lock-check format lint typecheck`) and `unit` (`make test-quick`) jobs using the T3 composite action, plus `concurrency` cancel-in-progress per ref.
**Where**: `.github/workflows/ci.yml` (new)
**Depends on**: T3
**Reuses**: `.github/actions/setup-tauri-build` (T3), `Makefile` targets unchanged
**Requirement**: MVP-41 (AC1, AC2, AC6 partial)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `ci.yml` exists with `static` and `unit` jobs, each `uses: ./.github/actions/setup-tauri-build` then the corresponding `make` target.
- [ ] `on:` triggers `pull_request` and `push` to `main`/`dev`.
- [ ] `concurrency: group: ci-${{ github.ref }}, cancel-in-progress: true` is set at workflow level.
- [ ] `actionlint` reports no errors.
- [ ] A deliberately broken lint rule pushed to a scratch branch (verified locally by running `make lint` against an intentionally bad file, then reverting) demonstrates the `static` job's command would fail — documented in the commit, not left unverified.
- [ ] Gate check passes: `make check`

**Tests**: none (CI config; correctness demonstrated by local dry-run of the wrapped `make` commands, which already have their own test coverage)
**Gate**: build

**Commit**: `ci(gate): add static and unit jobs to ci.yml (#41)`

---

### T5: `ci.yml` — integration and e2e jobs

**What**: Add `integration` (`make test-rust-integration`) and `e2e` (`make test-desktop-e2e`) jobs to `ci.yml`, with Playwright trace/screenshot artifact upload on failure.
**Where**: `.github/workflows/ci.yml` (extend)
**Depends on**: T4, T1 (the e2e job must not start red — T1 already fixed the one failing test)
**Reuses**: `.github/actions/setup-tauri-build`, existing Playwright config's trace/screenshot retention
**Requirement**: MVP-41 (AC1, AC2, AC5, AC7)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `integration` and `e2e` jobs added, each using the composite action.
- [ ] `e2e` job uploads Playwright traces/screenshots as run artifacts on failure (`actions/upload-artifact@v4`, `if: failure()`).
- [ ] Full `make check` surface (static, unit, integration, e2e) is now covered across `ci.yml`'s four jobs.
- [ ] With a warm cache, total workflow wall time is under ~10 minutes (estimated from job step timings; exact figure recorded in the commit/PR description after the first real run).
- [ ] Gate check passes: `make check`

**Tests**: none (CI config)
**Gate**: build

**Commit**: `ci(gate): add integration and e2e jobs to ci.yml (#41)`

---

### T6: `CONTRIBUTING.md` — branch model and local gate

**What**: Create `CONTRIBUTING.md` documenting the branch model (`main`, `dev`, `feat/*`), where PRs go, Conventional Commits, `make check` as the local gate and which parts CI enforces, and a placeholder section for branch-protection settings (filled in by T7).
**Where**: `CONTRIBUTING.md` (new)
**Depends on**: T5 (documents the now-complete CI gate accurately)
**Reuses**: none
**Requirement**: MVP-42 (AC5), MVP-56 (AC3, partial — branch model/commits/gate; templates come in T24)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `CONTRIBUTING.md` documents branch model, PR target (`dev`), Conventional Commits, and `make check`/CI-job mapping.
- [ ] A "Branch protection" section exists with a placeholder noting exact settings will be recorded once configured (T7 fills this in).
- [ ] Gate check passes: `make check`

**Tests**: none (doc)
**Gate**: build

**Commit**: `docs(contributing): document branch model and local gate`

---

### T7: Gate releases on green CI; protect `main`/`dev`

**What**: Configure GitHub branch protection on `main` and `dev` (required status checks from `ci.yml`, require branches up to date, disallow force-push/deletion, no required review per owner decision), and record the exact settings in `CONTRIBUTING.md`.
**Where**: GitHub repository settings (via `gh api` or the web UI — this is the one task in this phase that is infrastructure configuration, not a file change), `CONTRIBUTING.md` (fill in the T6 placeholder).
**Depends on**: T5, T6
**Reuses**: none
**Requirement**: MVP-42 (AC1–AC5)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Branch protection on `main` and `dev`: required status checks = the 4 `ci.yml` jobs, require branches up to date, disallow force pushes, disallow deletion, no required review.
- [ ] A pull request with a deliberately failing check cannot merge (verified against a scratch PR).
- [ ] A force-push attempt against `main` is rejected (verified with `git push --force` to a disposable test branch protection scenario, or documented as verified via `gh api` response for the protection rule).
- [ ] `CONTRIBUTING.md`'s branch-protection section now states the exact settings in force.
- [ ] Gate check passes: `make check`
- [ ] **This is the last task in Phase 1 — this is a natural checkpoint to confirm with the user before Phase 2, since branch protection is a shared-state GitHub setting.**

**Tests**: none (repo configuration)
**Gate**: build

**Commit**: `ci(gate): protect main/dev and require green CI (#42)`

---

### T8: Wire `tauri-plugin-log` (local rotating log infra)

**What**: Add the `tauri-plugin-log` dependency and wire minimal rotating-file logging, with a redaction guard ensuring note content, vault contents, and provider credentials never reach the log sink. This is a prerequisite for T13 (updater error logging), T22 (crash logging), and T23 (update observability).
**Where**: `apps/desktop/src-tauri/Cargo.toml` (add dependency), `apps/desktop/src-tauri/src/lib.rs` (plugin registration), `apps/desktop/src-tauri/src/logging.rs` (new — redaction-aware wrapper/guard)
**Depends on**: T7 (Phase 1 complete; this is the first Phase 2 task per design's sequencing note that logging must land before P2.4's error-logging AC)
**Reuses**: `app.path().app_local_data_dir()` (`lib.rs:25`)
**Requirement**: MVP-55 (AC1 — infra only; redaction/Settings-visibility completed in T22), MVP-47 (AC4 prerequisite), MVP-48 (AC2, AC5 prerequisite)

**Tools**:
- MCP: `context7` (verify current `tauri-plugin-log` API/version compatible with Tauri 2.11.5)
- Skill: NONE

**Done when**:
- [ ] `tauri-plugin-log` registered in `lib.rs`, writing a rotating log file to the app-local-data directory.
- [ ] `logging.rs` exposes a `log_event`/`log_error` wrapper that takes only structured, pre-sanitized fields (no raw `String` blobs from note/vault/credential paths passed through unchecked).
- [ ] A unit test in `logging.rs` asserts that a simulated credential-bearing string passed through the intended call sites (Stronghold error paths, note content paths) does not appear verbatim in captured log output.
- [ ] AD-014 is referenced in the module doc comment explaining why this new native dependency does not violate AD-012.
- [ ] Gate check passes: `make test-rust`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(desktop): wire tauri-plugin-log with a redaction guard (#55 infra, AD-014)`

---

### T9: Channel-aware updater endpoint + expose current channel

**What**: Make the updater endpoint in `tauri.conf.json` overridable per build (stable vs dev) via the existing `tauri-action --config` override mechanism, and add a Tauri command exposing the running build's channel (`stable`/`dev`) and version to the frontend.
**Where**: `apps/desktop/src-tauri/tauri.conf.json` (document the two endpoint values as a comment/README reference, keep `dev` as the default in-repo value), `apps/desktop/src-tauri/src/commands/*.rs` or a new `apps/desktop/src-tauri/src/app_info.rs` (new command), `apps/desktop/src-tauri/src/lib.rs` (register command)
**Depends on**: T8
**Reuses**: `tauri-action`'s existing `args: --config '{...}'` override pattern (`dev-build.yml:60`)
**Requirement**: MVP-44 (AC1, AC2, AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A Rust unit test confirms the new `get_app_info` (or equivalent) command returns the correct channel string given a build-time env var/config value (test both `stable` and `dev` cases via cfg or injected config).
- [ ] `tauri.conf.json` documents (inline comment or adjacent doc) that the `endpoints` array value is overridden per channel at build time by `release-dev.yml`/`release-stable.yml` (built in T10/T11) and that changing it post-first-stable-release is load-bearing/irreversible for existing installs.
- [ ] Gate check passes: `make test-rust`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(desktop): expose build channel and support per-channel updater endpoint (#44)`

---

### T10: `release-dev.yml` — dev channel publish with asset pruning

**What**: Replace `dev-build.yml` with `release-dev.yml`: gated on CI success, builds with the dev updater endpoint (via T9's override), deletes the previous `dev` release's assets before/while uploading new ones, and performs the one-time cleanup of the existing ~61 accumulated dev assets.
**Where**: `.github/workflows/release-dev.yml` (new, replaces `dev-build.yml` which is deleted)
**Depends on**: T9
**Reuses**: `.github/actions/setup-tauri-build`, `tauri-action@v0` invocation pattern from old `dev-build.yml:46-60`
**Requirement**: MVP-42 (AC1, dev side), MVP-44 (AC1), MVP-46 (all ACs)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `release-dev.yml` triggers on push to `dev`, `needs:` the `ci.yml` jobs (via `workflow_call`, per design's Tech Decisions) so publish is unreachable on a red run.
- [ ] Prior `dev` release assets are deleted (via `gh release delete-asset` or equivalent) before/as part of uploading the new build; the deletion step hardcodes the literal string `dev` as the tag (never a variable), matching design's scoping-safety decision.
- [ ] A code-review-visible assertion (comment + the literal-string check itself) confirms this step cannot resolve to any other tag.
- [ ] The existing accumulated `dev` release assets are pruned down to the current build as a one-time manual/scripted cleanup, executed once as part of this task and recorded in the commit.
- [ ] `dev-build.yml` is deleted.
- [ ] Gate check passes: `make check`

**Tests**: none (CI config; pruning-safety is verified by the literal-string review + a follow-up real push observed to only affect `dev`)
**Gate**: build

**Commit**: `ci(release): replace dev-build.yml with gated, pruning release-dev.yml (#42, #46)`

---

### T11: `release-stable.yml` — stable channel with version-gated no-op

**What**: Create `release-stable.yml`: triggers on push to `main`, gated on CI, a `check-version` job comparing `tauri.conf.json`'s version against the latest published stable GitHub release (no-ops the publish job if unchanged), then builds/publishes a signed, non-prerelease release with the stable updater endpoint.
**Where**: `.github/workflows/release-stable.yml` (new)
**Depends on**: T10 (established the shared gating/pruning patterns; also confirms `ci.yml`'s `workflow_call` shape works)
**Reuses**: `.github/actions/setup-tauri-build`, `tauri-action@v0`
**Requirement**: MVP-42 (AC1, stable side), MVP-44 (AC1, AC3), MVP-45 (AC1, AC2, AC3, AC5)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `check-version` job reads `tauri.conf.json`'s `version`, queries `gh api repos/:owner/:repo/releases` for an existing non-prerelease tag matching that version, and sets `should_publish`.
- [ ] `build-and-publish` job runs `if: needs.check-version.outputs.should_publish == 'true'` and `needs:` CI success.
- [ ] A version bump on a scratch branch (simulated locally: run the version-comparison script/step logic against the current release list) is demonstrated to yield `should_publish=true`; an unchanged version yields `false`.
- [ ] Published release includes AppImage, `.deb`, `.sig` files, and `latest.json`; `prerelease: false`.
- [ ] Gate check passes: `make check`

**Tests**: none (CI config; version-comparison logic verified by a documented dry-run against the real release list)
**Gate**: build

**Commit**: `ci(release): add release-stable.yml with version-gated publish (#42, #44, #45)`

---

### T12: `CHANGELOG.md` generation

**What**: Wire changelog generation from Conventional Commits (via `git-cliff` or equivalent) into `release-stable.yml`, updating `CHANGELOG.md` and populating GitHub release notes.
**Where**: `release-stable.yml` (extend), `cliff.toml` (new, if `git-cliff` is chosen), `CHANGELOG.md` (new, bootstrapped)
**Depends on**: T11
**Reuses**: existing Conventional Commits history (`feat:`, `fix:`, `docs:`, `refactor:` already used per repo's git log)
**Requirement**: MVP-45 (AC4)

**Tools**:
- MCP: `context7` (verify current `git-cliff` config syntax) or `web search` if unavailable
- Skill: NONE

**Done when**:
- [ ] `release-stable.yml`'s `build-and-publish` job generates changelog entries since the previous stable tag and commits the updated `CHANGELOG.md`.
- [ ] The GitHub release notes for a stable release are populated from the same generated content (not a separate hand-written body).
- [ ] Gate check passes: `make check`

**Tests**: none (CI config/doc generation)
**Gate**: build

**Commit**: `ci(release): generate CHANGELOG.md and release notes from commits (#45)`

---

### T13: Propagate and log updater errors

**What**: Rewrite `check_for_updates` in `lib.rs` to log each failure branch (updater unavailable, check failed, download/install failed) via the T8 logging infra instead of silently discarding with `let _ =`/`Ok(...) else { return; }`.
**Where**: `apps/desktop/src-tauri/src/lib.rs:66-78`
**Depends on**: T8, T9
**Reuses**: `logging.rs` wrapper from T8
**Requirement**: MVP-47 (AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Each `Err`/early-return branch in `check_for_updates` now logs a structured event (updater-unavailable / check-failed / install-failed) via T8's logger before returning.
- [ ] A Rust unit test injects each failure mode (via a mockable updater trait or cfg-gated seam) and asserts the corresponding log event is emitted.
- [ ] No behavior change to the actual update/install flow itself — only observability.
- [ ] Gate check passes: `make test-rust`

**Tests**: unit
**Gate**: quick

**Commit**: `fix(desktop): log updater failures instead of discarding them (#47)`

---

### T14: End-to-end updater upgrade verification

**What**: Prove the self-update path actually upgrades a running install: an automated CI job (build A, publish to a scratch release, install in a container, build B, publish, launch A headless, assert it becomes B) or — if disproportionate — a documented manual checklist run and recorded in every stable release PR. Also prove signature rejection and two-digit version ordering.
**Where**: new `.github/workflows/updater-e2e.yml` (if automated) or `docs/release-checklist.md` (if manual), plus a Rust unit test for version-ordering comparison logic if not already covered by the updater plugin's own semver handling.
**Depends on**: T10, T11, T13
**Reuses**: scratch/test GitHub release (not the real `dev`/`stable` channels), per design's dependency on the channel split existing first
**Requirement**: MVP-47 (AC1, AC2, AC3)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Either: an automated job demonstrates A→B upgrade end to end against a scratch release, OR a manual checklist document exists and this task's own execution serves as its first recorded run.
- [ ] A deliberately bad signature is proven to be rejected (not silently treated as "no update").
- [ ] Version ordering across `0.1.9` → `0.1.10` is verified correct (unit test if the comparison is custom logic; documented verification if it's entirely the updater plugin's built-in semver handling).
- [ ] Findings/evidence recorded in the task commit or the checklist doc.
- [ ] Gate check passes: `make check` (+ `make test-rust` if a version-ordering unit test was added)
- [ ] **This is the last task in Phase 2 — natural checkpoint before Phase 3, since Phase 2 changes are described as "hard to change after users install."**

**Tests**: integration (if automated) or none (if manual-checklist path chosen — still requires the checklist's first run to be recorded, which is the verification)
**Gate**: full

**Commit**: `test(release): verify end-to-end self-update upgrade path (#47)`

---

### T15: `SHA256SUMS` generation in both release workflows

**What**: Generate `SHA256SUMS` (and its `SHA256SUMS.sig`) over every published artifact in `release-dev.yml` and `release-stable.yml`, and document verification in the README.
**Where**: `release-dev.yml`, `release-stable.yml` (extend both), `README.md` (verification section)
**Depends on**: T14
**Reuses**: same CI-held minisign signing key already used for artifact `.sig` files
**Requirement**: MVP-50 (all ACs)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Both release workflows generate `SHA256SUMS` over all published artifacts and upload it as a release asset.
- [ ] `SHA256SUMS.sig` is generated and uploaded alongside it.
- [ ] README documents both `sha256sum -c SHA256SUMS --ignore-missing` and `minisign -Vm ... -P <public key>`, including the public key text.
- [ ] A manual dry run against the most recent real release's assets confirms `sha256sum -c` passes.
- [ ] Gate check passes: `make check`

**Tests**: none (CI config/doc; correctness verified by the manual dry-run against real assets)
**Gate**: build

**Commit**: `ci(release): publish SHA256SUMS and document verification (#50)`

---

### T16: `install.sh` — core install path

**What**: Write the one-line installer's happy path: detect `amd64` (fail clearly on anything else), resolve the latest stable release via the GitHub API, download the AppImage + `.sig`, verify signature and checksum, install to `~/.local/bin/knowledge-os`, write `.desktop` entry + icon, run `update-desktop-database`.
**Where**: `install.sh` (new, repo root)
**Depends on**: T15 (needs `SHA256SUMS`/`.sig` to exist on real releases to verify against)
**Reuses**: minisign public key already embedded in `tauri.conf.json:44`
**Requirement**: MVP-49 (AC1–AC4, AC7 partial), MVP-51 (AC2)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `shellcheck install.sh` reports no errors.
- [ ] A container-based test (`scripts/test-install.sh`, new — added here as this task's own test harness) runs `install.sh` in a clean Ubuntu Docker image and confirms: the AppImage lands at `~/.local/bin/knowledge-os` executable, a `.desktop` entry + icon exist, and the app is discoverable via `update-desktop-database`'s effect.
- [ ] The same container test flips one byte in a downloaded artifact and confirms `install.sh` refuses to install (non-zero exit, explicit message).
- [ ] Non-`amd64` architecture (emulated container arch) causes a clear early exit before any download attempt.
- [ ] New Makefile target `test-installer` wired to `scripts/test-install.sh`.
- [ ] Gate check passes: `make test-installer`

**Tests**: e2e (container-based)
**Gate**: full

**Commit**: `feat(installer): add one-line install.sh core path (#49, #51)`

---

### T17: `install.sh` — hardening and edge cases

**What**: Extend `install.sh` with `PATH` warning, `libfuse2` detection, idempotent re-install/upgrade behavior, `--uninstall`, no-`sudo` enforcement, and success output (version + launch instructions).
**Where**: `install.sh` (extend), `scripts/test-install.sh` (extend)
**Depends on**: T16
**Reuses**: same script/test harness from T16
**Requirement**: MVP-49 (AC1, AC5, AC6, AC8–AC11)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Script warns with the exact `PATH`-append line when `~/.local/bin` is absent from `PATH`.
- [ ] Script detects missing `libfuse2` and prints the precise apt/dnf/pacman line for the detected distro.
- [ ] Running the installer twice upgrades in place (verified by the container test: run once, note the binary's mtime/version, run again, confirm no duplicate `.desktop` entries and the binary is replaced not appended).
- [ ] `install.sh --uninstall` removes the binary, `.desktop` entry, and icon; prints the vault location; does not touch the vault directory (container test creates a dummy vault marker file and asserts it survives uninstall).
- [ ] No step in the script invokes or requires `sudo` (verified by `grep -n sudo install.sh` returning nothing, or only comments).
- [ ] Successful install prints the installed version and how to launch.
- [ ] Gate check passes: `make test-installer`

**Tests**: e2e (container-based, extending T16's harness)
**Gate**: full

**Commit**: `feat(installer): add uninstall, libfuse2 detection, and idempotent upgrade (#49)`

---

### T18: README — install paths, verification, and aarch64 note

**What**: Document both install paths (one-line installer and building from source) side by side, supported distributions/architectures (amd64 only, aarch64 deferred per issue #51), and link the SHA256SUMS/minisign verification steps from T15.
**Where**: `README.md`
**Depends on**: T17
**Reuses**: T15's verification doc section (extends it, doesn't duplicate)
**Requirement**: MVP-49 (AC6, README docs), MVP-51 (AC1, AC2)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] README shows both install paths side by side.
- [ ] README states supported distributions and that only `amd64` is supported for this MVP, with aarch64 explicitly noted as deferred (traceable to issue #51).
- [ ] Gate check passes: `make check`
- [ ] **This is the last task in Phase 3 — natural checkpoint before Phase 4, since this completes the user-facing MVP deliverable.**

**Tests**: none (doc)
**Gate**: build

**Commit**: `docs(readme): document install paths, verification, and supported architectures (#49, #51)`

---

### T19: Unified schema/vault-format version model

**What**: Implement `check_vault_compatibility` in a new `migration.rs`, repurposing `vault_metadata.schema_version` as the vault-format version and `PRAGMA user_version` as the SQLite schema version (per design's Data Models), with a pure decision function covering all four rows of the compatibility table.
**Where**: `apps/desktop/src-tauri/src/migration.rs` (new)
**Depends on**: T18
**Reuses**: `KnowledgeStore::schema_version()` (`crates/knowledge-storage/src/lib.rs:451-455`), `vault_metadata` table (`settings.rs:499-520`)
**Requirement**: MVP-52 (AC1, AC2)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `CompatibilityDecision` enum (`UpToDate`, `RebuildCache`, `Refuse(String)`) and `check_vault_compatibility` function implemented exactly per design's decision table.
- [ ] Unit tests cover all four rows of the decision table (both-current, sqlite-behind, format-behind-with-defined-migration, vault-newer-than-binary) — 1:1 to the table, no branch untested.
- [ ] Gate check passes: `make test-rust`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(desktop): unify schema/vault-format version model (#52)`

---

### T20: Wire compatibility check into startup + rebuild/refuse UX

**What**: Call `check_vault_compatibility` on vault open, branch to an observable cache-rebuild progress state or a refuse-to-open dialog with a clear message; wire a Rust integration test using fixture vaults at each version state.
**Where**: `apps/desktop/src-tauri/src/lib.rs` (startup flow), `apps/desktop/src-tauri/src/knowledge.rs` (vault-open call site, `KnowledgeStore::open` at L803), a small React progress/dialog component in `apps/desktop/src/settings/` or `apps/desktop/src/app/`
**Depends on**: T19
**Reuses**: T19's `check_vault_compatibility`, existing vault-open flow at `knowledge.rs:803`
**Requirement**: MVP-52 (AC2, AC3, AC4, AC5)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Rust integration test opens a fixture vault stamped with an older schema version and asserts a non-destructive, automatic rebuild path is taken (no data loss, cache regenerated correctly).
- [ ] Rust integration test opens a fixture vault stamped with a newer-than-binary version and asserts the app refuses to open, returns a clear message, and the fixture file is byte-for-byte unchanged after the attempt.
- [ ] Rebuild-in-progress state is observable in the UI (a progress indicator, not a frozen window) — verified by a React/Playwright test asserting the progress UI renders during a simulated rebuild.
- [ ] Gate check passes: `make test-rust-integration`, `make test-desktop-e2e`

**Tests**: integration + e2e
**Gate**: full

**Commit**: `feat(desktop): wire vault compatibility check into startup with observable rebuild/refuse UX (#52)`

---

### T21: Backup before Markdown-touching migrations

**What**: Ensure any migration step that would rewrite Markdown content (not just the SQLite cache) creates a recoverable backup first, with a test confirming the backup exists and is restorable.
**Where**: `apps/desktop/src-tauri/src/migration.rs` (extend)
**Depends on**: T20
**Reuses**: T19/T20's migration flow
**Requirement**: MVP-52 (AC6, AC7)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Any Markdown-rewriting migration path creates a timestamped backup copy before writing (even though no such migration exists yet for the current schema — this establishes the required mechanism/contract for future ones).
- [ ] Integration test simulates a Markdown-touching migration and asserts the backup exists, is a faithful copy, and restoring it recovers the pre-migration state.
- [ ] README documents the vault layout and data locations so a user can recover by hand without the app.
- [ ] Gate check passes: `make test-rust-integration`

**Tests**: integration
**Gate**: full

**Commit**: `feat(desktop): back up Markdown before any content-rewriting migration (#52)`

---

### T22: Crash/error logging surfaced to the user

**What**: Extend T8's logging infra with panic-hook capture, a Settings action to open/copy the log file, and a documented bug-report path stating what to attach.
**Where**: `apps/desktop/src-tauri/src/lib.rs` (panic hook registration), `apps/desktop/src/settings/About.tsx` (new — "open log" action; also used by T23), `docs/` or README (bug-report path doc)
**Depends on**: T21
**Reuses**: T8's `logging.rs` infra
**Requirement**: MVP-55 (AC1–AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A Rust panic anywhere in the app writes to the rotating log via a registered panic hook.
- [ ] Settings has an "open log" / "copy log path" action; log location is documented in-app and in the README.
- [ ] The T8 redaction test is extended to cover the panic-hook path specifically (a panic triggered from a code path touching note/vault/credential data must not leak that data into the log).
- [ ] A documented bug-report path exists telling the user exactly what to attach.
- [ ] Gate check passes: `make test-rust`, `make test-ui`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(desktop): surface crash/error log access from Settings (#55)`

---

### T23: Observable self-updates — About section UI

**What**: Build the Settings → About section: current version, channel (stable/dev), a non-modal pending-restart indicator, and surfaced update failures; confirm startup is not blocked by the update check.
**Where**: `apps/desktop/src/settings/About.tsx` (complete the component started in T22), `apps/desktop/src/settings/About.test.tsx` (new), a Playwright e2e case in `desktop-foundation.spec.ts`
**Depends on**: T22, T13, T9
**Reuses**: T9's `get_app_info` command, T13's logged update-failure events
**Requirement**: MVP-48 (AC1–AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] About section displays current version and channel, sourced from T9's command.
- [ ] A pending-restart state renders as a non-modal, non-blocking indicator with a "Restart now" action (unit test asserts non-modal rendering — no focus trap/overlay).
- [ ] Repeated update failures (from T13's logged events) surface in Settings → About.
- [ ] A test (existing startup timing assertion or a new one) confirms the app's first interactive render is not gated on the update check/download completing.
- [ ] Gate check passes: `make test-ui`, `make test-desktop-e2e`
- [ ] **This is the last task in Phase 4a — natural checkpoint before 4b, since this completes all data-safety and observability work.**

**Tests**: unit + e2e
**Gate**: full

**Commit**: `feat(desktop): add Settings → About with version, channel, and update observability (#48)`

---

### T24: Issue and pull request templates

**What**: Add a bug report template (asking for version and channel — now meaningful thanks to T23), a feature request template, and a pull request checklist template.
**Where**: `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/PULL_REQUEST_TEMPLATE.md` (all new)
**Depends on**: T23
**Reuses**: none
**Requirement**: MVP-56 (AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Bug report template asks for version and channel (referencing where to find them: Settings → About from T23).
- [ ] Feature request and PR checklist templates exist.
- [ ] GitHub recognizes the templates (verified by opening the "New issue" chooser view via `gh issue create --web` locally, or confirmed by template file location matching GitHub's documented convention).
- [ ] Gate check passes: `make check`

**Tests**: none (doc/config)
**Gate**: build

**Commit**: `docs(templates): add issue and pull request templates (#56)`

---

### T25: `SECURITY.md` and private vulnerability reporting

**What**: Add `SECURITY.md` (supported versions, private reporting channel, response-time expectations, scope), enable GitHub private vulnerability reporting, document the signing-key threat model/rotation procedure, and audit workflow triggers for fork-safety.
**Where**: `SECURITY.md` (new), GitHub repository security settings, `.github/workflows/*.yml` (audit only — confirm no signing-secret-bearing job is reachable via `pull_request` from a fork; fix if found)
**Depends on**: T24
**Reuses**: existing `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets already used in release workflows
**Requirement**: MVP-53 (all ACs)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `SECURITY.md` covers supported versions (latest stable only), private reporting channel, honest response-time expectation, and scope.
- [ ] Private vulnerability reporting is enabled on the repository (verified: the "Report a vulnerability" button appears on the Security tab).
- [ ] Signing-key threat model and rotation procedure documented (in `SECURITY.md` or a linked doc).
- [ ] Every workflow referencing the signing secrets is confirmed to trigger only on `push` (not `pull_request` from forks) — audit result recorded in the commit.
- [ ] Public minisign key documented in the README (cross-check against T15, avoid duplication — link if already present).
- [ ] Gate check passes: `make check`

**Tests**: none (doc/repo config)
**Gate**: build

**Commit**: `docs(security): add SECURITY.md and enable private vulnerability reporting (#53)`

---

### T26: Dependabot configuration

**What**: Add `.github/dependabot.yml` covering `cargo`, `npm`, `pip`/`uv`, and `github-actions` ecosystems.
**Where**: `.github/dependabot.yml` (new)
**Depends on**: T25
**Reuses**: existing workspace member directories (`crates/*`, `apps/*`, `packages/*`)
**Requirement**: MVP-54 (AC1)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Dependabot config covers all four ecosystems with sensible update schedules.
- [ ] `actionlint`/GitHub's own schema validation (via `gh api` dry-run or the Dependabot config validator) reports no errors.
- [ ] Gate check passes: `make check`

**Tests**: none (config)
**Gate**: build

**Commit**: `chore(deps): configure Dependabot for cargo, npm, pip, and github-actions (#54)`

---

### T27: Scheduled vulnerability scanning

**What**: Add a scheduled (cron, not just PR-triggered) workflow running `cargo audit`/`cargo deny`, `pnpm audit`, and `pip-audit`/`uv`-equivalent for Python members; document the no-fix-available advisory policy (file/update a tracking issue rather than fail the build).
**Where**: `.github/workflows/dependency-audit.yml` (new)
**Depends on**: T26
**Reuses**: `.github/actions/setup-tauri-build` (for the toolchain setup portions it needs)
**Requirement**: MVP-54 (AC2, AC3, AC4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Workflow runs on a `schedule` cron trigger (e.g. weekly) plus `workflow_dispatch`.
- [ ] Runs `cargo audit`/`cargo deny`, `pnpm audit`, and the Python equivalent across all workspace members.
- [ ] A deliberately introduced known-vulnerable dependency (in a scratch branch, reverted after verification) is demonstrated to be caught by the scan.
- [ ] No-fix-available policy documented in the workflow file's comments or `SECURITY.md`: opens/updates a tracking issue, does not fail the build.
- [ ] Gate check passes: `make check`

**Tests**: none (CI config; detection verified by the scratch-branch dry run)
**Gate**: build

**Commit**: `ci(security): add scheduled dependency vulnerability scanning (#54)`

---

### T28: SBOM generation on stable releases

**What**: Generate a CycloneDX or SPDX SBOM and attach it as a release asset in `release-stable.yml`.
**Where**: `release-stable.yml` (extend)
**Depends on**: T27
**Reuses**: same workflow extended in T11/T12/T15
**Requirement**: MVP-54 (AC5)

**Tools**:
- MCP: `context7` (verify current SBOM tooling for the Rust/npm/Python mix — e.g. `cargo-cyclonedx`, `@cyclonedx/cyclonedx-npm`) or web search if unavailable
- Skill: NONE

**Done when**:
- [ ] `release-stable.yml` generates an SBOM covering the Rust, npm, and Python dependency trees and attaches it as a release asset.
- [ ] Gate check passes: `make check`

**Tests**: none (CI config)
**Gate**: build

**Commit**: `ci(release): attach an SBOM to stable releases (#54)`

---

### T29: README — Linux system dependencies and vault/data locations

**What**: Add the "Linux system dependencies" block to the README (sourced from the same composite action as CI, per T3, so it cannot drift), and document where the vault and app data live and how to uninstall (cross-referencing T17's `--uninstall`, T21's recovery docs).
**Where**: `README.md`
**Depends on**: T28
**Reuses**: `.github/actions/setup-tauri-build` (T3, referenced as the single source of truth), T17's uninstall behavior, T21's vault-layout doc
**Requirement**: MVP-56 (AC1, AC2, AC5)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] README's "Linux system dependencies" block states the exact `apt` line and notes it's kept in sync with `.github/actions/setup-tauri-build/action.yml` (the shared source of truth), plus notes for non-Debian distros.
- [ ] README documents install, upgrade, data location, and uninstall in one place.
- [ ] A contributor following only the README from a clean Ubuntu container reaches a running app (final end-to-end validation of the whole epic's onboarding promise) — this is the Verifier's job to confirm independently, not self-certified here.
- [ ] Gate check passes: `make check`
- [ ] **This is the last task in Phase 4b and the last task overall — the Verifier runs automatically after this commit.**

**Tests**: none (doc)
**Gate**: build

**Commit**: `docs(readme): document Linux dependencies and vault/data locations (#56)`

---

## Phase Execution Map

```
Phase 1 (Foundation)              → Phase 2 (Release Channels)        → Phase 3 (Distribution)      → Phase 4a (Data Safety & Observability) → Phase 4b (Compliance & Docs)

Phase 1:  T1 → T2 → T3 → T4 → T5 → T6 → T7
Phase 2:  T8 → T9 → T10 → T11 → T12 → T13 → T14
Phase 3:  T15 → T16 → T17 → T18
Phase 4a: T19 → T20 → T21 → T22 → T23
Phase 4b: T24 → T25 → T26 → T27 → T28 → T29
```

Execution is strictly sequential — there is no intra-phase parallelism. Total: **29 tasks**, packed at Execute time into ~7-task batches (whole phases only) — Phase 1 (7), Phase 2 (7), Phase 3 (4), Phase 4a (5), Phase 4b (6) map naturally to roughly 5 worker batches, or could combine small adjacent phases (e.g. Phase 3 + Phase 4a = 9 tasks) if the packing algorithm at Execute time prefers fewer, fuller batches.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Fix divider persistence bug | 1 bug fix, 1-2 files | ✅ Granular |
| T2: LICENSE + license metadata | 1 concern (licensing), mechanical multi-file edit | ✅ Granular (config-class task) |
| T3: Composite action | 1 file | ✅ Granular |
| T4: ci.yml static+unit | 1 file, 2 jobs (cohesive: both are "no build needed" fast jobs) | ✅ Granular |
| T5: ci.yml integration+e2e | 1 file, 2 jobs (cohesive: both need the built app) | ✅ Granular |
| T6: CONTRIBUTING.md | 1 file | ✅ Granular |
| T7: Branch protection + fill placeholder | 1 config action + 1 file edit | ✅ Granular |
| T8: tauri-plugin-log wiring | 1 dependency + 1 new module | ✅ Granular |
| T9: Channel endpoint + command | 1 config concern + 1 new command | ✅ Granular |
| T10: release-dev.yml | 1 file | ✅ Granular |
| T11: release-stable.yml | 1 file | ✅ Granular |
| T12: CHANGELOG.md generation | 1 workflow extension + 1 config file | ✅ Granular |
| T13: Log updater errors | 1 function rewrite | ✅ Granular |
| T14: E2E updater verification | 1 verification artifact (workflow or checklist) | ✅ Granular |
| T15: SHA256SUMS | 2 workflow extensions (same concern) + 1 doc section | ✅ Granular |
| T16: install.sh core | 1 script, happy path only | ✅ Granular |
| T17: install.sh hardening | 1 script, extends T16 | ✅ Granular |
| T18: README install docs | 1 file section | ✅ Granular |
| T19: Compatibility model | 1 new module, 1 function | ✅ Granular |
| T20: Wire compatibility + UX | 1 integration point + small UI | ✅ Granular (cohesive: UI and backend wiring are one deliverable, per Tasks process' "merge forward" rule for untestable-until-wired code) |
| T21: Migration backup | 1 mechanism extension | ✅ Granular |
| T22: Crash logging surfaced | 1 panic hook + 1 UI action | ✅ Granular |
| T23: About section UI | 1 component | ✅ Granular |
| T24: Issue/PR templates | 3 small template files, 1 concern | ✅ Granular |
| T25: SECURITY.md | 1 doc + 1 repo setting | ✅ Granular |
| T26: Dependabot config | 1 file | ✅ Granular |
| T27: Scheduled audit | 1 file | ✅ Granular |
| T28: SBOM generation | 1 workflow extension | ✅ Granular |
| T29: README deps/data docs | 1 file section | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (start of Phase 1 chain) | ✅ Match |
| T2 | None | T1 → T2 | ✅ Match (sequential within phase, no data dependency required — order is arbitrary-but-fixed) |
| T3 | None | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4, T1 | T4 → T5 (T1 dependency satisfied by phase order, T1 precedes T5) | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T5, T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T8, T9 | T12 → T13 (both deps precede) | ✅ Match |
| T14 | T10, T11, T13 | T13 → T14 (all deps precede) | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22, T13, T9 | T22 → T23 (all deps precede) | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27 | T27 → T28 | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |

No task depends on a later task; no diagram arrow is unaccounted for.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Playwright e2e | e2e | e2e | ✅ OK |
| T2 | Config/doc | none | none | ✅ OK |
| T3 | CI config | none | none | ✅ OK |
| T4 | CI config | none | none | ✅ OK |
| T5 | CI config | none | none | ✅ OK |
| T6 | Doc | none | none | ✅ OK |
| T7 | Repo config + doc | none | none | ✅ OK |
| T8 | Rust domain (logging) | unit | unit | ✅ OK |
| T9 | Rust domain (command) | unit | unit | ✅ OK |
| T10 | CI config | none | none | ✅ OK |
| T11 | CI config | none | none | ✅ OK |
| T12 | CI config/doc | none | none | ✅ OK |
| T13 | Rust domain | unit | unit | ✅ OK |
| T14 | CI/integration verification | integration (or none if manual-checklist path) | integration | ✅ OK |
| T15 | CI config/doc | none | none | ✅ OK |
| T16 | Shell script | e2e (container) | e2e | ✅ OK |
| T17 | Shell script | e2e (container) | e2e | ✅ OK |
| T18 | Doc | none | none | ✅ OK |
| T19 | Rust domain | unit | unit | ✅ OK |
| T20 | Rust integration + React/e2e | integration + e2e (highest of the layers touched) | integration + e2e | ✅ OK |
| T21 | Rust integration | integration | integration | ✅ OK |
| T22 | Rust domain + React unit | unit (highest applicable — panic hook is domain-level, About action is component-level, both unit) | unit | ✅ OK |
| T23 | React component + Playwright e2e | unit + e2e (highest of the layers touched) | unit + e2e | ✅ OK |
| T24 | Doc/config | none | none | ✅ OK |
| T25 | Doc/repo config | none | none | ✅ OK |
| T26 | Config | none | none | ✅ OK |
| T27 | CI config | none | none | ✅ OK |
| T28 | CI config | none | none | ✅ OK |
| T29 | Doc | none | none | ✅ OK |

No violations. Every task's `Tests` field matches the highest-required test type of the code layer(s) it touches, per the Test Coverage Matrix.
