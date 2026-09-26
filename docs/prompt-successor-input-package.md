# Prepare the calibration public-input package

## Purpose and boundary

Issue #291 needs four real calibration evaluation packages before measured
execution. PR #310 connected their catalog IDs to the original source inputs;
it did not create their requirement records, private evaluators or admission.

`ask-benchmark-calibration-input-package.mjs` removes manual path and hash assembly
once the public packages exist. It inventories all four packages in one read-only
check, then uses the existing #197 validators and successor manifest builder to
assemble their exact public references. It is not a new scorer, admission path,
private-evaluator verifier, or measured-run preflight replacement.

The two operations have deliberately different meanings:

- `inspect`: report committed input availability, not semantic validity.
- `assemble`: validate admitted public input chains and write the existing
  `prompt_successor_scoring_input_manifest` in its canonical byte form.

Neither operation reads private assets or starts a model, evaluator, trial,
selection, run journal, admission review, or result-blind execution freeze.

## Inputs that must actually exist

Use the unchanged catalog/source pairs from
`scripts/ask-benchmark-calibration-source.mjs`:

| Catalog ID | Original source ID |
|---|---|
| `cal-session-refresh` | `pr-session-refresh-medium-hard` |
| `cal-export-lease` | `pr-export-lease-hard` |
| `cal-atomic-rule-batch` | `impl-rule-batch-medium-hard` |
| `cal-concurrent-transfer` | `impl-transfer-hard` |

Each `benchmarks/fixtures/checkpoint-b2/<catalog-id>/` needs its real public
`final-admission-record.json`, `requirement-record.json`, `output-contract.json`,
`evaluator-reference.json`, `scoring-input-freeze-manifest.json`, `metadata.json`,
`evidence-map.json`, `verification-command-contract.json`, and
`evaluator-authority-manifest.json`. These are existing contracts, not new formats.

The input manifest remains the shared, unchanged
`benchmarks/fixtures/checkpoint-b2/input-manifest.json`; do not create a per-alias
replacement or copy a different fixture's approval. The tool also reads the
existing successor execution config and catalog, policy-manifest, scoring,
admission and lineage policies. Its fixed inventory has 43 public JSON paths.

The private evaluator must be supplied and reviewed separately. A legacy
`evaluator/` directory being present in the repository does not establish an
independent private bundle for #291. Do not relabel old public answer assets or
test-only synthetic packages as real private authority. In particular, the
existing private-bundle contract requires `public_answer_sources_used: false`;
that field must describe the actual provenance, not a desired outcome.

## Inspect without creating anything

From the intended checkout, using the repository's Node 24 environment:

```sh
node scripts/ask-benchmark-calibration-input-package.mjs inspect
```

The JSON report identifies the exact inspected commit/tree and every fixed
public path. It distinguishes missing, uncommitted, changed, invalid, and
present-but-not-validated inputs. It contains no file contents, absolute source
paths, private paths or raw parser messages. It does not search arbitrary
storage roots for private material.

Exit 2 means the public inventory is incomplete or has rejected inputs. Exit 1
means the command or source could not be inspected. Exit 0 means only that all
expected files are present at the inspected revision; even syntactically valid
but meaningless JSON remains `present_not_validated`, with no approval claim.

## Assemble only after real public authority is ready

The public records must have been reviewed, committed, and admitted through an
actually supported frozen authority contract. Run from a clean checkout; the
implementation is pinned when the module loads. Restart after changing HEAD.
The output's parent directory must already exist and must not traverse a symlink.
Use a fresh absolute file path outside both the repository and its Git metadata:

```sh
node scripts/ask-benchmark-calibration-input-package.mjs assemble \
  --output /absolute/existing-evidence-directory/scoring-input-manifest.json
```

Assembly fails before publication if any input is missing or not committed,
changed from its Git bytes, invalid under the existing contracts, not admitted,
or inconsistent with the historical common inputs. It performs the existing
public admitted-fixture invariance checks, including primary-fixture checks.
It rechecks the input bytes and loaded source identity before writing.

The resulting manifest is built by `buildSuccessorScoringInputManifest`, not a
second serializer or scoring contract. `writeCanonicalJsonNoReplace` publishes
it atomically; existing outputs are never overwritten. Use the manifest's actual
semantic digest in the existing successor preparation. Do not reuse an earlier
preparation after its bound input identities change.

**Preparation 1.1 does not bind admission decision overlays.** This command
therefore rejects any repository overlay for a calibration fixture. It does not
ignore an overlay, flatten it into a legacy record, edit an admission status, or
accept a late per-case approval. If the real reviewed packages require overlays,
first implement and review a successor pre-result contract that binds them.
Changing `admission_pending` to `admitted` by hand is not a workaround.

A successful command reports `public_content_verified: true` and
`private_bundle_verified: false`. This is a public-input assembly result only.
The private bundle's bytes, source identity, independence, semantic correctness,
and isolation still need their own evidence through the existing evaluator
boundary. Public reference consistency alone cannot prove those facts.

## Remaining work before trial 1

At the PR #310 baseline (`e393018705718b989a74e343e6fd5c68e318ec8c`), the four
canonical calibration directories were absent. No approved package for these
four identities was supplied to this implementation task. This is a bounded
observation about the inspected inputs, not a claim to have searched all private
storage. This PR supplies no synthetic replacement and records no approval.

The next input-owner task is to supply or independently author and review the
four real packages, including their nonpublic assets and exact approval evidence.
Then complete public-chain validation and the existing private-evaluator checks.
Only after target-host controls and any previous run state are verified may the
separately authorized #291 procedure create a new result-blind execution freeze
and begin the 28 trials. Neither command here authorizes that execution or an
outcome for #278.

## Verification

```sh
node --check scripts/ask-benchmark-calibration-input-package.mjs
node --test scripts/test-ask-benchmark-calibration-input-package.mjs
```

The tests use disposable Git repositories and test-only input inventory data.
They cover bounded discovery, file identity, unsafe paths, invalid JSON, privacy
of diagnostics, incomplete-package rejection and no-write failure behavior.
They are not positive evidence that real packages are admitted or that their
private evaluators work. Positive end-to-end assembly must be verified using the
actual public packages, with the exact source and output digest recorded before
treating this command as operationally validated.
