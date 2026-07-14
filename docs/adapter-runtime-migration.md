# Dual Runtime Migration And Compatibility

This guide covers migration from an existing Agent Spectrum Kernel installation to the canonical Claude Code and Codex runtime projections introduced by #179. Generated adapter assets are replaceable projections. Project-owned files, runtime data, and approval state are not generated assets.

## Supported path

1. Record the current ASK repository revision and both adapter install states when present.
2. Run the core installer first so both adapters resolve the same canonical Kernel and Skill revision.
3. Run each adapter installer with its current profile. Use `--check` first in controlled repositories.
4. Run `adapter-runtime-bundle.mjs --check` in the ASK source and `adapter-cross-conformance.mjs` before making runtime-readiness claims.
5. Run `ask-doctor --runtime-probe` in the adopting repository. Treat projection, runtime detection, execution, and behavioral evidence as separate states.

```bash
node scripts/install-kernel.mjs --target /path/to/project --merge-agents
node scripts/install-claude-adapter.mjs --target /path/to/project --profile implementation
node scripts/install-codex-adapter.mjs --target /path/to/project --profile implementation
node scripts/ask-doctor.mjs --target /path/to/project --runtime-probe
```

The adapters may coexist. Claude owns `.claude/**`, its managed `.claude/settings.json` hook subset, and its runtime files. Codex owns `.agents/**` and its runner files. The core installer remains the owner of the root Kernel and canonical Skills.

## Compatibility matrix

| Existing state | Upgrade behavior | Stop condition | Recovery |
|---|---|---|---|
| Current managed files unchanged | Regenerate from current canonical inputs and refresh provenance. | None. | Rerun the same profile; generation is idempotent. |
| Pre-compact Codex managed prompt | Replace it with the generated compact profile and shared provenance. | Local prompt bytes differ from the recorded managed hash. | Review the local change, then explicitly use `--force` or preserve it outside the managed path. |
| Older Claude command-owned metrics sidecar | Commands no longer write task sidecars; the runtime-owned collector consumes the canonical Execution Envelope. | Required runtime or managed hooks are absent/modified. | Rerun the Claude installer; use `--skip-runtime` only when hooks are also intentionally removed. |
| Profile expansion | Add the newly selected managed assets. | Closure or canonical provenance validation fails. | Fix the selected profile/Skill closure and rerun. |
| Profile shrink | Requires `--prune` when excluded managed assets remain discoverable. | Modified excluded asset or omitted `--prune`. | Resolve the modified file, then rerun with `--prune`; do not silently retain it as selected capability. |
| Claude and Codex installed together | Preserve disjoint adapter ownership and independent state. | A path is claimed by both adapters or by the core. | Stop; correct the inventory contract before applying either projection. |

Schema additions remain compatible only when older profile documents remain valid and downgrade behavior is not weakened. Capability ID removal/rename, changed downgrade meaning, or canonical ownership changes require a schema-version change and new migration evidence.

## Rollback

Rollback is adapter-local and restores the previous successful managed snapshot. Roll back the adapter whose generated assets changed; do not roll back the core or the other adapter unless its own state also changed.

```bash
node scripts/install-codex-adapter.mjs --target /path/to/project --rollback
node scripts/install-claude-adapter.mjs --target /path/to/project --rollback
```

Rollback restores managed assets and state. It does not claim that an external runtime stopped using already loaded instructions, and it does not delete project-owned event/report data.

## Detach

Detach removes one adapter's managed execution surfaces while preserving the core and the other adapter. Claude detach preserves project-owned local metrics, reports, and ledgers by default. Purging runtime data is a separate destructive operation and requires explicit project approval.

```bash
node scripts/install-codex-adapter.mjs --target /path/to/project --detach
node scripts/install-claude-adapter.mjs --target /path/to/project --detach
```

## Verification and evidence boundary

The repository fixture `scripts/test-adapter-runtime-migration.mjs` verifies current installer idempotence, profile expansion, rollback, pruned shrink, coexistence, detach isolation, and project-owned content preservation in a temporary repository. Existing Codex fixtures separately cover pre-compact prompt replacement and rollback.

These checks prove bounded installer behavior. They do not prove an external Claude or Codex process loaded the projected assets or applied canonical risk, evidence, approval, and verification semantics. Capture bounded runtime evidence before upgrading those claims.

## Checkpoint C handoff

Issue #171 should copy a frozen Checkpoint B/B2 config after this migration lands, retain the original baselines, and record the dual-runtime bundle digest. The Checkpoint C report must attribute architecture, model, CLI, adapter, and repository changes separately. It must not treat projection conformance as runtime effectiveness.
