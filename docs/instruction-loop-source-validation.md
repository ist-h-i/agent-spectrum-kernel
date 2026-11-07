# Full candidate source validation

Spec: `full-source-validation@1`.

A scoped Full candidate may preserve file boundaries but violate required Skill
entrypoint contracts. Shallow generated source also omits historical objects
needed by repository validation, and generated reports can retain stale success.
The authoring/evaluation boundary must expose these failures before case approval.

The validator is executable code from the caller-trusted pinned baseline, not a
signature or proof that an arbitrary checkout is official ASK. Derived writers
cannot change validator/installer bytes, other authored content, untracked files
or file modes before another source executable is invoked.

The optional generator setting `sourceValidation: {kind: "ask_repository_v1"}`
selects the unchanged ASK repository validator. Existing profiles retain their
current behavior. This setting does not relax section, Envelope, proof or fixture
checks and does not approve Eval cases, effectiveness, adoption or owner writes.

Acceptance and Formal Verification Contract:

- S01: Legacy generation without the setting retains its existing source/history
  and output behavior. Unknown validation settings are refused.
- S02: Opt-in requires a complete local baseline Git ancestry and the tracked
  repository validator before authoring is dispatched or roots are allocated.
  The public generation request explains that entrypoint contracts must remain.
- S03: Generated source fetches that complete local ancestry without network
  recovery or modifying the baseline. Only allowed Markdown and existing trusted
  derived writers can change the generated source.
- S04: After normal fixture regeneration, the unchanged validator regenerates
  `docs/validation-report.md`. Nonzero or unavailable validation retains bounded
  private diagnostics and fails generation before source commit, Full install,
  registration or Eval. It never retries a consumed model invocation.
- S05: Successful validation is committed with the generated source; its report
  is a host-derived binding, not a model-writable path. The digest-bound receipt
  is owned staging, included in normal cleanup; its bounded record also remains
  in the owned worker result after cleanup. It explicitly is not evidence of
  runtime behavior, effectiveness, complete usage or actual instruction use.
- S06: Focused regressions cover invalid contracts, missing history before a
  provider call, report refresh, writer changes to validator/installer/untracked
  files or file modes, legitimate empty tracked source support files, owned
  receipt cleanup and legacy compatibility. Empty placeholders retain their
  exact hash/mode; executable validation inputs still require nonempty bytes.

Implementation Contract:

- Artifact: `full-source-validation-implementation@1`.
- Upstream: user request to repair standard-loop contract inconsistencies;
  `full-source-validation@1` S01..S06; retained source3ded/candidate413 validation
  failures. No modification of either frozen source or pending case packet.
- Boundary: Full generation preparation, trusted derived validation, owned
  receipt and tests/docs. No validator relaxation or new provider permission.
- Verification: focused failing regressions first, affected Full/native/practical
  compatibility tests, repository validation and independent review.
- Evidence: actual commands/results recorded with the implementation handoff.
- Proof: Formal S01..S06, including failure/compatibility behavior.
- Handoff: opt-in only; real Eval/application remains behind the two existing
  human judgments. Prior failed records and original36-trial conditions remain.

ADR review: no separate ADR is needed. This reversible opt-in reuses the trusted
baseline execution boundary in ADR-0016/0019/0021 rather than creating a new
validator authority. Always-on rejection of historical profiles or relaxing the
entrypoint contract were rejected. Revisit this decision before accepting a new
validator kind, following arbitrary reference closures, fetching missing history
from a network, treating validation as semantic efficacy, or changing cleanup.
