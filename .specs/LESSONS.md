# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When a spec names an exact file for a load-bearing/irreversible-config warning (e.g. README/CONTRIBUTING), grep that file for the note before marking the AC done — a doc comment elsewhere does not satisfy it.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: linux-mvp-release
- evidence: MVP-44 AC5 (docs)
- last seen: 2026-07-27T11:31:06Z

### L-002 — When a spec AC says a data-migration/rebuild path must work 'at realistic size', add a fixture sized well beyond the happy-path minimum — an empty/near-empty fixture does not exercise the scale the spec is asking about.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `test-fixtures` · harmful: 0
- features: linux-mvp-release
- evidence: MVP-52 AC5 (test-fixtures)
- last seen: 2026-07-27T11:31:06Z

### L-003 — An installer/updater script that replaces a running binary must either verify the replace strategy is safe against an in-use process, or explicitly document that a restart is required — silence on this edge case is itself a gap even when no failure has been observed.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `install.sh` · harmful: 0
- features: linux-mvp-release
- evidence: spec.md Edge Cases: installer re-run while app running (install.sh)
- last seen: 2026-07-27T11:31:06Z

### L-004 — Tasks that gate a new command/workflow on a config value (Tauri config keys, workflow_call triggers) recur needing one extra file beyond the task's listed Where — write tasks.md's Where field to include the module-registration/trigger-wiring file up front, not just the primary new file.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `tasks-authoring` · harmful: 0
- features: linux-mvp-release
- evidence: T9 app_info.rs SPEC_DEVIATION; T10 ci.yml workflow_call SPEC_DEVIATION (tasks-authoring)
- last seen: 2026-07-27T11:31:16Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
