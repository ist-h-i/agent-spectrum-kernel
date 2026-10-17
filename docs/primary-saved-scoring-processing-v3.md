# Fixed saved primary processing v3

Spec `SPEC-PRIMARY-SAVED-SCORING-3`, revision 1, implements the bounded
request in [#397](https://github.com/ist-h-i/agent-spectrum-kernel/issues/397).
It depends on the prospective [command evidence v3](primary-command-evidence-v3.md)
and reuses the [saved scoring preparation contract](primary-saved-scoring-processing-v2.md).
The status is accepted for this public implementation scope by that request;
private runtime compatibility and actual saved-result grading remain Unknown.

## Acceptance and responsibility

- `AC-VERSION` (compatibility): only an explicit
  `ask_primary_scoring_version_v3` manifest selects parser
  `1.6.0-primary-saved`, review recognition `2`, and the exact parser, review
  helper and two saved-v3 schema bytes. V2 stays fixed to parser 1.5 and its
  saved-v2 schemas; v1/default stay at 1.4. Manifest kind, processing revision,
  schema set, raw bytes and external digest must agree. Neither a repinned
  unsupported revision nor a producer override can relax this binding.
- `AC-CLOSURE` (architecture): source-only construction explicitly selects the
  same revision before the existing writers build a fresh closure. The selected
  schema pair and existing review helper use the original authority-data and
  private-entry mechanisms. Historical reconstruction uses the selected fixed
  manifest, rather than the current default. Construction cannot supply worker,
  schema, producer, admission or start authority. Existing root, Git staging,
  revision and async lifetime checks apply to both processing versions.
- `AC-CONSUMER` (business): the fixed selection reaches the existing producer,
  saved-v3 normalizer and consumer without removing the consumer's equality
  check. Legitimate independent checks survive finite recognized auxiliary
  reads. Missing evidence, unknown operations, unsafe writes and ambiguous
  records retain unavailable/Unknown outcomes without invented credit.
- `AC-PREPARE` (business): the existing saved preparation binds all nine paired
  primary tasks, the original retained source, the selected processing/source
  bytes, resources and fresh disjoint outputs. Preparation and reopening perform
  zero normalization, worker/model/provider dispatch, comparison start/resume
  or CAS mutation. Pending review/admission stays blocked. A fake-only separate
  consumer roundtrip may retain Unknown and partial results; it is not real
  saved-result grading or private acceptance evidence.
- `AC-PRESERVE` (compatibility): old manifests, outputs, source bundles,
  admission, consumed requests and scores are not migrated or overwritten.
  Existing source-pinned records still require their original implementation.
  The nine fixture IDs, task inputs, criteria, weights and raw scoring semantics
  stay fixed. Public synthetic evidence establishes only this connection.

## Fixed selection

`primaryProcessingDescriptor({root, commandEvidenceParserRevision})` describes
one of the two existing finite processing choices. Omission retains 1.5.
`withPrimaryProcessingSourceBuild({root, baseRevision,
commandEvidenceParserRevision: '1.6.0-primary-saved'}, callback)` selects the v3
closure while the existing static authority writers run. Its absence still
selects the previous v2 closure. An unknown revision refuses before the callback.
The v3 manifest has the same closed fixture/resource shape as v2, with
`kind: 'ask_primary_scoring_version_v3'` and the v3 descriptor in `processing`.
The two versions are separate identities, not aliases or automatic upgrades.

The sealed-byte validator recognizes both explicit schema pairs' existing
authority-data type. Recognition does not add either pair to default graphs.
The manifest reader owns the finite revision/schema mapping; source construction
and historical reconstruction consume that checked choice. Producer and
normalizer already own parser/schema dispatch. The existing grading adapter
continues to own private resource/admission checks and fixed producer equality.
The saved preparation record already pins the entire processing object and
implementation inventory, so its v1 record shape needs no migration.

ADR decision: no new ADR. This applies the existing version/source and
private-entry architecture described in the v2 contract and ADR-0012; it adds
no new authority, runtime permission, persistence owner or dependency layer.

## Human one-shot handoff

Use a new processing-version identity and new independent source/private
destination. Never reuse an old v2/v10 instruction, preparation, output or
consumed attempt. Before a future invocation, record these exact new references:

1. The reviewed public implementation commit/tree and its successful checks.
2. A fresh source closure built with explicit parser 1.6, its fixed v3 manifest
   path/raw digest, all nine fixture pins and the corresponding private assets.
3. Independent review, acceptance and admission references bound to those exact
   private bytes. Existing or pending authority is not upgraded by selection.
4. The original readonly retained export path/raw digest, source and retained
   roots, and baseline/challenger resource-file path/raw digests. Each resource
   selects the same fixed version and its own fresh grading output directory.
5. A fresh preparation directory outside all retained, source and authority
   roots and both grading outputs. Preserve the previous results separately.

With those references, the existing CLI is the prepare-only operation:

```sh
node scripts/ask-primary-saved-scoring.mjs prepare /canonical/new-v3-input/config.json /canonical/new-v3-preparation
```

The config shape is documented in the v2 contract. Save its returned
`output_root` and `external_digest` independently and reopen using
`verifyPrimarySavedScoringPreparation({recordRoot, externalDigest})` from the
same pinned implementation. Review all nine baseline/challenger bindings,
processing revision/schema pins and individual preflights. A `blocked` record
preserves useful observations; resolve its named blocker in new inputs and use
a new preparation directory. `prepared` still has `execution_permission`,
`scoring_ready` and `formal_aggregate_eligible` false.

Stop if any digest, revision, source closure, retained binding or admission
differs; if a source is not terminal/closed; if an output exists/overlaps; or if
preflight is blocked. Retain missing evidence as Unknown. Do not rewrite a
record, reuse output, loosen a guard or resume an old run to make it pass.

Actual saved-result grading is a separate human-authorized one-shot operation:
the user must directly authorize Codex to invoke the existing
`gradePreparedPrimarySavedScoring` API for the exact new preparation digest and
fresh destinations, with its normal worker budgets and explicit scope. The
prepare-only CLI cannot grade. This implementation task does not perform that
operation, private acceptance/review, a model/provider call or a comparison.

## Formal Verification Contract

- Artifact: `FVC-PRIMARY-SAVED-SCORING-3`, revision 1.
- Upstream: `SPEC-PRIMARY-SAVED-SCORING-3`, observed revision 1, acceptance
  items above; #397 and #379 (partial PV1-3/5/7/8 only).
- Policy: `ask.verification-proof-policy@1.0.0`, selected path
  `formal_verification_contract`; triggers `public_api_schema_or_compatibility`,
  `state_concurrency_persistence_lifecycle_or_cross_module`,
  `bug_reproduction_or_regression`, `multi_session_multi_agent_or_handoff`.
- `O-VERSION`: RED then passing synthetic v3 selection, all nine preserved
  fixture/resource identities, old-version regressions, revision/schema/source
  substitution and producer override refusals.
- `O-CLOSURE`: explicit v2/v3 graphs, exact known sealed file types, actual static
  writer transactions, rejected injected/root/revision/nested scopes, first
  imports and async expiration. No worker execution or new authority.
- `O-CONSUMER`: artificial fixed-v3 producer/normalizer controls for legitimate,
  missing, failed, unsafe, unknown and ambiguous evidence; fake saved pair
  preparation/consumer roundtrip with Unknown/partial results and replay guards.
- `O-PREPARE`: original-adapter blocked preflight with zero dispatch, changed
  processing or source refusal on reopening, fresh-output and retained-byte
  preservation checks; fake success cannot establish actual private admission.
- `O-REVIEW`: relevant local tests, generated schema check, repository validator,
  bundle check, independent final review and terminal exact-head CI.
- Insufficient evidence: failed/unexecuted checks, unresolved findings, wrong-head
  or incomplete CI, missing private acceptance/admission, unobserved real runtime
  compatibility or a real grading result. The last three remain outside the
  public implementation completion claim.

Implementation `IMPL-PRIMARY-SAVED-SCORING-3`, revision 1, references this Spec
and FVC. Exact executed evidence belongs in the linked PR and handoff. This
contract grants no Ready conversion, merge, release, real grading or Mac apply.
