# Runtime-successor native report policy

Status: unexecuted implementation candidate. This does not change the completed
historical #234 experiment, authorize a measured run, or establish adoption.

## Problem and decision

The historical Prompt wrapper names eleven count fields. The actual #197 raw
engineering result represents several correctness dimensions as categorical
observations, not counts. A `pass` observation is not evidence that a separate
failure-count metric was measured as zero. Counting arbitrary evidence references
would not recover the number of failures either.

The successor report retains categorical correctness observations. It uses a
separately identified `prompt_successor_native_comparison_policy@1.0.0` instead
of manufacturing the old count fields. The historical policy/Schema/validator
remain unchanged. This projection difference must appear in the new experiment's
preregistration and governance binding before any measured output is examined.
A runtime-only label is not sufficient to describe the whole successor delta.

Quality medians/sign counts, token reduction, token MAD and duration/quality
tradeoff thresholds retain the exact inherited values, bound by digest. The new
projection policy is additional: correctness and required-mechanism candidate
states must be positive; unknown/unavailable/not-evaluated/manual-review states
remain insufficient. A negative candidate state is disqualifying even if the
baseline has the same negative state. This is deliberately stricter than merely
comparing equal zero-increase counts. It is not a post-result interpretation.

## Source and evidence boundaries

`calculateSuccessorComparison` is a pure calculation function, not an evidence
reader or authority. Synthetic unit tests may use fabricated rows and must not
call their outputs empirical results.

`buildSuccessorComparisonFromProvenance` accepts only opaque handles created by
the actual execution/evaluator/admission re-verification path. It does not accept
raw caller success flags, a saved-artifact-reader handle, or a copied digest-shaped
object. At present this entrypoint remains `synthetic_integration_only`; a report
cannot authorize measured evidence access, deployment, or Portfolio mutation.

Reports preserve exact pair identities and require all 14 Codex pairs. Missing
cases are insufficient; duplicate, cross-adapter and transplanted cases are
rejected. No Claude success, cross-model inference or repository-wide adoption
is derived. Unknown cached tokens do not alter the input-plus-output total.
Nonfinite values, unsafe token totals and zero denominators are not statistics.

## Remaining implementation, separate from test execution

The new runtime-bound #277/#278 materialization, complete permission-gated measured
orchestrator and actual source/evaluator integration tests still require closure.
The report above does not replace those tasks. No measured launcher is implicitly
provided by the no-launch preparation CLI. No empty recommendation policy may be
mistaken for a useful adopt/retain decision pipeline.

## Required validation after publication

- Execute the new report tests and delivery tests on Node 24.
- Run existing successor tests plus actual native fake-process integration.
- Verify the report from actual generic evaluator/admission APIs, not only
  fabricated saved artifacts.
- Independently review the categorical projection and its pre-result binding.
- Verify historical #234 artifacts and their old outcomes remain unchanged.

No commands in this document have been executed as product tests in this update.
