# Knowledge OS

A local-first desktop knowledge base. Capture videos, PDFs, web pages and notes; Knowledge OS turns them into durable, traceable Markdown, a navigable knowledge graph and grounded retrieval — with AI use that is observable, deliberately small, and never required.

Full product vision and design: [`knowledge-os-system-design.md`](knowledge-os-system-design.md).

## Status

Active development on `dev`. Core MVP loop (capture → organize → search → grounded assistant) is implemented and tested end to end. See [`.specs/features/knowledge-os-mvp/tasks.md`](.specs/features/knowledge-os-mvp/tasks.md) for the current, audited task-by-task status.

A `dev` prerelease is published automatically on every push and the desktop app self-updates from it — see [Dev channel](#dev-channel) below.

## Architecture

Polyglot monorepo:

- `apps/desktop` — the product: a Tauri 2 + React/TypeScript desktop app. All privileged access and local domain logic live in the Rust runtime.
- `crates/` — Rust workspace: `knowledge-domain`, `knowledge-storage`, `knowledge-ingestion`, `knowledge-ai`, `knowledge-retrieval`.
- `apps/api`, `apps/worker` — optional FastAPI/worker services for a future remote/sync mode. The desktop app never depends on them to open or use a local vault.
- `packages/contracts` — canonical JSON Schemas, generated into TypeScript, shared across Rust/TS/Python.
- `packages/ui` — shared design tokens and accessible primitives.

Markdown in the vault is the canonical, durable format (AD-002); SQLite holds metadata, full-text index and graph as a reconstructible cache, never the source of truth.

## Installing Knowledge OS

Two ways to get a running app, side by side:

| | One-line installer | Building from source |
| --- | --- | --- |
| For | Using the app | Contributing / development |
| Command | `curl -fsSL https://raw.githubusercontent.com/LucasHonoratoDeSouza/KnowledgeGraphBase/main/install.sh \| sh` | See [Getting started](#getting-started) below |
| Gets you | The latest **stable** signed AppImage, verified and installed to `~/.local/bin`, with a launcher entry | A dev build you can modify and run with `pnpm tauri dev` |
| Self-updates | Yes (stable channel) | No — you rebuild from source |

The installer:

1. Resolves the latest stable (non-prerelease) GitHub release.
2. Downloads the `amd64` AppImage plus its checksum (`SHA256SUMS`) and signature (`.sig`), and refuses to install if either verification fails.
3. Installs it to `~/.local/bin/knowledge-os` and registers a `.desktop` entry + icon so it shows up in your application launcher.
4. Never invokes or requires `sudo`.

Run it again any time to upgrade in place — it replaces the existing install rather than duplicating it. To remove Knowledge OS:

```bash
curl -fsSL https://raw.githubusercontent.com/LucasHonoratoDeSouza/KnowledgeGraphBase/main/install.sh | sh -s -- --uninstall
```

`--uninstall` removes the binary, `.desktop` entry, and icon, and prints where your vault lives — it never touches the vault itself.

### Supported distributions and architectures

This MVP supports **`amd64` (x86_64) Linux only**. The installer detects any other architecture and exits immediately with a clear message rather than downloading an incompatible binary. `aarch64`/`arm64` support is a deliberately deferred decision, not an oversight — see [issue #51](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/51) for the cost/benefit tradeoff (GitHub ARM runners vs. cross-compiling a `webkit2gtk` sysroot) that would need to be revisited to add it.

The installer targets any Linux distribution with a POSIX `sh`, `curl`, and standard `~/.local` XDG directories — it has been developed and tested against Ubuntu. Building from source instead has its own system-dependency requirements (not needed for the one-line installer, which downloads a prebuilt binary) — tracked separately.

## Getting started

Prerequisites: Node (see `.node-version`) with Corepack enabled, Rust (see `rust-toolchain.toml`), and `uv` for the optional Python services.

```bash
make install       # pnpm + uv workspace install
make test-quick     # contracts, UI, Rust unit, Python — fast gate
make test-full       # + Rust integration, desktop e2e — full gate
make check           # lint, format, typecheck, test-full, build
```

Run the desktop app in development:

```bash
cd apps/desktop
pnpm tauri dev
```

## Vault layout and data locations

Your vault is a plain directory you chose during setup. Everything inside it is recoverable by hand, with no app installed:

```
<your vault>/
├── Projects/, Areas/, …        # your Markdown notes — the durable source of truth (AD-002)
├── attachments/                # captured files (PDFs, etc.)
└── .knowledge-os/
    ├── knowledge.sqlite3       # reconstructible search/graph cache — never the source of truth
    └── backups/                # timestamped Markdown backups, written automatically before
                                 # any migration that would rewrite note content (never touched
                                 # by a normal open/rebuild — see below)
```

- **Your notes are always plain Markdown files** you can open, copy, or back up with any text editor or file manager — they don't require Knowledge OS to read or recover.
- `.knowledge-os/knowledge.sqlite3` is disposable: if it's ever lost, corrupted, or behind what your installed version expects, Knowledge OS rebuilds it automatically from your Markdown on next open (never silently, never destructively — see the app's compatibility check).
- Before any future migration that would rewrite Markdown content itself (not just the SQLite cache), Knowledge OS writes a timestamped copy of every note under `.knowledge-os/backups/markdown-<timestamp>/` first. To hand-recover from one, copy its files back over your notes' original paths in the vault root.
- Uninstalling (`install.sh --uninstall`) never touches your vault directory, wherever you placed it.

## Crash and error logs, and filing a bug report

Knowledge OS writes a local, rotating log file (never phoning home) at `<app data directory>/knowledge-os-desktop.log` — typically `~/.local/share/dev.knowledge-os.desktop/knowledge-os-desktop.log` on Linux. Every unhandled panic and update-check/install failure is recorded there. Settings → About has a "Copy log path" action so you don't need to remember this path.

Log contents are redaction-guarded: note content, vault contents, and provider credentials are never written verbatim, even from a panic triggered while handling that data.

If you're filing a bug report, please attach:

1. The Knowledge OS **version and channel** (Settings → About).
2. The **log file** from the path above (or its last ~100 lines if it's large).
3. **Steps to reproduce**, if known.

Never attach your vault's Markdown files or a screenshot of Settings' provider section — the log and version/channel are all that's needed.

## Dev channel

`.github/workflows/dev-build.yml` builds and publishes a signed `dev` prerelease on every push to `dev`. The installed `.AppImage` silently checks for and installs updates from that release on startup — close and reopen the app to pick up the latest push. The `.deb` package does not self-update; use the AppImage for the auto-updating dev channel.

## Verifying a downloaded release

Every release (stable and `dev`) publishes a `SHA256SUMS` file covering every artifact, plus a `SHA256SUMS.sig` (minisign-signed, so the checksum list itself isn't an unsigned weak link) and a per-artifact `.sig`.

Checksum verification (no extra tools beyond coreutils):

```bash
curl -fsSLO https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/releases/latest/download/SHA256SUMS
curl -fsSLO https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/releases/latest/download/Knowledge.OS_<version>_amd64.AppImage
sha256sum -c SHA256SUMS --ignore-missing
```

Signature verification with [`minisign`](https://jedisct1.github.io/minisign/) against the public key below (also embedded in the app and in `install.sh`):

```
untrusted comment: minisign public key: C7EF911473A1DB25
RWQl26FzFJHvxw74sO1pttlHfyHfvsLRNH1y/SU001pRcHTeh/sb2YRd
```

```bash
minisign -Vm SHA256SUMS -P RWQl26FzFJHvxw74sO1pttlHfyHfvsLRNH1y/SU001pRcHTeh/sb2YRd
minisign -Vm Knowledge.OS_<version>_amd64.AppImage -P RWQl26FzFJHvxw74sO1pttlHfyHfvsLRNH1y/SU001pRcHTeh/sb2YRd
```

## License

MIT — see [`LICENSE`](LICENSE).

MIT is permissive: you may redistribute the AppImage (or any built artifact), modified or not, for free or for a fee, without asking permission — the only requirement is keeping the copyright notice and license text with any copy you distribute. This is what makes third-party packaging (AUR, Flathub, Homebrew, etc.) and mirroring the installer legally unambiguous.
