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

The adapters may coexist. Claude owns only the paths registered in its managed inventory under `.claude/`, the managed hook subset of `.claude/settings.json`, and its inventoried runtime files. Codex likewise owns only its managed inventory paths under `.agents/` and its inventoried runner files. Neither adapter owns either tree as a whole; non-managed project files nested below `.claude/` or `.agents/` must be preserved. The core installer remains the owner of the root Kernel, canonical Skills/contracts/schemas, the shared fixed-entry registry and control map, `scripts/json-schema-validation.mjs`, and `scripts/skill-effectiveness-outcome.mjs`. Adapter-owned Execution Envelope transport consumes the shared engine; selecting the Skill effectiveness evaluator additionally requires the semantic CLI. Adapter detach preserves both core runtime files.

## Compatibility matrix

| Existing state | Upgrade behavior | Stop condition | Recovery |
|---|---|---|---|
| Current managed files unchanged | Regenerate from current canonical inputs and refresh provenance. | None. | Rerun the same profile; generation is idempotent. |
| Pre-compact Codex managed prompt | Replace it with the generated compact profile and shared provenance. | Local prompt bytes differ from the recorded managed hash. | Review the local change, then explicitly use `--force` or preserve it outside the managed path. |
| Older Claude command-owned metrics sidecar | Commands no longer write task sidecars; the runtime-owned collector consumes the canonical Execution Envelope. | Required runtime or managed hooks are absent/modified. | Rerun the Claude installer; use `--skip-runtime` only when hooks are also intentionally removed. |
| Profile expansion | Add the newly selected managed assets. | Closure or canonical provenance validation fails. | Fix the selected profile/Skill closure and rerun. |
| Profile shrink | Requires `--prune` when excluded managed assets remain discoverable. | Modified excluded asset or omitted `--prune`. | Resolve the modified file, then rerun with `--prune`; do not silently retain it as selected capability. |
| Claude and Codex installed together | Preserve disjoint adapter ownership and independent state. | A path is claimed by both adapters or by the core. | Stop; correct the inventory contract before applying either projection. |
| Pre-#229 evidence projection | Regenerate ordinary commands with inline `ask.claim-evidence-status@1.0.0`; keep formal `evidence-ledger` installed but conditionally selected. | A copied taxonomy, missing contract revision, or unconditional ordinary-ledger route is detected. | Regenerate both projections and runtime fixtures; do not reinterpret or rewrite stored legacy artifacts in place. |
| Pre-#228 inline-only Envelope | Managed Codex migrates to a runner-owned bound record and ordinary `sidecar`; direct Codex and current Claude paths remain explicit `inline_required` compatibility. | Structured output, profile binding, record validation, or runtime-owned persistence is unavailable. | Reinstall the managed Codex runtime or remain explicitly inline. Never parse prose or silently upgrade a legacy inline payload to sidecar. |
| Pre-#231 formal-only verification projection | Regenerate commands and prompts with `ask.verification-proof-policy@1.0.0`; existing Formal Verification Contract artifacts remain byte-preserved and readable. | The projected policy ref or path differs, an unknown path appears, Compact Proof lacks complete eligibility, or formal is downgraded. | Regenerate both projections and runtime fixtures. Keep existing formal artifacts in place; do not rewrite selection history or execution evidence. |
| Pre-#230 optional semantic baseline review | Regenerate review entries with exactly one signal-independent `review-ai-quality` baseline, exact-signal additional gates, one shared finding contract, and requested-only last `review-final-merge-gate`. | Baseline is absent/duplicated, an additional gate has no exact signal, ordinary output emits skipped/category boilerplate, or an unrequested final Decision appears. | Regenerate both projections and runtime fixtures. Preserve historical review artifacts; do not reinterpret their gate execution or quality. |
| Pre-#233 schema-only Skill effectiveness projection | Rerun the core installer to add the shared Schema engine and semantic CLI before either adapter update. | Core runtime file or install-state hash/kind is missing or stale; selected Skill references a CLI unavailable from core. | Repair core with `install-kernel.mjs`, then rerun the adapter. Do not copy or let the adapter own a duplicate semantic runtime. |
| Pre-#232 independent fixed entries | Rerun the core installer, then both adapter installers. Claude commands/plugin Skills and Codex prompts are regenerated from one five-entry registry and one control map, with exact candidate Asset refs in schema `1.2.0` metadata. | Upper routers remain in a fixed entry, a placeholder or hand-maintained fallback remains, exact Asset identity drifts, or a selected direct-trigger contract is unavailable. | Regenerate from the registered source revision. Missing triggered capability must stop as `capability_missing`; never infer a substitute or activate the candidate Asset. |
| Pre-#230 optional semantic baseline review | Regenerate review entries with exactly one signal-independent `review-ai-quality` baseline, exact-signal additional gates, one shared finding contract, and requested-only last `review-final-merge-gate`. | Baseline is absent/duplicated, an additional gate has no exact signal, ordinary output emits skipped/category boilerplate, or an unrequested final Decision appears. | Regenerate both projections and runtime fixtures. Preserve historical review artifacts; do not reinterpret their gate execution or quality. |
| Pre-#230 optional semantic baseline review | Regenerate review entries with exactly one signal-independent `review-ai-quality` baseline, exact-signal additional gates, one shared finding contract, and requested-only last `review-final-merge-gate`. | Baseline is absent/duplicated, an additional gate has no exact signal, ordinary output emits skipped/category boilerplate, or an unrequested final Decision appears. | Regenerate both projections and runtime fixtures. Preserve historical review artifacts; do not reinterpret their gate execution or quality. |
| Pre-#229 evidence projection | Regenerate ordinary commands with inline `ask.claim-evidence-status@1.0.0`; keep formal `evidence-ledger` installed but conditionally selected. | A copied taxonomy, missing contract revision, or unconditional ordinary-ledger route is detected. | Regenerate both projections and runtime fixtures; do not reinterpret or rewrite stored legacy artifacts in place. |

Schema additions remain compatible only when older profile documents remain valid and downgrade behavior is not weakened. Capability ID removal/rename, changed downgrade meaning, or canonical ownership changes require a schema-version change and new migration evidence.

## Rollback

Rollback is adapter-local and restores the previous successful managed snapshot. Roll back the adapter whose generated assets changed; do not roll back the core or the other adapter unless its own state also changed.

```bash
node scripts/install-codex-adapter.mjs --target /path/to/project --rollback
node scripts/install-claude-adapter.mjs --target /path/to/project --rollback
```

Rollback restores managed assets and state. Rolling back a #231 projection restores
the prior formal-only prompt behavior; it does not downgrade or erase a formal
selection already made, reinterpret Compact Proof evidence, or rewrite an existing
Formal Verification Contract. More generally, rollback does not claim that an
external runtime stopped using already loaded instructions, and it does not delete
project-owned event/report data or content-addressed Execution Envelope records.

## Detach

Detach removes one adapter's managed execution surfaces while preserving the core and the other adapter. Claude detach preserves project-owned local metrics, reports, and ledgers by default; Codex detach preserves runtime-owned Envelope records. Purging runtime data is a separate destructive operation and requires explicit project approval.

```bash
node scripts/install-codex-adapter.mjs --target /path/to/project --detach
node scripts/install-claude-adapter.mjs --target /path/to/project --detach
```

## Verification and evidence boundary

The repository fixture `scripts/test-adapter-runtime-migration.mjs` verifies all selected fixed-entry metadata and exact Asset refs, current installer idempotence, profile expansion, rollback, pruned shrink, coexistence, detach isolation, and project-owned content preservation in a temporary repository. `scripts/test-fixed-entry-profiles.mjs` separately verifies the five shared primary mappings, six generated controls, direct triggers, fail-closed text, generated Claude project/plugin bytes, and deterministic byte/route-depth reduction. Existing Codex fixtures separately cover pre-compact prompt replacement and rollback.

For adapter-only maintenance that must not read benchmark handoff inputs, use `node scripts/adapter-runtime-bundle.mjs --check-adapters` (or `--write-adapters` when regeneration is intended). The full `--check` remains the repository-wide bundle gate and includes benchmark handoff inputs.

These checks prove bounded installer behavior. They do not prove an external Claude or Codex process loaded the projected assets or applied canonical risk, evidence, approval, and verification semantics. Capture bounded runtime evidence before upgrading those claims.

For #229, the repository additionally verifies deterministic projection selection between `inline` and `formal_ledger`. Existing lowercase and legacy evidence values are normalized read-only under `docs/claim-evidence-status-contract.md`; migration must not upgrade `weak` to `Verified`, broaden the #276 Asset observation subset, or treat Skill installation as task activation.

For #231, `scripts/test-verification-proof-policy.mjs` verifies the closed two-path
selection policy, Compact Proof result binding, protected-claim rejection,
monotonic compact-to-formal upgrade, exact legacy-formal fixture bytes, and the
bounded 97-byte versus 287-byte artifact-shape proxy, plus the separate 1944-byte
generated Codex verification prompt versus its immutable 2291-byte pre-compact
fixture. Adapter conformance verifies the same selected path across current Claude
and Codex projections. These static and local checks do not establish that an
external runtime loaded the projection, nor do the byte counts establish token,
latency, quality, or effectiveness gains.

For #230, `scripts/test-review-route.mjs` verifies baseline cardinality, exact
signal-to-additional-gate routing, requested-only final-gate ordering, missing
evidence handling, and the shared finding fields/order. Cross-adapter conformance
verifies the same projected baseline route for Claude and Codex. These checks prove
the review mechanism contract only; they do not establish review quality, value,
or a physical model-invocation count.

For #230, `scripts/test-review-route.mjs` verifies baseline cardinality, exact
signal-to-additional-gate routing, requested-only final-gate ordering, missing
evidence handling, and the shared finding fields/order. Cross-adapter conformance
verifies the same projected baseline route for Claude and Codex. These checks prove
the review mechanism contract only; they do not establish review quality, value,
or a physical model-invocation count.

For #230, `scripts/test-review-route.mjs` verifies baseline cardinality, exact
signal-to-additional-gate routing, requested-only final-gate ordering, missing
evidence handling, and the shared finding fields/order. Cross-adapter conformance
verifies the same projected baseline route for Claude and Codex. These checks prove
the review mechanism contract only; they do not establish review quality, value,
or a physical model-invocation count.

For #229, the repository additionally verifies deterministic projection selection between `inline` and `formal_ledger`. Existing lowercase and legacy evidence values are normalized read-only under `docs/claim-evidence-status-contract.md`; migration must not upgrade `weak` to `Verified`, broaden the #276 Asset observation subset, or treat Skill installation as task activation.

## Checkpoint C handoff

Issue #171 should copy a frozen Checkpoint B/B2 config after this migration lands, retain the original baselines, and record the dual-runtime bundle digest. The Checkpoint C report must attribute architecture, model, CLI, adapter, and repository changes separately. It must not treat projection conformance as runtime effectiveness.
