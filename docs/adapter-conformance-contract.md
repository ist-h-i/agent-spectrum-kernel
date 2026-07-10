# Agent Spectrum Kernel Adapter Conformance Contract

Adapters project Agent Spectrum Kernel into a specific coding tool without changing the core quality model. An adapter may be a local project projection, plugin, command set, or hosted workflow template.

Deployment profile support, Installed/Activated/Operational state criteria, approval ownership, metrics governance, and withdrawal criteria are defined in `docs/adapter-deployment-governance.md`. Passing this conformance contract does not by itself prove a deployment is Operational.

## Core Requirement

Every adapter must preserve these core behaviors or explicitly downgrade its claims:

| Area | Required behavior |
|---|---|
| File projection | Kernel and selected `skills/<name>/SKILL.md` files remain traceable to this repository's canonical files. |
| Invocation model | Local commands or tool entry points route through `operating-mode-router`, `skill-router`, or the named specific skill instead of duplicating workflow logic. |
| Review route support | A review-oriented adapter provides every gate referenced by `review-router` and `review-final-merge-gate`, including automated, AI-quality, domain, architecture, output-quality, adversarial-risk, evidence, ADR, risk, improvement-ledger, and adoption-metrics support. |
| Risk gate behavior | Destructive, irreversible, external, production, credential, auth, dependency, migration, billing, email, or infra-impacting actions require `risk-gate` before action. |
| Evidence output | Final outputs separate verified evidence, supported claims, hypotheses, unknowns, and residual risk. Unsupported readiness or no-regression claims are downgraded. |
| Verification | Behavior changes define an observable verification path before completion claims. |
| Metrics boundary | Metrics are opt-in summaries only. Raw prompts, secrets, customer data, personal data, full file contents, and full command output are omitted by default. |
| Privacy / publication | Local storage is the default. External publication, webhooks, telemetry, or cloud destinations require explicit approval and project policy. |

## Capability Levels

Use these values in adapter matrices and reviews:

| Level | Meaning |
|---|---|
| projected | Repository evidence shows the adapter projects files, commands, prompts, hooks, or workflow assets. |
| runtime_detected | Local smoke checks can see the installed runtime surface and required local files. |
| executed | A bounded adapter runner executed and captured output, but correctness remains unproven. |
| behavior_verified | Repository fixtures or local checks verify the stated behavior for this capability. |
| unsupported | Repository evidence shows the adapter does not implement the capability. |
| unknown | The capability was not verified from repository evidence. |

File projection must not be treated as proof of runtime execution. Unsupported, unknown, or lower-than-claimed capabilities must not be simulated in language. The adapter must either stop, route to a safer manual step, or mark the output as insufficient evidence for that capability.

## Required Checks For Future Adapters

Future adapters should add validation or fixture coverage for:

- required projected skills and commands,
- no hidden telemetry or external publication by default,
- risk-gate language on risky actions,
- review gate completeness,
- local command routing through existing skills,
- metrics event schema compatibility when metrics are emitted,
- documentation of unsupported or unknown capabilities,
- upgrade/idempotence behavior when the adapter modifies project-local settings.

## Runtime Probe Boundary

`ask-doctor --runtime-probe` is an optional local/static/dry-run confidence check for projected adapter surfaces. It may inspect command/template directories, projected `SKILL.md` files, adapter config shape, static project-overlay contradictions, and docs that reference command/template paths.

Runtime probe output is not a per-task gate and is not proof of real Claude, Codex, GitHub Actions, network, deployment, or product/client-value execution. Failures downgrade runtime conformance/readiness claims only; installation health remains a separate doctor result. `adapter-runtime-smoke.mjs` is the explicit local smoke path for write checks such as Claude event-store writability. `codex-exec-runner.mjs` is the explicit Codex execution path; it can reach `executed` after captured output passes `ask-sensors`, but it still does not prove business correctness.

## Evidence Status

Verified in this repository:

- The generic core installer can project and update `AGENTS.md`, `CUSTOM_INSTRUCTIONS.md`, and canonical `skills/<name>/SKILL.md` files while preserving existing `AGENTS.md` content through a managed block.
- The Claude Code project adapter has installer, command, hook, runtime, and Pattern B GitHub Actions templates.
- The Codex adapter has a local installer for `.agents/skills`, `.agents/prompts`, `.agents/commands`, README guidance, repo skill projection guidance, prompt templates, a bounded `codex exec` runner, and explicit evidence-level capability downgrades.
- Static and fixture validation checks the shared installer lifecycle module, install-state schema v3, in-progress marker detection, managed block ownership, managed partial-file rollback conflicts, local modification conflicts, `--force`, stale pruning, rollback, and detach.
- Static and fixture validation checks the generic core installer, install state output, dry-run/check behavior, managed `AGENTS.md` merge behavior, stale skill reporting, hash-checked managed-file pruning, rollback, detach, and local file preservation in stale skill directories.
- Static and fixture validation checks the Codex adapter installer, Codex install state output, dry-run/check behavior, managed `AGENTS.md` merge/skip behavior, profile-selected `.agents/skills` projection, prompt/command projection, skill and router-reachability closure failures, installed-reference integrity, stale skill/prompt/command reporting, hash-checked managed-file pruning, rollback, detach, and local file preservation in stale skill directories.
- Static and fixture validation checks the Claude adapter installer, Claude install state output, core-install-state precondition, supported profiles, command and router-reachability closure failures, command-required asset projection, local modification conflicts, partial `.claude/settings.json` rollback conflicts, `--force`, `--rollback`, `--detach`, `--skip-runtime` hook suppression, `.claude/settings.json` hook source of truth, managed hook replacement/removal, plugin hook wrapper resolution, local observability defaults, and Pattern B guardrails.
- Fixture validation checks the Codex runner with captured pass and insufficient-evidence outputs, plus Claude runtime smoke event-store writing and missing-runtime failures.
- Static validation checks the presence of required Codex adapter paths.

Unknown:

- Runtime behavior inside each external tool after users copy or modify adapter assets.
- Whether an adopting Codex repository copied the expected skills or ran the prompt templates against the intended workspace, diff, PR head, and verification commands.
- Capabilities of tools without adapters in this repository.
