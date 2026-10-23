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
Native3 is required for full24, not unrelated-task measurement alone. Repetition
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
