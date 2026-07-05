# Example: Claude Adapter Adoption

Goal: install the Claude Code adapter while keeping core skills tool-agnostic.

## Request

```text
Claude Code 用にこのskill setを導入してください。
core skillsは変更せず、scripts/install-claude-adapter.mjs で .claude/skills と commands/hooks をproject-localに投影してください。
local hooksは docs/ai/observability-config.yml を使い、raw prompt、secret、customer data、personal data、full file contents、full command output、external publication は既定offにしてください。
GitHub Actionsは有効化せず、Pattern B @claude review は必要時のoptional adapterとしてdocsだけ確認してください。
```

## Expected Route

```text
operating-mode-router -> adoption_bootstrap when this is first-time rollout
project-adoption-pack-generation for project-specific context
install-claude-adapter.mjs for project-local projection
risk-gate before enabling GitHub Actions, secrets, external publication, or team-wide plugin distribution
```

## Verification

```bash
node scripts/install-claude-adapter.mjs --target /tmp/example-project --dry-run
node scripts/ai-metrics-record.mjs --task-id TASK-1 --task-type validation --event-kind verification_attempt --dry-run --print-result
node scripts/validate-repo.mjs
```

## Boundary

- Core skills remain the source of truth.
- Claude-specific syntax stays under `adapters/claude-code/`.
- Local metrics stay project-local by default.
- Pattern B `@claude review` is optional and user-triggered, not always-on.
