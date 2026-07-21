# Adaptive ASK Evaluator Isolation Boundary

Status: Issue #204 boundary checkpoint plus Issue #205 Checkpoint B3 scoring-input authority closure; both Issues remain open

This checkpoint defines the answer-free exchange boundary between normalized execution evidence and a private evaluator package. The adjacent Issue #197 raw-scoring slice consumes this verified boundary but does not create the 24 evaluator packages, admit clean fixtures, execute an evaluator, aggregate results, or authorize measured execution.

## Storage boundary

Private evaluator bundles must stay outside the public repository and outside every materialized, selection-state, execution-run, normalized-results, and staged public-artifact root. The repository, private, materialized, selection-state, execution-run, normalized-results, and supplied public-artifact roots must exist as real directories; a missing root, regular file, or symlink root is rejected. Overlap is checked after canonicalizing the roots. The private manifest and every asset must also be regular non-symlink files. Asset paths are portable normalized relative paths; absolute POSIX paths, Windows drive paths, UNC paths, Windows device paths, backslashes, `.` segments, and `..` segments are rejected.

The materialized, selection-state, execution-run, and normalized-results roots must contain their existing managed markers: `materialization-manifest.json`, `selection-state.json`, `run-identity.json`, and `normalized-results-root.json`. Evaluator-result verification first verifies the immutable normalized generation, then requires the materialization-manifest and selection-state file digests plus the canonical run identity and run instance to match that generation's normalized lineage. Supplying an arbitrary unrelated directory therefore cannot satisfy full boundary verification.

Do not commit a private evaluator package. Do not upload one from public CI, including as a debug, cache, coverage, or failure artifact. After validating the private manifest's exact inventory, the scanner builds a digest set containing the private manifest and every declared asset. It rejects a byte-identical match, including a copied file or hard link, in every materialized, selection-state, execution-run, normalized-results, and supplied staged public-artifact root. It also checks the public repository working-tree files managed by `git ls-files`; untracked repository files are outside the meaning of “managed repository” and must instead be supplied through their applicable boundary root.

This is an exact-byte guarantee only. It does not detect partial extraction, changed serialization or encoding, compression, transformed content, or semantic equivalence. Directory scans are bounded to 100,000 regular files, 2 GiB total, and 256 MiB per file and hash in 64 KiB chunks; JSON artifacts consumed directly by this validator are limited to 1 MiB. Exceeding a bound fails closed. The managed repository reuses the bounded Git tracked-file inventory rather than reading an unrestricted repository tree into memory.

The measured agent must not be able to access evaluator material through its workspace, GitHub Issue or PR content, web access, connectors, selection state, execution state, normalized results, or public CI logs and artifacts. A measured environment therefore requires GitHub, web, and connector access to be disabled or isolated from contaminated Issue content before #198 can proceed.

The public answers from Issues #193 through #196 are contaminated inputs and must not be used as evaluator, oracle, rubric, hidden-test, matcher, reference-outcome, or human-evaluation source material.

## Versioned contracts

`evaluator-reference.schema.json` is the public, non-answer-bearing reference. It binds one evaluator bundle to one fixture ID and fixture-input digest and publishes only bundle, generator, independence, review, revision, storage-class, and deterministic metadata identities. Its `public_metadata_digest` is SHA-256 over sorted-key canonical JSON of the complete reference with only `public_metadata_digest` omitted.

`private-evaluator-bundle.schema.json` is private-root-only. `asset_inventory` is the exact file allowlist for oracle, rubric, hidden tests, matchers, equivalent-solution rules, false-positive boundaries, scope boundaries, unsafe-action rules, evidence-removal mutations, human-evaluation instructions, and reference outcome. Every listed asset records role, relative path, SHA-256, byte count, media type, and required state; duplicate roles and paths, missing or extra files, and digest or byte drift fail closed.

The manifest is part of the bundle closure but is not listed as an evaluator asset. Identity is defined as follows:

- `evaluator_bundle_id`: SHA-256 over `schema_version`, `schema_path`, `fixture_identity`, `input_identity`, and the deterministically ordered complete `asset_inventory`.
- `evaluator_bundle_digest`: SHA-256 over the sorted-key canonical JSON of the complete manifest with only `evaluator_bundle_digest` omitted. This includes the derived bundle ID, generator, independence and review provenance, capabilities, boundaries, and every asset digest and byte count.

`scoring-input-freeze-manifest.schema.json` is the authority artifact for one fixture/input pair. It binds repository-relative paths plus raw-byte and semantic digests for the catalog, policy manifest, scoring policy, final admission record, requirement record/set, output contract, and public evaluator reference. The manifest itself has a freeze revision and a self-excluding semantic digest. Its exact bytes must either match `HEAD` or an explicitly approved immutable source digest. Every path is resolved below the real repository authority root, and path escape, symlink traversal, non-regular files, a caller path that differs from the frozen authority path, or an internal `*_path` that differs from the resolved authority path fails closed. This checkpoint adds only the final-admission record Schema and synthetic contract evidence; it does not create a real fixture admission record.

`evaluator-result-envelope.schema.json` is the public exchange form consumed by the future scoring engine. It binds both the approved raw source digest and semantic digest of the scoring-input freeze manifest, plus the catalog, policy manifest, scoring policy, admission record, authoritative requirement record/set, output contract, public evaluator reference, normalized result, run, plan, fixture input, case, attempt, adapter, condition, repetition, normalized source snapshot, evaluator bundle, and evaluator revision. Requirement results retain only the requirement ID, `pass`/`fail`/`partial` or an explicit non-scoring state, earned points, matched equivalence-class IDs, finding IDs, and digest/byte evidence references. Every scored outcome requires at least one valid evidence reference in both JSON Schema and semantic validation. This checkpoint validates frozen points and partial-credit constraints but calculates no score or aggregate.

`evaluation_id` is derived from the scoring-input digests, normalized result ID/digest, evaluator bundle ID/digest, and evaluator revision. `evaluation_digest` covers the complete result envelope with only `evaluation_digest` omitted. A completed evaluation is scoring-ready only after it covers the authoritative requirement set exactly and every requirement outcome satisfies the frozen points contract. Non-completed, unavailable, manual-review, and not-evaluated states remain non-scoring and are never converted to zero. Findings retain only bounded public IDs, categories, severities, and digest/byte evidence references. Oracle, rubric, hidden-test, matcher, reference-answer, expected-patch, raw evaluator prompt, private path, credentials, secrets, customer data, and personal data fields are not part of the closed Schema.

## Read-only verification and guarantee levels

All three evaluator commands are read-only, but they do not make the same claim:

- `verify-evaluator-bundle` verifies private bundle identity, real marker-bearing boundary roots, disjointness, and byte-identical material absence. `--public-artifact-root` is optional; omitting it explicitly leaves staged publication unverified. It does not claim the marker identities belong to the normalized lineage.
- `verify-evaluator-result` additionally verifies normalized-result lineage, authoritative requirement/output sources, requirement-level outcome semantics, and the complete scoring-input identity closure. It binds the supplied materialized, selection-state, run, and normalized roots to that lineage. Staged publication remains unverified unless `--public-artifact-root` is supplied.
- `verify-evaluator-boundary` is the full boundary check. It requires `--public-artifact-root`; omission is an error and cannot report full verification success.

```bash
node scripts/ask-benchmark.mjs verify-evaluator-bundle \
  --reference /path/to/public-evaluator-reference.json \
  --private-root /path/to/private-evaluator-root \
  --manifest /path/to/private-evaluator-root/private-evaluator-bundle.json \
  --materialized /path/to/materialized-root \
  --selection-state /path/to/selection-state-root \
  --run-dir /path/to/execution-run-root \
  --normalized-results /path/to/normalized-results-root

node scripts/ask-benchmark.mjs verify-evaluator-result \
  --reference /path/to/public-evaluator-reference.json \
  --private-root /path/to/private-evaluator-root \
  --manifest /path/to/private-evaluator-root/private-evaluator-bundle.json \
  --result /path/to/public-evaluator-result.json \
  --admission-record /path/to/public-final-admission-record.json \
  --requirement-record /path/to/public-requirement-record.json \
  --output-contract /path/to/public-output-contract.json \
  --scoring-input-freeze /path/to/scoring-input-freeze-manifest.json \
  --scoring-input-freeze-source-digest sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --materialized /path/to/materialized-root \
  --selection-state /path/to/selection-state-root \
  --run-dir /path/to/execution-run-root \
  --normalized-results /path/to/normalized-results-root

node scripts/ask-benchmark.mjs verify-evaluator-boundary \
  --reference /path/to/public-evaluator-reference.json \
  --private-root /path/to/private-evaluator-root \
  --manifest /path/to/private-evaluator-root/private-evaluator-bundle.json \
  --result /path/to/public-evaluator-result.json \
  --admission-record /path/to/public-final-admission-record.json \
  --requirement-record /path/to/public-requirement-record.json \
  --output-contract /path/to/public-output-contract.json \
  --scoring-input-freeze /path/to/scoring-input-freeze-manifest.json \
  --scoring-input-freeze-source-digest sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --materialized /path/to/materialized-root \
  --selection-state /path/to/selection-state-root \
  --run-dir /path/to/execution-run-root \
  --normalized-results /path/to/normalized-results-root \
  --public-artifact-root /path/to/staged-public-artifacts
```

Evaluator-result verification invokes the existing normalized-results verifier in immutable-snapshot mode, then resolves the referenced normalized attempt from that verified generation. The default frozen policy passes the complete `validatePortfolioPolicyArtifacts()` path. Caller-supplied catalog or policy paths must equal the freeze manifest authority paths; an alternate path that is not explicitly frozen is rejected. The admission digest is re-derived from the actual final-admission artifact rather than trusted from the requirement record. For an untracked synthetic freeze manifest, `--scoring-input-freeze-source-digest` is mandatory; a checked-in manifest whose bytes match `HEAD` needs no explicit source digest. To additionally prove that the normalized snapshot is current against the execution source, first run the existing current-source `verify-normalized-results` command with config, plan, materialized, selection, run, and output roots.

The all-`a` source digest in the examples is a placeholder; callers must supply the separately approved SHA-256 of the exact untracked manifest bytes and must not derive approval from the manifest being verified.

The focused regression uses synthetic normalized evidence and a synthetic private bundle only:

```bash
node scripts/test-ask-benchmark-evaluator-boundary.mjs
node scripts/test-ask-benchmark-portfolio-score.mjs
```

The second command exercises `score-evaluator-result`, which reuses `verifyEvaluatorResult()` and writes one Schema-valid raw engineering result. It does not re-read the evaluator or normalized JSON after verification. The artifact retains the verified normalized outcome; only normalized `completed` can progress an otherwise scoring-ready evaluator result to a numeric score. Non-completed normalized execution keeps null score fields, and every non-ready result uses a non-ready safety state rather than inferring pass from absent findings. The derived artifact keeps blocker and safety gates separate from the normalized requirement score and retains false positives, correctness, scope, mechanism, unsafe-action counts, and overhead observations in native typed form. Publication is atomic no-replace through same-directory hard-link creation and has no overwrite fallback. It performs no aggregate, comparison, repetition, severity conversion, penalty, mechanism credit, or practice-frequency weighting.

## Responsibility and stop boundary

This checkpoint does not complete Issue #204 or #205. Issues #206 through #209 still own clean fixture and private evaluator package creation. The current Issue #197 slice deterministically joins and scores one verified result without inventing missing requirement semantics; later Issue #197 slices still own aggregation. Issue #198 owns preregistration, calibration, pilot, measured execution, human evaluation, interpretation, and product recommendations.

#198 Stage 0 remains blocked. No evaluator execution, measured-result score, measured run, aggregate, or product-value conclusion is authorized by this boundary.
