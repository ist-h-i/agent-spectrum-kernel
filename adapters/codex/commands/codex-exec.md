# Codex Exec Command Templates

Use these examples from an adopting repository after projecting `AGENTS.md`, the required skills, and the selected prompt templates.

The installer generates a profile-limited `.agents/commands/codex-exec.md` in adopting repositories. This source template shows the full command family.

Run these commands from the adopting repository so that `scripts/codex-exec-runner.mjs` is the installed, managed runner for that repository.

After task classification, add `--gates-observed` when no task-specific gate is required, or repeat `--required-gate <id>` for each required gate. Without either evidence, the normalized event records `required_gate_observation` as missing. The review entry always records `review-final-merge-gate`; `--required-gate risk-gate` records missing specific-action approval and stops before invoking Codex.

## Implementation

```bash
node scripts/codex-exec-runner.mjs --prompt skill-implement.md --mode implementation --sandbox workspace-write --output codex-implementation.md
```

If the prompt file is not installed for the selected profile, rerun the installer with a profile that includes it. Do not substitute the unrendered source template because it lacks generated canonical provenance.

## Investigation

```bash
node scripts/codex-exec-runner.mjs --prompt skill-investigate.md --mode investigation --sandbox workspace-write
```

Start with reproduction and evidence gathering. Make local edits only after the cause and verification path are clear.

## Review

```bash
node scripts/codex-exec-runner.mjs --prompt skill-review.md --mode review --sandbox read-only --diff-base origin/main...HEAD --output codex-review.md
```

Treat this as diff-only review unless the command also provides the checked-out PR head, relevant docs, test results, and context required by the review gates.

## Verification

```bash
node scripts/codex-exec-runner.mjs --prompt skill-verify.md --mode verification --sandbox workspace-write
```

Use the repository's actual test, lint, build, or validation commands. Do not claim no regression from a template alone.

## Handoff

```bash
node scripts/codex-exec-runner.mjs --prompt skill-handoff.md --mode handoff --sandbox read-only
```

The runner performs local preflight, loads the generated compact prompt/profile,
invokes `codex exec`, captures final output, runs `ask-sensors`, and reports
requested contracts, required gates, projected contracts, runtime-loaded contracts, and applied
output-contract evidence separately. Workflow, risk/approval, and verification
application remain unavailable unless separately observed.
Codex-controlled Skill loading remains unavailable unless separately observed.
A passing sensor result is not proof of business correctness, product readiness,
or no regression.

Use this when a task needs a precise next-agent handoff with allowed scope, forbidden scope, expected output, verification, and stop condition.

## Safety Notes

- Use `read-only` for review or handoff when edits are not required.
- Use `workspace-write` only when implementation or verification needs local edits.
- Do not use `danger-full-access` unless the environment is isolated and the task explicitly requires it.
- Do not pass secrets as broad job-level environment variables.
- Do not chain this template to publish, deploy, release, send notifications, or mutate production state without `risk-gate` and explicit approval.
