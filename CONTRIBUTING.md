# Contributing

## Branch model

- `main` — stable. Every push that changes `apps/desktop/src-tauri/tauri.conf.json`'s `version` field publishes a real, versioned, changelogged stable release. Only receives merges that have already been proven on `dev`.
- `dev` — active development. Every push publishes a signed prerelease build (the `dev` channel) so the self-updating desktop app always tracks the latest work.
- `feat/*` — one branch per feature or fix, cut from `dev`. Open your pull request against `dev`, not `main`.

Pull requests target `dev`. `main` only moves forward via a deliberate merge/promotion from `dev` once it's ready to ship as a stable release.

## Commit messages: Conventional Commits

This repo uses [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) (`type(scope): description`, e.g. `fix(desktop): persist Explorer divider width across reload`). This is not just a style preference — the stable-release changelog (`CHANGELOG.md`) and GitHub release notes are generated directly from this commit history, so a commit that doesn't follow the convention doesn't show up correctly in a release's notes.

Common types used in this repo: `feat`, `fix`, `refactor`, `docs`, `test`, `style`, `perf`, `build`, `ci`, `chore`.

## Local gate: `make check`

Before opening a pull request, run the same gate CI enforces:

```bash
make check
```

This runs, in order: `lock-check`, `format`, `lint`, `typecheck`, `test-full` (which is `test-quick` + `test-rust-integration` + `test-desktop-e2e`), then `build`. Narrower targets are available for faster local iteration (`make test-quick`, `make lint`, etc.) — see the `Makefile` for the full list.

### What CI enforces

`.github/workflows/ci.yml` runs on every pull request and every push to `main`/`dev`, as four jobs, all built on the shared `.github/actions/setup-tauri-build` composite action:

| CI job | Runs | Maps to |
| --- | --- | --- |
| `static` | `make lock-check format lint typecheck` | Lockfile integrity, formatting, linting, type checking |
| `unit` | `make test-quick` | Contracts, UI, Rust unit, Python tests |
| `integration` | `make test-rust-integration` | Rust integration tests |
| `e2e` | `make test-desktop-e2e` | Playwright end-to-end tests (traces/screenshots uploaded as CI artifacts on failure) |

A red run on any of these four jobs is a required status check and blocks merging (see Branch protection below), and blocks release publication — no publish step in `release-dev.yml`/`release-stable.yml` is reachable unless all four jobs already passed on the same commit.

## Branch protection

`main` and `dev` are configured with the following (see the CI gate table above for exactly which checks are required):

- Required status checks: the four `ci.yml` jobs (`static`, `unit`, `integration`, `e2e`) — a PR cannot merge while any of them is red or still running.
- "Require branches to be up to date before merging" is enabled, so a PR is checked against the latest target branch state, not a stale base.
- Force pushes and branch deletion are disabled on both branches.
- No required approving review is configured — per owner decision, for a solo maintainer this repo relies on required checks only, not mandatory human review (avoids self-approval theater).

These settings are configured directly in the repository's GitHub settings (Settings → Branches). If they are ever lost or need to be restored, the exact `gh api` invocation used to (re-)apply them is recorded here once configured.
