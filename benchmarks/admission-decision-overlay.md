# Admission decision overlay

The portfolio keeps admission in three separate authority planes.

1. The frozen evaluator and requirement authority binds the fixture input, requirement set, evaluator reference, and pre-review admission record. It freezes before independent review so the reviewer evaluates one immutable evaluator identity.
2. The append-only admission decision records the later independent review outcome. It remains public and answer-neutral, stays outside the private evaluator bundle, and binds the exact frozen raw and semantic identities plus the reviewed repository, pull request, head revision, evaluator bundle, and review archive.
3. Scoring eligibility requires a verified evaluator result bound to the frozen authority and an effective `admitted` status. The raw engineering result is the first durable scoring artifact and additionally binds the admission decision revision and digest.

## Why the overlay is separate

Rewriting an `admission_pending` record after evaluator review changes the requirement authority when the requirement record binds that record. Regenerating the requirement record would invalidate the evaluator identity that was reviewed. The overlay breaks that cycle: the frozen admission record may remain `admission_pending`, while a later independently authorized decision supplies the effective admission status without changing frozen bytes.

An admitted decision is not accepted from its self-digest alone. Validation re-derives the frozen admission, requirement, scoring-input manifest, and evaluator-reference identities from supplied artifact bytes and compares the decision against separate review/archive authority. Changing an inner identity and resealing only the outer decision therefore fails closed.

The independent-review authority is a separate closed artifact. Production scoring requires its externally supplied raw-byte digest and reads the referenced review archive bytes directly. The authority's canonical digest is therefore not a self-authorizing fallback: a forged authority, an archive replacement, or a partial authority fails before an engineering result is published.

## Compatibility and scoring lineage

Legacy fixtures keep their existing path: an admitted frozen final-admission record with no overlay resolves as `legacy_admitted_record`. Its `admission_decision_digest` and revision remain `null`.

Overlay fixtures resolve as `admitted_overlay` only after an approved independent review, `author_self_approval: false`, zero blocking findings, and exact frozen/review identity closure. Missing overlays, pending frozen records, `changes_requested`, and `rejected` decisions resolve as `not_admitted` and remain `not_scoring_ready` with null numeric score fields.

Raw engineering results bind:

- effective admission mode and status;
- frozen admission record and requirement-authority digests;
- admission decision revision/digest;
- requirement record digest;
- evaluator result digest and evaluator bundle identity.

The result-set source manifest and result-set inventory retain that lineage. Repetition and paired reports propagate the same decision identity from each raw result; directional outcomes retain both paired decision identities; mechanism scorecards retain it in each run-authority entry. The evaluator result envelope does not contain the overlay digest and continues to bind the frozen pre-admission authority.

## Production scoring entry

`score-evaluator-result` uses `verifyEvaluatorAuthority()` as its sole source of complete evaluator authority. The shared verifier closes the private bundle/public reference boundary, normalized result, result envelope, requirement coverage, profile/private authority supplied by the evaluator revision, and the raw and semantic frozen scoring inputs without treating the frozen admission lifecycle status as scoring eligibility. It also returns the verified frozen admission, requirement-record, and freeze-manifest source bytes needed to bind the later overlay. The downstream scorer verifies only the append-only decision authority and composes evaluation readiness with effective admission; it does not repeat evaluator, private-authority, or profile verification.

With no decision evidence, a pending frozen admission produces `not_scoring_ready` and null numeric fields. To consume an overlay, supply all four inputs together:

- `--admission-decision <decision.json>`;
- `--admission-review-authority <authority.json>`;
- `--admission-review-authority-source-digest <sha256:digest>`;
- `--admission-review-archive <archive>`.

Partial evidence is rejected. `buildPortfolioEngineeringResult()` accepts only an effective authority returned directly by the resolver; callers cannot inject a manufactured admitted authority object.

## Append-only lifecycle

An already consumed decision record is never edited in place. A later decision uses a greater revision and a different canonical digest. Existing score and report artifacts retain the exact revision/digest used when they were created; a later decision cannot retroactively validate or rewrite them.

## R21 historical authority and the R22 transition

R21 remains an immutable historical reviewed authority at PR #224 head `7db95b7a33878aa327192648d5ffc191d22c005e`. It is not reusable with the evaluator source produced by merged PR #239 plus this integration. After PR #238 is merged and incorporated into PR #224, the final evaluator source requires one R22 generation and independent review. R22 freezes `admission_pending` together with the final shared evaluator-authority API and source graph.

The later admission transition does not change the R22 evaluator result, private bundle, requirement record, frozen admission record, scoring-input manifest, or evaluator source. It adds only the append-only admission-decision overlay outside that graph. Therefore the transition binds the reviewed R22 authority at the first scoring artifact and does not require R23.

## PR #224 migration sequence

After this shared contract is merged to `main`:

1. merge the shared change into `feat/issue-207-mn-build-option-update` and resolve the evaluator-authority API on the final shared source;
2. generate R22 exactly once with `admission_pending` frozen, then obtain its independent review;
3. create the admission decision overlay outside the R22 private evaluator source/bundle graph;
4. invoke the production scorer with the byte-frozen R22 admission record, requirement record, scoring-input manifest, evaluator reference, decision, externally sealed review authority digest, and review archive;
5. let `verifyEvaluatorAuthority()` retain the R22 evaluator result binding to frozen pre-admission authority and bind the resolved decision only when building the raw engineering result;
6. verify result-set and report lineage against that exact decision revision/digest;
7. obtain the separately required human/independent lifecycle decisions before any Ready or merge transition.

This contract does not generate or approve R22, admit a fixture by itself, authorize measured execution, calculate a measured score, mark any pull request Ready, or authorize merge.
