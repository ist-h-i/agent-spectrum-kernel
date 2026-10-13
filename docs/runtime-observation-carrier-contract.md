# Bounded runtime observation carrier

The opt-in `ask_verified_runtime_observation_carrier_v1` extends existing execution inspection, normalization and sealed evaluation-input transport. It starts no process and changes no fixture, catalog, scoring rule, admission selector or existing normalized wire record.

`normalizeRuntimeObservationCarrier` and `verifyRuntimeObservationCarrier` accept the existing execution options (`root`, `config`, `planPath`, `materializedPath`, `selectionState`, `runDir`, optional `executionAdmissionEvidenceByFixture`), plus `normalizedResultsPath` and `observationRoot`. They re-inspect execution and verify the **current** normalized generation. Snapshot-only checks cannot establish carrier authority. The destination must be a fresh private directory, disjoint from source, execution, normalized, materialized and selection roots; saved primary input/controller/producer roots are also excluded. Files are regular, owner-private, single-link, mode0400. The verifier rederives every byte and checks stable file identity before/after. A content digest alone grants no producer authority.

Existing command references remain `execution_event` references with the original verified digest and byte count. The carrier adds run/case/attempt/fixture-input/runtime/environment/request/result/commit/normalized-result and normalizer-minted source-snapshot bindings. `source_evidence.basis=verified_snapshot_endpoints` covers the retained execution snapshot and terminal authority only. `loaded_source_status=unknown` is mandatory. Performance measurement values/load-time source are outside this version.

For saved primary producers, the existing producer returns an internal copy of its already retained, reverified native stdout. The carrier extracts only verified command pairs and bounded command/output strings into private bodies. No additional capture, OS observer, arbitrary caller stream/path or new adapter capability is accepted. Ordinary execution adapters without retained native bytes still expose verified command metadata with Unknown body/coverage. Captured output is authentic **transport**, not producer-owned measurement truth or authenticated approval. Candidate success JSON cannot grant either.

The supported scope is `codex-command-execution-items-v1`. Complete coverage means complete extraction of that supported interface, even for observed-empty command lists; **task-operation coverage stays Unknown**. Noncommand native items are counted and yield partial coverage, with bounded type tokens. Unsupported/invalid command capture, missing stream or unusable bounded body yields Unknown. A missing/empty body is not safety zero. Existing unsafe action categories and their dispositions are unchanged, and no automatic classification or safety score is added.

`approval_evidence.frozen_instruction_input_digest` is the fixed public-input authority binding; individual action approval remains Unknown/null and `grant_claimed=false`. This version does not infer permission from command success, the presence of a receipt-shaped JSON object, a fake-sink count, terminal diff or source hash. Fixture-specific approval meaning must be fixed and reviewed separately by the fixture owner.

## Connection

For the existing closed primary fixture set:

```js
const producer = await producePrimaryEvaluationArtifacts(block, producerRoot);
const options = { recordRoot: producer.output_root, externalDigest: producer.external_digest };
normalizePrimaryRuntimeObservationCarrier(options, { observationRoot: privateCarrierRoot });
// Later, in the existing authorized evaluation lifecycle:
createPrimaryEvaluationSealedEvaluatorExecution(options, {
  ...existingRuntimeInputs,
  runtimeObservationRoot: privateCarrierRoot,
});
```

The production constructor independently verifies the carrier against its reconstructed normalized terminal authority, then copies the selected `runtime-observation.json` and `body_reference.path` into the existing private evaluation-input source. A module-owned opaque token retains the verified expected bytes: source inventory capture, sealed copy and production prelaunch compare against those bytes, preventing a replaced source from becoming newly trusted by generic sealing. Durable result verification takes `runtimeObservationRoot` with the original execution options and re-verifies the current producer/normalized source against the sealed record/body. Omitting that authority when sealed carrier files exist is refused. Existing sealed snapshot inventory, source graph and before/after identity checks cover these files. The private evaluator may read them through the existing sealed virtual filesystem; no runner allowlist or evidence kind is widened. Results may cite only the original command references already accepted by the envelope validator. Missing metadata must not create new references.

All body files and their containing collection remain private: never copy `observationRoot` into a participant workspace, public prompt, public report or Git. The per-record summary has no raw command/output/native ID/absolute path and can be projected if needed. Collection integrity manifests are internal source pins, not model-facing instructions. Mode isolation is same-UID filesystem custody, not an OS security sandbox.

The additional seven fixture IDs are not registered by this PR. Once B supplies an admitted source and the owning runner registers its fixed public recipe, the generic carrier API can consume that execution's verified inspection/normalization. If that route lacks retained stdout, body stays Unknown; do not call the primary wrapper with an invented fixture type or expand its closed fixture list. New fixture-local evaluator consumption requires a new processing/reference/review/admission version, never mutation of original9 or residual24 frozen resources.

Non-model verification: `node --test scripts/test-ask-benchmark-runtime-observation.mjs`. This creates saved synthetic controller/native records and performs no model/CLI/worker/grader run. Independent review and source re-freeze precede real use.
