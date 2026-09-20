# Codex Exec Command Templates

Use these examples from an adopting repository after projecting `AGENTS.md`, the required skills, and the selected prompt templates.

The installer generates a profile-limited `.agents/commands/codex-exec.md` in adopting repositories. This source template shows the full command family.

Run these commands from the adopting repository so that `scripts/codex-exec-runner.mjs` is the installed, managed runner for that repository.

After task classification, a review command uses exactly one observation form: keep `--gates-observed` when no mapped signal exists, or remove it and repeat `--observed-signal <id>` for each exact mapped signal. Never combine those forms. Without either form, the normalized event records `required_gate_observation` as missing. The review entry always records the mandatory `review-ai-quality` baseline. Add `--final-decision` only when a final merge decision is requested; the runner then adds `review-final-merge-gate` after baseline and additional gates. Accepted final decisions, including `approve_with_comments`, remain exact in the runner-owned Envelope.

A non-review `--required-gate risk-gate` requires `--risk-action /absolute/path/to/action.json`. Its first run emits the deterministic exact request in `risk_approval` and stops without invoking Codex. An authorized rerun adds `--risk-approval /outside/target/approval.json --risk-approval-sha256 <lowercase-raw-file-sha256>`. The approval file must embed the exact request and preserve its self-digest; the caller-supplied raw file digest is the separate trust root for the external authority bytes.

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
node scripts/codex-exec-runner.mjs --prompt skill-review.md --mode review --sandbox read-only --diff-base origin/main...HEAD --gates-observed --final-decision --output codex-review.md
```

Omit `--final-decision` for a gate-status review with no merge judgment. Treat either form as diff-only review unless the command also provides the checked-out PR head, relevant docs, test results, and context required by the review gates.

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
invokes `codex exec` with a closed structured-result schema, derives and persists one bound Execution Envelope record, runs `ask-sensors` against the record/output pair, and reports
requested contracts, required gates, projected contracts, runtime-loaded contracts, and applied
output-contract evidence separately. Workflow, risk/approval, and verification
application remain unavailable unless separately observed.
Codex-controlled Skill loading remains unavailable unless separately observed.
A passing sensor result is not a verification attempt and is not proof of business correctness, product readiness, or no regression. Ordinary fixed output contains no serialized Envelope; protected and handoff output contains exactly one runner-rendered projection. Add `--diagnostic-envelope` only for an explicit route/debug request.

Use this when a task needs a precise next-agent handoff with allowed scope, forbidden scope, expected output, and verification. The Envelope owns the stop condition.

## Safety Notes

- Use `read-only` for review or handoff when edits are not required.
- Use `workspace-write` only when implementation or verification needs local edits.
- Do not use `danger-full-access` unless the environment is isolated and the task explicitly requires it.
- Do not pass secrets as broad job-level environment variables.
- Closed risk action descriptors name the normalized credential-free `remote.origin.url` repository ID, operation, target scope, permitted/prohibited effects, and expected authority id/revision/evidence digest. The request independently binds that logical repository ID plus checkout/Git-directory identity, HEAD/tree, installed profile and fingerprints, prompt bytes, mode/sandbox, all required gates, the Codex executable argument/canonical path/raw digest/size, and output path.
- The runner stable-reads action and approval files and repeats the complete exact check immediately before spawn. A symlink, target-contained approval, raw digest mismatch, partial/superset approval, changed binding, or resealed request stops without execution.
- Exact approval cannot supply a missing installed capability. Read-only review of a risk surface is evaluation-only and does not require action approval.
