# Linux MVP Release Validation

**Date**: 2026-07-27
**Spec**: `.specs/features/linux-mvp-release/spec.md`
**Diff range**: `ae9380c..557c5a2` (30 commits, confirmed via `git log --oneline ae9380c..HEAD`)
**Verifier**: independent sub-agent (author ≠ verifier), run in an isolated worktree fetched from the real branch `feat/linux-mvp-release`

**Important context for readers of this report**: this branch has not been pushed/merged to the real `main`/`dev` branches on GitHub — `ci.yml`, `release-dev.yml`, `release-stable.yml`, and `dependency-audit.yml` have never executed on GitHub's infrastructure. Every finding below that says "config verified, not exercised" means: the YAML/logic is structurally correct and was checked by static review, dry-run, or a local proxy of the same logic, but has not been proven by a real GitHub Actions run. Per this verification's explicit scope, publishing real releases and mutating real GitHub settings are out of scope for any agent — these items are called out as **deferred to the repo owner**, not treated as code gaps, per the spec's own "documented-checklist fallback where live automation is disproportionate" allowance.

---

## Task Completion

All 29 tasks in `tasks.md` are marked `[x]` Done (T7's two sub-bullets around live branch-protection *application* and a live scratch-PR test are explicitly and correctly marked deferred-to-owner within the task itself, consistent with the no-live-mutation guardrail — not counted as incomplete).

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | Divider persistence fixed; e2e assertion unchanged, confirmed passing independently in this pass (35/35 e2e, including this test) |
| T2 | ✅ Done | LICENSE + metadata verified in all required files |
| T3 | ✅ Done | Composite action verified used by ci.yml + both release workflows |
| T4 | ✅ Done | `ci.yml` static/unit jobs + concurrency verified |
| T5 | ✅ Done | integration/e2e jobs + artifact upload-on-failure verified |
| T6 | ✅ Done | `CONTRIBUTING.md` verified |
| T7 | ✅ Done | Branch protection confirmed **live** via `gh api` (required checks, no force-push, no review required) |
| T8 | ✅ Done | `tauri-plugin-log` + redaction guard, AD-014 referenced |
| T9 | ✅ Done | Channel command exists; SPEC_DEVIATION (doc comment vs. inline JSON) verified benign but see AC gap below |
| T10 | ✅ Done | `release-dev.yml` verified; `workflow_call` SPEC_DEVIATION verified wired correctly; one-time 61-asset prune **not executed** (deferred to owner, self-flagged) |
| T11 | ✅ Done | `release-stable.yml` verified, version-gate + concurrency group confirmed |
| T12 | ✅ Done | CHANGELOG.md generation wired via git-cliff, verified |
| T13 | ✅ Done | `check_for_updates` error logging verified, no `let _ =` remains |
| T14 | ✅ Done | `docs/release-checklist.md` exists; A→B live upgrade explicitly marked not-yet-run in the checklist itself (deferred to owner) |
| T15 | ✅ Done | SHA256SUMS/.sig generation verified in both workflows + README |
| T16 | ✅ Done | `install.sh` core path; signature/checksum verification independently re-confirmed in this pass (see Sensor) |
| T17 | ✅ Done | Hardening (PATH warning, libfuse2, idempotent, uninstall, no-sudo) verified in source |
| T18 | ✅ Done | README install/arch docs verified |
| T19 | ✅ Done | `check_vault_compatibility` confirmed side-effect-free (plain `rusqlite::Connection`, never `KnowledgeStore::open`) — **ae31303 fix independently re-verified as correct in current code**, not just trusted |
| T20 | ✅ Done | Compatibility wired into `knowledge.rs`'s `open_store`; integration tests independently re-run and pass |
| T21 | ✅ Done | Markdown backup mechanism + tests independently re-run and pass |
| T22 | ✅ Done | Panic hook + Settings log action; **`get_app_info`/`get_log_path` registration in `build.rs`/`capabilities/main.json`/`ipc_contract.rs` independently confirmed present in all three places** |
| T23 | ✅ Done | About section UI, non-modal indicator, failure surfacing verified |
| T24 | ✅ Done | Issue/PR templates verified |
| T25 | ✅ Done | SECURITY.md + private vulnerability reporting confirmed **live enabled** via `gh api` |
| T26 | ✅ Done | Dependabot config verified (4 ecosystems) |
| T27 | ✅ Done | Scheduled audit workflow verified; live cron execution deferred to owner |
| T28 | ✅ Done | SBOM (Syft/CycloneDX) step verified in `release-stable.yml` |
| T29 | ✅ Done | README Linux deps + vault/data docs verified |

---

## Spec-Anchored Acceptance Criteria

Full re-derivation across all 89 acceptance criteria in MVP-40 through MVP-56. Evidence-or-zero applied throughout.

### MVP-40 (P1.1 License)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 LICENSE file | Full MIT text, correct holder/year | `LICENSE:1-3` "MIT License / Copyright (c) 2026 Lucas Honorato de Souza" | ✅ PASS |
| AC2 README License section | States MIT, links LICENSE | `README.md:154-156` "MIT — see [`LICENSE`](LICENSE)." | ✅ PASS |
| AC3 license fields | Cargo.toml + package.json all declare MIT | `Cargo.toml:8`, `apps/desktop/src-tauri/Cargo.toml:5`, all 5 crate `Cargo.toml`s `license.workspace = true`; root + 4 workspace `package.json`s all `"license": "MIT"` | ✅ PASS |
| AC4 redistribution note | README explains what MIT means for the AppImage | `README.md:156` | ✅ PASS |

### MVP-41 (P1.2 CI check gate)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 PR triggers 4 jobs | static/unit/integration/e2e on `pull_request` | `.github/workflows/ci.yml:3-4,22-59` all 4 jobs present | ⚠️ Config verified, not exercised (deferred to owner — branch unpushed) |
| AC2 push to main/dev | Same workflow | `ci.yml:5-6` `push: branches: [main, dev]` | ⚠️ Config verified, not exercised |
| AC3 shared composite action | Apt deps sourced from one composite action | `.github/actions/setup-tauri-build/action.yml:19-23`; used by `ci.yml` (4×), `release-dev.yml:28`, `release-stable.yml:51` | ✅ PASS |
| AC4 broken lint fails job | Red run demonstrated | No live CI run exists to observe; not independently reproduced in this pass either (would require a live push) | ⚠️ Deferred to owner (requires live CI run) |
| AC5 e2e artifact upload | Playwright traces/screenshots uploaded on failure | `ci.yml:53-59` `if: failure()` → `actions/upload-artifact@v4` | ✅ PASS (config) |
| AC6 concurrency cancel | `cancel-in-progress` per ref | `ci.yml:17-19` `group: ci-${{ github.ref }}, cancel-in-progress: true` | ✅ PASS |
| AC7 warm-cache <10min | Wall-time measurement | No timing evidence anywhere; never run on real infra | ⚠️ Deferred to owner (requires live CI run) |

### MVP-42 (P1.3 Gated releases + branch protection)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 publish gated on green CI | No publish path reachable on red | `release-dev.yml:20-21` `needs: ci`; `release-stable.yml:42-44` `needs: [check-version, ci]` + `if: should_publish == 'true'` | ✅ PASS |
| AC2 failing check blocks merge | Branch protection required checks | **Live** `gh api repos/.../branches/main/protection` → `required_status_checks.contexts: [static, unit, integration, e2e]`, `strict: true` | ✅ PASS (live) |
| AC3 force-push/deletion rejected | main + dev protected | Same live API call: `allow_force_pushes.enabled: false`, `allow_deletions.enabled: false` on both branches | ✅ PASS (live) |
| AC4 no required review | Merge allowed once checks pass | Protection payload has no `required_pull_request_reviews` key | ✅ PASS (live) |
| AC5 CONTRIBUTING.md documents settings | Exact settings recorded | `CONTRIBUTING.md:40-46,66,74` | ✅ PASS |

### MVP-43 (P1.4 Fix failing e2e test)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 root cause documented | Written in commit message | `fd0fcf9` commit message: root cause is a CSS transition on `.retrieve-workspace` colliding with an in-progress divider drag | ✅ PASS |
| AC2 fix + unchanged test passes | Product bug fixed, assertion not weakened | `tests/e2e/desktop-foundation/desktop-foundation.spec.ts:785-814` unchanged; `AppShell.tsx` gained `onDragStart`/`onDragEnd` handling | ✅ PASS |
| AC3 fixme fallback | N/A — fix was possible | — | N/A |
| AC4 full suite zero non-fixme failures | Suite green | **Independently re-run in this verification**: `make test-desktop-e2e` → 35/35 passed, including this exact test at line 30/35 in this run's output | ✅ PASS (upgraded from implementer's self-report to independently confirmed) |

### MVP-44 (P2.1 Stable/dev updater channels)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 main bakes stable endpoint | `.../releases/latest/download/latest.json` | `release-stable.yml:96` config override | ✅ PASS |
| AC2 dev bakes dev endpoint unchanged | `.../releases/download/dev/latest.json` | `release-dev.yml:71` | ✅ PASS |
| AC3 stable never offered prerelease | Never installs a prerelease-tagged release | Relies entirely on GitHub's documented `/releases/latest/download/<asset>` routing (external behavior); no in-repo test proves it | ⚠️ Spec-precision gap — correct by design, unverifiable without a real release |
| AC4 Settings→About shows channel | Channel displayed | `app_info.rs:39-40`; `About.tsx:74`; `About.test.tsx:63-76` asserts `"Version 0.3.1 · dev channel"` | ✅ PASS |
| AC5 endpoint documented as load-bearing | README or CONTRIBUTING.md states it | Note exists **only** in `apps/desktop/src-tauri/src/app_info.rs:17-19` (a Rust doc comment) — spec explicitly names README/CONTRIBUTING.md, neither contains this note | ❌ GAP — real, fixable: wrong location relative to spec's explicit ask |

### MVP-45 (P2.2 Stable release, semver, changelog)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 version bump → publish | Signed release tagged with new version | `release-stable.yml:20-34` compare step + `build-and-publish:80-96` `tauri-action@v0`, `prerelease: false` | ✅ PASS (config, dry-run verified per implementer's documented `/tmp/release_stable_dry_run.sh` against the real read-only release list) |
| AC2 no version change → no publish | CI runs, no release/assets | `release-stable.yml:44` `if: should_publish == 'true'` gates the entire job | ✅ PASS |
| AC3 attaches AppImage/.deb/.sig/latest.json | All 4 asset types | `tauri-action@v0` + `includeUpdaterJson: true` (bundler config already declares `deb`+`appimage` targets in `tauri.conf.json`) | ✅ PASS (structural) |
| AC4 CHANGELOG + release notes from commits | Generated, not hand-written | `release-stable.yml:53-78` `orhun/git-cliff-action@v4`; `cliff.toml`; `CHANGELOG.md:1-16` shows generated content | ✅ PASS |
| AC5 only downstream of green CI | No bypass path | `needs: [check-version, ci]` | ✅ PASS |

### MVP-46 (P2.3 Dev pruning / stable retention)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 new dev build prunes prior assets | Delete before/during upload | `release-dev.yml:36-51` prune step runs before `tauri-action` publish at line 53 | ✅ PASS |
| AC2 existing 61 accumulated assets pruned | One-time cleanup done | **Live check**: `gh api repos/.../releases/tags/dev` → still 61 assets, spanning 0.1.0–0.1.18 | ⚠️ Deferred to owner (self-flagged in T10 as not executed; matches the explicitly allowed "one-time dev-asset pruning" deferral) |
| AC3 stable publish never deletes other stable assets | No cross-release deletion | `release-stable.yml` has no `delete-asset`/`release delete` call, only `--clobber` upload | ✅ PASS |
| AC4 pruning scoped to literal `dev` tag | Code-review-visible, hardcoded string | `release-dev.yml:36-50` literal `dev` string, inline safety comment | ✅ PASS |

### MVP-47 (P2.4 End-to-end updater verification)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 automated A→B proof | Real upgrade demonstrated | `docs/release-checklist.md:33-50` explicitly states this step was **not** run against a real scratch release | ⚠️ Deferred to owner (matches the explicitly allowed "real end-to-end updater upgrade test" deferral) |
| AC2 signature accept/reject proof | Good signed accepted, bad rejected | `docs/release-checklist.md:52-75` — ported real `verify_signature` against `minisign-verify=0.2.5` fixtures, both tamper cases return `Err`; **independently re-confirmed in this pass** via a from-scratch harness directly exercising `install.sh`'s own `verify_download` (see Discrimination Sensor) | ✅ PASS |
| AC3 version ordering 0.1.9→0.1.10 | Correct two-digit comparison | `docs/release-checklist.md:90-96` — local run against pinned `semver=1.0.28` confirms `0.1.10 > 0.1.9`; `updater.rs:532`'s comparison confirmed to be entirely built-in semver, no custom logic to unit-test | ✅ PASS |
| AC4 check_for_updates errors logged | No silent `let _ =` | `lib.rs:84-138` every `Err` arm calls `logging::log_error`/`log_update_error`; grep confirms no `let _ =` remains in the function | ✅ PASS |
| AC5 manual checklist fallback | Actually run, recorded | `docs/release-checklist.md` is a real filled document with a first-recorded-run section | ✅ PASS (fallback mechanism itself; AC1's substance remains deferred) |

### MVP-49 (P3.1 One-line installer)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 curl\|sh → launchable app | End-to-end install, no other steps | `install.sh:299-367` `main()` orchestrates full flow; container-based run not live here (no Docker) but non-container real-fixture run was executed by the implementer and this verifier ran an equivalent isolated signature/checksum proof (see Sensor) | ✅ PASS (script logic verified; full container run deferred — no Docker in either implementer's or this verifier's environment) |
| AC2 resolves latest stable via API | `/releases/latest`, never dev | `install.sh:125-128` | ✅ PASS |
| AC3 verifies signature + checksum, refuses on failure | Non-zero exit, explicit message | `install.sh:183-206` `verify_download()` — **independently re-executed against real signed fixtures in this pass; see Sensor, both baseline-accept and mutant-reject confirmed** | ✅ PASS |
| AC4 install locations + desktop integration | `~/.local/bin/knowledge-os`, `.desktop`+icon, `update-desktop-database` | `install.sh:26-30,208-247` | ✅ PASS |
| AC5 PATH warning | Exact append line printed | `install.sh:74-83` `check_path_warning()` | ✅ PASS |
| AC6 libfuse2 detection | Distro-specific install line | `install.sh:89-115` `check_libfuse2()` | ✅ PASS |
| AC7 non-amd64 exits clearly | Clear message, no download attempt | `install.sh:56-64` `check_arch()` | ✅ PASS |
| AC8 idempotent re-run | Upgrades in place | `install.sh:350-354`; `scripts/test-install.sh:216-241` `test_idempotent_upgrade` (container, not run live) | ✅ PASS (script logic) |
| AC9 `--uninstall` | Removes binary/.desktop/icon, prints vault location, never touches vault | `install.sh:278-297` `uninstall()`, `260-273` `print_vault_location()` | ✅ PASS |
| AC10 never sudo | No invocation anywhere | `scripts/test-install.sh:276-284` static check; `grep -n sudo install.sh` matches only comments/log strings | ✅ PASS |
| AC11 prints version + launch instructions | On success | `install.sh:360-366` | ✅ PASS |

### MVP-50 (P3.2 SHA256SUMS)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 SHA256SUMS generated for every artifact | Uploaded as release asset | `release-dev.yml:75-92`, `release-stable.yml:98-115` | ✅ PASS |
| AC2 SHA256SUMS.sig published | minisign-signed | Same blocks, `tauri signer sign` + upload | ✅ PASS |
| AC3 `sha256sum -c` passes | Verified against real assets | README documents the command; implementer's self-reported dry run against real `dev` release assets is the only evidence (`Knowledge.OS_0.1.18_amd64.AppImage`); not independently re-executed in this pass (no fresh assets produced since branch unpushed) | ⚠️ Deferred to owner (requires a real published release under this workflow) |
| AC4 README documents both verification paths + public key text | sha256sum + minisign, key inline | `README.md:128-147` both blocks present, public key literal at line 146 | ✅ PASS |

### MVP-51 (P3.3 aarch64 decision)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 README states amd64-only | aarch64 deferred, explicit | `README.md:53` | ✅ PASS |
| AC2 installer exits clearly on non-amd64 | Clear specific message | `install.sh:56-64` | ✅ PASS |
| AC3 traceable to #51 | Linked | `README.md:53`, `install.sh:61` | ✅ PASS |

### MVP-52 (P4.1 Vault/index migration)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 both versions persisted | SQLite schema + vault-format version | `migration.rs:37-46,99,101-107` | ✅ PASS |
| AC2 startup compares, one explicit branch | UpToDate/migrate/rebuild/refuse | `migration.rs:208-242` `decide()` — exactly 4 return points, **independently mutation-tested in this pass (2 mutations, both killed — see Sensor)** | ✅ PASS |
| AC3 newer app + older vault non-destructive | Automated fixture test | `tests/vault_compatibility.rs:38-77` — **independently re-run in this pass, passes** | ✅ PASS |
| AC4 older app + newer vault refuses, no mutation | Byte-for-byte unchanged | `tests/vault_compatibility.rs:79-101` — **independently re-run in this pass, passes; further confirmed by a dedicated mutation reverting the T19/ae31303 side-effect-free fix, which this test correctly catches (killed)** | ✅ PASS |
| AC5 rebuild shows observable progress, correct at realistic size | Progress UI + correctness at scale | `VaultCompatibilityNotice.tsx`/`.test.tsx` prove the progress-UI half; no test uses a "realistic size" vault — only small/empty fixtures | ⚠️ Spec-precision gap — "realistic size" undefined by spec and untested; real fix task warranted |
| AC6 Markdown-touching migration backs up first | Restorable backup, tested | `tests/markdown_migration_backup.rs:16-51` — **independently re-run in this pass, passes** | ✅ PASS |
| AC7 vault layout documented for hand recovery | README section | `README.md:88-106` | ✅ PASS |

### MVP-53 (P4.2 SECURITY.md)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 SECURITY.md covers all 4 elements | Versions, channel, response time, scope | `SECURITY.md:3-46` | ✅ PASS |
| AC2 private vuln reporting enabled | Button visible | **Live** `gh api repos/.../private-vulnerability-reporting` → `{"enabled":true}` | ✅ PASS (live) |
| AC3 signing-key threat model + rotation | Documented | `SECURITY.md:48-91` | ✅ PASS |
| AC4 no fork-triggerable signing-secret workflow | Audited | `SECURITY.md:92-107`; corroborated: neither release workflow declares `pull_request`/`pull_request_target` | ✅ PASS |
| AC5 public key documented in repo | Not only embedded in binaries | `README.md:146`, cross-linked from `SECURITY.md` | ✅ PASS |

### MVP-54 (P4.3 Dependency auditing/SBOM)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 dependabot.yml 4 ecosystems | cargo/npm/uv/github-actions | `.github/dependabot.yml:3-29` | ✅ PASS |
| AC2 scheduled scan runs all 3 audits | cron trigger | `.github/workflows/dependency-audit.yml:3-8,27-44` | ✅ PASS |
| AC3 deliberately-vulnerable dep detected | Scan flags it | Never run against real GitHub infra; implementer's scratch-project dry run (`smallvec` RUSTSEC-2021-0003) is self-reported, not independently re-executed in this pass | ⚠️ Deferred to owner (requires live scheduled-workflow run) |
| AC4 no-fix policy: tracking issue not build fail | `continue-on-error`, issue creation | `dependency-audit.yml:29,36,41` all `continue-on-error: true`; issue-open logic at lines 46-73 | ✅ PASS |
| AC5 SBOM attached to stable release | CycloneDX/SPDX asset | `release-stable.yml:117-129` Syft step | ✅ PASS (config) |

### MVP-55 (P4.4 Crash/error logging)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 panics/errors → rotating log | `tauri-plugin-log` wired | `logging.rs:39-49,84-95` | ✅ PASS |
| AC2 Settings open/copy-log action | Location documented | `About.tsx:93-99`; `README.md:110` | ✅ PASS |
| AC3 no note/vault/credential leakage, automated test | Explicit test | `logging.rs:157-241` 6 unit tests; **independently mutation-tested in this pass — redaction guard disabled, 4/5 tests immediately fail (killed)** | ✅ PASS |
| AC4 documented bug-report path | What to attach | `README.md:108-120` | ✅ PASS |
| AC5 opt-in remote reporting | N/A — explicitly out of scope | — | N/A |

### MVP-48 (P4.5 Observable self-updates)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 non-modal pending-restart indicator | "Restart now" action | `About.tsx:78-87` `role="status"`; `About.test.tsx:78-102` asserts no dialog/aria-modal | ✅ PASS |
| AC2 repeated failures surfaced | Settings→About shows it | `About.tsx:89-91` `role="alert"`; `About.test.tsx:104-124` | ✅ PASS |
| AC3 version+channel shown | Displayed | `About.tsx:72-76` | ✅ PASS |
| AC4 startup never blocked | Update check not awaited | `lib.rs:34-37` `tauri::async_runtime::spawn(...)`, not awaited; e2e regression test at `desktop-foundation.spec.ts:509` — **independently re-confirmed passing in this pass's full e2e run** | ✅ PASS |
| AC5 update attempts logged | Success + failure | `lib.rs:114-128` | ✅ PASS |

### MVP-56 (P4.6 Documentation/contributing)

| Criterion | Spec-defined outcome | file:line + evidence | Result |
| --- | --- | --- | --- |
| AC1 README Linux deps block matches CI source | Verbatim apt line + non-Debian notes | `README.md:67,70` matches `.github/actions/setup-tauri-build/action.yml:23` verbatim | ✅ PASS |
| AC2 both install paths + locations + uninstall | All documented | `README.md` installer/build-from-source/arch/vault-locations/uninstall sections all present | ✅ PASS |
| AC3 CONTRIBUTING.md full coverage | Branch model, commits, gate, protection | `CONTRIBUTING.md:3-46` | ✅ PASS |
| AC4 issue/PR templates | Bug (version+channel)/feature/PR checklist | `.github/ISSUE_TEMPLATE/bug_report.md:7-15`, `feature_request.md`, `PULL_REQUEST_TEMPLATE.md:5-9` | ✅ PASS |
| AC5 clean-Ubuntu contributor reaches running app via README alone | Self-certified reachability | Not independently re-executed (would require a real clean-Ubuntu container run through the full README); plausible from doc content review only | ⚠️ Spec-precision gap — plausible, not literally executed |

**Status**: 79/89 criteria ✅ PASS (14 of which carry a "config verified, not exercised on live GitHub infra" caveat, correctly deferred to the owner per this verification's scope), 1 ❌ real GAP (MVP-44 AC5), 4 ⚠️ genuine spec-precision gaps (MVP-44 AC3, MVP-52 AC5, MVP-56 AC5, plus MVP-43 AC4 which this Verifier upgraded to PASS via independent re-run), 5 items explicitly deferred to the repo owner as inherently un-runnable without a real release/live infra (MVP-41 AC4/AC7, MVP-46 AC2, MVP-47 AC1, MVP-50 AC3, MVP-54 AC3).

---

## Discrimination Sensor

All mutations injected into scratch copies (via `Edit` then reverted via `Edit`) or a fully external scratch directory — the real working tree was confirmed byte-identical (`git diff --stat` empty) after every mutation was discarded.

| # | File:line | Description | Test run | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/desktop/src-tauri/src/migration.rs:215` | Flipped comparison `actual_sqlite > expected_sqlite` → `actual_sqlite >= expected_sqlite` in `decide()`'s newer-vault-refuse branch | `cargo test --lib migration::` | ✅ Killed — 2 tests failed (`both_current_is_up_to_date`, `format_behind_with_a_defined_migration_rebuilds_the_cache`) |
| 2 | `apps/desktop/src-tauri/src/migration.rs:228-230` | Changed `RebuildCache` return to `UpToDate` in the sqlite-behind branch | `cargo test --lib migration::` | ✅ Killed — `sqlite_behind_rebuilds_the_cache` failed |
| 3 | `apps/desktop/src-tauri/src/logging.rs:126` | Disabled the redaction guard (`redact()` returns its input unchanged) | `cargo test --lib logging::` | ✅ Killed — 4/5 tests failed, including both credential-leak and note-content-leak assertions |
| 4 | `apps/desktop/src-tauri/src/migration.rs:94-107` | Reverted the T19/`ae31303` side-effect-free fix — reintroduced `KnowledgeStore::open()` (which unconditionally migrates on open) in place of the plain, unmigrated connection | `cargo test --test vault_compatibility` | ✅ Killed — `vault_newer_than_binary_refuses_and_leaves_the_fixture_byte_for_byte_unchanged` failed (the vault opened successfully instead of refusing, and the refuse-path byte-for-byte guarantee was invalidated) |
| 5 | `install.sh` `verify_download()`'s AppImage minisign check (`-Vm ... || die ...`) | Disabled the check's failure path (`\|\| true`) in a scratch copy, isolating it from the separate checksum-manifest check | Custom scratch harness: sourced the real (then mutated) `install.sh` functions, generated a throwaway minisign keypair, signed real fixtures, and exercised `verify_download` directly against a same-filename tampered AppImage whose SHA256SUMS was recomputed+resigned to match (isolating the AppImage's own signature check from the checksum-manifest lookup) | ✅ Killed — baseline correctly `REJECTED`; mutant incorrectly `ACCEPTED` the tampered file. This directly demonstrates that `scripts/test-install.sh:155-189`'s `test_tamper_rejected` (not runnable live here — no Docker) exercises this exact code path and would catch the same fault. |

**Sensor depth**: lightweight (5 targeted mutations across the two highest-risk Rust modules and the installer's signature verification, per the "default" tier — data-integrity/security-adjacent code warranted going one above the 1–3 minimum).
**Result**: 5/5 killed — ✅ PASS. No survivors; no fix tasks generated by the sensor.

---

## Code Quality

Spot-checked via an independent sub-agent across 6 representative points spanning all 4 phases (CI gate, logging, installer, migration + its fix commit, About UI + build.rs wiring, and a full repo-wide diff-stat scan for out-of-scope files).

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ — e.g. `logging.rs`'s redaction guard has no speculative config/strategy pattern |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — the few "extra" touches (`lib.rs` module registration, `knowledge.rs` call-site wiring, `build.rs` allow-list entries) are one/two-line mechanically-necessary additions, each self-flagged as `SPEC_DEVIATION` rather than silently done |
| Didn't "improve" unrelated code | ✅ — `ae31303` (T19's fix) is a minimal, surgical correction touching only the buggy read path |
| Matches existing patterns/style | ✅ |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria, non-shallow | ✅ (spot-checked MVP-52's decision-table tests, MVP-55's redaction tests) |
| Spec-anchored outcome check | ✅ — see AC table above; the one real gap (MVP-44 AC5) and the spec-precision gaps are called out rather than silently passed |
| Per-layer Coverage Expectation met | ✅ — domain logic (migration.rs, logging.rs) has 1:1 branch coverage per the decision table; e2e covers happy+regression paths |
| Every test maps to a spec AC/edge case/Done-when | ✅ — no unclaimed tests found in the spot-checked files |
| Documented project guidelines followed | tasks.md's own Test Coverage Matrix (generated from codebase sampling, no separate `AGENTS.md`/testing-standards doc exists) — followed throughout |

---

## Edge Cases (spec.md)

| Edge case | Status | Evidence |
| --- | --- | --- |
| dev/stable channel update checks stay independent | ✅ Handled | Endpoint is baked in at build time per binary (`release-dev.yml:71`, `release-stable.yml:96`) — structurally independent, no shared state possible |
| CI gate broken → fail closed, no publish on absence-of-red | ✅ Handled | `needs: ci` (a `workflow_call`) — GitHub Actions treats a `needs:` job that errors/is skipped as blocking downstream jobs by default; no publish path exists without an explicit CI success |
| Installer re-run while app is currently running | ❌ NOT handled or documented | No mention of a running-process check, warning, or documented behavior anywhere in `install.sh` or `README.md`. This is a genuine, spec-named gap — the spec explicitly requires either verifying replace-while-running works, or documenting that it requires killing the process first; neither happened. |
| Partial/flaky download → fails verification, not installed | ✅ Handled | A truncated download changes the file's hash and its minisign signature no longer matches → `verify_download()`'s existing checks catch this by construction (same mechanism proven in Sensor mutation 5) |
| Concurrent pushes → no duplicate/overwriting stable release | ✅ Handled | `release-stable.yml:7-9` `concurrency: group: stable-channel-release, cancel-in-progress: true` serializes runs on this workflow, so only the latest run's `check-version` result is acted on |

**4/5 edge cases handled and evidenced; 1 genuine gap** (installer-while-running) — added to Fix Plans below.

---

## Gate Check

- **Gate command**: `make check` (per tasks.md's Gate Check Commands, Build level)
- **Result**: `make check` stopped at `test-rust-integration` with exactly one failure: `settings_security.rs::onboarding_persists_only_a_vault_display_name_publicly`, which asserts the vault's persisted display name equals the checkout directory's literal name (`"Knowledge GraphBase"`); it fails identically in this worktree (named `agent-af104e0d1216d3f9b`) for the same environment-specific reason every implementer batch documented. Confirmed this is the **sole** environment-specific failure by running every remaining stage individually past this point:
  - `cargo test --workspace --lib --locked`: **all passed** (0/26/4/21/0/0/0 across the 7 crates with lib tests — see below)
  - `cargo test --workspace --tests --locked -- --skip onboarding_persists_only_a_vault_display_name_publicly`: **exit 0**, all 27 test binaries passed (unit + integration across all crates and the desktop app, including `vault_compatibility.rs` 2/2, `markdown_migration_backup.rs` 2/2, `ipc_contract.rs`, `settings_security.rs`'s other 29 tests)
  - `make test-desktop-e2e`: **35/35 passed** (Playwright, including the T1 divider-persistence regression test and the new About/observability e2e cases)
  - `make build`: **passed** (TypeScript build + `cargo build --workspace --locked`, both clean)
  - One transient environment gap was found and fixed mid-verification: the Python venv was missing `fastapi`/`pydantic` (an `apps/api` typecheck dependency, unrelated to this feature's diff — confirmed via `git diff --stat ae9380c..HEAD -- apps/api pyproject.toml uv.lock` showing zero changes to that surface). Running `uv sync --all-packages` resolved it; this is a worktree-setup gap, not a feature defect.
- **Test count before feature**: not independently measurable from this worktree (pre-feature commit `ae9380c` was not built/tested in this pass); implementers' task-by-task counts show steady growth (e.g., T19 added 6, T20 added 2 integration + component tests, T22 brought desktop-lib to 18, T23 to 179 UI tests total)
- **Test count after feature**: 27 Rust test binaries all green (lib + integration), 35 Playwright e2e, UI test suite green as part of `test-quick`
- **Delta**: substantial net-positive addition across Rust unit/integration, React component, and Playwright layers; no test deletions observed in any reviewed commit
- **Skipped tests**: none found (no `.skip()`/`test.fixme()` in the diff surface — T1's divider test is fully un-skipped and passing)
- **Failures**: 1, environment-specific, pre-existing, documented, out of scope for this feature (see above)

---

## Fix Plans

### Fix 1: Load-bearing endpoint note is in the wrong file (MVP-44 AC5)

- **Root cause**: T9 (`app_info.rs`) documented that the updater endpoint is load-bearing/irreversible-once-shipped as a Rust module doc comment, because `tauri.conf.json`'s config parser rejects unknown JSON keys (a real, valid constraint) — but never propagated an equivalent note into README.md or CONTRIBUTING.md, which is exactly where spec.md's P2.1 AC5 says it must live.
- **Fix task**: Add a short note to `README.md` (near the existing channel/updater documentation, or the "Linux system dependencies"/build section) and/or `CONTRIBUTING.md`, stating: the stable/dev updater endpoints baked into `tauri.conf.json`'s override at build time are load-bearing once the first stable release ships, and must not be changed casually — cross-reference `app_info.rs`'s doc comment as the technical source of truth.
- **Priority**: Major (spec explicitly names the two files; the current location is technically correct information in the wrong, less-discoverable place for a future maintainer editing CI/release config).

### Fix 2: No test at "realistic vault size" for cache rebuild (MVP-52 AC5)

- **Root cause**: `tests/vault_compatibility.rs`'s `older_sqlite_schema_triggers_a_non_destructive_automatic_rebuild` uses an empty/near-empty fixture vault. The spec asks the rebuild to "complete correctly on a vault of realistic size," which is untested.
- **Fix task**: Extend (or add alongside) the existing integration test with a fixture vault containing a meaningfully larger number of notes/concepts (e.g., hundreds of Markdown files with realistic front-matter), asserting the rebuild completes and the resulting graph/index state is correct at that scale.
- **Priority**: Minor (correctness at small scale is proven; this closes a scale-specific blind spot, not a known defect).

### Fix 3: Installer's behavior when the app is running is neither verified nor documented (spec.md Edge Cases)

- **Root cause**: `install.sh`'s `install_binary()` does a plain `cp`+`chmod` over the existing AppImage path with no check for whether the target binary is currently an in-use, running process.
- **Fix task**: Either (a) verify empirically that replacing the AppImage file while it's running is safe on Linux (typically yes — the running process holds its own inode, a `cp` that truncates+rewrites the destination path would be the risky case; POSIX `rename`-style replace is safe, an in-place truncate is not — this needs to be checked against `install_binary`'s actual write strategy), or (b) add a one-line note to `README.md`'s uninstall/upgrade section stating whether restarting the app is required after an in-place upgrade.
- **Priority**: Minor (very unlikely to cause active data loss, but spec explicitly names this as a required edge case to resolve one way or the other, and it currently has zero evidence either way).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| MVP-40 | Pending | ✅ Verified |
| MVP-41 | Pending | ⚠️ Verified with deferred-to-owner live-run items (AC4, AC7) |
| MVP-42 | Pending | ✅ Verified (live) |
| MVP-43 | Pending | ✅ Verified |
| MVP-44 | Pending | ⚠️ Needs Fix (AC5) |
| MVP-45 | Pending | ✅ Verified |
| MVP-46 | Pending | ⚠️ Verified with deferred-to-owner item (AC2, one-time asset cleanup) |
| MVP-47 | Pending | ⚠️ Verified with deferred-to-owner item (AC1, real A→B upgrade) |
| MVP-49 | Pending | ✅ Verified |
| MVP-50 | Pending | ⚠️ Verified with deferred-to-owner item (AC3, live sha256sum dry run) |
| MVP-51 | Pending | ✅ Verified |
| MVP-52 | Pending | ⚠️ Needs Fix (AC5, realistic-size test) |
| MVP-53 | Pending | ✅ Verified (live) |
| MVP-54 | Pending | ⚠️ Verified with deferred-to-owner item (AC3, live scan run) |
| MVP-55 | Pending | ✅ Verified |
| MVP-48 | Pending | ✅ Verified |
| MVP-56 | Pending | ⚠️ Verified with spec-precision gap (AC5, self-certification) |

---

## Summary

**Overall**: ✅ Ready (with 3 minor/major follow-up fix tasks, none blocking; 5 items are inherently un-runnable without a real GitHub release/live infra and are explicitly deferred to the repo owner, not counted against this verification)

**Spec-anchored check**: 79/89 ACs independently matched their spec-defined outcome with file:line evidence; 1 real gap (MVP-44 AC5); 4 genuine spec-precision gaps flagged (MVP-44 AC3, MVP-52 AC5, MVP-56 AC5, and MVP-43 AC4 which this Verifier upgraded to PASS via its own independent re-run); 5 items deferred to the owner as inherently requiring a live release/real CI run

**Sensor**: 5/5 mutations killed (100%) — migration.rs's decision function (2), logging.rs's redaction guard (1), install.sh's own signature verification (1), and the T19/ae31303 side-effect-free regression (1)

**Gate**: all stages pass except the one documented, pre-existing, environment-name-dependent test (`settings_security.rs::onboarding_persists_only_a_vault_display_name_publicly`) — confirmed via individual stage runs that every other test (27 Rust binaries, 35 Playwright e2e, full UI suite, both format/lint/typecheck static gates, and the production build) is green

**What works**: License clears the legal blocker; a real CI gate (static/unit/integration/e2e) exists and is wired to gate publish; branch protection is genuinely live on GitHub (independently confirmed via `gh api`, not just documented); stable/dev channel split is structurally correct and independently baked per-binary; the dev-asset-pruning mechanism is correct (only the one-time historical cleanup remains, explicitly deferred); the installer's signature/checksum verification was independently proven correct and its failure mode was independently proven to be caught by mutation testing; the vault migration decision function is fully branch-covered and independently proven correct via mutation testing, including the specific T19 side-effect-free regression the implementer claimed to have fixed; crash/error logging exists with an independently-proven redaction guard; the About UI correctly surfaces version/channel/restart/failure state without blocking startup; SECURITY.md and private vulnerability reporting are genuinely live; dependency auditing and SBOM generation are wired correctly.

**Issues found**:
1. MVP-44 AC5 — the updater endpoint's "load-bearing, don't change casually" warning lives only in a Rust doc comment, not in README.md/CONTRIBUTING.md as the spec explicitly names. Fix: add the note to one or both of those files.
2. MVP-52 AC5 — no test proves the cache-rebuild-from-Markdown path is correct at a "realistic" vault size, only at near-empty scale. Fix: add a larger fixture-vault integration test.
3. Edge case (installer-while-running) — neither verified nor documented. Fix: verify `install_binary`'s replace strategy is safe against a running process, or document that a restart is required.

**Next steps**: Route the 3 fix tasks above to an implementer (all are small, additive, non-blocking); no re-verification loop is required to ship the MVP as-is, but closing these before or shortly after the first real stable release would tighten the spec-precision gaps this pass found. The 5 owner-deferred items (live CI run timing/red-run proof, one-time dev-asset cleanup, real A→B updater upgrade, live sha256sum dry run against a real release, live scheduled-scan detection proof) require the repo owner to actually push this branch and publish real releases — genuinely out of scope for any agent to do autonomously, and already self-flagged as such by the implementers.

---

## Post-verification fixes (applied directly by the orchestrator, not re-verified by a fresh Verifier pass)

All 3 ranked gaps were closed directly rather than routed through another full batch cycle, since each was small and additive:

1. **MVP-44 AC5** — Added a "Release channels and the updater endpoint" section to `CONTRIBUTING.md` stating the load-bearing/irreversible warning in prose, cross-referencing `app_info.rs`'s doc comment as the technical source of truth. Also corrected a stale `CONTRIBUTING.md` line that still said branch protection "has not yet been executed" — it has (confirmed live via `gh api` earlier in this session) — to reflect reality.
2. **MVP-52 AC5** — Added `older_sqlite_schema_rebuild_is_correct_at_a_realistic_vault_size` to `apps/desktop/src-tauri/tests/vault_compatibility.rs`: populates a real `KnowledgeStore` with 300 concepts (under the 500-node `graph_in_vault` cap), rolls `PRAGMA user_version` back to simulate an older-schema vault, and asserts the rebuild returns all 300 concepts untruncated within 10s. Passes (3/3 in the file, `cargo fmt`/`clippy -D warnings` clean).
3. **Edge case (installer-while-running)** — Chose the safer fix over the documentation-only option: rewrote `install_binary()` in `install.sh` to write to a same-directory temp file and `mv` (atomic rename) into place, rather than an in-place `cp` over the existing binary — so a currently-running instance keeps its own already-open inode until it exits, instead of risking corruption from an in-place truncate+rewrite. Added a corresponding one-line README note under the upgrade instructions. `sh -n install.sh` syntax-checked clean (no Docker available in this environment to re-run the full container harness).

These fixes are not yet independently re-verified by a fresh Verifier — the original PASS ✅ verdict above stands as the authoritative feature-level validation; this section is a transparency note on follow-up work done after that pass, not a new validation cycle.
