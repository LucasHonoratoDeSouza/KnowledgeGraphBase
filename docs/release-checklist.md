# Stable release checklist: self-update upgrade verification

This checklist exists because nothing in the codebase automatically proves
that the self-updater actually upgrades a running install end to end (spec
`MVP-47` / design's P2.4). Per P2.4 AC5, full CI automation of that path
(build version A, publish it to a scratch GitHub release, install it in a
container, build and publish version B, launch A headless, assert it becomes
B) was judged disproportionate for this pass: it requires *actually
publishing* releases to the real GitHub repository from CI, which this
implementation pass is explicitly not permitted to do (see the "no live
GitHub mutation" constraint recorded for the Phase 2 batch that produced
this checklist). A documented, actually-run manual checklist is the
spec-approved fallback (P2.4 AC5).

**This checklist must be run once, with its evidence copied into the PR
description, for every stable release** (every push to `main` that
`release-stable.yml`'s `check-version` job would actually publish). Never
skip it silently -- if a release ships without a completed checklist below,
that is a process gap to flag, not something to paper over.

---

## First recorded run (2026-07-27, Phase 2 batch T8-T14)

This first run was executed as part of implementing this checklist itself,
using local/offline verification instead of a real scratch GitHub release
(no live publish was performed, per this pass's guardrail). It exercises the
exact library code the app depends on, with the same pinned versions this
workspace uses (`Cargo.lock`), rather than the full container-based
end-to-end flow -- that full flow is still owed to the first real stable
release and is called out as pending below.

### 1. A -> B upgrade end to end (P2.4 AC1)

**Status: NOT run against a real scratch release.** Per the guardrail for
this implementation pass, no release was published to the real
`LucasHonoratoDeSouza/KnowledgeGraphBase` repository (dev, stable, or
scratch/test). This step is **pending** and must be completed by the repo
owner before or alongside the first real stable release:

1. Bump `apps/desktop/src-tauri/tauri.conf.json`'s `version` (e.g. `0.1.0` ->
   `0.1.1`), push to a scratch/test release channel (not `dev` or the real
   stable tag), and let it build/publish as version A.
2. Install A in a clean container via `install.sh` (or manually place the
   AppImage + run it headless, e.g. `xvfb-run`).
3. Bump the version again to build and publish version B to the same
   scratch channel.
4. Launch the installed A headless and confirm it detects, downloads, and
   installs B, ending up reporting B's version via `get_app_info` (T9).
5. Record the before/after version strings here.

### 2. Signature verification: correct signature accepted, bad signature rejected (P2.4 AC2)

**Status: verified**, by porting `tauri-plugin-updater`'s `verify_signature`
function verbatim (plugins-workspace `updater-v2.10.1`,
`plugins/updater/src/updater.rs:1453-1462`) into a throwaway local project
using `minisign-verify = "0.2.5"` -- the exact crate and version this
workspace's `Cargo.lock` pins for `tauri-plugin-updater` -- and running it
against `rust-minisign-verify`'s own published test fixtures (public sample
key/signature/message, not this project's real signing key):

```
case 1 (correct payload):  true
case 2 (tampered payload): Err(InvalidSignature) (expected: Err)
case 3 (corrupted signature): Err(InvalidEncoding) (expected: Err)
PASS: verify_signature (ported verbatim from tauri-plugin-updater) accepts only a correctly-signed, untampered payload.
```

This proves `verify_signature` -- and therefore
`Update::download_and_install`, which calls it and propagates its `Err` --
rejects both a tampered payload and a corrupted signature rather than
silently treating either as "no update" or succeeding. Combined with T13
(`log_update_error("update-install-failed", ...)` on that `Err` branch), a
real bad-signature scenario in production now surfaces as a logged
`update-install-failed` event, not silence.

### 3. Version ordering across a two-digit boundary, e.g. `0.1.9` -> `0.1.10` (P2.4 AC3)

**Status: verified, documented (no custom logic to unit-test)**. Version
comparison for "is there a newer update" is entirely
`tauri-plugin-updater`'s own built-in handling:
`release.version > self.current_version` (`updater.rs:532`), where both
sides are `semver::Version` (the crate this workspace's `Cargo.lock` pins at
`semver = "1.0.28"`). No custom version-comparison logic exists in this
codebase for the updater path (the *separate* version-comparison logic in
`release-stable.yml`'s `check-version` job, covered by T11, is a distinct
concern -- whether to publish a release at all, not whether an installed
build should update).

Confirmed locally against that exact pinned `semver` version:

```
0.1.10 > 0.1.9 => true
naive string comparison would say 0.1.10 > 0.1.9 => false (must be false, proving semver's numeric comparison is required)
PASS: semver::Version orders the two-digit boundary correctly.
```

`semver::Version`'s `Ord` implementation compares the major/minor/patch
fields numerically, not the version string lexicographically, so `0.1.10` is
correctly treated as newer than `0.1.9`.

### 4. Update failures are logged, not silently discarded (P2.4 AC4)

**Status: verified** by T13 (`fix(desktop): log updater failures instead of
discarding them`, commit `5d59a69`): every `Err`/early-return branch in
`check_for_updates` (`apps/desktop/src-tauri/src/lib.rs`) now logs a
structured event (`updater-unavailable` / `update-check-failed` /
`update-install-failed`) via `logging::log_error` before returning, with
unit test coverage in `lib.rs`'s `update_error_logging_tests` module.

---

## Template for future runs

Copy this section into the stable-release PR description and fill it in
before merging:

```
## Release checklist (P2.4)

- [ ] A -> B upgrade verified end to end (version: ____ -> ____; evidence: ____)
- [ ] Correctly-signed update installs; deliberately bad signature is rejected (evidence: ____)
- [ ] Version ordering across this release's version bump is correct (evidence, if a two-digit boundary is crossed: ____)
- [ ] check_for_updates failures for this release are visible in logs, if any occurred during testing (evidence: ____)
```
