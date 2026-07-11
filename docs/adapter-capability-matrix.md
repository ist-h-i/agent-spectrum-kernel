# Agent Spectrum Kernel Adapter Capability Matrix

Evidence status is based on this repository's Agent Spectrum Kernel files and validation scripts, not on external product claims. Tools without repository adapters are marked `unknown` unless a capability is directly represented here.

Levels:

- `projected`: files, commands, prompts, hooks, or workflow assets are installed or generated.
- `runtime_detected`: local smoke checks can see the installed runtime surface.
- `executed`: a bounded adapter runner executed and captured output, but business correctness is still not proven.
- `behavior_verified`: repository fixtures or local checks verify the stated behavior for this capability.
- `unsupported`: this repository does not implement the capability for the adapter.
- `unknown`: this repository has no current evidence for the capability.

| Capability | Claude Code | Codex | Cursor | Cline | Devin | Kiro |
|---|---|---|---|---|---|---|
| Project-local skill projection | behavior_verified | behavior_verified | unknown | unknown | unknown | unknown |
| Local command templates | behavior_verified | behavior_verified | unknown | unknown | unknown | unknown |
| Review route support | projected | projected | unknown | unknown | unknown | unknown |
| Risk-gate preservation | projected | projected | unknown | unknown | unknown | unknown |
| Verification-first workflow support | projected | projected | unknown | unknown | unknown | unknown |
| Evidence-ledger output support | projected | projected | unknown | unknown | unknown | unknown |
| Adapter runtime smoke | behavior_verified | projected | unknown | unknown | unknown | unknown |
| Bounded adapter execution runner | unsupported | behavior_verified | unknown | unknown | unknown | unknown |
| Local metrics event recording | runtime_detected | unsupported | unknown | unknown | unknown | unknown |
| Hidden telemetry disabled by default | behavior_verified | behavior_verified | unknown | unknown | unknown | unknown |
| External publication disabled by default | behavior_verified | behavior_verified | unknown | unknown | unknown | unknown |
| Upgrade/idempotent project install | behavior_verified | behavior_verified | unknown | unknown | unknown | unknown |
| PR shared review workflow | projected | unsupported | unknown | unknown | unknown | unknown |
| Fork/comment-trigger guardrails | behavior_verified | unsupported | unknown | unknown | unknown | unknown |

## Generic Core Installer

The repository also ships `scripts/install-kernel.mjs`, which supports three-way update-safe projection of the generic core `AGENTS.md`, `CUSTOM_INSTRUCTIONS.md`, and `skills/<name>/SKILL.md` files into an adopting repository. Codex-specific `.agents/skills`, prompt, and command projection is handled separately by `scripts/install-codex-adapter.mjs`; Claude projection is handled by `scripts/install-claude-adapter.mjs`. The installers share lifecycle semantics for `--check`, `--dry-run`, `--prune`, `--force`, `--rollback`, and `--detach`.

## Tool Notes

Claude Code:

- Evidence: `scripts/install-claude-adapter.mjs`, `adapters/claude-code/project/.claude/commands/`, local hooks, runtime scripts, and Pattern B workflow template.
- Projected-only areas: human setup is still required for copied GitHub Actions, authentication, repository policy, and interpreting review evidence.

Codex:

- Evidence: `scripts/install-codex-adapter.mjs`, `adapters/codex/README.md`, `adapters/codex/project/.agents/skills/README.md`, `adapters/codex/prompts/`, `adapters/codex/commands/codex-exec.md`, `manifest.json`, and validation coverage in `scripts/validate-repo.mjs` / `scripts/test-validate-repo.mjs`.
- Supported areas: the adapter ships no hidden telemetry, webhook, publication, deploy, release, or external notification path by default.
- Projected-only areas: workflow routing, risk gates, verification, and evidence outputs are preserved in projected skills and prompts, but runtime execution remains user-controlled. A per-run Codex runner result may reach `executed`; this matrix records only repository-level fixture evidence.
- Unsupported areas: local metrics event recording, shared PR workflow, and fork/comment-trigger guardrails are not implemented by this adapter. Do not claim them for Codex from this repository evidence.

Cursor, Cline, Devin, Kiro:

- Evidence: no tool-specific adapter exists in this repository.
- Status: capabilities are `unknown` until an adapter contract, projection assets, command entry points, and validation fixtures are added.

## Conformance Rule

If an adapter lacks a required capability, it must downgrade the relevant claim. Examples:

- If review gates cannot be projected, do not claim layered review completeness.
- If the tool cannot prove it is reading the PR head state, return insufficient evidence or mark the review as diff-only.
- If metrics cannot be emitted within the privacy boundary, omit metrics instead of storing raw prompts or sensitive data.
- If risk-gate enforcement is not available, stop before risky action and require manual approval.
