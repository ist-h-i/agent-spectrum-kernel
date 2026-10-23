# Human-started primary comparison and offline nine-condition report

SPEC-P24-MANUAL-COMPARISON-1, revision 1. Upstream: the requested three model
settings × P/K2/F report and `primary-evaluation-batch-contract.md`.
The human chooses when to start; update triggers and ordinary-Codex automatic
startup are separate work. Reuse the existing batch, factory grading adapter,
single-shot runner and retained report JSON. No native/runtime gate is lifted.

Acceptance:

- M1: `node scripts/ask-primary-evaluation-batch.mjs start ROOT --confirm DIGEST`
  confirms the retained manifest and creates the registered grading adapter from
  the exact resources already bound in every block. Missing/mismatched pins,
  existing blockers and consumed/unknown starts refuse before dispatch. No CLI
  option supplies readiness, another adapter, a fake runner, retries or resume.
- M2: the command invokes `startPrimaryEvaluationBatch` exactly once. SIGINT and
  SIGTERM relay to its existing AbortSignal and listeners are removed on every
  exit. Completed returns 0; stopped/unknown 1; preflight blocked 9; invalid input
  or exception 10. It does not add another process manager or termination promise.
- R1: offline input binds saved batch reports by raw digest, model/effort,
  repetition and task scope. Keep nine groups distinct, all expected rows,
  missing evidence, failed attempts and synthetic/observed origins.
- R2: the report preserves quality zero versus unknown, usage/time lower bounds
  versus complete totals, unknown monetary costs and missing success evidence.
  Public test success or numeric quality alone never becomes adoption success.
- R3: fresh report output contains inspectable JSON and standalone graphs with
  explicit missing-data and synthetic labels. No model/native/grader dispatch,
  old-run overwrite, implicit private asset read, guessed prices or dependencies.

## Preparation and start

Prepare with the existing `ask-primary-evaluation-prepare.mjs PUBLIC_INPUTS
OPTIONS_JSON`, explicitly selecting `fixtureSet:catalog24`, model/effort,
`kernel_principles_v2`, the closed primary input contract, exact selector and
per-batch private resource map pins, and a fresh output root. Inspect its plans
and manifest before confirming the digest. Each model/repetition needs distinct
run/output and grading-output roots. Never reuse a consumed plan.

```sh
node scripts/ask-primary-evaluation-batch.mjs inspect BATCH_ROOT
node scripts/ask-primary-evaluation-batch.mjs start BATCH_ROOT --confirm sha256:MANIFEST_RAW_HASH
node scripts/ask-primary-evaluation-batch.mjs report BATCH_ROOT
```

Paths/hashes above are placeholders, not a live plan. `inspect` retains its
model-free behavior; `start` performs an additional factory-adapter inspection.
The private resources are taken from the pinned manifest, not from CLI overrides.
Missing original/review/admission resources, unqualified closed-input runtime,
and client/focused/performance native gates keep their current refusal behavior.
Moving the start to a Terminal does not qualify those conditions or prove which
outer constraints apply. No sandbox disabling, HOME/auth changes or old-grant reuse.

The smallest 9-slot measurement smoke and full 24×9 comparison are different
plans. Measurement-only smoke can retain quality null; a quality smoke needs
the selected task's grading evidence. All need their applicable runtime contract.
Native3 is required for qualified full24 private scores, not for unrelated-task measurement. Exploratory full24 may retain unqualified scores as unknown, but candidate-code verification still needs its actual isolation boundary. Repetition
count, total time/token reservation and provider/model compatibility remain
fixed-plan decisions, not inferred from this command or a synthetic test.

## Saved JSON to nine-condition figures

Export each retained batch report into a new file and record its raw SHA-256.
For example, a shell subshell with noclobber protects an existing result:

```sh
(set -C; node scripts/ask-primary-evaluation-batch.mjs report BATCH_ROOT > NEW_BATCH_REPORT_JSON)
node scripts/ask-primary-nine-condition-report.mjs --manifest REPORT_INPUT_JSON --output NEW_REPORT_DIRECTORY
```

`REPORT_INPUT_JSON` is a closed offline input document. Example: one setting's
smoke report; the other six rows remain explicitly not_reported. Replace every
placeholder, and use the canonical full24 fixture order for the full comparison.
All input paths are canonical absolute paths; all output directories must be new.

```json
{
  "kind": "ask_primary_nine_condition_report_input_v1",
  "evidence_kind": "observed",
  "fixture_ids": ["hi-authorization-exception"],
  "repetitions": [1],
  "reports": [{
    "path": "/absolute/new-sol-high-batch-report.json",
    "digest": "sha256:REPORT_RAW_HASH",
    "model": "gpt-6.1-sol",
    "reasoning": "high",
    "repetition": 1
  }]
}
```

The three settings are gpt-6.1-sol high, gpt-6.1-sol low and gpt-6-luna max;
each has plain, kernel_principles_v2 and full_ask. Each repetition has at most
one batch report per setting. Duplicate slots/runs/settings, different retained
task/verification/scoring pins, conflicting child model/effort, invalid metrics
or changed input bytes refuse instead of pooling them. Missing slots remain.
Synthetic inputs use evidence_kind:synthetic and every figure says they are
fixtures, not real quality. Never relabel a fixture or old null-quality run.

Output: report.json, report.md, quality-cost.svg, quality-tokens.svg and
quality-time.svg. Only groups with complete quality and x-axis coverage are
plotted; all nine groups and missing/failed rows remain in JSON/Markdown.
Numeric quality is the retained per-condition private normalized requirement
score [0,1], including zero; a completed condition can coexist with another
manual/null condition. The report does not run or requalify a grader.

Monetary cost is unknown by default, so the cost graph has an explicit empty
state. Optional `api_equivalent_prices` has exactly `currency`, `as_of` (YYYY-MM-DD),
`source` (credential-free HTTPS document URL), and `models`: one entry per model
with `model`, `input_per_million`, `cached_input_per_million`, `output_per_million`.
Rates must be explicit finite nonnegative numbers. No prices are fetched or
assumed. The estimate is ((input-cached)×inputRate + cached×cachedRate +
output×outputRate)/1M and requires all three usage counts. It is separately
labeled operator-supplied/unverified API-equivalent reported components, not
ChatGPT contract consumption, actual billing or total cost. Cache-write, tools,
setup/review/grading and other charges remain unknown; cached input is not added
again to total input+output tokens.

Full safety/blocker pass is not embedded in the retained batch projection.
Consequently full success count and cost per full success stay null/undefined;
an all-requirements/full-credit diagnostic is not adoption success. Condition
duration excludes separate grader/setup/provider time, so end-to-end totals
remain unknown. Public seed/source equality also cannot establish Full/kernel
instruction or startup equivalence: original pinned plans and runtime receipts
are still required for a qualified experiment. These figures are a projection,
not execution/scoring authority. A failed report write may leave a partial new
directory; retain it and do not overwrite or infer completion from one file.

## Verification contract

FVC-P24-MANUAL-COMPARISON-1 uses `formal_verification_contract` under
`ask.verification-proof-policy@1.0.0`: public API, cross-module lifecycle,
multiple specialized checks and durable independent-review handoff.
V-M1/M2: artificial module mocks prove exact dispatch, preflight refusal,
no retry, signal forwarding and cleanup including exception; real synthetic
batch regression proves the production API still rejects fake CLI dispatch.
V-R1/R2/R3: artificial saved reports prove distinct nine groups, exact identities,
tamper/duplicate refusal, partial and unknown results, zero-score preservation,
safe fresh outputs, explicit-rate arithmetic and labeled graphs. Synthetic observations establish only
software behavior. No test qualifies runtime, native3, real model quality or cost.
Source/contract/bundle checks and an independent final diff review are required
before the bounded implementation completion claim; publication is held.

## Unified saved measurements (revision 2)

SPEC-P24-MEASUREMENTS-2 / FVC-P24-MEASUREMENTS-2: delivery implementation;
formal verification contract (public API compatibility, multiple checks and
independent handoff). Reuse this module and its existing command for formal
batch reports and exploratory single-task reports; do not add a launcher.

- Both inputs become the same per-task/setting/condition measurement rows.
  `quality` remains the retained formal score; `reference_score` is separately
  derived from a digest-pinned public-criteria protocol and review. Neither
  public test success nor missing formal grades becomes a formal score.
- Exploratory inputs additionally pin the original plan and its declared K/Full
  instruction identities. Source/task/verification/protocol drift rejects.
  Resolved model, runtime qualification and native admission remain unverified
  where the saved evidence does not establish them.
- Score protocols are fixed before the new measurement, identical across all
  settings, and include every public requirement used for the reference score.
  Unknown criterion outcomes make the task score unknown. Diagnostic counts are
  supplemental and never silently replace the fixed task weighting.
- Charts use task-normalized 0–100 scores with equal task weight, model-setting
  colors and P/K2/F shapes. Formal/reference panels are separate. Each panel
  uses the intersection of tasks with score and both time/token observations
  in all nine groups; its denominator and excluded tasks are shown. X is summed
  attempt time or summed input+output, not parallel elapsed time or money.
- The Japanese HTML contains all planned rows, a task×nine-condition heatmap,
  completion/missing/unscorable counts and limitations. No price is guessed;
  cached input and reported reasoning are never added again to input/output.
- Preserve existing v1 input and formal validation. Add v2 input for multiple
  task reports per setting. Offline reads never start a model/native process,
  grant admission or edit a saved run. Keep the existing CLI and CI job.

Verification before completion: existing report/start tests; new artificial
24×9 rows, native report normalization, protocol/answer identity rejection,
zero/unknown separation, common-task chart denominator, escaping and fresh-output
checks; independent diff review. Synthetic checks are not runtime acceptance.


Revision 2 uses the same command with `kind:ask_primary_nine_condition_report_input_v2`.
Each report entry binds one retained `ask_user_comparison_report_v1` by path/digest,
model/reasoning/repetition and fixture_id, plus the original plan path/digest in
`plan`. Multiple task reports per setting are supported. No fake batch execution
or private grade is manufactured to ingest an exploratory run.

Optional `reference_protocol` and `reference_review` are each a path/digest pair.
The original execution plan must contain `reference_review_protocol_digest`
matching the protocol; prepare with `referenceReviewProtocolDigest` before start.
Old plans without this pin retain measurements but no plan-pinned reference score.
Offline consistency is not independent proof of when an operator created a plan.
Keep original start/terminal receipts for audit; no report grants authority.

Protocol fields are kind (`ask_reference_review_protocol_v1`), fixture_id,
source_digest, task_digest, verification_digest, criteria and limitations. Each
criterion has id, positive weight and a public-requirement description. Review
fields are kind (`ask_reference_review_v1`), evidence_kind, fixture_id, run_id,
plan_digest, protocol_digest and conditions in P/K2/F order. Each condition binds
the saved artifact digest map and has judgments (criterion_id, pass/fail/unknown,
nonempty evidence digests for decided outcomes) plus supplemental diagnostics.
All criteria must be decided for a reference score; unknown is not zero.
Diagnostics may count detected/missed/false_positives/duplicates/factual_or_locator_errors;
they do not silently alter the fixed weighted score. Native acceptance and
performance claims still require the applicable genuine observations.

Both input versions use one measurement schema and renderer, including Japanese
`report.html`, task×nine heatmap and reference-time/reference-tokens SVGs. Future
reports use this path rather than separate one-off Python reducers. Historical
HTML/data/scripts outside Git remain preserved, not reinterpreted as new runs.

The start adapter is an imported helper, not a second executable CLI. Human
starts stay on the existing batch command; exploratory starts stay on the
existing user-comparison command. Neither creates another execution engine.
