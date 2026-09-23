# Verification reuse completion and measurement contract

Progresses #274. This is an opt-in runtime contract, not an always-on agent instruction or a claim that the issue is complete.

## Audit boundary

The implementation was audited against main `77f461ca3693d7ae15de9327e33f38d579c2d84e`, after PR #297 (`f1e331b861f5c0d80938adf5ef84e23a8404b5ce`) and PR #299. The old Issue #274 Slice 2/3 status is not the implementation baseline.

PR #279 already supplies the signed verification evidence, CAS, exact planner and deterministic transfer contract. PR #297 already supplies immutable gate/dependency inventories, actual-Git scoped invalidation, a bounded changed-path review request, and conservative current coverage. None of those artifact formats or APIs is replaced here.

The actual remaining implementation gaps were current rerun acceptance, newly affected semantic surfaces beyond directly changed files, a positive decision-point observation path, and multirevision evaluation/handoff support. The old `buildCurrentCoverage()` continues to have its original conservative behavior; the new opt-in entry point is `buildFinalVerificationCoverage()`.

## Inputs and responsibility

- Existing `.ask/verification-scoped-gates.json`, `.ask/verification-scoped-requirements.json`, dependency manifests and signed evidence remain authoritative for deterministic requirements.
- New `.ask/verification-completion-policy.json` must be present at the source baseline and byte-identical at the target. Its schema is `schemas/verification-completion-policy.schema.json`.
- `scripts/verification-reuse-completion.mjs` resolves Git and existing evidence contracts. `scripts/verification-decision-core.mjs` implements the bounded observation protocol and metrics accounting without adapter dependencies.
- #275 remains responsible for Work Packages, checkpointing, snapshots and context rollover. This implementation does not import or recreate its state model.

Only immutable committed Git inputs and the declared Node process environment are supported. Keep the evidence store and generated output outside the target repository. Final coverage rejects a non-current HEAD, dirty worktree/index, and assume-unchanged/skip-worktree flags. This is not a filesystem snapshot or proof about ignored/private inputs, undeclared dependencies, external build resources or unsupported runtimes. Those require an appropriate complete contract; unknown dependencies stay blocked/rerun-required.

## Deterministic completion

`prepareVerificationCompletion({ repositoryRoot, storeRoot, targetRevision })` always recomputes the scoped plan from actual Git trees. It does not accept a caller-authored plan, changed-path list or coverage result.

For each required gate it constructs the exact current identity from the actual target manifest, selected inputs, manifest bytes, command/runner, current runtime and current obligations. The unchanged Slice 1 exact planner validates current rerun evidence, producer attestation, CAS identity, terminal result and obligation coverage. A current exact failure, conflict or invalid authority cannot be hidden by selecting a historical green result. Before accepting historical scoped evidence, its baseline exact identity is also resolved to detect conflicting accepted outcomes in an imported store.

Valid current exact evidence may discharge deterministic execution but never an outstanding independent judgment. A failed/missing/transplanted input cannot be repaired by an observer reporting approval. No new CAS or transfer format is introduced. Evidence remains developer-produced after export/import; importing it does not confer reviewer, independent, human or action authority.

## Selective semantic request

The bounded request binds repository, base and target, tree, requirements, scoped plan and resolved evidence. It contains verified deterministic evidence references, declared prior review/finding references, obligation references and affected paths only. Prior semantic references are **baseline references, not authenticated current review results**; their mere presence never satisfies a current judgment.

The semantic inventory is compared across actual trees, including additions, deletions and mode changes. A direct source change includes only the changed declared semantic paths. A changed declared upstream input, such as a generator or configuration file, invalidates the gate's declared semantic surface and includes the unchanged but newly affected paths. This conservative gate-level dependency relationship is explicit policy, not an LLM-inferred dependency graph.

More than 256 review paths, an unknown/incomplete dependency closure, an unsupported semantic input or a truncated diff yields `blocked_unbounded_or_unknown`. No truncated package can claim a complete review. Unknown closure needs a valid new baseline/contract, not an invented dependency proof.

`required_judgment_refs` distinguishes unconditional `gate:<gate-id>` requirements from changed-surface `delta:<gate-id>` requirements. Status `independent_judgment_required` cannot be discharged by old review JSON or current deterministic reruns. Raw source, full diff, command output, prompts, transcripts, secrets and private evaluators are not included in the request.

## Decision-point observations

The policy is a bounded object, for example:

```json
{
  "schema_version": "1.0.0",
  "repository_id": "github.com/example/project",
  "maximum_decision_ms": 60000,
  "providers": [
    {
      "kind": "independent_judgment",
      "provider_id": "installed-review-provider",
      "actor_ids": ["independent-reviewer"]
    }
  ],
  "forbidden_actor_ids": ["implementation-actor"]
}
```

The host explicitly supplies trusted executable functions keyed by the pinned `provider_id`. Repository data cannot load executable provider code. These functions are a **trusted installation/integration boundary**, not a new authentication mechanism: a malicious host function can lie just as a malicious runner can. The policy name alone does not authenticate a service or person. Adopting integrations must authenticate their upstream sources, enforce actor mapping and read the authoritative system on every invocation. Do not implement them by rewrapping historical evidence with a new challenge.

Each provider receives a closed query containing repository, full target revision/tree, requirement/plan/request/policy digests, claim, kind, obligation reference, a fresh challenge and an `initial` or `confirm` phase. It receives an AbortSignal as the second argument. It must be read-only and cancellation-aware. Its bounded response has exactly:

```javascript
{
  query, // exact request binding, including challenge and phase
  status: "satisfied", // or "unsatisfied" / "unavailable"
  actor_id: "independent-reviewer", // null only when actor authority is not needed
  evidence_digest: "sha256:<64 lowercase hexadecimal characters>"
}
```

A positive response needs an evidence digest. Independent judgment, approval, human approval and authorization additionally need an explicitly allowed actor that is not a forbidden implementation actor or a known developer evidence producer. Host policy must include all implementation actor aliases; a key digest alone cannot identify every alias of a human or account. Human approval is a separate observation kind and is never synthesized from another kind.

All required facts are read twice in one bounded decision window. A changed response, wrong binding, cached response from a previous call, timeout, unavailable provider, denied fact or unknown field fails closed. Provider errors are sanitized; raw error responses are not persisted. Git state, policy and evidence resolution are checked again after the observers return.

For `completion`, all declared current obligations and independent judgments are required. For `merge`, PR HEAD, required CI, approval, mergeability and authorization are mandatory even if omitted from repository requirements. `release` additionally requires release state. A satisfied approval does not substitute for any other fact or vice versa. The observer for each kind must validate the claim-specific semantics, not just an old green label.

Two observations are not an atomic snapshot of external systems. The returned artifact is diagnostic and always has `authorizes_action: false` and `historical_state_is_current: false`. The downstream actor must still enforce native authorization, exact-head compare-and-swap and its normal merge/release gates at action time. Historical coverage is not reusable as action authority.

### Integration availability

This PR supplies the executable decision protocol and integration API, not a production GitHub approval collector, a live model review producer, a human-approval service, or an automatic CI-skipper. Without installed trusted providers, claims requiring these facts remain blocked. Tests use explicitly synthetic providers and make no live-PR, real independent review, human approval or cross-adapter runtime parity claim.

This distinction is intentional: a `fresh: true` field or a freshly signed copy of old external state would not complete the integration. Production provider wiring and live runtime evaluation remain issue-level work.

## Invocation

```bash
node scripts/verification-reuse-completion.mjs prepare \
  --repository /path/to/repository --store /path/to/external-store \
  --target <full-current-commit> --output /path/outside/repository/plan.json

node scripts/verification-reuse-completion.mjs coverage \
  --repository /path/to/repository --store /path/to/external-store \
  --target <full-current-commit> --claim merge
```

The CLI does not accept historical observations or provider JSON and exits nonzero for blocked coverage. Provider-enabled hosts import `buildFinalVerificationCoverage({ repositoryRoot, storeRoot, targetRevision, claim, providers })`. `prepare` is a plan, not final coverage; after reruns, prepare again because the current evidence and review-request digests change. Final coverage itself recomputes them.

## Native-unit measurement contract

`summarizeVerificationWork()` consumes resolved gate dispositions and runner/dispatch-boundary events. It reports required/full-rerun counts, exact/scoped/reused counts, required reruns, actually executed distinct gates, execution attempts, saved deterministic executions, uncovered gates, required judgments, review dispatches and actual AI requests.

Planned reruns are not executions. Uncovered/blocked gates are not counted as saved work. Repeated execution attempts are separate from distinct rerun gates. The latest failed attempt is not hidden by an earlier success. A deterministic success event records execution outcome; it is **not** a substitute for the evidence validator or final coverage. Callers must report both metrics and validated coverage.

Events are emitted at their actual boundary:

- `deterministic_execution` includes gate ID and succeeded/failed status;
- `review_request_dispatch` counts routing to the review integration, including an explicitly synthetic test integration;
- `ai_request` counts an actual model request, not a constructed request artifact or a fixture dispatch.

Input/output/cached tokens and end-to-end elapsed milliseconds remain `{ "status": "unavailable", "value": null, "source_ref": null }` without runtime observations. Observed values require an explicit source reference. Missing is never inferred as zero. Individual fixture process durations in signed test evidence are not reported as end-to-end model workflow latency.

## Multirevision regression fixture

`node scripts/test-verification-reuse-completion.mjs` creates real temporary Git repositories and executes two small deterministic Node gates. It compares a full-rerun condition, scoped/rerun-required condition and same-target exact reuse over initial, docs-only, source, generator and schema revisions. Both conditions start from the same signed source evidence; common baseline acquisition is outside the compared five revisions.

The assertions require 10 full-rerun executions versus 4 selective executions and 6 saved deterministic executions per adapter-labelled fixture. The fixture review integration receives 5 versus 3 dispatches; **actual AI requests are zero in both conditions**. These values are computed from actual fixture execution/dispatch events and checked alongside current deterministic coverage and independent-judgment boundaries, not inferred from the plan alone. The test prints its bounded per-revision report. These are regression expectations until the test has actually passed on the candidate.

The two runner identities are `codex` and `claude-code`. This exercises the adapter-neutral contract and preservation/rejection of adapter provenance, not real Codex or Claude Code invocation. Additional negatives cover transplant, unknown dependency, conflicts, policy drift, hidden index flags, concurrent decision changes, missing current facts, developer handoff and bounded CLI behavior.

## Formal verification contract and remaining work

Artifact: `ASK-274-verification-reuse-completion-v1`. Upstream: #274, PR #279 and PR #297. The change boundary is two new runtime modules, their focused tests, one policy schema, this contract and focused CI coverage. Exact/scoped evidence bytes, frozen benchmarks, #275 and release/merge actions are outside the change boundary.

Required checks are the decision-core tests, actual repository integration fixture, existing exact/scoped regression tests, repository validation, and diff whitespace validation. Local syntax/core checks do not replace Node 24 full-repository CI. Published PR validation records distinguish the checks that actually ran from the intended commands.

Issue #274 remains open: production observer/model integration, exact fresh-clone/full integration acceptance where unavailable, and live end-to-end token/time/effectiveness evaluation are not completed by this fixture. No #198 benchmark, quality improvement, implicit approval, product ROI or automatic workflow enforcement is claimed. Independent review before merge remains separate from implementation self-checks.
