# Formal verification and delivery scope

Verification artifact `FVC-RULE-BATCH`, revision 2. Upstream ref:
`SPEC-RULE-BATCH@2` (spec.md), acceptance items r1–r10 in requirements.json.
Policy `ask.verification-proof-policy@1.0.0`; selection `PROOF-RULE-BATCH@2` uses
`formal_verification_contract`, with observed triggers
`state_concurrency_persistence_lifecycle_or_cross_module`,
`multi_session_multi_agent_or_handoff`, `merge_release_or_stable_trace`,
`multiple_specialized_checks`. Compact eligibility is not established.

O1: r1–r10 each have exact original text, explicit judgment, inputs, expected
result/error, state invariants, fixed case IDs and finite coverage limits.
O2: signed-zero scalar identity, counter identity, ordered typed payload, atomic
rejections and replay snapshots are observed using Object.is/deep strict equality
rather than lossy JSON comparison. O3: batch-only raw ASCII validation rejects
Unicode independent of stored-key existence; constructor/direct raw Unicode
keys/values and legacy Unicode aliases survive. O4: the compliant controller
example passes all fixed tests and named artificial faults fail their specific
paired witnesses. O5: original task/seed/evaluation assets are not modified;
historical evidence remains separately identified. O6: closed digest-bound
materialization, distinct model-added tests and common frozen future preparation
integrate with the existing comparison runner without any actual model calls.
O7: independent specification and fresh final implementation reviews, local
consistency/freshness checks, exact-head CI and remote main identity precede a
merge claim. O8: delete only evidenced obsolete duplicate backups; preserve
unique/original evidence, other worktrees and uncertain ownership.

Focused checks E1 (O1–O4):
`node --test scripts/test-rule-batch-contract-v2.mjs`.
E2 (O5/O6): `node --test scripts/test-rule-batch-comparison-preparation.mjs` plus
existing comparison prepare/runner/log/unattended tests. E3 (O7):
`node scripts/validate-repo.mjs`, `node scripts/adapter-runtime-bundle.mjs --check`,
`git diff --check`, and exact-head CI. E4 (O7): independent reviewed snapshot hash
or exact base/head SHA with findings resolved. E5 (O5/O8): local preservation and
cleanup inventory, plus historical source/verifier provenance and hashes.
Executed evidence is recorded on the PR/delivery record; these commands are
obligations, not a claim that they have passed.

Insufficient evidence: missing original 114-case verifier provenance prevents
claiming its reuse; absent required checks, unresolved major findings, failed CI
or changed reviewed bytes prevent delivery/merge completion. Bounded test passes
do not prove exhaustive correctness, fair causal comparison, process/OS isolation
or ASK superiority. Real model evaluation, saved P/F rescoring, K launch and prior
refused diagnostics are outside this task.

Implementation artifact `IMP-RULE-BATCH`, revision 2, upstream
`SPEC-RULE-BATCH@2` and `FVC-RULE-BATCH@2`. Work package `WP-RULE-BATCH@2` owns only
new versioned contract/seed/fixed verifier/controller examples; a new model-free
materializer, its qualification/integration tests; a CI test step; narrow public
guide link; local cleanup evidence. Do not modify original fixture/evaluator,
saved P/F, global config, runtime distributions, admitted scoring manifests,
dependencies or model launcher. Sequence: design review → fixed cases/paired
qualification → frozen bundle integration → fresh independent review → checks →
Draft PR → fixes if needed → ready/merge/remote verification. Public Issue/PR
updates and merge are explicitly authorized by the 2026-10-11 task; no additional
execution grant is issued for a model comparison.
