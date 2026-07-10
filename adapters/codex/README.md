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

It updates `AGENTS.md`, profile-selected `.agents/skills`, `.agents/prompts`, `.agents/commands`, and `.agent-spectrum-kernel/codex-install-state.json`. It does not create hooks, telemetry, GitHub Actions, external publication, secrets, deploys, or releases.

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
2. Use `--profile <name>` to choose a supported workflow profile. The default is `implementation`.
3. Rerun the installer after pulling this repository's updates.
4. Use a template from `.agents/prompts/` as the task prompt, or adapt the command pattern in `.agents/commands/codex-exec.md`.
5. Run repository-specific verification commands before claiming correctness, readiness, safety, reliability, or no regression.

## Workflow Profiles

Use profiles instead of arbitrary partial skill sets for normal installs:

| Profile | Intended use |
|---|---|
| `minimal` | Verification and handoff without installing broad routing/review skills. |
| `implementation` | Default scoped implementation work. |
| `investigation` | Bug, regression, reliability, and unknown-root-cause work. |
| `review` | PR, diff, generated-output, and readiness review. |
| `adoption` | Project adoption and durable context setup. |
| `observability` | Skill effectiveness, adoption metrics, and capability evaluation. |
| `full` | All manifest skills and all Codex prompt templates. |

Each profile installs a closed command/prompt/skill set. Installed command examples only reference prompt files selected by that profile.

Use `--skills <csv>` only as an advanced override. The override must include all required skills for installed prompt templates, command templates, and dependencies of the specified skills. Invalid combinations fail before any files are written.

## Prompt Templates

Use these files as copy-paste prompts or as `codex exec` prompt files:

- `prompts/skill-implement.md`
- `prompts/skill-investigate.md`
- `prompts/skill-review.md`
- `prompts/skill-verify.md`
- `prompts/skill-handoff.md`

They route through the existing core skills and require evidence-backed outputs. They do not store raw prompts, secrets, customer data, personal data, full command output, or full file contents.

Prompt templates define entry intent, mutation level, evidence requirements, and output contract. They do not duplicate the canonical skill-routing procedure; routing remains in `operating-mode-router`, `skill-router`, review routing, or explicitly named relevant skills.

For non-trivial continuation, handoff, interrupted work, or risk-gated work, handoff prompts may include bounded resume state when useful. The adapter does not require session state for trivial or fully captured simple local tasks.

## Stale Managed Files

The installer records managed skills, prompts, and commands in `.agent-spectrum-kernel/codex-install-state.json`.

When a later install no longer selects a previously managed file, the installer reports it as stale and retains it by default. Use `--prune` to delete stale managed files only when the current file hash still matches the previous managed hash. Modified managed files are preserved and cause prune to fail before deletion.

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
