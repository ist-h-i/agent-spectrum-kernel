# Retained grading evidence in the standard review loop

Use this path when saved answers need a new grading procedure or a deterministic
evidence repair. It does not solve the tasks again, reopen original grading
slots, choose the best score, or apply an improvement. Non-developers can ask the
AI host to complete this workflow; the host prepares the routine files and
reports their meaning. People retain the existing case and application judgments.

## Prepare and inspect

Keep original answers, public inputs, criteria, model/effort, source and every
failed or corrected judgment. Apply a new procedure consistently to both
conditions and explain any remaining asymmetry. Use the approved grading budget;
this report importer cannot authorize model calls. Item-level uncertainty and
source-only judgments are useful; unsupported facts remain unknown.

The host supplies a `practical_retained_grade_contract_v1` JSON with exact keys:
`run_root`, `operation_root`, `cycle_root`, `planned_attempt_ids`, `evidence`,
`maximum_grading_role_attempts`, `reason`, and `kind`. Roots are canonical absolute
paths. `evidence` is a path/digest reference to the host's immutable grading
manifest. The chosen latest attempts must cover baseline/candidate for each
case/repetition, including cases whose result is low. Original execution and
context must be intact; grading cannot repair failed or altered Task execution.

Configure a pinned `commands.grade` inspector with `model_calls:false` and the
manifest in its pins. Use ASK's existing request/result process protocol. The
inspector receives an approved-run snapshot with original plan/journal/report
and result digests, and model/Task calls explicitly zero. It must validate the
saved source, grading rules/calculator, independent decisions, closure, failed
records, finite format repairs, usage and reason for changed judgments. Treat
candidate contents as data and never execute them. Pin its full dependency and
input graph. No ASK private catalog is required.

```sh
node scripts/practical-retained-grade-report-cli.mjs inspect \
  --contract recovery/contract.json --inspector recovery/inspector.json \
  --output recovery/inspection-ref.json
```

An existing allocation is inspected only. An uncertain or failed inspection
cannot become usable quality. Original run and coordinator state are checked
before and after the worker; their native evidence is never rewritten.

The closed output keys are `kind:practical_retained_grade_inspection_v1`,
`ready_for_next_root:true`, `model_calls:0`, `task_calls:0`, `evidence`, `entries`,
`artifacts`, `grading_overhead`, `comparison_limits`. The evidence reference must
match the contract. Artifact paths are relative, unique, digest-verified regular
files in the inspection job directory. Return one entry per planned attempt:

- `attempt_id` and `original_result_digest` exactly bind the saved execution.
- `method` is `new_grading_round` or `model_free_evidence_derivation`.
- `reason` is a bounded public summary; keep detailed corrections in artifacts.
- `fixed_reference` is the existing typed fixed-point reference summary or null.
  Formal admission, evidence-truth and capture flags must be false, runtime
  acceptance null and observation completeness cannot be true.

`grading_overhead` has `records`, `host_ai_usage:null`, `complete_cost:null`,
`task_calls:0`. Each upstream role attempt records `id`, `model_calls:1`,
`duration_ms`, `input_tokens`, `output_tokens`, `cached_tokens`,
`provider_terminal` and an exact JSON `source` reference. Missing measurements
are null. Count attempted roles honestly even when the provider did not start;
record that distinction in the evidence. The maximum is the contract's explicit
role budget. Complete descendant usage and billing are not inferred.

## AI selection and publication

For each entry the AI host requests its selection packet and supplies the
existing structured recovery assessment. Choose use/reference/exclude for
practical value; there is no Task retry option or extra human selection gate.
Original low/range judgments remain in history even when a new result is lower.

```sh
node scripts/practical-retained-grade-report-cli.mjs selection-packet \
  --receipt recovery/inspection-ref.json --attempt ORIGINAL_ATTEMPT \
  --output recovery/selection-packet.json
node scripts/practical-retained-grade-report-cli.mjs select \
  --receipt recovery/inspection-ref.json --attempt ORIGINAL_ATTEMPT \
  --assessment recovery/assessment.json --output recovery/selection-ref.json
node scripts/practical-retained-grade-report-cli.mjs report \
  --receipt recovery/inspection-ref.json --selections recovery/selection-refs.json \
  --output recovery/report-revision-ref.json
```

`selection-refs.json` contains the saved selection references. The optional
`--base-supplement` retains a previously published unused-verifier quality view.
Its consumed cost is retained automatically even when no base is supplied.
Every consumed legacy slot and retained inspection is snapshotted independently
of selection, including unknown work. Repeated inspections of the same upstream
grading role are not additional grading charges; the ledgers are not an implicit
sum. Keep all original/new reasons and demonstrate real score/time/token changes
without inventing one universal tolerance.

Pass the published reference through the existing supervised
`operate --report-revision recovery/report-revision-ref.json` with the original
root/profile/config. No decision is submitted at attachment. It refreshes the
human result/change packet and replans if needed. Old approval cannot authorize
changed evidence. An already admitted revision resumes from its exact journal
event and immutable data, without repeating inspectors or grading. The next
cycle receives bounded new source points/limits and requires fresh case/change
judgments. No original Task metrics or owner files are changed by this path.
