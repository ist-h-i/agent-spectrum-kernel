# Agent Spectrum Kernel Adapter Conformance Contract

Adapters project Agent Spectrum Kernel into a specific coding tool without changing the core quality model. An adapter may be a local project projection, plugin, command set, or hosted workflow template.

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
| supported | Direct repository evidence shows the adapter implements the capability. |
| partial | Repository evidence shows a bounded implementation, but manual setup, local policy, or known limits remain. |
| unsupported | Repository evidence shows the adapter does not implement the capability. |
| unknown | The capability was not verified from repository evidence. |

Unsupported or unknown capabilities must not be simulated in language. The adapter must either stop, route to a safer manual step, or mark the output as insufficient evidence for that capability.

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

Runtime probe output is not a per-task gate and is not proof of real Claude, Codex, GitHub Actions, network, deployment, or product/client-value execution. Failures downgrade runtime conformance/readiness claims only; installation health remains a separate doctor result.

## Evidence Status

Verified in this repository:

- The generic core installer can project and update `AGENTS.md`, `CUSTOM_INSTRUCTIONS.md`, and canonical `skills/<name>/SKILL.md` files while preserving existing `AGENTS.md` content through a managed block.
- The Claude Code project adapter has installer, command, hook, runtime, and Pattern B GitHub Actions templates.
- The Codex adapter has a local installer for `.agents/skills`, `.agents/prompts`, `.agents/commands`, README guidance, repo skill projection guidance, prompt templates, a `codex exec` command template, and explicit unsupported/partial capability downgrades.
- Static and fixture validation checks the generic core installer, install state output, dry-run behavior, managed `AGENTS.md` merge behavior, stale skill reporting, hash-checked managed-file pruning, and local file preservation in stale skill directories.
- Static and fixture validation checks the Codex adapter installer, Codex install state output, dry-run behavior, managed `AGENTS.md` merge/skip behavior, profile-selected `.agents/skills` projection, prompt/command projection, skill and router-reachability closure failures, installed-reference integrity, stale skill/prompt/command reporting, hash-checked managed-file pruning, and local file preservation in stale skill directories.
- Static validation checks the presence of required Claude adapter paths, default review skill projection, command template projection, local observability defaults, and Pattern B guardrails.
- Static validation checks the presence of required Codex adapter paths.

Unknown:

- Runtime behavior inside each external tool after users copy or modify adapter assets.
- Whether an adopting Codex repository copied the expected skills or ran the prompt templates against the intended workspace, diff, PR head, and verification commands.
- Capabilities of tools without adapters in this repository.
