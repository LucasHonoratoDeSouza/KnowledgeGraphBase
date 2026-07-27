# Changelog
All notable changes to Knowledge OS are documented here, generated from
Conventional Commits by git-cliff.

## [Unreleased]

### Bug Fixes

- *(ci)* Give every dev release a strictly increasing version
- *(desktop)* Default the vault folder picker to the home directory
- *(desktop)* Fail over off WebKitGTK's DMA-BUF renderer on Linux
- *(desktop)* Also disable WebKit compositing mode on the Linux failover
- *(desktop)* Also disable WebKit compositing mode on the Linux failover
- *(desktop)* Disable WebKit's process sandbox in the Linux failover
- *(explorer)* Make the Explorer's search, creation and tree controls real
- *(graph)* Guarantee node separation in dense graphs
- *(graph)* Keep viewport control icons contained
- *(graph)* Add weighted collision-aware motion
- *(graph)* Harden fluid interaction scheduling
- *(graph)* Keep edges hidden until a node is singled out, and open wider
- *(desktop)* Grant the seven file-management commands the renderer invokes
- *(desktop)* Persist Explorer divider width across reload ([#43](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/43))

### Documentation

- *(tasks)* Reconcile Phase 3-6 status with the audited codebase
- Add project README
- *(state)* Close out session handoff with final audited status
- Context.md updated
- *(specs)* Specify, design and break down the Ready backlog
- *(specs)* Record the validation report and the backlog decisions
- *(spec)* Define fluid graph interactions
- *(spec)* Record fluid graph baseline validation
- *(spec)* Define weighted graph motion outcomes
- *(spec)* Add triangular graph navigation outcomes
- *(spec)* Keep graph layout organic
- *(spec)* Organize initial graph clusters
- *(specs)* Add Linux MVP release spec, design, and tasks ([#39](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/39))
- *(license)* Add MIT LICENSE and wire license metadata ([#40](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/40))
- *(contributing)* Document branch model and local gate

### Features

- *(settings)* Add Groq as a first-class AI provider connection ([#2](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/2))
- *(ingestion)* Close the loop from raw capture to organized, grounded knowledge
- *(desktop)* Add a restrained motion layer to the app shell
- *(ingestion)* Give every generated note a machine-readable context line
- *(vault)* Add rename, delete and move commands with index consistency
- *(capture)* Segment mixed submissions and let the user choose placement
- *(librarian)* Add the scoped, undoable folder reorganization pass
- *(explorer)* Add the right-click menu, drag-and-drop moves and the Librarian action
- *(ingest)* Make the organize control choose how a capture is filed
- *(editor)* Add a rendered reading view with a source toggle
- *(workspace)* Add draggable pane dividers and a force-directed graph
- *(settings)* Compact provider cards and a usable default AI setup
- *(graph)* Add incremental physics and viewport core
- *(graph)* Add fluid drag pan and zoom interactions
- *(graph)* Reveal labels and open concept notes
- *(graph)* Seed separated structural clusters
- *(ui)* Add a secondary accent hue and layered surfaces
- *(desktop)* Replace the OS title bar with custom window chrome
- *(desktop)* Add a shared keyboard-shortcut layer with save and find
- *(ingest)* Drift the knowledge graph behind the capture surface
- *(ui)* Replace the native organize select with an in-app listbox
- *(settings)* Reduce first-run setup to one local-only step
- *(ui)* Adopt the official mark and lift the ambient graph
- *(desktop)* Wire tauri-plugin-log with a redaction guard (#55 infra, AD-014)
- *(desktop)* Expose build channel and support per-channel updater endpoint ([#44](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/44))

### Miscellaneous Tasks

- Extract shared Tauri Linux build setup into a composite action
- *(gate)* Add static and unit jobs to ci.yml ([#41](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/41))
- *(gate)* Add integration and e2e jobs to ci.yml ([#41](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/41))
- *(gate)* Protect main/dev and require green CI ([#42](https://github.com/LucasHonoratoDeSouza/KnowledgeGraphBase/issues/42))
- *(release)* Replace dev-build.yml with gated, pruning release-dev.yml (#42, #46)
- *(release)* Add release-stable.yml with version-gated publish (#42, #44, #45)

### Refactor

- *(graph)* Remove imposed layout silhouette
- *(ui)* Settle on one indigo hue and a graph that rests in gray

### Testing

- *(e2e)* Cover the capture-to-search-to-assistant golden path
- *(e2e)* Cover rename, reading view and divider resize end to end
- *(graph)* Cover fluid interactions in chromium
