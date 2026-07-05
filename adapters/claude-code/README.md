# Claude Code Adapter

This adapter projects the core AI Coding Kernel skills into Claude Code without changing the core `skills/` directory design.

Use the project-local adapter when you want short project commands such as `/review-router` and local hook-based observability in one repository. Use the optional plugin package when the same entry points should be distributed across several projects or a team.

## What This Adapter Installs

The installer can copy:

- selected core skills into `.claude/skills/<skill>/SKILL.md`,
- command templates into `.claude/commands/`,
- hook configuration into `.claude/hooks/hooks.json`,
- local metrics and ledger runtime scripts into `scripts/`,
- the local observability config template into `docs/ai/observability-config.yml`.

The copied skills remain a projection of the canonical core skills in this repository. Update by rerunning the installer from a newer checkout of this repository.

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

First version:

- `review-router`
- `review-final-merge-gate`
- `review-code-health`
- `review-architecture-impact`
- `review-output-quality`
- `review-adversarial-risk`
- `skill-adoption-metrics`
- `improvement-ledger`
- `risk-gate`

Claude Code project skills load from `.claude/skills/<skill-name>/SKILL.md` and can be invoked as `/skill-name`.

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
