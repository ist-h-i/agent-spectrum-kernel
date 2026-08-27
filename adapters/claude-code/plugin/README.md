# AI Skills Claude Plugin

This optional plugin packages stable Claude Code entry points for Agent Spectrum Kernel.

Use the project-local adapter when one repository needs short commands such as `/review-router`. Use this plugin when a team wants namespaced commands such as `/ai-skills:review-pr` across multiple repositories.

## Entry Points

- `/ai-skills:review-pr`
- `/ai-skills:implement`
- `/ai-skills:investigate`
- `/ai-skills:verify`
- `/ai-skills:handoff`
- `/ai-skills:adoption-report`
- `/ai-skills:ledger-refresh`
- `/ai-skills:implementation-context-check`

The plugin remains an adapter. Core skills in `skills/*/SKILL.md` and the shared fixed-entry/control registries remain the source of truth. The five fixed entries are generated from adapter-owned templates and bind the same exact registered candidate Asset references as the project and Codex projections; they do not carry an independent route table. The package also includes the canonical Execution Envelope and claim-evidence contracts, their referenced schemas, the formal `evidence-ledger` Skill, and the legacy claim normalizer under plugin-root-qualified paths, so entry points do not depend on root-level ASK files. Its Execution Envelope path is explicit inline compatibility; plugin installation or the Stop wrapper does not provide or claim a runner-owned sidecar.

The bundled assets include byte-exact projections of the Execution Envelope and claim-evidence contracts/schemas plus the review-route registry, `skills/evidence-ledger/SKILL.md`, and `scripts/claim-evidence-status.mjs`. The registry carries the closed finding fields used by the plugin review entry. Repository validation requires byte-for-byte equality with the canonical files.

Ordinary entry points apply `ask.claim-evidence-status@1.0.0` inline. `/ai-skills:implement`, `/ai-skills:investigate`, `/ai-skills:review-pr`, `/ai-skills:verify`, and `/ai-skills:handoff` skip upper routers because their task class is fixed, while preserving shared scope, verification, risk/approval, evidence, missing-evidence, output, and direct-trigger controls. `/ai-skills:review-pr` selects `high_stakes_readiness` only when a final merge decision is explicitly requested; `/ai-skills:adoption-report` selects `multiple_material_claims`. Other entry points keep the bundled capability inactive unless an observed closed trigger selects `formal_ledger`; installation is never activation evidence.

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
