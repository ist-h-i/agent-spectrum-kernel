# Explicit processing version for saved primary evidence

Spec `SPEC-PRIMARY-SAVED-SCORING-2`, revision 2, references #393, #379 and
the merged #392 public processing seam. This is a separately identified,
posthoc processing interpretation of retained evidence. It does not restore
old admission or rewrite the meaning of an old score.

## Acceptance and boundary

- `AC-VERSION`: an explicit scoring-version v2 descriptor selects command parser
  `1.5.0-primary-saved`, public review recognition revision `2`, and exact public
  processing-source bytes. Version v1 and default behavior retain parser 1.4.
  A producer derives the v2 selection from that descriptor; a conflicting option
  refuses. Unbound opt-in offline capture is not private scoring authority.
- `AC-CLOSURE`: reuse the original sealed dependency graph and private-entry
  import mechanism. Only the bounded review helper and the two additive saved-v2
  command schemas join this explicit source closure. No worker builtin, host,
  filesystem or network permission changes. Source-only construction is distinct
  from verified producer/schema/scoring authority and cannot enable workers.
- `AC-PRIVATE`: consumer-specific facts, targets, oracle assets and private
  controls stay outside Git. Rebind fresh private assets and review/admission
  against their actual bytes. Ambiguity stays Unknown; independently established
  facts, citations, scope, safety and confidence checks remain necessary.
  Private performance consumer and its confidence/citation judgments are not
  replaced by a public assertion classifier.
- `AC-PREPARE`: a saved-evidence preparation binds the original block/export,
  successor descriptor/resources, implementation bytes and fresh disjoint output.
  It uses existing readonly export/preflight APIs. Preparation performs no producer
  normalization, grading worker, model, provider, comparison, generation or CAS
  mutation. Pending authority is a blocker, never a claimed permission.
- `AC-EXECUTE`: a future explicit offline grading entry rechecks the preparation
  and invokes the existing grading adapter. It starts no model and never resumes
  a consumed comparison request. Reused, overlapping, changed or mismatched inputs
  refuse. Keep partial/manual/null outcomes and original worker budgets. This
  development task exercises that route only with new artificial inputs.
- `AC-PRESERVE`: original sessions, inputs, results, scoring assets, CAS and
  consumed requests remain untouched. Public requirements, weights, policies,
  input bytes, output semantics and the existing nine-fixture set remain fixed;
  only the existing allowed identity headers are rebound in independent copies.
- `AC-PROOF`: new synthetic controls, legacy regressions, independent review and
  exact-head CI cover the public change. Private acceptance evidence is recorded
  separately and cannot be replaced by a synthetic public helper test.

## Construction and use

Source construction uses an explicit, source-only scope while the original
authority writers assemble a new private version. It selects a fixed graph shape
and reuses the existing generator/validator. It supplies no verified producer,
schema, admission, start or execution authority. Historical graph reconstruction
continues to use the exact version-selected old graph.
The existing transactional writers may stage at their selected commit in a
linked worktree of the same Git common directory. Construction rechecks that
relationship through its Git administrative directory and reciprocal worktree
backlink, selected commit, physical path and processing bytes. OS ancestor aliases
are normalized; a final root symlink, forged Git pointer, unrelated clone or
staging worktree at another commit is refused. Runtime permissions are unchanged.
Revision 2 adds this existing writer transaction to the construction boundary;
revision 1 evidence remains scoped to its earlier single-root construction tests.

The private copy imports the public helper through its existing verified
`private_entry_import` edge. A recognized assertion must still agree with a
separately established fact. A requirement target includes all required
qualifiers. A syntactically recognized statement cannot validate a citation,
scope change, truth claim or confidence level.

Before any formal saved-result re-evaluation, retain exact private source and
archive identities, independent acceptance evidence and valid new admission.
Prepare a new output outside all retained roots, then review the externally
pinned preparation. The original result and its old processing version remain
available independently. New derived results are posthoc, evaluation-only and
not eligible for a preregistered/formal aggregate by implication.

`scripts/ask-primary-saved-scoring.mjs` accepts a configuration with these fields:

```json
{
  "source": { "path": "/canonical/retained/prepared-comparison.json", "digest": "sha256:<raw-file-hash>" },
  "scoringVersion": { "path": "/canonical/new-fixed/scoring-version.json", "digest": "sha256:<raw-file-hash>" },
  "resources": {
    "baseline": { "path": "/canonical/new-input/baseline-resources.json", "digest": "sha256:<raw-file-hash>" },
    "challenger": { "path": "/canonical/new-input/challenger-resources.json", "digest": "sha256:<raw-file-hash>" }
  },
  "retainedRoots": ["/canonical/retained", "/canonical/old-fixed"]
}
```

The retained source supplies `blocks.baseline` and `blocks.challenger`, each
containing the same original nine fixture IDs in matching order. Each resource
file uses the existing `ask_primary_grading_resources_v1` shape with the exact
nine resources and a fresh `output_root`. Both grading outputs and the new record
directory must be mutually disjoint and outside the retained roots, public
source repository and old/new fixed authority. The successor selector and its
resources must satisfy the existing read-only, independent-file checks.

Run the prepare-only CLI after those separate private review/admission conditions
are satisfied:

```sh
node scripts/ask-primary-saved-scoring.mjs prepare /canonical/new-input/config.json /canonical/new-record
```

Save the returned `output_root` and `external_digest` independently. Reopen using
`verifyPrimarySavedScoringPreparation({recordRoot, externalDigest})`. A `blocked`
preparation retains its inspected source bindings and preflight results; use new
inputs and a fresh record after resolving the named blocker. Editing its status
cannot authorize or enable grading. Even `prepared` records keep
`execution_permission`, `scoring_ready` and `formal_aggregate_eligible` false.

Only a separately authorized caller invokes
`gradePreparedPrimarySavedScoring({recordRoot, externalDigest}, {signal,
deadline_at_ms})`. The function rechecks source bytes and fresh original-adapter
preflights, then grades the paired blocks through that adapter. A completed
manual/null semantic result is retained and does not stop later tasks; a failed
execution stops further dispatch and retains partial results. Reopening does not
replay grading. A second invocation refuses existing grading outputs/result;
there is no implicit resume, retry, CAS update or adoption. The CLI exposes no
grading action. The caller must retain the original adapter's time reservation;
this entry does not reduce worker budgets or add a short task deadline.
The explicit call claims a new `grading` output directory atomically before its
first adapter call and saves `grading/derived-grading-result.json` there. Concurrent
calls and interrupted output directories cannot be reused by another call.

No new Codex CLI/model/provider invocation is required by the deterministic
offline grading path. Evidence absent from retained logs cannot be invented;
runtime cwd, unresolved semantics or other missing observations may remain
Unknown after a new interpretation. Collecting additional task evidence would
be a separate, newly authorized execution, never an automatic retry.

## Formal Verification Contract

- Artifact: `FVC-PRIMARY-SAVED-SCORING-2`, revision 2.
- Upstream: `SPEC-PRIMARY-SAVED-SCORING-2`, observed revision 2.
- Policy: `ask.verification-proof-policy@1.0.0`; formal triggers are
  `public_api_schema_or_compatibility`,
  `state_concurrency_persistence_lifecycle_or_cross_module`,
  `bug_reproduction_or_regression`, and `multi_session_multi_agent_or_handoff`.
- `O-VERSION`: static synthetic v1/v2 descriptors, option conflict, revision,
  source-digest and descriptor substitution controls.
- `O-CLOSURE`: construct and verify the explicit graph; reject added entries,
  missing helper/schema nodes, changed root/revision and stale async scope.
  Exercise the actual CI/doc resource writers in source-only construction;
  permit only their same-repository, same-commit linked staging worktrees.
  Pass the same graph through sealed byte validation, retaining exact schema
  types and all descriptor checks. A source-build scope cannot acquire
  producer/scoring authority.
- `O-PREPARE`: fake retained exports/resources demonstrate zero dispatch during
  preparation, source preservation, output overlap/drift refusal and independently
  pinned re-opening. A fake-only future grading roundtrip uses the existing APIs,
  refuses concurrent/repeated calls, retains completed Unknown results and stops
  with retained partial results on execution failure. Forged stored readiness
  cannot replace a fresh original-adapter preflight.
- `O-PRIVATE`: private compatibility controls preserve false-claim, qualified,
  contradictory, scope, citation and confidence failures. Keep private evidence
  outside the repository and record exact review targets before admission.
- `O-REVIEW`: independent public/private review, relevant local checks and
  exact-head CI. A blocked private authority stays blocked.

Implementation `IMPL-PRIMARY-SAVED-SCORING-2`, revision 2, references this Spec
and FVC. Executed evidence and current limitations belong in the linked PR and
the separate private preparation record. This file grants no formal regrading,
model execution, adoption, Mac application or merge permission.
