# Claude Code Adapter

This adapter projects the core Agent Spectrum Kernel skills into Claude Code without changing the core `skills/` directory design.

Use the project-local adapter when you want short project commands such as `/review-router` and local hook-based observability in one repository. Use the optional plugin package when the same entry points should be distributed across several projects or a team.

## What This Adapter Installs

The installer can copy:

- selected core skills into `.claude/skills/<skill>/SKILL.md`,
- command templates into `.claude/commands/`,
- hook configuration into `.claude/hooks/hooks.json`,
- local metrics and ledger runtime scripts into `scripts/`,
- the local observability config template into `docs/ai/observability-config.yml`.

The copied skills remain a projection of the canonical core skills in this repository. Update by rerunning the installer from a newer checkout of this repository. The default mode is upgrade-safe: projected files are overwritten from the current checkout, unrelated existing settings are preserved, and adapter hook commands are merged without duplication.

## Install

From this repository:

```bash
node scripts/install-claude-adapter.mjs --target /path/to/adopting-project
```

Useful flags:

```bash
node scripts/install-claude-adapter.mjs --target /path/to/project --dry-run
node scripts/install-claude-adapter.mjs --target /path/to/project --skip-hooks
node scripts/install-claude-adapter.mjs --target /path/to/project --skip-runtime
```

The installer does not enable external publication. It does not create secrets, tokens, webhooks, or cloud telemetry destinations.

## Installed Skills

Default workflow projection:

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

## Local Observability

Hooks are local-first. They record summarized facts only when a task boundary is available. Missing task boundary is treated as `skip` to avoid event spam.

Default local paths:

```text
docs/ai/observability-config.yml
docs/ai/metrics/events.jsonl
docs/ai/reports/
```

The runtime omits raw prompts, secrets, customer data, personal data, full file contents, and full command output by default.

## GitHub Actions

GitHub Actions support is optional and lives under `adapters/claude-code/github-actions/`. It is a PR-sharing adapter for on-demand `@claude review`, not the default local observability path.
