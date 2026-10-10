# User repository comparison contract

Spec `SPEC-USER-COMPARE-1` revision 1 references the 2026-10-10 user request
and Issues #315 / #318. This is a new exploratory delivery lane; existing fixed
experiments, frozen inventories, grants and synthetic-only drivers are unchanged.

Acceptance IDs:

- A1: prepare three independent Git copies of one explicit committed source,
  task and verification recipe without starting Codex or changing source/global
  state. Preserve user instructions; refuse ambiguous managed ownership.
- A2: P adds no project ASK; K uses canonical AGENTS with no ASK Skills;
  F installs actual core plus Codex full, recording versions and asset hashes.
  Missing Kernel routes are recorded as capability_missing, never repaired.
- A3: inspect shows exact command, input/scope, settings, paths, timeouts and
  retry policy. Explicit start alone reaches the existing Codex runner.
- A4: persist all three slots, launch request/start/completion separately,
  failures, denial, timeout, interruption and partial evidence. One attempt,
  sequential sessions, no automatic retry or overwriting. New runs use new IDs.
- A5: retain logs, patches, independent verification, requirements left
  unassessed, duration, available usage and unknowns. Reopen offline, retaining
  condition differences and separating synthetic from observed evidence.
- A6: exact Japanese commands cover single-task acceptance and comparison
  prepare/inspect/start/report, interruption and limitations.

Implementation Contract `IMP-USER-COMPARE-1` revision 1 references this Spec.
Allowed scope: new exploratory entry and tests, small reuse seams where needed,
report aggregation, user documentation and model-free CI. Forbidden scope:
real evaluation Codex/model calls in this development task, old rejected
diagnostics, auth/config changes, private evaluator inputs, old fixed conditions,
release gates, new dependencies and automatic publication of user evidence.

Formal Verification Contract `FVC-USER-COMPARE-1` revision 1 references A1–A6.
Selected policy `ask.verification-proof-policy@1.0.0`, path
`formal_verification_contract`; selection `PROOF-USER-COMPARE-1` uses observed
triggers `state_concurrency_persistence_lifecycle_or_cross_module`,
`multi_session_multi_agent_or_handoff`, `merge_release_or_stable_trace`,
`multiple_specialized_checks`. Compact eligibility is not established.

Proof obligations:

- O1 (A1/A2): temporary real Git repos, uninstalled/installed/custom/ambiguous
  ownership, original/global bytes, independent arm configuration and hashes.
- O2 (A3/A4): fake runner observes exact args/cwd/input; all-success, missing
  capability, denied start, process failure, timeout, interruption, partial
  persistence, no duplicate starts/concurrency/overwrite.
- O3 (A5): missing result and unknown usage remain explicit, independent tests
  and requirements are separate from self-report, synthetic/observed never pool.
- O4 (A6): executable CLI examples and offline reopening from chosen output.
- O5: related preparation/runner/report/setup/recovery/release regressions,
  repository validation, generated runtime freshness, whitespace, exact-head CI
  and fresh independent review of the final snapshot before merge.

Focused evidence E1: `node --test scripts/test-ask-user-comparison-prepare.mjs scripts/test-ask-user-comparison.mjs` (O1–O4).
E2: relevant existing model-free suites (O5). E3: `node scripts/validate-repo.mjs`,
`node scripts/adapter-runtime-bundle.mjs --check`, `git diff --check` (O5).
E4: independent review with exact base/head; E5: CI and remote merge identity.
Executed results and exact revisions belong on the PR and final implementation
report; this contract is not an execution receipt.

Insufficient evidence: missing focused/required checks, unresolved major review
findings or failed required CI prevent merge completion. Real model comparison,
normal-user sandbox/provider behavior, general ASK value and v1 completion stay
unverified even when this development contract passes.
