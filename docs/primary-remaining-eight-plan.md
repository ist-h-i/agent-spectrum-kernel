# Primary remaining-eight continuation

Spec `SPEC-PRIMARY-REMAINING-EIGHT`, revision 1, implements the owner's explicit
remaining-work request after the first primary fixture completed in a stopped
single-shot batch. This is a separate practical plan, not resume, retry, arbitrary
fixture selection, or the official four-condition protocol.

The optional `continuation` setting accepts only the fixed suffix of eight primary
fixtures, in original order, with `plain`, `kernel_principles_v2`, `full_ask`, once
each. The normal nine-fixture manifest remains unchanged. Parent manifest/start/
first-child-report/retained first-grade bytes are pinned. The parent's original
nine IDs, first run ID, and all eight original unstarted block IDs remain in the
new plan. Grading resources bind a fresh output outside retained evaluation/
first-grade roots; both factory and direct batch validation reject overlap before
any writes. Original child roots must have no start/digest/leases/history/invocation
or slot evidence; partial intent is not unstarted. New child roots and IDs must
be independent. The parent and completed first fixture are read only.

An append-only issuance record keyed by the original manifest digest lives in a
`.ask-primary-continuations` directory beside the original evaluation. It binds
one new output before any preparation output is created. A live in-process grant
permits its exact manifest publication once; partial publication cannot be
reopened from another process. All four issuance/publication paths count as
prior intent, including torn or orphan records; failed preparation permanently
retains that intent. The base record and exact-manifest record are both pinned
in the final readiness inventory. A sibling plan and replacement IDs are refused.
This preparation record conveys no execution authority and does not alter the
parent. It is not a general retry or recovery facility.

There is one new batch consumption boundary. Failures preserve consumed intent;
no resume, new-ID retry, or task replacement is implemented. The unchanged budget
is 84 hours / 45M token start-decision upper limit, 60 minutes per condition,
5 minutes per public check, original private worker timeouts, 185 minutes grading
reservation per block. Standard CLI/global instruction differences are recorded.

Closed native verification failures remain quality evidence, including a block
where an earlier completed/manual-pending slot makes the single-task overall
state `indeterminate`. The primary admission checks each slot instead of using
that overall label: `completed` requires pass/unknown with every native check
passing; `verification_failed` requires fail with at least one closed native
failure. Every receipt/owner/journal/process/scope/exit consistency guard stays
required. Inconsistent state/check/outcome combinations and true execution
unknown still stop. Global single-task and formal four-condition semantics do
not change.

Fresh primary grading distinguishes completed processing/saved results from
numeric completeness. Manual/null/partial requirement judgments are saved and
permit the next fixed fixture. Execution unknown, damaged evidence, permission
or authentication refusal, and unresolved child termination still stop. Unknown
is never promoted to pass or zero. The original v4 criterion bytes are retained;
existing admitted nine-bundle resources can be referenced without regeneration.
Private evaluator/oracle material remains outside model workspaces.

## Verification contract

`VERIFY-PRIMARY-REMAINING-EIGHT`, revision 1, references
`SPEC-PRIMARY-REMAINING-EIGHT@1`. Proof policy
`ask.verification-proof-policy@1.0.0` selects `formal_verification_contract` for
`state_concurrency_persistence_lifecycle_or_cross_module`,
`bug_reproduction_or_regression`, `merge_release_or_stable_trace`.

- O-SUFFIX: only exact eight ordered IDs and P/Kv2/F are admitted; base nine unchanged.
- O-LINEAGE: reject changed parent digests/run/IDs, missing consumption, incomplete
  first execution/grading, parent remaining intent/evidence, and shared roots/IDs.
- O-ONCE: a synthetic-only 24-slot pass saves mixed partial/manual results and
  terminates; a second start and second sibling preparation refuse without dispatch.
  Preparation also refuses retained evaluation/grade overlap before any writes. No production CLI/model is
  invoked by tests and production rejects synthetic grading/start adapters.
- O-STOP: uncertain execution, corrupt evidence, permission refusal, interrupted
  or failed grading stop; never erase consumption or generate replacement IDs.
- O-PRESERVE: budgets, private v4 criteria, main fixture registrations, legacy
  nine- and four-condition behavior are preserved.

Implementation `IMPL-PRIMARY-REMAINING-EIGHT`, revision 1, references this Spec and
Verification Contract. Only preparation/batch validation, existing fake-only
batch regression tests, their explicit model-free CI registration, and this document change. Review and observed execution
logs provide item-level evidence for the obligations; CI binds the final head.

## Analysis notes

Natural-language interpretation may remain manual. Exact shell/rendered-command
matching can leave equivalent logical scripts unmatched. One rejected command can
make whole capture unavailable. Some fixed v4 predicates map missing verification
to raw fail/zero: retain raw results but distinguish capture-caused unknown in the
analysis. Human manual scoring is not a start or continuation prerequisite.

## Architecture review decision

No new ADR is needed for this narrow connector. ADR-0007's runner-owned control
records and ADR-0011's separate experimental identity/unchanged #197 authority
remain applicable and are not superseded. This plan document records the local
issuance choice and its failure consequence. Reusing only the per-batch start
stamp would permit sibling-ID retries; a general recovery/continuation framework
would exceed the owner's scope. The digest-keyed external immutable record is
chosen instead. Failed preparation permanently consumes its issuance, while
comparison execution still requires a separate later direct human instruction.
Revisit this decision if another continuation shape or recovery becomes needed.

The evaluation dispatcher remains pinned to `a40958bc75dfbfe19961ab61e9b081adc9cf84ed`.
A later development-only CI registration does not replace that sealed dispatcher,
its preparation source, condition assets, criterion bytes, or planned child IDs.
CI invokes the synthetic batch tests explicitly before the long repository suite;
those tests cannot use production start with synthetic plans.
