# Personal Evolution: generation request and supplied file registration

This slice prepares a bounded generation request and imports a caller-supplied instruction Asset revision into the existing Registry and Evolution preparation path. It never invokes a model or generator. Automatic generation effectiveness remains `Unknown`.

`preparePersonalEvolutionGenerationRequest` takes the observation input used by the bridge, `blueprint` without `candidate_asset`, `generationActor`, `holdoutTaskIds`, `requestedVersion`, `requestId`, a dedicated `storeRoot`, and the existing independent trust arrays. It verifies the exact Registry and current parent in the supplied immutable Portfolio lock before publishing the observation and request. Candidate policy is checked against the existing schema using a validation-only reference in memory; that unproduced reference is never published or registered. Supported Asset types are `skill` and `prompt`; evaluator Assets are excluded.

The returned `generation_input` contains a public bounded observation, exact parent Asset reference, distinct requested version, request digest, and `requested_action: "produce_candidate_files_only"`. Parent file retrieval, task execution, and generation are outside this API. It supplies no private evaluator root, answers, execution command, adoption authorization, or effectiveness proof.

`importPersonalEvolutionGenerationResult` takes `requestObjectDigest`, `sourceRoot`, the dedicated `storeRoot`, a supplied `result`, and independent trust arrays. Result fields are exactly:

```text
request_digest
observation_digest
parent_asset
candidate_descriptor
privacy: {
  classification: "caller_reviewed_asset_source",
  private_answers_included: false,
  raw_task_history_included: false
}
```

The descriptor is the existing Asset registration format, not a new asset schema. It must preserve parent Asset type and stable ID, use the requested distinct version and repository, declare a full-content direct revision and exact parent rollback, and retain `not_evaluated` safety/mechanism/evaluation statuses. Existing registration validates descriptor/content semantics, portable file inventory, byte digests, symlinks, collisions, and dependency references. Source files and CAS write roots must be separate and non-nested.

Import registers candidate state only, preserving the predecessor Registry, then calls the existing personal preparation API. The returned immutable publisher receipt binds request, supplied result digest, registered Asset and snapshot, and preparation object. `models_started: false`, `authority_implied: false`, and `generation_effectiveness: "Unknown"` describe this operation. The receipt is not a standalone verified authority; consumers must use existing Registry and Evolution verifiers for the prepared candidate and later artifacts.

The shared parent helper keeps preparation and inspection checks aligned. A recomputed request digest does not bypass Registry identity/current supplied parent, schema, actor separation, observation binding, or holdout checks.

Privacy is caller attestation, not secrecy proof. Source file hashes prove imported bytes, not authorship or the truth of a declared Git revision. Declared factors do not prove causal isolation. CAS registration, preparation, and receipt publication are not one transaction: a later failure can leave immutable candidate or orphan objects, without promotion, installation, or external effects. The caller owns source/store paths and must keep private evaluator and development output roots separate. Global head freshness remains outside the immutable supplied-lock check.

Non-model tests exercise a deterministic fake file producer and an actual public repository document input, original CAS preservation, idempotent import, request/result transplants, source drift, shared roots, privacy and unearned-effectiveness rejection. The repository validation workflow runs both personal bridge test files and this generation test file in one explicit model-free step. They do not establish automatic generation quality or finish the personal loop. Evaluation connection, same-target installation/restoration and unattended operation remain separate slices. Runtime bundles, schemas, catalogs and private scoring assets are untouched.
