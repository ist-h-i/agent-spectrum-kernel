# Verification Evidence Contract

This contract defines the local-first bounded evidence state used to preserve deterministic verification results without turning a historical `PASS` into current authority.

The canonical machine-readable shapes are:

- `schemas/verification-evidence.schema.json` for one sealed result;
- `schemas/verification-reuse-plan.schema.json` for exact-reuse requirements and dispositions;
- `schemas/verification-evidence-transfer.schema.json` for deterministic bounded transfer.

`scripts/verification-evidence.mjs` implements the contract. `scripts/content-addressed-store.mjs` owns only generic canonical JSON identity and local content-addressed object I/O. Asset registration, admission, promotion, and portfolio state remain separate concerns.

## Slice 1 boundary

This revision supports:

- versioned bounded deterministic verification evidence;
- a local content-addressed store;
- `reuse_exact` decisions;
- tamper, partial, duplicate-conflicting, and identity-transplant rejection;
- deterministic export/import of exportable bounded evidence;
- fail-closed exact-gate coverage.

It does not support `reuse_scoped`, semantic dependency inference, AI delta review, remote storage, hosted coordination, asset admission, measured benchmark execution, or merge/release approval.

## Evidence identity

Every sealed evidence object binds:

- gate ID, category, and exact gate-contract digest;
- repository, target revision, and tree digest;
- the sorted consumed input paths, kinds, and digests;
- executable, arguments, and repository-relative working directory;
- runner, adapter, evidence level, toolchain, and bounded environment identity;
- terminal status, exit code, duration, output byte count, and output digest;
- covered obligation refs and explicit non-coverage;
- exact-only invalidation behavior;
- producer kind and producer identity digest;
- independent-review status;
- privacy classification and exportability.

The `reuse_identity_digest` covers the gate, target, consumed inputs, command, runner, toolchain, and environment. It deliberately excludes the terminal result and producer identity so repeated observations can share one material execution identity. Producer and evidence-level policy are checked separately before reuse.

The `evidence_digest` covers the complete bounded evidence content, including the reuse identity digest, result, coverage, producer, authority, and privacy fields. `evidence_id` is derived from that digest. Identity fields never rely on branch names, check labels, or command display names alone.

## Content-addressed store

The store layout is shared infrastructure rather than evidence-specific admission state:

```text
<store>/objects/sha256/<first-two-hex>/<remaining-hex>.json
```

Stored bytes are canonical JSON plus one newline. A verification-evidence object is stored as its bounded content without the derived `evidence_id` and `evidence_digest`; reading the object deterministically reconstructs and verifies both fields.

Writes are no-replace. Repeating an identical write verifies the existing bytes and returns the same object. A conflicting object at the same address, a non-canonical object, a digest mismatch, a symlink inside the owned store path, or an unsupported store entry fails closed.

This layout may later hold other versioned content-addressed ASK artifacts. Consumers select objects by their strict `program` and schema contract. Evidence validity never promotes or admits an Asset.

## Exact reuse planner

Requirements declare one exact reuse identity per required gate plus:

- the obligation refs that the evidence must cover;
- accepted producer kinds;
- accepted producer identity digests;
- accepted evidence levels;
- whether independent judgment is still required;
- whether new execution is available.

Slice 1 emits one disposition per gate:

| Disposition | Meaning in this revision |
|---|---|
| `reuse_exact` | A passing, authority-compatible object matches every material exact identity. |
| `rerun_required` | No valid exact pass exists, a material identity changed, required obligations are not covered, a prior result did not pass, authority is incompatible, or exact outcomes conflict. |
| `independent_judgment_required` | Exact deterministic execution evidence is reusable, but it cannot replace the required independent decision. |
| `blocked_uncovered` | No covering exact evidence exists and current execution is unavailable. |
| `reuse_scoped` | Reserved by the shared state model; rejected while `planner_scope` is `exact_only`. |

Conflicting passing and non-passing evidence for one exact identity never resolves by selecting the pass. It yields `rerun_required` with `conflicting_exact_evidence`.

Repository, target, tree, gate-contract, input, command, runner, toolchain, and environment changes produce a different reuse identity. A cross-boundary object therefore cannot satisfy exact reuse even when its gate label or command text looks similar. Producer identity is evaluated separately against the gate's accepted producer identity digests, so a changed or untrusted producer cannot reuse evidence while producer changes remain distinct from material execution changes.

A passing exact-identity object is reusable only when its `coverage.obligation_refs` contains every obligation required by the gate. Covered and explicitly non-covered refs must be disjoint. An unrelated or incomplete obligation set yields `exact_evidence_coverage_mismatch`; it never becomes coverage merely because the command succeeded.

## Authority boundary

Deterministic developer or automation evidence may be consumed by another actor when the requirement accepts its producer kind and evidence level. Consumption does not change the original producer.

Generic verification evidence does not represent review findings, approval, admission, or a current independent semantic decision. When a gate requires independent judgment, a matching deterministic pass yields `independent_judgment_required`, not `reuse_exact` coverage.

PR HEAD, CI, approval, mergeability, release, authorization, and other current external facts remain decision-time checks. Historical evidence does not make them current.

## Coverage foundation

The exact planner includes a coverage summary and a required/covered/uncovered obligation partition for every gate. In Slice 1, `covered` means every required deterministic gate has `reuse_exact` and its chosen evidence covers every required obligation. Any rerun, unavailable obligation, independent judgment, conflicting result, or reserved scoped reuse yields `blocked` and names the blocking gate IDs.

The planner validates its output against the exact requirements object before returning it. Consumers using a stored or transferred plan for a coverage claim must likewise supply that requirements object to plan validation; standalone validation proves only schema, digest, and internal consistency, not that a different requirements set was satisfied.

This is a foundation for the later current-target coverage gate. It does not by itself support a completion, merge, or release claim, and it does not replace lifecycle traceability, final review, approval, rollback, or current external-state checks.

## Transfer

A transfer contains sorted evidence refs and the corresponding sealed evidence objects. Its digest and ID cover both arrays and the fixed privacy declaration.

Export:

- accepts unique evidence IDs;
- verifies each stored object before packaging;
- rejects `local_only` evidence;
- emits deterministic canonical content.

Import:

- validates the transfer schema, digest, ID, ref/object equality, object identity, canonical order, uniqueness, privacy, and exportability;
- writes every object through the same no-replace CAS path;
- preserves each original evidence ID and digest.

Missing objects, mismatched refs, duplicate IDs, modified objects, modified transfer metadata, or a conflicting destination object fail closed.

## Privacy boundary

The strict evidence and transfer schemas allow bounded structured fields only. They do not allow raw prompts, full transcripts, raw command output or logs, arbitrary environment values, secrets, credentials, absolute private paths, private evaluator content, or external review archives.

Command execution is represented as a direct executable plus argument list and a portable repository-relative working directory. Output is represented only by byte count and digest. Environment identity is represented by bounded OS/architecture labels and a digest, not raw environment variables.

## CLI

The CLI accepts explicit paths and never chooses a repository or external store implicitly:

```bash
node scripts/verification-evidence.mjs put \
  --store /path/to/local-store \
  --input /path/to/evidence-draft.json \
  --output /path/to/sealed-evidence.json

node scripts/verification-evidence.mjs verify \
  --store /path/to/local-store \
  --evidence-id verification-evidence-<sha256>

node scripts/verification-evidence.mjs plan \
  --store /path/to/local-store \
  --requirements /path/to/requirements.json \
  --output /path/to/exact-reuse-plan.json

node scripts/verification-evidence.mjs export \
  --store /path/to/local-store \
  --evidence-ids verification-evidence-<sha256>[,verification-evidence-<sha256>] \
  --output /path/to/evidence-transfer.json

node scripts/verification-evidence.mjs import \
  --store /path/to/other-local-store \
  --input /path/to/evidence-transfer.json
```

`put` accepts an unsealed draft or an already sealed object. `plan` accepts either a sealed requirements object or `{ "requiredGates": [...] }` as a draft. Output files use atomic no-replace publication; existing files are not overwritten.

## Extension rules

- Slice 2 may add explicit dependency manifests and `reuse_scoped`; it must not infer scoped reuse from an LLM-only dependency guess.
- Selective AI delta review must preserve the independent-judgment boundary and use bounded evidence refs rather than raw history.
- #276 may reuse the generic content-addressed store and provenance primitives, but Asset registration/admission and evidence validity remain separate contracts and states.
- A hosted store, mutable index, garbage collection policy, signing model, or store-layout revision requires a fresh architecture/ADR review.
- Benchmark evaluator, fixture, admission, scoring, and measured-output semantics are outside this contract.
