# Codex Exec Command Templates

Use these examples from an adopting repository after projecting `AGENTS.md` and the required skills.

## Implementation

```bash
codex exec --sandbox workspace-write --output-last-message codex-implementation.md "$(cat adapters/codex/prompts/skill-implement.md)"
```

If the prompt file is not in the adopting repository, paste the template text directly into Codex or provide an equivalent local path.

## Review

```bash
git diff --patch origin/main...HEAD | codex exec --sandbox read-only "$(cat adapters/codex/prompts/skill-review.md)"
```

Treat this as diff-only review unless the command also provides the checked-out PR head, relevant docs, test results, and context required by the review gates.

## Verification

```bash
codex exec --sandbox workspace-write "$(cat adapters/codex/prompts/skill-verify.md)"
```

Use the repository's actual test, lint, build, or validation commands. Do not claim no regression from a template alone.

## Handoff

```bash
codex exec --sandbox read-only "$(cat adapters/codex/prompts/skill-handoff.md)"
```

Use this when a task needs a precise next-agent handoff with allowed scope, forbidden scope, expected output, verification, and stop condition.

## Safety Notes

- Use `read-only` for review or handoff when edits are not required.
- Use `workspace-write` only when implementation or verification needs local edits.
- Do not use `danger-full-access` unless the environment is isolated and the task explicitly requires it.
- Do not pass secrets as broad job-level environment variables.
- Do not chain this template to publish, deploy, release, send notifications, or mutate production state without `risk-gate` and explicit approval.
