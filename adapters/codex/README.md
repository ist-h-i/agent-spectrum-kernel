# Codex Adapter

This adapter projects Agent Spectrum Kernel into Codex-compatible usage without creating a separate quality model.

Use this adapter when a repository wants Codex to follow the core kernel, route through the existing skills, and produce evidence-backed outputs from either an interactive Codex session or `codex exec`.

## What This Adapter Provides

- A Codex usage guide for `AGENTS.md`, repo skills, prompt templates, and `codex exec`.
- Prompt templates for implementation, investigation, review, verification, and handoff workflows.
- A command template showing bounded `codex exec` invocation patterns.
- A mapping from core skills to Codex execution style.
- A Codex adapter installer for `.agents/skills`, `.agents/prompts`, and `.agents/commands`.
- Explicit capability downgrades for unsupported automation, telemetry, hooks, and shared PR workflows.

The Codex adapter installer projects Codex-specific files into another repository:

```bash
node scripts/install-codex-adapter.mjs --target /path/to/adopting-repo --merge-agents
```

It updates `AGENTS.md`, `.agents/skills`, `.agents/prompts`, `.agents/commands`, and `.agent-spectrum-kernel/codex-install-state.json`. It does not create hooks, telemetry, GitHub Actions, external publication, secrets, deploys, or releases.

## Codex Projection Model

Codex-compatible projection uses these surfaces:

| Core model | Codex surface | Adapter status |
|---|---|---|
| Always-on kernel | Repository `AGENTS.md` | supported by documentation/template guidance |
| Reusable workflows | Repo-scoped `.agents/skills/<skill>/SKILL.md` projections of canonical `skills/<name>/SKILL.md` | supported for local projection; runtime skill loading remains Codex-controlled |
| Task commands | Prompt templates passed to Codex or `codex exec` | supported for local template projection; runtime execution is user-controlled |
| Review / implementation routing | `operating-mode-router`, then `skill-router` or named specific skills | partial; prompt templates preserve route requirements |
| Risk and evidence gates | `risk-gate`, `test-first-verification`, `evidence-ledger` | partial; preserved in prompts, not mechanically enforced by this adapter |
| Metrics / observability | Project-local metrics contract only when separately enabled | unsupported in this adapter; no Codex hook or telemetry integration is shipped |
| Shared PR automation | Codex GitHub Action or workflow defined by an adopting project | unsupported in this adapter; no workflow is provided here |

Codex documentation supports `AGENTS.md`, repo-scoped skills under `.agents/skills`, skills in CLI/IDE/app surfaces, and `codex exec` for non-interactive runs. This adapter uses those documented surfaces and avoids claiming parity with Claude-specific hooks or plugin packaging.

## Minimum Setup In An Adopting Repository

1. Run `node scripts/install-codex-adapter.mjs --target /path/to/adopting-repo --merge-agents`.
2. Use `--skills <csv>` to project a narrower set than `manifest.json.skills` when needed.
3. Rerun the installer after pulling this repository's updates.
4. Use a template from `.agents/prompts/` as the task prompt, or adapt the command pattern in `.agents/commands/codex-exec.md`.
5. Run repository-specific verification commands before claiming correctness, readiness, safety, reliability, or no regression.

## Recommended Skill Sets

Implementation work:

- `operating-mode-router`
- `skill-router`
- `requirement-grill` when business intent or responsibility boundary is unclear
- `work-package-compiler` when a confirmed Requirement Contract should become an agent-ready task
- `spec-driven-development`
- `test-first-verification`
- `controlled-implementation`
- `evidence-ledger`
- `risk-gate`

Investigation work:

- `operating-mode-router`
- `skill-router`
- `doubt-driven-development`
- `test-first-verification`
- `controlled-implementation`
- `evidence-ledger`
- `risk-gate`

Review work:

- `review-router`
- `review-automated-gate`
- `review-ai-quality`
- `review-code-health`
- `review-domain-impact`
- `review-to-rule-compiler` when review evidence should become domain rule candidates
- `review-architecture-impact`
- `review-output-quality`
- `review-adversarial-risk`
- `review-final-merge-gate`
- `evidence-ledger`
- `risk-gate`
- `adr-review`
- `improvement-ledger`

Decision-support and learning work:

- `next-best-change-finder`
- `requirement-grill`
- `work-package-compiler`
- `review-to-rule-compiler`
- `domain-rule-ledger`

Full-layer reusable intelligence work:

- `engineering-pattern-ledger`
- `verification-pattern-ledger`
- `review-finding-compiler`
- `documentation-knowledge-compiler`
- `architecture-decision-memory`
- `engineering-capability-evaluation`

Project only the full-layer skills that match the adopting repository's need. Their ledgers are evidence sources for selected workflows, not mandatory inputs for every Codex task.

## Prompt Templates

Use these files as copy-paste prompts or as `codex exec` prompt files:

- `prompts/skill-implement.md`
- `prompts/skill-investigate.md`
- `prompts/skill-review.md`
- `prompts/skill-verify.md`
- `prompts/skill-handoff.md`

They route through the existing core skills and require evidence-backed outputs. They do not store raw prompts, secrets, customer data, personal data, full command output, or full file contents.

For non-trivial continuation, handoff, interrupted work, or risk-gated work, handoff prompts may include the bounded resume state from `docs/agent-session-state-contract.md`. The adapter does not require session state for trivial or fully captured simple local tasks.

## Capability Downgrades

This adapter is intentionally narrower than the Claude Code adapter.

- No hooks: do not claim automatic local metrics sidecar recording or mechanical risk-gate enforcement.
- No GitHub Actions workflow: do not claim shared PR review, fork guardrails, or comment-trigger support from this adapter.
- No hidden telemetry: the adapter ships prompt files and documentation only; any telemetry must be a separate, explicit project decision.
- No external publication: the adapter does not publish, comment, deploy, release, or notify externally.
- Runtime behavior: mark Codex output as insufficient evidence when the workspace, diff, PR head, tests, or required command results are unavailable.

## Validation

This repository validates the Codex adapter paths through `scripts/validate-repo.mjs` and fixture coverage in `scripts/test-validate-repo.mjs`.

Run:

```bash
node scripts/test-validate-repo.mjs
node scripts/validate-repo.mjs
```
