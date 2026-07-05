# Adapter Capability Matrix

Evidence status is based on this repository's files and validation scripts, not on external product claims. Tools without repository adapters are marked `unknown` unless a capability is directly represented here.

| Capability | Claude Code | Codex | Cursor | Cline | Devin | Kiro |
|---|---|---|---|---|---|---|
| Project-local skill projection | supported | partial | unknown | unknown | unknown | unknown |
| Local command templates | supported | partial | unknown | unknown | unknown | unknown |
| Review route support | supported | partial | unknown | unknown | unknown | unknown |
| Risk-gate preservation | partial | partial | unknown | unknown | unknown | unknown |
| Verification-first workflow support | partial | partial | unknown | unknown | unknown | unknown |
| Evidence-ledger output support | partial | partial | unknown | unknown | unknown | unknown |
| Local metrics event recording | partial | unsupported | unknown | unknown | unknown | unknown |
| Hidden telemetry disabled by default | supported | supported | unknown | unknown | unknown | unknown |
| External publication disabled by default | supported | supported | unknown | unknown | unknown | unknown |
| Upgrade/idempotent project install | supported | unsupported | unknown | unknown | unknown | unknown |
| PR shared review workflow | partial | unsupported | unknown | unknown | unknown | unknown |
| Fork/comment-trigger guardrails | supported | unsupported | unknown | unknown | unknown | unknown |

## Tool Notes

Claude Code:

- Evidence: `scripts/install-claude-adapter.mjs`, `adapters/claude-code/project/.claude/commands/`, local hooks, runtime scripts, and Pattern B workflow template.
- Partial areas: human setup is still required for copied GitHub Actions, authentication, repository policy, and interpreting review evidence.

Codex:

- Evidence: `adapters/codex/README.md`, `adapters/codex/project/.agents/skills/README.md`, `adapters/codex/prompts/`, `adapters/codex/commands/codex-exec.md`, `manifest.json`, and validation coverage in `scripts/validate-repo.mjs` / `scripts/test-validate-repo.mjs`.
- Supported areas: the adapter ships no hidden telemetry, webhook, publication, deploy, release, or external notification path by default.
- Partial areas: skill projection and workflow routing are documented prompt-driven projections. There is no installer, hook enforcement, or runtime proof that an adopting repository copied the expected skills.
- Unsupported areas: local metrics event recording, upgrade/idempotent project install, shared PR workflow, and fork/comment-trigger guardrails are not implemented by this adapter. Do not claim them for Codex from this repository evidence.

Cursor, Cline, Devin, Kiro:

- Evidence: no tool-specific adapter exists in this repository.
- Status: capabilities are `unknown` until an adapter contract, projection assets, command entry points, and validation fixtures are added.

## Conformance Rule

If an adapter lacks a required capability, it must downgrade the relevant claim. Examples:

- If review gates cannot be projected, do not claim layered review completeness.
- If the tool cannot prove it is reading the PR head state, return insufficient evidence or mark the review as diff-only.
- If metrics cannot be emitted within the privacy boundary, omit metrics instead of storing raw prompts or sensitive data.
- If risk-gate enforcement is not available, stop before risky action and require manual approval.
