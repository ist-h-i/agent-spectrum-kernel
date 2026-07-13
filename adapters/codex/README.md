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
| Explicit entry routing | Direct primary contract selected by the compact profile; review retains `review-router` for signal-to-gate selection | `projected`; upper routers are skipped only because mode/task class is already fixed |
| Risk and evidence gates | `risk-gate`, `test-first-verification`, `evidence-ledger` | `projected`; preserved in prompts, not mechanically enforced by this adapter |
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

Named implementation and investigation profiles are compact explicit-entry projections: they install the primary workflow and critical verification/evidence/risk/handoff contracts without upper routers. `daily`, `organizational`, `adoption`, `observability`, and `full` retain routers where the entry intent is broader. Review retains the review-router gate family because observed change signals still determine required gates. Durable domain-rule work requires an explicit knowledge-plane profile or advanced override.

Use `--skills <csv>` only as an advanced override. The override must include all required skills for installed prompt templates, command templates, router-reachable routes, and dependencies of the specified skills. Invalid combinations fail before any files are written.

## Prompt Templates

The source files below are adapter renderer inputs. After installation, use the generated `.agents/prompts/<name>` profile as the copy/paste or `codex exec` prompt so canonical provenance is retained:

- `prompts/skill-implement.md`
- `prompts/skill-investigate.md`
- `prompts/skill-review.md`
- `prompts/skill-verify.md`
- `prompts/skill-handoff.md`

The installer validates each source template against canonical Skill/contract inputs, generates critical controls and direct conditional contracts from `schemas/compact-profile-control-map.json`, embeds the shared adapter profile revision/digest provenance, and writes the generated compact profile to `.agents/prompts`. The generated profile invokes its fixed primary contract directly while preserving direct triggers for repository orientation, scope, boundary, design, docs/ADR, and long-running work where applicable. It does not store raw prompts, secrets, customer data, personal data, full command output, or full file contents.

Prompt templates define entry intent, mutation level, evidence requirements, and output contract. They use `docs/lifecycle-artifact-contract.md` for lifecycle artifacts and the shared `docs/execution-envelope-contract.md` for one boundary-level control record. Implementation and verification outputs use one Contract plus Evidence record and keep `next_action` only in the Envelope.

For non-trivial continuation, handoff, interrupted work, or risk-gated work, handoff prompts may include bounded resume state when useful. The adapter does not require session state for trivial or fully captured simple local tasks.

## Stale Managed Files

The installer records managed skills, prompts, commands, and Codex runner runtime scripts in `.agent-spectrum-kernel/codex-install-state.json`.

Install state also records `compact_runtime_profiles` and per-prompt `compact_profile` metadata. Prompt update, stale retention/prune, rollback, and detach use the existing managed prompt lifecycle, so profile provenance cannot outlive its managed prompt silently.

When a later install no longer selects a previously managed file, the installer reports it as stale and retains it by default. Use `--prune` to delete stale managed files only when the current file hash still matches the previous managed hash. Modified managed files are preserved and cause prune to fail before deletion.

## Capability Downgrades

This adapter is intentionally narrower than the Claude Code adapter.

- No hooks: do not claim automatic local metrics sidecar recording or mechanical risk-gate enforcement.
- No GitHub Actions workflow: do not claim shared PR review, fork guardrails, or comment-trigger support from this adapter.
- No hidden telemetry: the adapter ships prompt files and documentation only; any telemetry must be a separate, explicit project decision.
- No external publication: the adapter does not publish, comment, deploy, release, or notify externally.
- Runtime behavior: `codex-exec-runner.mjs` can report `executed` after `codex exec` returns output and `ask-sensors` passes. It must still report `insufficient_evidence` when the workspace, diff, PR head, tests, or required command results are unavailable.
- Evidence stages: runner preflight separately checks root canonical source integrity and every selected `.agents/skills` Codex discovery asset/managed record/hash before reporting projected profile bytes or runner-observed compact-profile load. It then reports requested contracts, unavailable Codex Skill-load evidence, and sensor-evidenced output-contract shape separately. Workflow, risk/approval, and verification application remain unavailable unless separately observed. Doctor remains static and never upgrades projection to runtime execution.

## Migration From Pre-Compact Prompts

After updating ASK, rerun the core installer and then the Codex adapter installer. The default three-way update replaces an unmodified managed prompt with its generated compact profile and refreshes provenance. A locally modified managed prompt is preserved and stops the update; review the diff and use `--force` only when replacement is intended. Profile shrink still requires `--prune`, while `--rollback` and `--detach` retain their existing safe managed-state behavior. The managed runner rejects legacy prompts that lack compact-profile provenance, so reinstall before the next `codex exec` run.

## Validation

This repository validates the Codex adapter paths through `scripts/validate-repo.mjs` and fixture coverage in `scripts/test-validate-repo.mjs`.

Run:

```bash
node scripts/test-validate-repo.mjs
node scripts/test-codex-runtime-profile.mjs
node scripts/validate-repo.mjs
```

The representative compact fixture calculates raw prompt bytes from immutable pre-compact assets under `docs/fixtures/codex-pre-compact-prompts/`. Route depth is calculated from `docs/fixtures/codex-compact-route-baseline.json` and counts sequential canonical stages; parallel risk/evidence overlays and signal-selected direct branches are checked separately. The five-entry set reduces the byte proxy from 11,371 to 11,275 and aggregate route depth from 15 to 11. Direct-trigger equivalence and all six required controls are fixture-checked.
