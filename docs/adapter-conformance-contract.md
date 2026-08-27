# Agent Spectrum Kernel Adapter Conformance Contract

Adapters project Agent Spectrum Kernel into a specific coding tool without changing the core quality model. An adapter may be a local project projection, plugin, command set, or hosted workflow template.

Deployment profile support, Installed/Activated/Operational state criteria, approval ownership, metrics governance, and withdrawal criteria are defined in `docs/adapter-deployment-governance.md`. Passing this conformance contract does not by itself prove a deployment is Operational.

## Core Requirement

Every adapter must preserve these core behaviors or explicitly downgrade its claims:

| Area | Required behavior |
|---|---|
| File projection | Kernel and selected `skills/<name>/SKILL.md` files remain traceable to this repository's canonical files. |
| Invocation model | Ambiguous entries route through `operating-mode-router` / `skill-router`; entries with fixed mode/task class may invoke the named specific Skill directly when critical canonical controls remain self-contained and provenance-validated. |
| Review route support | A review-oriented adapter projects exactly one signal-independent `review-ai-quality` baseline, exact-signal additional gates, one shared finding contract, and requested-only last `review-final-merge-gate` authority. It provides the automated, domain, architecture, output-quality, adversarial-risk, code-health, evidence, ADR, risk, improvement-ledger, and adoption-metrics support referenced by that route. |
| Risk gate behavior | Destructive, irreversible, external, production, credential, auth, dependency, migration, billing, email, or infra-impacting actions require `risk-gate` before action. |
| Evidence output | Final outputs use exactly Verified, Supported, Hypothesis, Unknown, and Falsified for claim truth. Ordinary work applies them inline; a formal Evidence Ledger appears only for a closed `ask.claim-evidence-status@1.0.0` audit trigger. Unsupported readiness or no-regression claims are downgraded. |
| Execution Envelope | One owner produces one canonical control payload. Managed ordinary output may use a profile-bound sidecar; protected/handoff output is visible exactly once. Adapters without structured ownership stay explicit inline compatibility and never infer control from prose. |
| Shared semantic runtime | The core installer owns the shared JSON Schema engine and Skill effectiveness semantic CLI as immutable runtime. Every Execution Envelope adapter requires the shared engine; a profile selecting `skill-effectiveness-evaluation` also requires the CLI. Adapters consume but never own, prune, detach, or fork these paths. |
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
- mandatory baseline, exact-signal additional-gate, shared-finding, and requested-final-gate completeness,
- local command routing through existing skills,
- metrics event schema compatibility when metrics are emitted,
- documentation of unsupported or unknown capabilities,
- upgrade/idempotence behavior when the adapter modifies project-local settings.

Claude and Codex additionally share `docs/fixtures/adapter-cross-conformance.json`. The runner evaluates the exact required twelve scenarios and exact Adapter set against both generated projection plans. It derives normalized meaning independently from generated Claude and Codex bytes, verifies exact registered Asset binding, validates each derived event against the shared schema, compares the results, and permits different internal traces. The comparison includes projected `inline` versus `formal_ledger` selection, a direct verification entry, an available triggered secondary contract, and an unavailable triggered contract that stops as `capability_missing`. Empty Adapter sets, substituted scenario IDs, missing expectations, schema-reference or Asset-reference drift, missing contract minimums, unconditional ledger activation, missing fail-closed behavior, and approval/stop or formal-route byte mutations fail closed. A projected pass proves these projection controls only; runtime loading, application, and behavioral conformance remain unavailable until separately captured.

## Runtime Probe Boundary

`ask-doctor --runtime-probe` is an optional local/static/dry-run confidence check for projected adapter surfaces. It may inspect command/template directories, projected `SKILL.md` files, adapter config shape, static project-overlay contradictions, and docs that reference command/template paths.

Runtime probe output is not a per-task gate and is not proof of real Claude, Codex, GitHub Actions, network, deployment, or product/client-value execution. Failures downgrade runtime conformance/readiness claims only; installation health remains a separate doctor result. `adapter-runtime-smoke.mjs` is the explicit local smoke path for write checks such as Claude event-store writability. `codex-exec-runner.mjs` is the explicit Codex execution path; it can reach `executed` after a bound record and captured output pass `ask-sensors`, but sensor pass is not command-result or business-correctness evidence.

## Evidence Status

Verified in this repository:

- The generic core installer can project and update `AGENTS.md`, `CUSTOM_INSTRUCTIONS.md`, canonical `skills/<name>/SKILL.md`, immutable contracts/schemas, and the shared Schema/Skill-effectiveness runtime while preserving existing `AGENTS.md` content through a managed block.
- The Claude Code project adapter has installer, command, hook, runtime, and Pattern B GitHub Actions templates.
- The Codex adapter has a local installer for `.agents/skills`, `.agents/prompts`, `.agents/commands`, README guidance, repo skill projection guidance, prompt templates, a bounded `codex exec` runner, and explicit evidence-level capability downgrades.
- Static and fixture validation checks the shared installer lifecycle module, install-state schema v3, in-progress marker detection, managed block ownership, managed partial-file rollback conflicts, local modification conflicts, `--force`, stale pruning, rollback, and detach.
- Static and fixture validation checks the generic core installer, install state output, dependency-complete immutable runtime projection, installed semantic CLI behavior, missing/stale runtime rejection, dry-run/check behavior, managed `AGENTS.md` merge behavior, stale skill reporting, hash-checked managed-file pruning, rollback, detach, and local file preservation in stale skill directories.
- Static and fixture validation checks the Codex adapter installer, Codex install state output, dry-run/check behavior, managed `AGENTS.md` merge/skip behavior, profile-selected `.agents/skills` projection, prompt/command projection, skill and router-reachability closure failures, installed-reference integrity, stale skill/prompt/command reporting, hash-checked managed-file pruning, rollback, detach, and local file preservation in stale skill directories.
- Static and fixture validation checks the Claude adapter installer, Claude install state output, core-install-state precondition, supported profiles, command and router-reachability closure failures, command-required asset projection, local modification conflicts, partial `.claude/settings.json` rollback conflicts, `--force`, `--rollback`, `--detach`, `--skip-runtime` hook suppression, `.claude/settings.json` hook source of truth, managed hook replacement/removal, plugin hook wrapper resolution, local observability defaults, and Pattern B guardrails.
- Fixture validation checks the Codex runner with captured pass and insufficient-evidence outputs, plus Claude runtime smoke event-store writing and missing-runtime failures.
- Fixture validation checks the Claude runtime-owned collector against the canonical Execution Envelope, including summarizer-visible session task segmentation, PostToolUse/candidate-Stop aggregation, concurrent duplicate-hook idempotency, same-Envelope separation across later transcript turns and process restarts, expiry of duplicate claims, missing/malformed/invalid Stop boundary closure, bounded and lock-protected session-state eviction, safe generation restart after eviction, controlled signal preservation, controlled gate-reason semantics, 49/50 reference-count boundaries, configured path limits at 50/51/100/negative/non-numeric values, write/update/skip, malformed input, structural privacy projection, final schema validation, concurrent health updates, persistence failure isolation, and a clean read-only Git working tree. Doctor fixtures cover merged legacy/runtime-owned health resolution and legacy-only error recovery into the runtime-owned log.
- Same-fixture projection conformance checks localized implementation, new behavior with verification, unknown-root-cause investigation, selective PR review, approval-required destructive/external action, missing repository/diff/test evidence, handoff/resume, explicit knowledge promotion, and a lightweight no-agent path for both adapters.
- Temporary-repository migration fixtures check dual installation, idempotent regeneration, profile expansion, adapter-local rollback, pruned shrink, coexistence, detach isolation, and project-owned content preservation.
- Static validation checks the presence of required Codex adapter paths.

Unknown:

- Runtime invocation inside each external tool after users copy or modify adapter assets. Repository fixtures verify bounded adapter behavior but do not prove an adopting installation invoked it.
- Whether an adopting Codex repository copied the expected skills or ran the prompt templates against the intended workspace, diff, PR head, and verification commands.
- Capabilities of tools without adapters in this repository.
