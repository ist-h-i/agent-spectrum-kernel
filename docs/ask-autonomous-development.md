# ASK autonomous development automation

This repository includes a bounded, scheduled Codex workflow that advances the ASK roadmap while keeping publication and high-risk actions outside the model process.

## Purpose

The automation is designed to move ASK from its current technically strong internal foundation toward:

- an evidence-backed practical Beta after the benchmark critical path; and
- an externally adoptable production-grade candidate after the full roadmap.

It does not presume that Full ASK should be the default. It preserves Kernel-only as the ordinary baseline, treats Adaptive ASK as an evidence-triggered condition, and keeps Full ASK diagnostic unless measured evidence supports a narrower default.

## Schedule

`.github/workflows/ask-autonomous-development.yml` runs on weekdays at:

- 09:20 Asia/Tokyo (`00:20 UTC`): automatic PR-first development loop;
- 17:20 Asia/Tokyo (`08:20 UTC`): review-preferred loop.

The workflow can also be started with `workflow_dispatch` using `auto`, `review`, or `advance` mode.

Scheduled runs are disabled until the repository variable below is set:

```text
ASK_AUTOMATION_ENABLED=true
```

## Required credentials

Configure this repository secret:

```text
OPENAI_API_KEY
```

The official `openai/codex-action` requires an API key. The key is supplied only to the Codex job through the action's protected Responses API proxy.

Optional:

```text
ASK_AUTOMATION_GITHUB_TOKEN
```

Use a fine-grained token or GitHub App token limited to this repository with only the permissions required for contents, pull requests, issues, and Actions. When omitted, the workflow falls back to `GITHUB_TOKEN`.

A dedicated publication token is preferable when automated pushes and newly created pull requests must trigger ordinary pull-request workflows. With the default `GITHUB_TOKEN`, the automation performs its own guarded validation and explicitly dispatches the repository validation workflow for a newly created branch; an update to an existing PR may require manual CI re-run if GitHub recursion protection suppresses the normal event.

Never store credentials in repository files, prompts, Issue text, or workflow artifacts.

## Control flow

Each run selects exactly one target.

### 1. Maintain an eligible open PR

Open PRs targeting `main` take precedence when they are authored by the repository owner or carry the automation marker. Critical-path linkage is read from `Progresses #…`, `Closes #…`, `Fixes #…`, or `Addresses #…` in the PR body.

Codex then either:

- implements bounded fixes and updates the same branch; or
- performs an independent review and posts an evidence-bounded status without changing files.

The workflow never merges the PR.

### 2. Advance the next open critical-path Issue

When no eligible PR requires attention, the first open Issue in this order is selected:

```text
#205 → #197 → #207 → #206 → #208 → #209 → #204 → #198 → #192
→ #173 → #176 → #180 → #174 → #175 → #178 → #177 → #202
```

Codex implements only one reviewable work package and the publisher opens a Draft PR. The selected Issue receives a persistent status comment that is updated rather than appended on every run.

The Issue order is intentionally dependency-bearing: later work does not begin while an earlier critical-path Issue remains open.

### 3. Report a bounded failure

If the Codex or validation job fails or is cancelled after a target has been selected, a separate token-bearing job posts or updates a status comment with the workflow-run evidence. It publishes no patch and performs no branch mutation.

## Privilege separation

The workflow separates reasoning, code mutation, and GitHub publication.

1. **Context job** — reads repository, Issue, PR, review, and check metadata.
2. **Codex job** — receives no GitHub write token. It can edit only an isolated checkout and produces a Schema-valid result plus a patch.
3. **Guard step** — rejects protected paths, binary/symlink changes, oversized patches, missing executed validation evidence, target drift, action/result mismatch, and whitespace errors.
4. **Publish job** — receives the bounded GitHub token after Codex has finished. It applies the guarded patch, commits, pushes, creates or updates a Draft PR, posts status, and dispatches repository validation where permitted.
5. **Failure reporter** — receives no patch and can only update the selected Issue/PR status when execution fails.

Issue and PR text is treated as untrusted context data, not executable instruction.

## Hard boundaries

The automation cannot intentionally:

- merge a PR or enable auto-merge;
- close an Issue;
- modify its own workflow, prompt, result Schema, or control scripts;
- modify `benchmarks/results/**` or private evaluator paths;
- commit secrets, keys, binary files, or symlinks;
- run or authorize measured benchmark, pilot, human-evaluation, release, deployment, production migration, billing, or external notification actions;
- expose or generate private evaluator packages;
- change frozen scoring/lineage policy after measured result inspection;
- infer monetary cost or human effort from tokens or elapsed time.

For Issue #198, the automation may prepare preregistration artifacts, verify entry conditions, or report readiness gaps. Actual measured execution requires a separate explicit human-authorized workflow.

A run that encounters one of these boundaries reports `blocked` and identifies the missing approval or dependency.

## Patch limits

Each run is limited to:

- 60 changed files;
- 8,000 changed lines;
- one selected Issue or PR;
- one bounded work package;
- no binary or symlink changes.

The Codex result must list the exact ASCII-ordered changed path set. A changed run must also report at least one validation command that Codex actually executed. The guard independently compares these claims with the working tree.

## Validation

The automation runs:

- syntax checks for changed `.mjs` files;
- `node scripts/test-ask-autonomous-development.mjs` from the protected control checkout;
- `node scripts/test-validate-repo.mjs` in the development checkout;
- `node scripts/validate-repo.mjs`;
- `git diff --check`.

Codex may run additional focused tests and must report only commands it actually executed.

## Publication semantics

New work is published as a branch named like:

```text
automation/ask-issue-205-<run-id>
```

The PR remains Draft and contains the marker:

```html
<!-- ask-autonomous-development -->
```

A single status comment marked with `ask-autonomous-development-status` is updated on the PR and linked Issue. The updater recognizes GitHub Actions, the repository owner, and dedicated GitHub App bot identities. No merge or Issue closure follows automatically.

## Operations

### Enable

1. Add `OPENAI_API_KEY`.
2. Optionally add `ASK_AUTOMATION_GITHUB_TOKEN`.
3. Set repository variable `ASK_AUTOMATION_ENABLED` to `true`.
4. Run the workflow once with `workflow_dispatch` in `review` mode.
5. Inspect the generated review/status before relying on the schedule.

### Pause

Set:

```text
ASK_AUTOMATION_ENABLED=false
```

Manual dispatch remains available for controlled testing.

### Emergency stop

Disable the workflow in GitHub Actions or remove the repository variable. Rotate the dedicated GitHub token and OpenAI API key if credential exposure is suspected.

## Evidence boundary

Successful execution proves that a bounded Codex run produced a guarded patch or review under the recorded repository state. It does not prove product value, real evaluator correctness, measured benchmark validity, release readiness, or safe applicability outside the selected work package.
