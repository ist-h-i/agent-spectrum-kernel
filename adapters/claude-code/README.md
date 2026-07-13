# Claude Code Adapter

This adapter projects the core Agent Spectrum Kernel skills into Claude Code without changing the core `skills/` directory design.

Use the project-local adapter when you want short project commands such as `/skill-review` and local hook-based observability in one repository. Use the optional plugin package when the same entry points should be distributed across several projects or a team.

## What This Adapter Installs

The installer can copy:

- selected core skills into `.claude/skills/<skill>/SKILL.md`,
- command templates into `.claude/commands/`,
- managed project hook configuration into `.claude/settings.json`,
- local metrics and ledger runtime scripts into `scripts/`,
- refreshable command references into `docs/`,
- initialize-once project ledger state into `docs/`,
- the local observability config template into `docs/ai/observability-config.yml`.

The copied skills remain a projection of the canonical core skills in this repository. Update by rerunning the installer from a newer checkout of this repository. The default mode is three-way update safe: managed projections and refreshable references are updated only when the target still matches the previous managed hash, unless `--force` is used. Project-owned state and unrelated existing settings are preserved, and adapter-owned hook commands are replaced without duplication.

Hook source of truth:

- The project adapter writes managed hooks to `.claude/settings.json`.
- It no longer installs `.claude/hooks/hooks.json`.
- A legacy `.claude/hooks/hooks.json` is removed only when it contains adapter-owned hooks.
- Existing unrelated hooks in `.claude/settings.json` are preserved.

## Install

Install the core kernel first, then install the Claude adapter:

```bash
node scripts/install-kernel.mjs --target /path/to/adopting-project --merge-agents
node scripts/install-claude-adapter.mjs --target /path/to/adopting-project
```

Useful flags:

```bash
node scripts/install-claude-adapter.mjs --target /path/to/project --dry-run
node scripts/install-claude-adapter.mjs --target /path/to/project --profile daily
node scripts/install-claude-adapter.mjs --target /path/to/project --profile organizational
node scripts/install-claude-adapter.mjs --target /path/to/project --profile implementation
node scripts/install-claude-adapter.mjs --target /path/to/project --profile review
node scripts/install-claude-adapter.mjs --target /path/to/project --skip-hooks
node scripts/install-claude-adapter.mjs --target /path/to/project --skip-runtime
node scripts/install-claude-adapter.mjs --target /path/to/project --check
node scripts/install-claude-adapter.mjs --target /path/to/project --rollback
node scripts/install-claude-adapter.mjs --target /path/to/project --detach
```

The Claude adapter requires `.agent-spectrum-kernel/install-state.json` from the core installer. If the core state is missing, the adapter fails before writing `.claude/`.

The adapter records `.agent-spectrum-kernel/claude-install-state.json` with managed file hashes, managed hook identifiers, partial-file hashes for `.claude/settings.json`, selected profile, previous successful state, and rollback snapshot. `--prune` removes stale unmodified managed assets. `--detach` removes projected Claude execution surfaces and adapter-owned hooks while preserving metrics, reports, and ledgers by default.

The installer does not enable external publication. It does not create secrets, tokens, webhooks, or cloud telemetry destinations.

## Asset Lifecycle

- The core installer always owns every root immutable contract, independent of selected skills. Claude commands and selected skills declare them as required dependencies but never own or repair them; a missing or stale core contract stops adapter installation and requires a core reinstall. During migration, legacy Claude ownership records for these contracts are dropped without deleting the core-owned files.
- Other managed references such as schemas, README files, and fixed templates are refreshed from the ASK checkout on each install.
- Project-owned state such as `docs/ai/improvement-ledger.md` and `docs/ai/skill-adoption-metrics.md` is initialized only when absent. A later install, including `full` and `observability`, preserves existing content.
- `docs/ai/metrics/` and `docs/ai/reports/` are runtime directories only. The installer creates the directories but does not seed or replace event or report data.
- `--dry-run` labels each planned file operation as `refresh`, `initialize`, or `preserve`; runtime directories are reported separately.

## Profiles

Supported profiles:

| Profile | Installs |
|---|---|
| `daily` | Manifest `daily_delivery` pack: execution and control Skills, without durable knowledge lifecycle Skills. |
| `organizational` | Manifest `organizational_intelligence` pack: all three planes for explicitly authorized knowledge work. |
| `implementation` | Implementation, verification, and handoff commands plus implementation router closure. |
| `investigation` | Investigation, verification, and handoff commands plus bug-investigation router closure. |
| `review` | Review, verification, and handoff commands plus review gates. |
| `observability` | Report, ledger refresh, verification, and handoff commands plus local metrics/evaluation skills. |
| `full` | All manifest skills and all Claude project commands. This is the default. |

Profiles are closed over command requirements, skill dependencies, managed contract assets, and normal router-reachable routes for their task scope. `spec-driven-development` requires `work-package-compiler`; an advanced override that omits it fails before writes. For example, `implementation` includes routes such as `repository-orientation`, `scope-control`, `application-boundary-architecture`, `grill-design`, `grill-with-docs`, and `planning-with-files`. Durable domain-rule work requires an explicit knowledge-plane profile or advanced override.

Use `--skills <csv>` only as an advanced override. The installer fails before writing files if the override is not closed over the selected profile's commands and router-reachable skills.

## Installed Skills

The `full` and `organizational` profiles project all skills in `manifest.json`. `daily` projects the smaller manifest-governed daily pack. Other narrow profiles project only their closed task-scope subset. Availability never authorizes a knowledge write: ledger and memory updates remain explicit.

Pack profiles are strict projection boundaries. When changing from `full` or `organizational` to `daily`, rerun with `--prune`; without it the installer fails before writing so excluded Skills cannot remain discoverable. A locally modified excluded Skill makes prune fail and is preserved for manual resolution. Install state derives `selected_planes` and `installed_planes` from actual Skill sets; `--skills` is recorded as `selection_mode: custom`, and `selected_projection_pack` is set only for an exact pack match.

Legacy full workflow projection:

- `operating-mode-router`
- `skill-router`
- `next-best-change-finder`
- `requirement-grill`
- `work-package-compiler`
- `domain-rule-ledger`
- `engineering-pattern-ledger`
- `verification-pattern-ledger`
- `spec-driven-development`
- `controlled-implementation`
- `test-first-verification`
- `doubt-driven-development`
- `handoff-generation`
- `review-router`
- `review-automated-gate`
- `review-ai-quality`
- `review-code-health`
- `review-domain-impact`
- `review-to-rule-compiler`
- `review-finding-compiler`
- `review-architecture-impact`
- `architecture-decision-memory`
- `review-output-quality`
- `review-adversarial-risk`
- `review-final-merge-gate`
- `documentation-knowledge-compiler`
- `evidence-ledger`
- `risk-gate`
- `adr-review`
- `improvement-ledger`
- `skill-adoption-metrics`
- `engineering-capability-evaluation`

Claude Code project skills load from `.claude/skills/<skill-name>/SKILL.md` and can be invoked as `/skill-name`.

The Requirement-to-Rule Loop and full-layer intelligence skills are projected by default so teams can move from candidate discovery to Requirement Contract, Work Package, domain review, reusable implementation/verification/review/documentation/architecture memory, and capability evaluation without copying extra skill files manually. Projection only makes skills available; routing still loads them only when relevant.

## Project Commands

The project adapter installs local command templates for common daily workflows:

- `/skill-review`: layered PR or diff review through `review-router` and `review-final-merge-gate`.
- `/skill-implement`: scoped implementation through `skill-router`, `test-first-verification`, and `controlled-implementation`.
- `/skill-investigate`: bug, regression, performance, or unknown-root-cause work through `doubt-driven-development` and verification.
- `/skill-verify`: focused verification and evidence classification before readiness or correctness claims.
- `/skill-handoff`: executable next-task handoff through `handoff-generation`.
- `/skill-report`: local adoption/debt report generation from project-local evidence.
- `/skill-ledger-refresh`: improvement-ledger lifecycle refresh.

Commands route through the existing skill model. They do not bypass `risk-gate`, verification, or evidence requirements.

For non-trivial continuation, handoff, interrupted work, or risk-gated work, `/skill-handoff` may include the bounded resume state from `docs/agent-session-state-contract.md`. The adapter does not require session state for trivial or fully captured simple local tasks.

## Local Observability

Hooks are local-first. They record summarized facts only when a task boundary is available. Missing task boundary is treated as `skip` to avoid event spam.

Default local paths:

```text
docs/ai/observability-config.yml
ask-runtime/metrics/events.jsonl
docs/ai/reports/
```

The logical `ask-runtime/` store resolves under Git metadata (or `.agent-spectrum-kernel/runtime/` outside Git), so read-only workflows do not dirty the engineering working tree. The Stop hook validates the canonical Execution Envelope from `last_assistant_message`; command templates never write metrics directly. Missing or malformed results are skipped without changing the engineering decision. Same-result project/plugin hooks converge through an Envelope-digest event ID, while distinct results in one session remain separate. Before schema revalidation and persistence, free-text references and paths are removed or hashed so the runtime stores bounded structural metrics rather than assistant prose or identifiers. The runtime omits raw prompts, secrets, customer data, personal data, full file contents, and full command output by default.

Runtime and hook flags:

- `--skip-runtime` does not install local metrics runtime scripts and also skips/removes adapter-owned metrics hooks.
- `--skip-hooks` skips/removes adapter-owned metrics hooks but still installs runtime scripts.
- Plugin hooks resolve their wrapper through `${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record` and fail open when the project runtime is absent.

## Project Adapter and Plugin

The project adapter and optional plugin can be combined when a team wants shared plugin entry points and project-local commands/runtime in the same repository.

Operational boundary:

- Project adapter: owns `.claude/skills/`, `.claude/commands/`, `.claude/settings.json` managed hooks, local runtime scripts, and project-local metrics files.
- Plugin: owns plugin-packaged commands/hooks and resolves its metrics wrapper through `CLAUDE_PLUGIN_ROOT`.
- Local metrics recording requires the project runtime. Plugin hooks no-op when the project runtime is not present.
- Project and plugin Stop hooks may coexist: the runtime-owned collector uses deterministic event IDs and idempotent upsert to prevent duplicate local rows.

## GitHub Actions

GitHub Actions support is optional and lives under `adapters/claude-code/github-actions/`. It is a PR-sharing adapter for on-demand `@claude review`, not the default local observability path.
