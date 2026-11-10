# Ordinary frontend review practical case

`ordinary-frontend-state-review` is one public, caller-owned practical case,
derived from `mp-frontend-state-review`. It is not a replacement or a new
admission for the frozen primary fixture. No original packet, source authority,
candidate, result, or catalog24 registration is changed.

The reviewed source, state contract, diff and tests are identical to the source
case. Only the task request, package identity and review output contract differ.
The task asks for an ordinary PR review, with no requested final merge judgment.
The schema and validator require findings and verification; the legacy decision
field is optional and accepts the same values. Both omission and presence pass
structural validation. The task does not tell an agent to avoid a decision,
choose a particular route, call a Skill or minimize its response.

## Delivery and scoring boundary

Deliver only `task.md` and the exact `workspace/**` files bound by
`input-manifest.json`. Never deliver this README, requirement record, evidence
map, scoring contract or verification-command metadata to the task agent or
candidate author. Keep the candidate frozen before selecting this case. The
existing human case-approval gate still applies before any model execution.

The required public command is `npm run validate:review`. State unit and
list/detail interaction commands are declared optional to capture actual
verification evidence without making successful interaction tests a prerequisite
for a correct review of deliberately faulty code. The unmodified seed has three
passing unit tests and one failing / one passing interaction test. Host reruns
do not prove that the task agent performed those checks. Input integrity is
checked by the practical worker and caller grader against the fixed inventory;
the output validator only checks output shape and source locations.

`requirement-record.json` has five binary requirements totaling 10 points:
material finding 4, truthful verification 2, non-defect restraint 1, actionable
evidence 2 and review-only scope 1. Missing evidence stays Unknown. Do not infer
semantic correctness from structural success or exact wording, finding count,
tool choice or route labels. Equivalent supported findings and remedies count.

`scoring-contract.json` supplies the caller grader's output path, trusted
JSON-validation command arguments and command-evidence requirement IDs. The
quality score never rewards or penalizes the optional decision field. Record
added final judgments separately, including narrative judgments in the retained
response, and mark incomplete capture Unknown. This is a descriptive observation,
not a penalty or proof that a route was unnecessary. Record existing observed
time/tokens and their coverage separately; shorter output alone is not success.

The current caller primary grading engine consumes the requirement/evidence-map/
verification-command shapes, but its closed fixture allowlist does not yet
include this new ID. Prepare a new pinned grader revision and configuration for
this case; do not modify an earlier run's grader or reuse old case approval.
Preserve its source-only, binary pass/fail/unknown summary and provider/independent
audit boundaries. Runtime acceptance, formal admission and model effectiveness
remain unverified. One paired case is a narrow observation, not general efficacy
evidence or a comprehensive evaluation suite.

## Preparation verification

Formal Verification Contract `ordinary-review-case@1`, selected under
`ask.verification-proof-policy@1.0.0` because this changes a public schema and
cross-agent evaluation inputs:

- OR-01: distinct identity; closed task input inventory; original source, tests
  and contract unchanged; scoring metadata stays outside delivered files.
- OR-02: no final judgment requested or required; public schema and validator
  accept either omission or an allowed optional decision and reject malformed
  outputs and false evidence locations.
- OR-03: preserved behavioral defect and allowed retained history remain
  observable with model-free native checks.
- OR-04: fixed binary weights and scope/evidence maps agree; route and judgment
  presence have no point effect; task verification and host checks stay separate.
- Required check: `node --test scripts/test-practical-ordinary-review-case.mjs`.
- Closure check: `node scripts/practical-ordinary-review-case.mjs validate`.
- Preparation only: these checks do not execute a candidate or a model, perform
  semantic grading, qualify the current caller grader or authorize evaluation.

Use `node scripts/practical-ordinary-review-case.mjs write` only while preparing
a new version to regenerate this fixture's public inventory and command binding.
Once approved, preserve the exact case assets and use a new approval for changes.
