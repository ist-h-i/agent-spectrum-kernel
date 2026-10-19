# Bounded personal evolution run

Spec: `personal-evolution-unattended-spec-v1`, revision 1. Upstream:
`personal-evolution-cli-spec-v1@3`, #385, #379 and the owner's 2026-10-19
instruction to connect the existing operations without live development runs.

- RUN-1: one explicit invocation fixes the target, permitted candidate paths,
  source review method, allowed decision actions, cycle limit and execution
  budget. It composes existing generation, comparison and original grading APIs.
- RUN-2: source approval requires an actually completed configured review bound
  to the exact candidate content, or an applicable existing approval. Missing,
  declined, malformed, consumed or unknown review work stops without another route.
- RUN-3: the confirmed run policy supplies the caller's bounded authorization
  for evaluation confirmation and allowed decisions. A verifier result alone
  never grants authority. Unknown dimensions and frozen recommendations persist.
- RUN-4: completed no-op and candidate rejection receipts link to the next
  request. Rejection retires only the candidate, preserves the baseline and
  Portfolio, and is verified against its exact decision and lifecycle context.
- RUN-5: bounded subsequent cycles use a reviewed public problem and prior
  receipt reference. Consumed incomplete work never restarts; complete work is
  read without repeating generation, comparison or grading. Adoption/application
  remains the existing separate boundary and is reported rather than performed.

Verification Contract: `personal-evolution-unattended-verification-v1@1`;
upstream `personal-evolution-unattended-spec-v1@1`. Retain
`formal_verification_contract` under `ask.verification-proof-policy@1.0.0`:
persisted lifecycle, external review I/O, authorization, cross-module and PR
handoff boundaries apply. Prove RUN-1–5 with artificial targets and fake
provider/runner/grading: two cycles, exact invocation counts, no-change,
insufficient/negative evidence, rejection, interruption, resume and input drift.
Existing CLI, generation, primary pair, saved-result and Evolution regressions
remain the surrounding contract. No live model, private grader rerun, actual
candidate adoption or Mac settings are part of development verification.

Implementation Contract: `personal-evolution-unattended-implementation-v1@1`;
upstream spec/verification above. Change boundary: a thin personal CLI composer,
source review acceptance and dedicated rejection receipt writer/verifier, using
existing Registry/Portfolio/Evolution storage and execution components. No new
runner, scorer, general state machine or evidence platform.

## Configuration and one-shot procedure

Prepare the existing management inputs described in
[the personal CLI procedure](personal-evolution-cli.md#one-time-management-input)
in a clean committed ASK checkout. The blueprint normally selects the existing
nine primary fixtures. Keep the original scoring selector, resource templates,
recommendation policy and action mapping. Add this optional `unattended` object
before configuring a **fresh** profile:

```json
{
  "allowedPaths": ["prompt.md"],
  "sourceReview": {
    "command": ["/absolute/node", "/absolute/source-review.mjs"],
    "timeoutMs": 3600000,
    "source": {
      "path": "/absolute/source-review.mjs",
      "digest": "sha256:<raw-byte-sha256>"
    },
    "allowExistingApproval": false
  },
  "decisionActions": ["retain_current", "revise_candidate", "insufficient_evidence", "reject_candidate"],
  "maxCycles": 2,
  "maxDurationMs": 1216800000,
  "maxComparisonTokens": 180000000
}
```

Replace the paths, digest and allowed candidate paths with reviewed inputs.
The reviewer is an explicitly selected program; its pinned source path must be
one command argument. Hash its raw bytes with the existing `comparisonHash`
helper. No reviewer or model is selected implicitly. The caller is responsible
for reviewing the program and any dependencies before confirming the policy.

The command receives one JSON object on stdin: `policy_digest`, the full
`review-source` `source` view (exact before/after files, candidate reference,
inherited scope/effects/maintenance and approval attestation), and `files` with
each `path`, `before_digest` and `raw_digest`. It must actually inspect the
source and return exactly this JSON shape on stdout:

```text
{
  input_digest: canonicalDigest(the complete input),
  candidate_asset: the exact input.source.candidate_asset,
  verdict: "approved" | "declined" | "needs_action",
  reason: a nonempty reason of at most 2048 characters,
  file_reviews: [
    {path, raw_digest, verdict, reason}
  ]
}
```

`file_reviews` must cover every input file in order and bind its exact bytes.
Every file verdict must approve for the overall approval to be accepted. Exit
zero alone is insufficient. Unknown safety/scope/effect facts must lead to a
decline or `needs_action`. Do not implement an unconditional approval program.
Existing approval reuse is disabled by default; explicitly enabling it only
accepts the existing CLI's approval for this exact candidate and inherited
parent. It cannot bypass a requested reviewer whose result is missing, declined
or invalid.

Run these commands only after a new direct human instruction authorizes the
configured real provider, comparison and reviewer execution. Development tests
use artificial inputs and fake dispatch, and do not supply that authorization.

```sh
node scripts/ask-personal-evolution-cli.mjs configure --config /absolute/management.json --profile /absolute/new-profile
node scripts/ask-personal-evolution-cli.mjs run --profile /absolute/new-profile --output /absolute/new-run --target TARGET --problem /absolute/public-problem.txt --confirmed-policy-digest DIGEST_FROM_CONFIGURE
```

Confirming the digest explicitly delegates the policy's bounded evaluation
confirmation and allowed decisions. The configured reviewer still has to
complete its source review. Every later request keeps the same reviewed public
problem, baseline target and scope and references the preceding completed
receipt; it does not claim to synthesize a new problem from private development
history. The caller chooses a new run to change that scope or problem.

For a normal lost command response, inspect the retained files and resume with:

```sh
node scripts/ask-personal-evolution-cli.mjs run --output /absolute/new-run
node scripts/ask-personal-evolution-cli.mjs status --cycle /absolute/new-run/cycle-1
```

Do not delete command locks or consumed records to make a retry possible. A
lock left by a killed process requires establishing its outcome first. Each
cycle keeps the existing command inputs, fixed pair, original saved grading,
decision and receipt; `run-input.json` fixes the one invocation's input rather
than introducing another lifecycle ledger. Reviewer request/result records
retain the actual review, including a refusal. Completed generation and saved
comparison results are reused; consumed incomplete work is preserved and stops.

## Outcomes and budgets

- `completed / cycle_limit_reached`: every reported receipt is verified. A
  candidate may have no effect, regress, remain insufficient, or be rejected.
  Quality improvement is not implied. Candidate rejection retires only that
  candidate in its derived Registry snapshot; the baseline and Portfolio remain.
- `needs_action / unattended_run_stopped_preserved`: inspect `detail` and the
  cycle's saved readout. Partial evidence remains available. Missing review,
  evaluation, safety or consumed terminal facts cannot become approval.
- `needs_action / run_in_progress_or_interrupted`: another command or an
  unresolved interrupted command owns the run. No new child is launched.
- Adoption/retirement outside the allowed candidate rejection is reported as a
  separate authority requirement. `run` performs no Portfolio adoption or
  physical installation and never relabels a positive action as a hold.

`maxComparisonTokens` bounds **reserved comparison admission budgets**, using
the existing per-fixture primary budget for both roles. It is not a hard total
provider-token limit. Generation and review token telemetry is absent from the
existing receipts and remains `auxiliary_token_usage: "Unknown"`. Do not count
it as zero or claim a known aggregate token cost.

`maxDurationMs` fixes a dispatch deadline measured from the initial run. Before
launching a child, the composer reserves its full existing timeout, and before
a new cycle it reserves generation, review and the full comparison. Original
child/pair budgets, retry zero and serial execution are retained. This is a
dispatch admission guarantee; it does not terminate or discard already running
work at the wall-clock deadline. Required budgets depend on fixture count; the
example reserves two full nine-fixture comparisons plus generation/review time.
Smaller budgets stop before the next dispatch and preserve all partial work.

Tests, independent-review and CI evidence belongs to the PR. Live unattended
operation and a particular candidate's effectiveness require separate evidence.
