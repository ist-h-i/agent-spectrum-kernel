# AI Skills Claude Plugin

This optional plugin packages stable Claude Code entry points for Agent Spectrum Kernel.

Use the project-local adapter when one repository needs short commands such as `/review-router`. Use this plugin when a team wants namespaced commands such as `/ai-skills:review-pr` across multiple repositories.

## Entry Points

- `/ai-skills:review-pr`
- `/ai-skills:adoption-report`
- `/ai-skills:ledger-refresh`
- `/ai-skills:implementation-context-check`

The plugin remains an adapter. Core skills in `skills/*/SKILL.md` remain the source of truth.

## Local-First Hooks

The bundled hook config records only summarized project-local events by delegating to project runtime scripts when present. It does not enable HTTP hooks, webhook hooks, external publication, raw prompt storage, or credential handling.

Plugin hooks invoke `${CLAUDE_PLUGIN_ROOT}/bin/ai-skills-metrics-record` directly instead of relying on `PATH`. The wrapper exits successfully when the adopting project has not installed the project-local metrics runtime.

## Install / Test

From a checkout of this repository:

```bash
claude --plugin-dir ./adapters/claude-code/plugin
```

Then invoke a namespaced skill:

```text
/ai-skills:review-pr
```

For team distribution, package or publish this directory according to your Claude Code plugin policy. Enabling plugins in a shared project may be externally visible to collaborators and should follow `risk-gate` when repository settings or secrets change.

## Update Path

Update plugin wrappers when core workflow names or output contracts change. Do not fork core skill logic into plugin-only behavior.
