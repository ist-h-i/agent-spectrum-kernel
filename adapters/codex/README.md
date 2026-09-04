# Codex Adapter

This adapter projects Agent Spectrum Kernel into Codex-compatible usage without creating a separate quality model.

Use this adapter when a repository wants Codex to follow the core kernel, route through the existing skills, and produce evidence-backed outputs from either an interactive Codex session or `codex exec`.

## What This Adapter Provides

- A Codex usage guide for `AGENTS.md`, repo skills, prompt templates, and `codex exec`.
- Generated compact runtime profiles for implementation, investigation, review, verification, and handoff entry prompts.
- A command template and runner showing bounded `codex exec` invocation patterns.
- A mapping from core skills to Codex execution style.
- A Codex adapter installer for `.agents/skills`, `.agents/prompts`, `.agents/commands`, and the local runner/sensor runtime used by the command template.
- Explicit evidence-level downgrades for projected-only workflows, unsupported automation, telemetry, hooks, and shared PR workflows.
- A shared Execution Envelope contract for routing, evidence state, stop reasons, and next actions at workflow boundaries.
- The canonical lifecycle artifact contract for Requirement, Spec, Work Package, Verification, Implementation, and compact artifact boundaries.

The Codex adapter installer projects Codex-specific files into another repository:

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-repo --merge-agents
node scripts/install-codex-adapter.mjs --target /path/to/adopting-repo
```

The core installer always owns `AGENTS.md` and the root immutable Execution Envelope and Lifecycle Artifact contracts, independent of selected skills. The Codex adapter updates profile-selected `.agents/skills`, `.agents/prompts`, `.agents/commands`, `scripts/codex-exec-runner.mjs`, the local sensor runtime used by that runner, and `.agent-spectrum-kernel/codex-install-state.json`. It records required core assets but never owns or repairs them; a missing or stale core contract stops installation and requires a core reinstall. It does not create hooks, telemetry, GitHub Actions, external publication, secrets, deploys, or releases.

## Codex Projection Model

Codex-compatible projection uses these surfaces:

| Core model | Codex surface | Adapter status |
|---|---|---|
| Always-on kernel | Repository `AGENTS.md` | `behavior_verified` for projection |
| Reusable workflows | Repo-scoped `.agents/skills/<skill>/SKILL.md` projections of canonical `skills/<name>/SKILL.md` | `behavior_verified` for projection; runtime skill loading remains Codex-controlled |
| Task commands | Prompt templates passed to Codex through `scripts/codex-exec-runner.mjs` | `executed` only after the runner captures output; business correctness remains unproven |
| Explicit entry routing | Direct primary contract selected by the compact profile; review retains `review-router` for one mandatory baseline and exact-signal additional-gate selection | `projected`; upper routers are skipped only because mode/task class is already fixed |
| Risk and evidence controls | `risk-gate`, `test-first-verification`, `ask.claim-evidence-status@1.0.0`, conditional `evidence-ledger` | Prompt controls are `projected`; ordinary claims use the shared status inline, a closed trigger selects the formal ledger, and a non-review `risk-gate` uses a runner-owned exact request/approval handshake before execution |
| Metrics / observability | Project-local metrics contract only when separately enabled | unsupported in this adapter; no Codex hook or telemetry integration is shipped |
| Shared PR automation | Codex GitHub Action or workflow defined by an adopting project | unsupported in this adapter; no workflow is provided here |

Codex documentation supports `AGENTS.md`, repo-scoped skills under `.agents/skills`, skills in CLI/IDE/app surfaces, and `codex exec` for non-interactive runs. This adapter uses those documented surfaces and avoids claiming parity with Claude-specific hooks or plugin packaging.

## Minimum Setup In An Adopting Repository

1. Run the core installer, then `node scripts/install-codex-adapter.mjs --target /path/to/adopting-repo`.
2. Use `--profile <name>` to choose a supported workflow profile. The default is `implementation`.
3. Rerun the installer after pulling this repository's updates.
4. From the adopting repository, use `.agents/commands/codex-exec.md` or call its installed `node ./scripts/codex-exec-runner.mjs --prompt <file>` directly.
5. Run repository-specific verification commands before claiming correctness, readiness, safety, reliability, or no regression.

## Workflow Profiles

Use profiles instead of arbitrary partial skill sets for normal installs:

| Profile | Intended use |
|---|---|
| `daily` | Manifest `daily_delivery` pack with execution and control Skills only. |
| `organizational` | Manifest `organizational_intelligence` pack with all three planes for explicit knowledge lifecycle work. |
| `minimal` | Verification and handoff without installing broad routing/review skills. |
| `implementation` | Default scoped implementation work. |
| `investigation` | Bug, regression, reliability, and unknown-root-cause work. |
| `review` | PR, diff, generated-output, and readiness review. |
| `adoption` | Project adoption and durable context setup. |
| `observability` | Skill effectiveness, adoption metrics, and capability evaluation. |
| `full` | All manifest skills and all Codex prompt templates. |

Each profile installs a closed command/prompt/skill/runtime/contract-asset set. Installed command examples only reference files present in the adopting repository. Selecting `spec-driven-development` requires `work-package-compiler`; advanced overrides that omit it fail before writes.

The `daily` and `organizational` profile skill lists are read from `manifest.json.projection_packs`. Both preserve `knowledge_write_policy: explicit_only`; installing a knowledge Skill does not authorize a ledger or memory update.

Pack profiles are strict projection boundaries. When changing from `full` or `organizational` to `daily`, rerun with `--prune`; without it the installer fails before writing so excluded Skills cannot remain discoverable. A locally modified excluded Skill makes prune fail and is preserved for manual resolution. Install state derives `selected_planes` and `installed_planes` from actual Skill sets; `--skills` is recorded as `selection_mode: custom`, and `selected_projection_pack` is set only for an exact pack match.

Named implementation and investigation profiles are compact explicit-entry projections: they install the primary workflow and critical verification/evidence/risk/handoff contracts without upper routers. `daily`, `organizational`, `adoption`, `observability`, and `full` retain routers where the entry intent is broader. Review retains `review-router`, always projects one `review-ai-quality` baseline, and lets exact observed signals select only additional gates. `review-final-merge-gate` runs last only with `--final-decision`. Durable domain-rule work requires an explicit knowledge-plane profile or advanced override.

Use `--skills <csv>` only as an advanced override. The override must include unconditional prompt/command requirements and dependencies of the specified skills. A conditional fixed-entry capability may be omitted; install state records it as `capability_missing`, and execution stops only if that trigger is selected. Other invalid combinations fail before any files are written.

## Prompt Templates

The source files below are adapter renderer inputs. After installation, use the generated `.agents/prompts/<name>` profile as the copy/paste or `codex exec` prompt so canonical provenance is retained:

- `prompts/skill-implement.md`
- `prompts/skill-investigate.md`
- `prompts/skill-review.md`
- `prompts/skill-verify.md`
- `prompts/skill-handoff.md`

The installer validates each source template against canonical Skill/contract inputs, selects the five mode-to-primary mappings from `schemas/fixed-entry-profile-registry.json`, generates critical controls and direct conditional contracts from `schemas/compact-profile-control-map.json`, binds the two exact registered candidate Asset tuples, embeds shared schema `1.2.0` provenance, and writes the generated compact profile to `.agents/prompts`. The same semantic registries feed Claude, while each adapter retains its own templates and headers. The generated profile invokes its fixed primary contract directly while preserving direct triggers for repository orientation, scope, boundary, design, docs/ADR, and long-running work where applicable. Missing selected capability stops as `capability_missing`; candidate registration is not activation. The adapter does not store raw prompts, secrets, customer data, personal data, full command output, or full file contents.

Prompt templates define entry intent, mutation level, evidence requirements, and output contract. They use `docs/lifecycle-artifact-contract.md` for lifecycle artifacts and the shared `docs/execution-envelope-contract.md` for one boundary-level control record. The managed runner requests a closed structured result, derives route from the compact profile, and persists ordinary control state as a bound sidecar; protected/handoff output is projected inline once. Direct copy/paste use is explicit inline compatibility. Implementation and verification outputs use one Contract plus Evidence artifact and keep `next_action` only in the Envelope.

For non-trivial continuation, handoff, interrupted work, or risk-gated work, handoff prompts may include bounded resume state when useful. The adapter does not require session state for trivial or fully captured simple local tasks.

## Stale Managed Files

The installer records managed skills, prompts, commands, and Codex runner runtime scripts in `.agent-spectrum-kernel/codex-install-state.json`.

Install state also records `compact_runtime_profiles`, per-prompt `compact_profile` metadata, and exact Asset refs. Prompt update, stale retention/prune, rollback, and detach use the existing managed prompt lifecycle, so profile provenance cannot outlive its managed prompt silently.

When a later install no longer selects a previously managed file, the installer reports it as stale and retains it by default. Use `--prune` to delete stale managed files only when the current file hash still matches the previous managed hash. Modified managed files are preserved and cause prune to fail before deletion.

## Capability Downgrades

This adapter is intentionally narrower than the Claude Code adapter.

- No hooks: do not claim automatic local metrics sidecar recording or automatic risk classification; the bounded runner blocks only a non-review-required risk gate or one derived from an exact observed review signal.
- No GitHub Actions workflow: do not claim shared PR review, fork guardrails, or comment-trigger support from this adapter.
- No hidden telemetry: the adapter ships prompt files and documentation only; any telemetry must be a separate, explicit project decision.
- No external publication: the adapter does not publish, comment, deploy, release, or notify externally.
- Runtime behavior: `codex-exec-runner.mjs` can report `executed` after `codex exec` returns a schema-valid result, the runner persists a profile-bound Envelope record, and `ask-sensors` accepts the record/output pair. Sensor pass is output-shape evidence, not a passed verification command. Missing structured authority never falls back to prose.
- Evidence stages: runner preflight separately checks root canonical source integrity and every selected `.agents/skills` Codex discovery asset/managed record/hash, including `lstat` rejection of a symlink in any path segment, before reporting projected profile bytes or runner-observed compact-profile load. It reports the fixed review baseline, exact-signal task gates, and requested-only final gate separately; absent additional-gate classification becomes missing `required_gate_observation`, never evidence that no additional gate is required. A non-review `risk-gate` requires a closed action descriptor. The first run emits a deterministic request and does not invoke Codex. A rerun executes only when a stable external approval file exactly embeds that request and matches the caller-trusted raw SHA256; action and approval are re-read immediately before spawn. The request binds a normalized credential-free logical identity derived from `remote.origin.url`, checkout/Git-directory identity, HEAD/tree, target scope, selected prompt/profile and fingerprints, composed base prompt, mode/sandbox, required gates, executor/output, risk gate, operation, effects, authority identity/revision/evidence digest, and canonical action/invocation/request digests. The logical repository ID must also match the closed action descriptor. The spawned prompt then adds the exact approved request, and `rendered_invocation_sha256` binds those final bytes. Exact approval does not bypass missing capability. Read-only risk review remains evaluation-only. Requested contracts and sensor-evidenced output-contract shape remain separate. Doctor remains static and never upgrades projection to runtime execution.

## Migration From Pre-Compact Prompts

After updating ASK, rerun the core installer and then the Codex adapter installer. The default three-way update replaces an unmodified managed prompt with its generated compact profile and refreshes provenance. A locally modified managed prompt is preserved and stops the update; review the diff and use `--force` only when replacement is intended. Profile shrink still requires `--prune`, while `--rollback` and `--detach` retain their existing safe managed-state behavior and preserve runtime-owned Envelope records. The managed runner rejects legacy prompts that lack compact-profile provenance or the structured-result runtime, so reinstall before the next `codex exec` run.

## Validation

This repository validates the Codex adapter paths through `scripts/validate-repo.mjs` and fixture coverage in `scripts/test-validate-repo.mjs`.

Run:

```bash
node scripts/test-validate-repo.mjs
node scripts/test-codex-runtime-profile.mjs
node scripts/validate-repo.mjs
```

The representative compact fixture calculates raw prompt bytes from immutable pre-compact assets under `docs/fixtures/codex-pre-compact-prompts/`. Route depth is calculated from `docs/fixtures/codex-compact-route-baseline.json` and counts sequential canonical stages; parallel risk/evidence overlays and signal-selected direct branches are checked separately. The five-entry set reduces the byte proxy from 11,371 to 11,275 and aggregate route depth from 15 to 11. Direct-trigger equivalence and all six required controls are fixture-checked.
