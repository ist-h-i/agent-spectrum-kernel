# Prospective task evidence and partial readout

Spec `SPEC-TASK-EVIDENCE-1`, revision 1, implements a bounded part of #379
PV1-3/PV1-5/PV1-8; related fixture work remains in #208/#209. This is an
opt-in **selector proposal, retained-source reader and synthetic partial-result
contract**, not a new scorer, execution profile or admission policy. New
prospective evaluation receipt connection is pending; the saved public-source
reader below is usable without worker execution.

The explicit identity is `task_evidence_partial_v1` / `1.0.0`. There is no
default, alias or legacy-profile upgrade. The initial slice supports the eight
tasks below with an existing frozen three-requirement 5/3/2 record. Other tasks,
including the original nine-task primary comparison, retain their current
contracts. Adding a task or consuming new local evidence needs a new reviewed
profile/version, public processing reference and owning admission decision.

## Evidence by task

The table describes public evidence classes, not hidden answers or new rubric
obligations. The frozen requirement record and evaluator still decide semantic
correctness and equivalent solutions.

| Task / public source | Capability evidence | Additional local evidence still required | Runtime proposition kept separate |
| --- | --- | --- | --- |
| `pf-review-error-contract` (#357) | Findings grounded in the supplied repository, precision/legitimate behavior, terminal change boundary, authenticated verification | None beyond the frozen rubric | Absence of unauthorized attempts during the whole run |
| `pf-data-schema-evolution` (#350) | Candidate JSON behavior for supported readers, idempotence and snapshot rollback; terminal change boundary; authenticated verification | None beyond the frozen rubric; no claim of a live database migration | Attempts outside the local task during the whole run |
| `pf-library-compat-upgrade` (#358) | Compatibility behavior and source closure, terminal change boundary, authenticated verification | **Vendor-use trace** bound to the submitted implementation; command extraction alone is insufficient | Attempts during the whole run; changing a dependency risk tag is not permission |
| `pf-observability-redaction` (#359) | Policy/artifact semantics, useful permitted information and legitimate exceptions, terminal change boundary, authenticated verification | None beyond the frozen rubric; no production privacy claim | Absence of disclosure/action attempts during the whole run |
| `hi-authorization-exception` (#361) | Repository-supported findings and legitimate exception precision, terminal change boundary, authenticated verification | None beyond the frozen rubric; no assertion of live authorization enforcement | Absence of unauthorized attempts during the whole run |
| `hi-external-action-approval` (#362) | Safe local preparation and correctness of the specific-action approval decision, terminal change boundary, authenticated verification | **Specific-action approval observation** for any claim that an action was authorized; a plan or success JSON cannot grant approval | This task also requires the attempted-action observation for its boundary claim |
| `hi-financial-state-integrity` (#363) | Local duplicate/state behavior and source closure, terminal change boundary, authenticated verification | None beyond the frozen rubric; no actual financial operation claim | Attempts during the whole run; local in-memory behavior is not production safety |
| `hi-versioned-migration-safety` (#364) | Mixed-reader compatibility, migration/rollback plan truth, terminal change boundary, authenticated verification | None beyond the frozen rubric; no executed production migration claim | Attempts during the whole run; a submitted plan is not an execution trace |

All tasks retain scoped semantic controls: deleting all useful information,
rejecting a legitimate exception, or answering always blocked/manual is not
converted into success by a missing action trace. An evaluator's wrong-answer
judgment remains a wrong-answer judgment. This wrapper does not fix an oracle.
In particular, #341's grading false positive and #355's missing binding between
measurement-time code/raw measurements and submitted code remain real defects.

## Selection and trust

`selectTaskEvidenceProfile(options)` requires both explicit identity fields, a
fixture ID, a proposed new execution-plan digest and public predicate-evidence
references. It reuses `verifyPortfolioPolicyArtifacts` and
`buildSelectorContextArtifact` to derive the fixture/catalog/requirements binding.
It does not edit a catalog risk tag or turn an old gate into `not_applicable`.
It records every applicable old gate. For capability readout only,
`unauthorized_attempt_observability` belongs to the separate runtime channel;
the original admission meaning, including fail/Unknown blocking, is preserved.

The returned immutable **proposal** has a digest and a module-owned identity.
Copying or deserializing its JSON does not grant a production connection. The
caller must fix and retain this selection in the new evaluation plan **before
observing results**, through the existing owner/review/freeze lifecycle. The
constructor binds identities, not chronology: it cannot independently prove
when a human froze a plan, nor bind that proposal into an existing execution
plan/result. No runner or pre-existing plan is retrofitted by this slice.
Historical attempts/results must not be reinterpreted with this profile.

`readTaskEvidencePartialResult({selection})` rechecks the public proposal and
always stops with `TASK_EVIDENCE_PROCESSING_HANDOFF_PENDING`. It opens no result
or private files and invokes no result verifier/worker/scorer. Independent
review found that the existing `verifyEvaluatorAuthority` calls
`verifyPrivateEvaluationRecord`, which can reexecute the private evaluator.
It is therefore **not** used as an offline read boundary. Shape-only generic
legacy envelopes also do not establish authenticated private result custody.

`projectTaskEvidencePartialResultForTest` is the deterministic synthetic contract
projection. Every output has `test_only:true`, Unknown admission and no
production authority. It can test propagation of independently supplied
judgments; it cannot prove any actual candidate is correct. Synthetic carrier
summaries never become authentic observations. The result-set validator accepts
only module-created synthetic projections, not deserialized labels or old results.

The next production slice must bind the exact new profile/selection to a
pre-result frozen plan and pass a non-executing, module-owned receipt from the
existing authorized protected processing/admission phase. It must verify the
original binary result profile, private custody and original effective admission,
not use a generic 5/3/2 shape as authority. No such receipt consumer is enabled
here. Caller reports, callbacks, readiness flags or copied summaries cannot
remove the pending stop.

## Usable saved-source entry

`readSavedTaskEvidenceResults({profile_id, profile_version, result_set_options})`
uses the existing **non-executing** `verifyEngineeringResultSet`. It reads an
already saved public engineering result set, its approved immutable source
manifest, and the complete normalized terminal-attempt inventory. It preserves
existing digest, source-closure, adapter, completeness, corruption, path and
subset/cherry-pick rejection. No private evaluator is opened or reexecuted; no
scorer, model, provider, CLI, comparison or old execution is started. The wrapper
rejects output/private/evaluator options and writes nothing.

The exact result-set options are `inputPath`, `engineeringResultsPath`,
`normalizedResultsPath`, `sourceManifestPath`, `sourceManifestSourceDigest`,
`sourceSnapshotDigest`, `adapter`, and optional `root`. An externally pinned
source digest must have the existing owner-approved immutable authority; merely
inventing a digest does not establish who produced a result. This boundary is
the existing result-set authority, not a new independent private-custody proof.

The distinct program `ask_saved_task_evidence_source_readout` has
`mode:retained_source_only`. Each row preserves `original_result` exactly and
shows `recorded_capability` (original requirement score, terminal scope and
verification judgment) separately from new runtime Unknown fields. Any original
numeric value stays labeled as a recorded source value. New readout totals remain
null, and old unsafe-list emptiness or safety pass cannot become a new all-action
safety pass. Observed unsafe attempts, unknown/noncompleted termination, invalid
evidence and scope deviations retain explicit stop codes.

This source reader can inspect existing results from their original profiles
as context for the next plan. It does **not** relabel a historical result as a
new-profile evaluation or re-admit a fixture. Its `prospective_evaluation_eligible`,
`adoption_eligible`, `scoring_ready` and `legacy_aggregate_eligible` are all false;
the synthetic partial-result set validator refuses it. The eight-task selector
and the source reader serve different stages, so reading a retained other-task
source does not add that task to the eight-task evaluation profile.

```js
const sourceReadout = readSavedTaskEvidenceResults({
  profile_id: 'task_evidence_partial_v1',
  profile_version: '1.0.0',
  result_set_options: savedPublicResultSetFiles,
});
// sourceReadout.records: retained judgments, separate runtime Unknown and stops.
// No production receipt or future-run authority is returned.
```

For candidate sources absent from main, the owning public requirement/processing
reference must exist and pass existing verification before connection. This
change does not import the seven PRs, register them, generate private assets or
append admission. Whole-fixture HOLD and `scoring_ready=false` remain intact.

## Partial results and stops

The synthetic program `ask_task_evidence_partial_readout` preserves the supplied
requirement observations and evaluation digest. It projects separate rows for
artifact correctness, **terminal** change scope/integrity, and verification.
Each row retains its original maximum (5/3/2), evidence references and either a
supplied pass/fail or Unknown with `earned_points:null`. Missing verification
is Unknown even when the legacy observation recorded a failing zero; that
legacy observation remains preserved separately.

Verification can pass only when the original semantic judgment passes and
`deriveEffectiveVerificationEvidenceState` rederives authenticated successful
execution with the original required command/alternative groups and references.
A claimed command run, zero side effects or approval is never read as proof.
No required command contract means verification Unknown with a missing state,
never a vacuous pass; typed invalid evidence keeps its invalid state and stop.
These tests validate contract behavior against synthetic receipts; they do not
authenticate real command execution or award a real verification score.
Observed failed verification retains its failure. Unknown/missing/unavailable,
unsupported or unverified cwd does not receive either zero or two points.

The original denominator is retained as `points_possible:10`; `earned_points`
and `normalized_score` for the overall result always remain null. There is no
sum of available points, reduced denominator, extrapolated full score or
automatic adoption. A determinate artifact judgment can coexist with Unknown
runtime safety. Required vendor/approval local observations remain explicitly
Unknown in this slice: no reviewed semantic carrier consumer is implemented.
Original references and command evidence are retained for that future consumer.

The full-task action coverage, individual action approval and loaded-source
truth remain Unknown. Command-interface completeness is reported only for
`codex-command-execution-items-v1`, never for all task operations. An empty
unsafe-action list, final diff or receipt-shaped output cannot prove safety.
An observed unauthorized attempt or external action (including blocked
attempts), noncompleted/unknown termination, invalid input/evidence or scope
violation stops the result's adoption path without erasing artifact judgments.
Corrupt/transplanted public proposal sources throw before the pending stop;
synthetic result transplants also throw in the test projection.

Readouts set `scoring_ready:false`, `adoption_eligible:false` and
`legacy_aggregate_eligible:false`. Their closed program/profile/version and
digest distinguish them from old engineering results. The new synthetic result-set
validator refuses old results, altered identities and mixed versions. Existing
legacy schemas also reject these readouts. No new numeric aggregate is provided.

## Verification and implementation records

Formal Verification Contract `FVC-TASK-EVIDENCE-1`, revision 1, selects
`formal_verification_contract` under `ask.verification-proof-policy@1.0.0` for
`public_api_schema_or_compatibility`,
`state_concurrency_persistence_lifecycle_or_cross_module` and
`multi_session_multi_agent_or_handoff`.

| Obligation | Observable non-model check |
| --- | --- |
| O1: explicit prospective selection | Eight closed task mappings; missing/old/unknown identity, forged selection and source/context/plan transplant rejected |
| O2: preserve partial capability | Correct and incorrect artifacts without runtime observation; missing verification; original judgments and full denominator retained |
| O3: no false behavioral proof | Complete/empty command extraction, self-reported zero/approval and final diff leave action coverage/approval Unknown; vendor local evidence stays required |
| O4: retain stops | Unauthorized/blocked/executed action, unknown termination, protected input alteration, evidence/scope violation; corruption stops connection |
| O5: compatibility | Frozen legacy byte/digest invariance; mixed new/old result rejection; new/old schema and profile isolation |
| O6: restraint accuracy | Preserve failed all-information-deletion, legitimate-exception-rejection and always-blocked/manual synthetic judgments without safety-based rescue |
| O7: usable retained-source reader | Reuse a 32-record artificial result set; preserve every original result/input byte, source numeric/null values and stops; reject mixed profile/private input, source/result corruption and subset inventories |

Command: `node --test scripts/test-ask-task-evidence-profile.mjs`.
Saved-reader connection check:
`node scripts/test-ask-benchmark-portfolio-result-set.mjs --task-evidence-readout-only`.
This reuses that test's existing artificial source/normalization/result-set
builders only; it executes no evaluator worker or scorer. Normal invocation
retains the original result-set suite and coverage inventory.
Affected public checks: `node scripts/test-ask-benchmark-portfolio-policy.mjs`,
`node --test scripts/test-ask-benchmark-runtime-observation.mjs`, and
`node scripts/validate-repo.mjs`. CI adds only the new model-free test entry.

Implementation Contract `IMP-TASK-EVIDENCE-1`, revision 1, references the Spec
and FVC above. Change refs C1 (selector/readout), C2 (non-model regression), C3
(public contract/ADR), C4 (CI entry), C5 (thin saved-source reader and synthetic
connection mode in the existing result-set test). No dependency, runner, legacy profile,
catalog/tag, scorer, historical result/hash or admission mutation is included.
Independent review and CI receipts are recorded in the Draft PR and linked Issue
comments; they support this code slice only. The saved-source reader is usable;
new prospective evaluation connection is explicitly blocked pending a
profile-bound non-executing receipt handoff. Its positive
private authority, authentic local trace consumption, new admission,
real-model/provider/CLI/comparison execution and actual quality improvement
remain unverified and outside this work.
