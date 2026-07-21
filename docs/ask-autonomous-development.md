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

The workflow can also be started with `workflow_dispatch` using `auto`, `review`, or `advance` mode. Manual dispatch uses the same generation, validation, final-guard, and publication boundaries as scheduled execution; it is not a privileged bypass.

Scheduled runs are disabled until the repository variable below is set:

```text
ASK_AUTOMATION_ENABLED=true
```

## Required credentials

Configure this repository secret:

```text
OPENAI_API_KEY
```

The official `openai/codex-action` requires an API key. The key is supplied only to `codex_generate` through the action's protected Responses API proxy. That proxy boundary protects delivery of the API key to the action. Separately, repository validation runs in a different job with no OpenAI key, publication token, write permission, deployment secret, or environment secret. These are two independent guarantees.

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

If generation or validation fails or is cancelled after a target has been selected, a separate token-bearing job posts or updates a status comment with the workflow-run evidence. It publishes an empty patch and performs no branch mutation.

## Privilege separation

The workflow separates reasoning, untrusted repository execution, and GitHub publication.

1. **`context`** — read-only. It resolves `github.workflow_sha` once and records the identical control/workflow SHA, target mode and branch, exact target commit, exact base `main` commit, selected PR/Issue identity, run identity, and a canonical context digest. Immediately after GitHub retrieval, it secret-scans the untruncated source fields and the final context/prompt bytes before writing an artifact.
2. **`report_sensitive_context`** — a dedicated trusted status path. If input scanning finds secret-like text, `context` writes only a minimal blocked identity. This job never starts Codex, receives a patch, checks out the target repository, creates a branch/PR, or includes matched text in its status.
3. **`codex_generate`** — `contents: read` only. It runs only when the context boundary produced both a safe context and a pre-scanned prompt. It checks out the control and target by exact SHA, gives Codex no GitHub write token, runs Codex in `workspace-write`, validates the raw result against the protected Schema, creates the binary patch, secret-scans patch/result fields, hashes context/result/patch, and uploads one raw artifact. After the Codex action, this job executes only trusted control-plane code; it does not execute `workspace/scripts/**`, tests, builds, or validators.
4. **`validate_execute`** — `contents: read` only and the untrusted repository execution domain. It has no OpenAI key, publication token, Issue/PR write permission, contents write permission, OIDC permission, deployment/environment secret, host credential mount, SSH agent, or Docker socket mount. A trusted host wrapper verifies and applies the original raw patch, then executes every immutable validation-plan command in a separate digest-pinned Node.js 24 container. The patched repository source and control inputs are mounted read-only; trusted container code copies source into a fresh writable tmpfs validation workspace. Only that disposable workspace and scratch tmpfs are writable. The container has no network and receives only `PATH`, `HOME`, `LANG`, `LC_ALL`, and `NODE_ENV` through `env -i`. Runner command files, tool cache, artifact token, host home, and host sockets are not mounted. `--rm --init` plus a fresh workspace/container per command destroys its process namespace, filesystem state, `PATH` changes, and background processes before the next command.
5. **`attest_validation`** — a fresh runner with only the exact control checkout, original raw artifact, immutable plan, and digest-only execution evidence. It never checks out or executes the patched repository. It binds the actual `needs.validate_execute.result`, run/attempt, control/workflow/target/base SHAs, raw artifact digest, container digest, command-plan digest, all command-definition/output/safe-log digests, and produces the only validation attestation accepted by the publisher.
6. **`publish`** — the only patch-bearing job with GitHub write permission. It checks out the same exact control and target SHAs, independently downloads the original raw artifact and trusted attestation, verifies the observed validation-job conclusion, checks remote drift, applies the original patch to a fresh checkout, and recomputes the final guard. It does not accept a downloaded `guard.json` or validation execution self-report as publication authority. After the final guard it executes no model-changed repository code; only trusted git/GitHub publication operations remain.
7. **`report_failure`** — publishes only a bounded failure status derived from a context that passed input scanning. It carries an empty patch and cannot update a branch, open a PR, merge, or close an Issue.

Issue and PR text is treated as untrusted context data, not executable instruction.

## Immutable identity and stale targets

Every job uses the same exact `github.workflow_sha` as its control checkout. Per-job `ref: main` resolution is prohibited. PR maintenance records both the publication branch name and exact PR HEAD SHA; Issue advancement records `main` as the destination and binds both target/base identity to the exact selected `main` SHA. Branch names are publication destinations, never checkout identities for generation or validation.

Publication checks the remote target before applying and again immediately before mutation. For Issue advancement it also fetches current Issue, open PR, run branch, and `main` state before acquiring a run-scoped lease and again immediately before push:

- a moved PR HEAD rejects an update before push;
- a moved review-only PR receives only a trusted stale-review status containing the reviewed and current HEADs, with no generated verdict/comment;
- a moved Issue base rejects remote branch and PR creation;
- a closed, completed, or `not_planned` Issue rejects publication;
- a newly linked human PR, an automation-marker PR, or the same-run branch rejects duplicate publication;
- an active lease owned by another run rejects publication; an expired lease can be reacquired;
- a moved control branch does not change the control plane because every job remains pinned to the recorded workflow SHA.

Linkage recognizes `Progresses #N`, `Closes #N`, `Fixes #N`, `Addresses #N`, and the automation marker. A stale or duplicate target receives only trusted run/Issue/target/current-state/existing-PR/reason metadata; generated text, patch push, remote branch, and Draft PR publication are suppressed.

The Issue-comment lease accepts authority only from a closed identity set: the repository owner, `github-actions[bot]`, or the actual publication identity authenticated from the current token. The publisher resolves that identity through the authenticated user or installation API where possible. Lease acquisition always uses a two-stage comment: it first creates a non-authoritative pending comment, then seals the same comment with its GitHub comment ID and a closed lease object, and finally re-fetches it to compare ID, author login, author association, and creation time. A failed PATCH or identity comparison leaves only a pending comment, which can never parse as a lease.

The sealed lease binds comment ID, Issue, repository, run/attempt, target/control/workflow SHAs, authenticated owner, acquisition/expiry timestamps, and a canonical digest. The body digest detects drift but is not a signature and grants no authority by itself. A lease lasts more than zero and at most 15 minutes; its acquisition time must remain within 60 seconds of the GitHub comment creation time and cannot be materially in the future. Unknown fields, malformed values, binding drift, expired leases, and lease-like comments from any unrecognized user or bot are ignored. Selection and final publication revalidation bind the verified digest, comment metadata, authority class, expiry, Issue, and target SHA into the final guard.

The lease only suppresses duplicate work among cooperating automation runs. It is not a general safety guarantee and cannot eliminate the final API race with unrelated human or other non-cooperating writes.

The final guard binds Schema version, control/workflow/target/base SHAs, context/result/patch SHA-256 values, changed paths, additions, deletions, total changed lines, validation run ID/attempt/status, attestation/execution/container/plan digests, publication revalidation digest, and its own canonical digest.

## Hard boundaries

The automation cannot intentionally:

- merge a PR or enable auto-merge;
- close an Issue;
- modify its own workflow, prompt, result Schema, or control scripts;
- modify any directly executed repository validation entrypoint, including the autonomous, repository, portfolio, benchmark, evaluator-boundary, and adapter-bundle test/validation scripts;
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

## Input and output secret scanning

Before any model call, the protected scanner inspects untruncated Issue title/body/comments; PR title/body/comments, reviews, inline comments, check names/output descriptions, and status descriptions; roadmap/portfolio Issue context; and the final context JSON and prompt bytes. Scanning the raw source before truncation prevents a credential at or across a truncation boundary from disappearing before inspection.

One finding stops generation. The workflow does not upload the full context, does not build a prompt artifact, does not start Codex, and does not redact the task into a different request. The replacement artifact contains only immutable target identity, reason, finding categories, and field/ID/line-or-byte-range locations. It never contains the match, surrounding source text, or full original field.

After generation, the scanner also rejects secret-like material in the complete patch bytes and model-controlled outbound fields: summary, rationale, PR title/body, Issue/review comments, `tests_run`, `risks`, branch name, and commit message. It detects private-key headers, common GitHub/OpenAI/AWS credential forms, bearer/authorization credentials, explicit password/secret/token/API-key assignments, credential URLs, NUL/invalid control bytes, and abnormally large single lines.

Findings contain only category, artifact/field, repository path when available, line, and byte range. The matched value and private evaluator text are never copied into scanner diagnostics. Source and outbound text are rejected; source code is never silently redacted.

This is a bounded pattern scanner, not proof that arbitrary novel credential formats, encoded values, split values outside covered assignment forms, or semantically disguised secrets are absent. It can also stop on a false positive; that is intentionally fail-closed rather than a redaction-and-continue path. Credentials must still never be placed in prompts, Issues, PRs, artifacts, or repository files.

## Validation

The secret-free `validate_execute` job reads `.github/ask-automation/validation-plan.json` from the immutable control SHA and runs:

- syntax checks for changed `.mjs` files;
- `node scripts/test-ask-autonomous-development.mjs` from the protected target checkout;
- `node scripts/test-validate-repo.mjs` in the development checkout;
- the catalog, policy, design-admission, independent-design-review, general benchmark, execution, normalized-result, and evaluator-boundary control tests;
- `node scripts/adapter-runtime-bundle.mjs --check`;
- `node scripts/validate-repo.mjs`;
- `git diff --check`.

The reviewed image is pinned by OCI digest, not a mutable tag. Each command record contains the immutable command-definition digest, start/finish timestamps, exit status, stdout/stderr digests, digest-only safe-log path/hash, and container digest. Raw stdout/stderr—including a matched credential or private-evaluator text—is never included in the uploaded validation artifact.

Codex may run additional focused tests and must report only commands it actually executed.

All directly executed control and repository validation entrypoints are protected from automation patches. Work that requires changing one of these trust anchors must return `blocked` for a human-managed PR.

## Action pin maintenance

Every external Action in the high-privilege automation workflow is pinned to an approved 40-character commit SHA and carries the resolved release tag as a version comment. `scripts/validate-repo.mjs` rejects mutable tags, short SHAs, unknown Actions, unreviewed commits, and missing/mismatched version comments.

To update a pin:

1. Read the upstream release notes and compatibility requirements, including the bundled Node runtime and minimum runner version.
2. Resolve the release tag through the GitHub API (`/repos/{owner}/{repo}/git/ref/tags/{tag}`); if it is an annotated tag, dereference its tag object to the commit. Do not use a release asset/blob SHA or a guessed revision.
3. Review the action diff and update both the workflow line (`uses: owner/action@<commit> # <tag>`) and `APPROVED_ASK_AUTOMATION_ACTION_PINS` in `scripts/validate-repo.mjs`.
4. Run the autonomous control tests, repository validation tests, repository validator, and a manual dry-run while scheduled execution remains disabled.

## Publication semantics

New work is published as a branch named like:

```text
automation/ask-issue-205-<run-id>
```

The PR remains Draft and contains the marker:

```html
<!-- ask-autonomous-development -->
```

A single status comment marked with `ask-autonomous-development-status` is updated on the PR and linked Issue. Issue advancement additionally creates a short-lived `ask-autonomous-development-lease` comment before publication. The updater uses the same closed authority set as the lease path: the repository owner, `github-actions[bot]`, or the authenticated dedicated publication identity. A marker posted by another user or an arbitrary `[bot]` account is never selected for update. No merge or Issue closure follows automatically.

## Operations

### Enable

1. Add `OPENAI_API_KEY`.
2. Optionally add `ASK_AUTOMATION_GITHUB_TOKEN`.
3. Keep `ASK_AUTOMATION_ENABLED` unset or false.
4. Run one manual dry-run with `workflow_dispatch` in `review` mode and inspect target/control bindings, artifacts, validation, stale-target behavior, and the resulting bounded status.
5. Only after the dry-run is reviewed, set `ASK_AUTOMATION_ENABLED` to `true` if scheduled operation is explicitly approved.

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
