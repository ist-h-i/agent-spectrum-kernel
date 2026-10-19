# Explicit primary evaluation correctness v7

## Spec

Artifact `SPEC-PRIMARY-EVALUATION-CORRECTNESS-7`, revision 1. Upstream: the
owner's scoped continuation decision, #379 and #385. The two defects are an
inapplicable historical requirement-ID classifier and a retained command
processor which cannot close supported runtime shell renderings to the public
verification command. This work ends analysis of the current candidate.

The new `ask_primary_scoring_version_v7` selects command processor
`1.10.0-primary-saved` and the `requirement_scope_verification_v2` result
profile. Selection is explicit and digest-pinned. Existing v1–v6, their default
parser, original fixture inputs, command bodies, frozen evaluators, scores,
receipts and start records retain their meanings. No old result is rescored.

- AC7-CLASSIFY: the new profile covers every authoritative requirement exactly
  once. Unknown, duplicate, missing or non-existent configured IDs are errors,
  never evidence of under/over-processing. It uses actual requirement outcomes
  and scope deviations without historical ID fallbacks. Invalid evidence takes
  precedence; manual semantic evidence remains manual/null. For known results,
  a scope deviation takes precedence over a simultaneous requirement failure;
  otherwise a failed requirement is under-processing. All requirements passed,
  no scope deviation and successful required verification is narrow execution.
- AC7-OBSERVE: classification, quality, decision correctness and completion
  correctness share the same derivation and are rechecked by the verifier.
  Scope deviations are the source for over-processing; classification is not
  its own evidence. Unsupported/missing verification never becomes successful
  validation or fabricated quality zero. Known requirement/scope failures stay
  available even when another dimension is missing. A v2-only manual result
  may retain all known requirement points when typed verification is missing.
- AC7-RUNTIME: v7 accepts exactly `/bin/bash -lc` and `/bin/zsh -lc` as the
  finite runtime envelopes for an otherwise exact public canonical body.
  The registered Bash descriptor/digest remains its canonical representation.
  A matched shell event includes its actual executable witness; public body,
  literal-word trace and witness must reconstruct its actual rendered digest.
  Direct argv has no shell witness. The witness grants no authority by itself.
  Other flags/shells, dynamic words, drift, malformed/ambiguous streams and
  forged references remain refused. Output text such as `pass` grants no credit.
- AC7-VERSION: existing producer, schemas, normalizer, resource writer and
  explicit selector carry the new version. The selected existing handoff task
  can have its own new evaluation version without preparing the other eight.
  Criteria, weights, task bytes, evidence/scope maps and scoring formula remain
  unchanged. Only the new profile binding and its resulting identity headers
  may differ in an independently constructed v7 evaluation root.
- AC7-ISOLATE: tests use independently authored anonymous events and artificial
  targets. New private resources, if prepared, use a fresh directory and the
  existing resource-assets-only authoring boundary; preparation is not runtime
  admission. No model, real comparison, old private evaluation, candidate edit,
  Mac adoption/application or global/auth/security change is performed.

The v7 envelope equivalence is a new explicit processing rule, not a claim of
general Bash/Zsh program equivalence. Arbitrary per-command shell selection is
outside this change. Generation model identity and actual cost remain Unknown
when they are not observed; collecting them is not an acceptance condition.

## Verification Contract

`FVC-PRIMARY-EVALUATION-CORRECTNESS-7`, revision 1, upstream
`SPEC-PRIMARY-EVALUATION-CORRECTNESS-7@1`. Select the existing
`ask.verification-proof-policy@1.0.0` formal path: bug reproduction/regression,
public schema/compatibility, cross-module persistence and independent PR review
are present. This is not an additional proof framework.

- O7-CLASSIFY → AC7-CLASSIFY/OBSERVE: fail-before/pass-after checks for an
  anonymous five-requirement all-pass case; true scope excess, true missing
  requirements, mixed scope/failure, invalid IDs/duplicates, manual/null,
  unavailable verification and forged global observations.
- O7-RUNTIME → AC7-RUNTIME: anonymous paired start/terminal captures with exact
  public body under the two supported shells and existing literal encodings;
  failure exit, changed body/shell/flags/witness/digest, ambiguous words,
  malformed events, missing terminals and fake success text cannot pass.
- O7-CHAIN → AC7-VERSION: synthetic producer → normalized evidence → existing
  fake saved consumer, explicit selector/source/schema closure, new profile
  private-authority binding, source drift and cross-version refusal.
- O7-OLD → AC7-VERSION/ISOLATE: old focused parser/scoring/authority regressions,
  unchanged historical fixture/frozen inputs, generated schema freshness,
  repository validation and relevant required CI on the exact reviewed head.
- O7-REVIEW → all AC: independent required review gates, resolved blocking
  findings, linked Draft PR and terminal CI. Parent owns Ready/merge.

Evidence records commands, exit codes, source head/tree and supported items in
the task's external delivery directory. Live acceptance remains separate; no
test count or static resource preparation proves provider/runtime success.

## Implementation Contract

`IMPL-PRIMARY-EVALUATION-CORRECTNESS-7`, revision 1. Upstream Spec/FVC above.
Change class: bug fix. Allowed boundary: existing scoring/profile validator,
private envelope adaptation, command evidence parser, primary source/schema/
producer/selector and handoff resource writer, their tests and CI/docs.
Reuse current storage, original scorer and evaluation authority. No new scorer,
state machine, authority platform or dependency. No original private fixture
material is committed. Exact implementation and verification evidence will be
recorded at delivery; real admission/execution remains separately bounded.

## Preparing a new evaluation version

Use a fresh source checkout at the reviewed implementation commit and a fresh
external private resource directory. Preserve the previous evaluator, all raw
results, scores and receipts. The existing handoff requirement record remains
the five-requirement rubric; neither IDs nor point weights are replaced.

An independently authored new private evaluator must return the explicit v2
profile. After deriving its task-specific requirement observations, call
`deriveRequirementScopeVerificationOutcome({ evaluatorResult, requirementRecord,
normalizedResult })` from the existing scoring-contract module. Retain those
requirement points and evidence. Use the returned status/classification and
under/over observations with its derived reference set; use
`deriveEffectiveVerificationEvidenceReferences` for the verification observation.
Omit classification for a manual result. The boundary independently checks
these values and constructs the global quality/decision/completion observations.
An old v1 fragment cannot be relabeled as v2.

For static resource authoring, use the existing source-only boundary:

```js
withPrimaryProcessingSourceBuild({
  root: freshSourceRoot,
  baseRevision: reviewedCommit,
  commandEvidenceParserRevision: '1.10.0-primary-saved',
}, () => writeMpDataMigrationHandoffProductionAuthority({
  root: freshSourceRoot,
  privateRoot: freshPrivateRoot,
  evaluatorRevision: reviewedCommit,
  generationDate,
  resourceAssetsOnly: true,
  resultProfileName: 'requirement_scope_verification_v2',
}));
```

This writes a pending resource version, with no evaluator start or admission.
It expects already authored private source assets and does not manufacture an
evaluator. Complete the existing independent resource review/admission for that
new version. Old admission receipts do not authorize the new source/profile.
Freeze an `ask_primary_scoring_version_v7` manifest with just the intended
existing primary fixture keys (the single handoff fixture is supported), the
`primaryProcessingDescriptor` v7 source pins and independent read-only resource
paths. Output and scoring freeze must both bind the exact new result profile.
`readPrimaryScoringVersion` checks these bindings and unchanged task/scoring
semantics; it supplies no execution permission.

Configure a fresh personal-loop profile with those reviewed resources using the
[existing CLI procedure](personal-evolution-cli.md). Inspect its frozen inputs
and wholly unstarted pair. Only a new direct human execution instruction can
start the real provider/runner; previous starts or approvals are not reused.
Use a fresh cycle and output roots. A previous hold receipt can be a read-only
next-request reference via the existing `next` procedure, never an old-run resume.
Do not apply the candidate to host settings during this evaluation.

The non-model acceptance command is:

```sh
node scripts/generate-ask-primary-grading-schemas.mjs --evaluation-v7 --check
node --test scripts/test-ask-primary-classification-v7.mjs scripts/test-ask-primary-runtime-shell-v7.mjs scripts/test-ask-primary-evaluation-correctness-v7.mjs
```

The anonymous source/fragment tests prove the connection and refusal boundaries.
They do not establish the new private evaluator's semantic validity, admission,
real CLI/provider compatibility, candidate superiority or operational adoption.
Those remain separate observations. #379 and #385 retain their broader open
acceptance conditions.
