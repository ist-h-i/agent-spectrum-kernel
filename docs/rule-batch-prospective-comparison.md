# Rule batch prospective comparison bundle

Contract `ask.rule-batch@2.0.0`, verifier `ask.rule-batch-verifier@2.0.0`, judgment
`ask.rule-batch-judgment@2.0.0` form a new prospective lane. The
[specification](../benchmarks/contracts/rule-batch/2.0.0/spec.md),
[ten-requirement map](../benchmarks/contracts/rule-batch/2.0.0/requirements.json),
[bundle inventory](../benchmarks/contracts/rule-batch/2.0.0/bundle.json) and
[verification contract](../benchmarks/contracts/rule-batch/2.0.0/verification-contract.md)
are one reviewable source. This is not portfolio admission or a change to old
scoring/release gates. Historical records remain in their original local roots;
only the public, candidate-neutral verifier code and sanitized identity metadata
are published. Original v1.2 code is retained byte-for-byte with its 114 cases;
the new fixed cases add signed-zero, Unicode and payload/state boundaries.

`set.value` uses typed Object.is equality, preserving -0/+0 separately; counter
zeros both mean version 0. Batch validates raw ASCII before its explicit ASCII
trim/lowercase. Legacy single-rule Unicode aliases and raw store Unicode remain
unchanged. Read the spec for error precedence, receipt enumeration and test limits.

## One proposed next comparison — prepare/freeze before any launch

Use one new P/K/F run of this task, with identical committed seed, task, recipe,
fixed verifier, runtime/model settings, one-session/no-retry policy and a separately
approved budget. Freeze the contract bundle digest and repository commit before
inspecting any new candidates. Missing K capability remains not-started/unknown,
never quality zero. This proposal issues no model execution authorization.

Preparation is model-free. After checking out the delivered repository commit:

```sh
node scripts/ask-rule-batch-bundle.mjs check
```

Record its bundle digest outside the bundle and supply that exact value below.
Choose a new canonical directory outside all repositories; its parent must exist.

```sh
node scripts/ask-rule-batch-bundle.mjs materialize /absolute/private/new-rule-batch-inputs sha256:RECORDED_BUNDLE_DIGEST
```

This creates `source/`, external `task.md` and `verification.json`, plus a
materialization receipt. It never overwrites existing paths or includes the
positive reference/mutants. Initialize and commit `source/` as a standalone Git
repository with normal local Git commands. Record its exact commit externally;
do not put the commit's own ID into a file in that commit.

Then use the existing [comparison guide](user-repository-comparison-mac-codex-ja.md)
prepare/inspect commands with that source commit, external task/recipe, and only
`--allow src/ --allow test/generated/`. Keep fixed `test/fixed/`, original visible
tests, docs, binding and package immutable. The plan freezes all input hashes
and source commit for the three slots. Model-added tests are separate from the
fixed aggregate and ten requirement commands. A protected-file edit is a scope
violation, not a new passing grade. Public tests remain readable; this does not
prove OS isolation or resistance to gaming a finite public suite.

Stop at inspection until the separate actual-comparison authorization, runtime,
budget, stop conditions and missing-capability policy are settled. This task ran
no actual P/K/F comparison, no K launch and no retrospective v2 evaluation.

## Version and preservation rules

Original run `f37390c0-c168-406d-8823-b02b9e09154d`, original public 3/3 and overall
exit 7, posthoc v1.2 and its r7/r10 unknowns remain unchanged. New boundary choices
are not retroactive requirements. A future saved-result evaluation needs its own
ID, parent run ID, `post_hoc` label and bundle digest. Later semantic changes
require a successor contract/verifier and separate records; no indefinite
rescoring of frozen results. Test passes establish bounded observations, not
complete correctness, causal advantage or general ASK superiority.

The local cleanup audit classified original runs/logs/patches, earlier attempt
records, old verifier versions, evaluation snapshots/replays, and source copies
as evidence or reconstruction inputs. No obsolete duplicate backup was evidenced;
none was deleted and no deletion backup was created. Other worktrees and missing
temporary worktree registrations were retained. The detailed local audit contains
private paths and is not published with this guide.
