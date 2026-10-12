# Explicit fresh scoring version for the practical primary evaluation

Requirement `REQ-PRIMARY-FRESH-SCORING-1`, revision 1, records the owner's
2026-10-12 approval to reconstruct unrecovered private assets for the existing
nine tasks. This is a new evaluation-only scoring version. It is neither a
restoration of the old admission nor proven equivalence to old hidden scoring.
The separate K-principles v2 decision does not authorize scoring changes by itself.

Spec `SPEC-PRIMARY-FRESH-SCORING-1`, revision 1, references that requirement.
Its acceptance items are:

- `AC-PRESERVE`: identical task/public-input/command bytes, formal task classes,
  requirement items, requirement-set digest, weights, scope/evidence maps,
  scoring policy, catalog and policy manifest. Output-contract behavior is
  identical; reference/authority/admission binding headers and their computed
  digests may be rebound in independent evaluation copies only.
  Fresh build-task mutation asset identities may also rebind only the public evidence-map
  `mutation_contracts[*].mutation_digest` fields. All maps, scope authority,
  mutation/equivalence/requirement IDs, expected recoverability/admission states,
  order and other fields remain identical. This permits a new private asset's
  byte identity, not a scoring-policy or evidence-meaning change. The old build
  mutation digest cannot be reproduced from its incomplete public projection;
  its original additional private fields remain Unknown.
  The other eight evidence-map files remain byte-identical.
- `AC-SEMANTICS`: each fresh private evaluator uses real candidate output,
  workspace and retained evidence, not case labels or preselected scores.
  Private coverage records include positive, equivalent, negative, scope,
  false-positive/false-negative and unknown cases. Unsupported or ambiguous
  meaning is manual review/unknown, never fabricated quality zero or a pass.
- `AC-EXPLICIT`: an externally digest-pinned version manifest selects all nine
  independent runtime roots and each new bundle/reference/freeze/review/admission.
  All consumers recheck the same version; no unverified fallback to old assets.
- `AC-REVIEW`: fresh independent review is recorded against exact asset bytes.
  Pending review is not admission; review authority and archive are issued only
  after actual reviewer evidence and post-fix verification.
- `AC-CUSTODY`: one dedicated external private root, reproducible archive,
  digest-pinned manifest and receipt preserve asset provenance and restoration.
  No answer-bearing asset is committed or uploaded to GitHub.
- `AC-NO-MODEL`: preparation, authoring, native checks, packaging and review do
  not invoke comparison start/resume, evaluation Codex CLI/model, grading models
  or legacy ownership diagnostics. Ordinary deterministic Node evaluators may be
  exercised against authored non-model candidates for compatibility verification.
- `AC-PREPARE-ONLY`: the eight existing authority writers may explicitly select
  resource-assets-only verification during fresh asset publication. It reuses
  `verifyPrivateEvaluatorResourceAssets`, retaining public/source/schema,
  independence, mutation and equivalence checks. Default writer validation and
  runtime full-bundle verification remain unchanged. Empty preparation boundary
  directories are not run evidence; this mode never fabricates run markers or
  grants start, worker, review or admission authority.

Work package `WP-PRIMARY-FRESH-SCORING-1`, revision 1, references the Spec.
The allowed change boundary is the explicit-version primary connector and its
tests/documents and explicit preparation-mode writer validation in PR #340,
plus external private authoring/runtime/archive and
receipt files. Existing fixture/catalog/old admission/result files in the source
repository are read-only. No PR #341/remaining-fifteen development private source
or stopped review operation is an input. Local generated-binding commits inside
independent runtime copies are allowed; they are never pushed.

Verification `FVC-PRIMARY-FRESH-SCORING-1`, revision 1, selects the Formal
Verification Contract under `ask.verification-proof-policy@1.0.0`, with triggers
`public_api_schema_or_compatibility`,
`state_concurrency_persistence_lifecycle_or_cross_module`, and
`multi_session_multi_agent_or_handoff`. Its obligations are:

1. `O-PRESERVE`: compare every public input and semantic contract projection
   against the unchanged source; reject altered criteria, policy or scope.
2. `O-SEMANTICS`: run task-specific private positive/equivalent/negative/unknown
   checks and validate original fragment contracts, with per-task status receipts.
3. `O-BIND`: verify manifest substitution/drift rejection and the original
   constructor/normalizer/scorer route using authored non-model candidates;
   verify explicit writer asset mode needs no fabricated run markers and cannot
   authorize execution or change the default full validation path.
4. `O-REVIEW`: perform fresh independent asset and connector review; retain exact
   target digests, findings and post-fix results before new admission.
5. `O-CUSTODY`: verify archive inventory/digests and restore into a new directory
   with the same identities; preserve source Git objects without shared Git state.
6. `O-PREPARE`: all nine/27 slots are unstarted; one-use start remains unconsumed;
   resource readiness is checked without issuing start authority. Existing 60
   minute/condition and five minute/native-check limits, four ordinary private
   worker budgets/condition and conservative 84 hour/45M token overall planning
   remain. Actual completion ends promptly and unknown usage remains unknown.

Implementation `IMP-PRIMARY-FRESH-SCORING-1`, revision 1, references the work
package and verification. Task authoring is isolated by fixture. Runtime
packaging reuses original writers/digest/validator APIs; the build task requires
an explicitly documented external assembly because its adopted revision lacks
a production writer. No new model grader or replacement scoring platform is added.
The new build bundle receives an explicit 300000 ms ordinary worker budget;
the old build budget is unrecovered and is not asserted. The other eight
writer-defined budgets remain intact, including focused's 660000 ms. The
conservative reservation already covers four 900000 ms worker runs per condition.

Known interpretation limits: existing binary scope/verification classification
recognizes specific historical requirement IDs. Some review/handoff tasks use
different IDs; the unchanged derivation can classify all-pass requirements as
over-processing. Per-task receipts must distinguish this classification from
numeric requirement quality. Free-text cases unsupported by deterministic
recognition remain manual review/unknown. Old hidden equivalence stays Unknown.

The implementation evidence, independent review, final source SHA, explicit
scoring-version digest and custody receipts are recorded locally before the
human start prompt is finalized. Main integration is coordinated by the parent.
