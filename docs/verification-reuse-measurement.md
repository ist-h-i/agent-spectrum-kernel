# Verification reuse runtime measurement

Progresses #274. This opt-in pilot does not close the issue, change default review routing, skip repository CI, or authorize a merge/release. It uses the existing signed evidence, transfer, scoped/exact planners and final-coverage contracts. It is not another reuse engine.

## Residual acceptance audit

Audit baseline: main `b13e75a996dfd6305d0e6ec11d6207aca66c8368`, after merged PRs #279, #297 and #302. Issue #274's old Slice 2/3 status is not an implementation inventory.

| Classification | Observed boundary | This change |
| --- | --- | --- |
| already complete | Signed CAS evidence, exact/scoped reuse, actual Git invalidation, bounded delta requests, current rerun acceptance, independent decision protocol, post-observation revalidation | Import existing APIs without changing their contracts |
| implementation missing | Durable paired measurement output, initial-acquisition accounting, executable model-review dispatch, quality comparison/partial-run interpretation | Add bounded runner, native Codex provider, result schema and tests |
| runtime integration missing | Dispatch the resolved full/delta package through a model process, then bind the current result into the final-coverage provider | Add an explicit native `codex exec` pilot; do not change the managed `codex-exec-runner.mjs` projection contract |
| measured evidence missing | Matched live full/delta reviews, tokens, end-to-end latency and real model quality | Executable operator-run path; synthetic tests cannot satisfy this evidence |
| external provider unavailable | Production GitHub observations, real human approval, installed ASK adapter acceptance in this environment | Remain open; never synthesize these providers from old evidence |

#275 owns Work Packages, snapshots, checkpoints and context rollover. No #275 module or state model is introduced here. #198, monetary ROI, general CI caching and unrelated installer/refactoring work are excluded.

## Fixed comparison

The closed public fixture has two actual Node test commands and two independently declared semantic obligations. No caller-supplied repository, command, dependency inference, executable provider module or GitHub mutation is accepted by the CLI.

| Revision | Change | Full-rerun condition | Reuse condition |
| --- | --- | --- | --- |
| A | Initial acquisition | Execute both gates and review both surfaces | Execute both gates and review both surfaces |
| B | Docs-only clarification | Execute both gates and review both surfaces | Reuse both deterministic results; skip semantic dispatch only after an observed, complete, passing A review |
| C | Change the inclusive limit comparison to an exclusive comparison | Execute both gates and review both surfaces | Rerun the source gate, reuse the unrelated gate and request the affected semantic surface |

C deliberately contains a blocker at the equality boundary which the deterministic smoke test does not exercise. The review obligation explicitly requires inclusive behavior. An independent, closed oracle checks whether the review found this seeded blocker. Finding it means **block completion**, not pass the code. The oracle is never sent to the model as the expected answer.

Both conditions use the same Git target, gate contracts, review obligations and public source bytes in a repetition. A execution costs are included in each condition, unlike #302's comparison of revisions after common baseline acquisition. A source evidence is transferred into both condition stores to bind identical requirements; each condition still actually executes and records its own A gates. Common fixture construction, Git commits and requirement binding are outside both timed condition cells.

Default: two repetitions, alternating baseline/reuse and reuse/baseline order. No model retry, hidden warmup, discarded trial, automatic model choice or adaptive threshold is used. The exact source/scenario digest, Node identity, runtime pin, order, repetitions, stop conditions and acquisition boundary are written to `plan.json` **before** gate/model execution. An existing output file is never overwritten. Persisted rows survive a later cell failure.

Expected fixture assertions, not a substitute for an executed result: per repetition, six full-rerun versus three selective gate executions; three full versus two selective review dispatches. Two repetitions therefore expect 12 versus 6 gate executions and 6 versus 4 dispatches. Same-target evidence transfer is also checked in a fresh reviewer store without additional commands. These small public fixtures establish only a bounded mechanism result, not a production effect size.

## Runtime and adapter path

`verification-reuse-measurement.mjs` re-resolves `prepareVerificationCompletion()` after reruns. Full review uses the fixed complete semantic inventory; delta review uses the existing request's affected paths and obligation references. An unconditional `gate:<id>` judgment still dispatches a current review, even with unchanged source. Missing/incomplete A review never permits later baseline reuse.

`verification-review-runtime.mjs` invokes an operator-selected, exact-version-and-byte-pinned native Codex executable. It supplies the bounded package in memory through stdin and requires structured JSON output. A fresh process uses an isolated temporary HOME/CODEX_HOME/workspace, read-only sandbox, ephemeral execution, no shell/multi-agent tools, disabled web search and no inherited user MCP configuration. Only the explicit `CODEX_API_KEY` is provided to the model process; it is not serialized. The binary and host remain trusted boundaries, not a sandbox for malicious executables.

The native path uses `codex exec --ephemeral --json --sandbox read-only --skip-git-repo-check --model ... --output-schema ... -`. Native CLI output is bounded; timeouts kill the subprocess group on supported Unix hosts. Failed, ambiguous, wrong-target, out-of-scope or prohibited-tool results do not produce successful quality evidence. Missing token classes stay unavailable. Fake binaries are explicitly test-only protocol evidence, not actual AI requests.

This is an **executable native Codex pilot**, not proof that an installed ASK managed runner loaded its compact profile, applied every review contract or accepted the package. It does not change `scripts/codex-exec-runner.mjs`, its installer-owned asset set or generated profiles. Real managed-adapter acceptance remains separately unmeasured. No Claude Code runtime parity is claimed. The new subprocess wrapper and parser can be exercised without altering either adapter's authority contract.

The current in-process review-state provider is read-only, exact-target/plan/request bound and scoped to one decision. It checks HEAD and current result coverage on every observation. It does not load historical review receipts or turn persisted result JSON into current authority. The existing completion engine still owns its challenge, actor policy, two observations, final Git/evidence revalidation and non-authorization result. Correct blocker findings return an unsatisfied judgment and leave completion blocked. Raw model output is never used as an approval.

## Measurement semantics

The versioned output is `ask_verification_reuse_measurement`, schema version `1.0.0`, validated by `schemas/verification-reuse-measurement.schema.json`.

- `baseline` and `reuse` contain required gates, exact/scoped reuse, rerun-required/blocked counts, actual deterministic execution attempts, review dispatches, AI-review invocations, token classes, elapsed measurements, current judgments and quality outcomes.
- `delta` uses **reuse minus baseline** in native units. Negative gate/request/token/time deltas mean less work. An incomplete paired run has unavailable deltas, never a savings claim from fewer recorded cells.
- Every telemetry value is an explicit `{status, value, reason}` measurement. A known no-dispatch cell may record zero. An absent or failed provider, missing token field or partial sum is not converted to zero. Partial-run counts describe only recorded cells, not inferred full-run totals.
- `ai_review_requests` counts completed native model-review invocations. It does **not** claim to count internal model HTTP requests, retries or reasoning steps; native JSONL does not establish those counts. The output explicitly lists upstream model HTTP counts as unmeasured.
- Token fields come only from the native `turn.completed.usage` event: input tokens include cached input; `cached_tokens` is the cached subset, not an additional input category. No byte-to-token estimate is used.
- `deterministic_elapsed_ms` is measured subprocess wall time. `harness_elapsed_ms` includes the cell's planning, evidence, dispatch, coverage and handoff work, plus A acquisition where applicable. `elapsed_time` is only populated for a complete live-model cell. Fixture process durations are not represented as live AI workflow latency.
- The synthetic provider emits fixture dispatches and fixture judgments, **zero actual AI calls**, and unavailable live tokens/independent judgments/end-to-end time. Its quality outcomes concern the explicit fixture/oracle only.

Short subprocess measurements have startup, cache, filesystem and scheduler noise. Two repetitions do not establish statistically reliable time or token savings. Model/backend resolution is operator/runtime controlled; the plan records the requested model and runtime pins, not an independently authenticated backend snapshot.

## Quality, handoff and current facts

Required outcomes: missed requirements, missed blocker, stale deterministic evidence acceptance, false completion, unsafe action, scope deviation, false-positive findings and omitted independent judgment. The known fixture oracle and explicit path/obligation/judgment inventories determine these outcomes; they are not a model-generated overall score. A detected safety violation with other unavailable dimensions remains a failure, not eight invented zeroes.

Any quality failure makes the bounded decision `harmful` even if work was reduced. A complete, quality-passing fixture with reduced work can be `bounded benefit`; no measured improvement is `neutral`; incomplete/provider-missing quality is `insufficient evidence`. The issue decision remains insufficient until separate live/real-adapter/production-quality closure evidence exists. No opaque aggregate score is added.

Each cell exports source and current evidence through the existing transfer API into a fresh reviewer CAS. It verifies that deterministic evidence can be consumed without rerunning commands, the producer is still `developer`, and required judgments remain blocked without a provider. Evidence never becomes human approval or independent approval merely by import. A review baseline is an unchanged semantic reference, not current judgment for a changed surface.

The fixture requests completion, not merge or release. It has no production PR/CI/approval/mergeability/authorization provider or production mutation path. Existing decision-point tests retain stale/missing external-fact, denied actor, changed HEAD and post-observation negatives. Calling this pilot cannot make historical GitHub green state current.

## Commands and stop conditions

Use the repository-supported Node 24 runtime. Core tests also run on the available Node 22 local sandbox, but that is not full repository integration evidence.

```bash
node --test scripts/test-verification-reuse-measurement-core.mjs
node --test scripts/test-verification-reuse-measurement.mjs
node scripts/verification-reuse-measurement.mjs \
  --provider fixture --repetitions 2 --output /tmp/ask-reuse-fixture-new-run

# Diagnostic path: actual gates, no model and no invented semantic baseline.
node scripts/verification-reuse-measurement.mjs \
  --provider unavailable --repetitions 2 --output /tmp/ask-reuse-unavailable-new-run
```

For a real run, select an installed trusted Codex binary, read its exact `--version` string, select one accessible model and supply a scoped API credential through the existing operator secret mechanism. Do not put credentials in a PR checkout or run untrusted PR code with secrets.

```bash
# CODEX_API_KEY must already be supplied by the operator's secret mechanism.
node scripts/verification-reuse-measurement.mjs \
  --provider codex --allow-live --repetitions 2 \
  --codex-bin /absolute/path/to/codex \
  --codex-version 'codex-cli EXACT_INSTALLED_VERSION' \
  --model OPERATOR_SELECTED_MODEL \
  --output /tmp/ask-reuse-live-new-run
```

The CLI makes no silent model fallback. Invalid pins/options or an existing output file stop before the run. Gate/protocol failure, a failed installed provider, identity drift, unknown/unbounded review or quality regression stop further trials. Token-unavailable alone is preserved as unavailable rather than fabricating usage. Completed rows and partial result remain inspectable. No PR workflow executes the live provider or receives a model credential.

## Formal Verification Contract

Artifact: `ASK-274-runtime-reuse-measurement-v1`.
Upstream: #274, PRs #279/#297/#302, `docs/verification-reuse-completion-contract.md`, `docs/adapter-capability-matrix.md`, Metrics Event privacy/native-unit meanings.

Change boundary: four new pilot/runtime/measurement modules, two test modules, one result schema, this document, and focused workflow extensions. Existing CAS, exact/scoped engines, completion policy/schema, managed adapters, #275, frozen benchmarks and production action paths are unchanged.

Required candidate checks:

```bash
node --test scripts/test-verification-reuse-measurement-core.mjs
node --test scripts/test-verification-reuse-measurement.mjs
node --test scripts/test-verification-decision-core.mjs
node --test scripts/test-verification-reuse-completion.mjs
node scripts/test-verification-evidence.mjs
node scripts/test-verification-scoped-reuse.mjs
node scripts/validate-repo.mjs
git diff --check origin/main...HEAD
```

The unchanged exact/scoped/completion suites cover unrelated/affected changes, unknown dependencies, gate/runtime/toolchain invalidation, unchanged/changed semantic surfaces, independent judgment, stale/missing external state, developer self-approval rejection, repository/target/adapter transplant and evidence tampering. The new tests cover real A/B/C count comparison, initial acquisition, explicit fixture/native distinction, model failures/timeouts, unavailable tokens, partial measurement, quality regression, durable output/privacy and repeat-native-count reproducibility.

The PR validation record, not this command list, states which checks actually passed on its head. Implementation self-review is not independent GitHub or human approval. Remaining risks are completeness of declared dependencies, truthful trusted provider/actor mapping, unverified installed runtime behavior, toy-fixture representativeness and unmeasured real model quality/work. Keep Issue #274 open until those applicable closure conditions have evidence.
