# Issue #235 Prompt v2 execution handoff

Status: result-blind transfer contract; not execution authorization

## Task

Execute and interpret the preregistered `current_prompt` versus `prompt_v2` canary exactly once under Issue #235, after a separate explicit approval permits measured execution and result access. Preserve the two adapter tracks and produce only the preregistered non-authoritative Prompt outcome.

## Context

- Preregistration source commit A: `1710b3007d60e249d553ca7a43b5a83937066b61`.
- Source tree: `caff00c8f1d97386fe28d62d819028e644036a27`.
- Frozen execution repository: `869d96b16543ef68b4c459064c8010e1cdb0b8de` / tree `1546f9cd522716f5d266018b7cc4901bed98c204`.
- Preregistration digest: `sha256:5c7c9d0a8bce5171f5c9b6bbb4c737d509a8375bb8db1bdb89df80a684d49cce`.
- Protocol raw-byte digest: `sha256:4ab18a466567e0a94df575bddb5aabc4ccf8fff496be11d3af74a32ef44aff3a`.
- Exact generated authority: `docs/fixtures/prompt-v2-preregistration/binding.json`, `reference.json`, and the adjacent shared CAS.
- Inventory: 56 cases in 28 paired blocks: four protected fixtures, two Prompt roles, and separate Codex and Claude tracks.
- Codex is frozen to `codex-cli 0.147.0`, `gpt-5.6-sol`, reasoning `high`, one fresh process and isolated workspace per case, `workspace-write`, approval `never`, network disabled, 900000 ms timeout, sequential execution.
- Claude is preregistered as `unavailable` because its CLI is absent. Keep all 28 Claude cases as typed unavailable records; do not spawn, substitute, pool, or convert them to zero.

The generated binding and reference are the exact authority. A mutable branch name, latest selector, newly rendered Prompt, or manually reconstructed identity is not a substitute.

## Allowed scope

- Read and verify the checked-in preregistration, generated binding/reference/CAS, source commit A, runtime versions, and frozen execution revision.
- Create one new local run root outside the repository. It must be absent at start and must contain separate immutable case directories and mutable-result roots for every Prompt arm.
- Build the plan, materialization manifest, and initial resume state with the exports in `scripts/ask-benchmark-prompt-v2.mjs`.
- Execute only pending Codex cases from the exact plan. Preserve task, workspace, and evaluator-visible input identity inside each pair while applying the exact role-specific Prompt Asset.
- Record Claude cases through the typed unavailable path without process creation.
- Use the existing #197 `full_ask` raw scoring/result/report authority. Preserve its exact raw result references; do not implement another scorer or add a fifth #197 condition.
- Append normalized case references through `applyPromptV2NormalizedResult`, then derive adapter-separated comparison reports with `buildPromptV2ComparisonReport`.
- Keep raw prompts, full model outputs, stdout/stderr, private evaluator bytes, secrets, and absolute private paths outside durable public artifacts.
- Report exact commands, terminal exits, case inventory, unavailable/unknown states, native-unit metrics, medians/MADs/sign counts, adapter outcomes, and the repository outcome.

## Forbidden scope

- Changing the protocol, preregistration, source A, rendered archive, generated authority, Prompt Assets, Portfolio selections, Evolution candidates/experiments, fixtures, tasks, workspaces, evaluator/oracle semantics, thresholds, order seed, runtime variables, or privacy rules after any measured-output access.
- Reading prior Prompt-comparison results to select, omit, reorder, retry-substitute, or cherry-pick cases.
- Pooling Codex and Claude, substituting another runtime for Claude, inferring Claude parity from Codex, or treating missing/unknown/unavailable values as zero, pass, tie, or non-regression.
- Reusing a mutable workspace or result root across arms, overwriting a terminal case reference, or transplanting a result from another plan, run, Prompt version, Asset, Portfolio, selection, or Evolution experiment.
- Creating an Evolution recommendation, action proposal, human decision, application receipt, Asset lifecycle transition, Portfolio activation/rollback, production change, external publication, Issue/PR mutation, push, merge, deploy, or release.
- Performing Issue #198 Product Evidence work.

## Expected output

1. One exact plan and materialization identity covering all 56 cases.
2. One immutable resume chain with exactly one terminal reference per case and no omitted, duplicated, substituted, or cherry-picked case.
3. Codex normalized results bound to exact #197 raw-score references and Claude typed-unavailable results.
4. Separate Codex and Claude comparison reports. Never emit a pooled adapter report.
5. One non-authoritative repository Prompt outcome derived by the frozen precedence:
   - incomplete or unavailable required evidence -> `insufficient_evidence`;
   - any quality or guardrail regression -> `revise_and_repeat`;
   - complete non-regressing evidence missing efficiency, duration, or stability targets -> `retain_current`;
   - all rules pass -> `adopt_prompt_v2`.
6. The #278 mapping only: adopt -> `adopt_candidate`, retain -> `retain_current`, revise -> `revise_candidate`, insufficient -> `insufficient_evidence`. Do not create the mapped action object in #235 without separate authority.

With the frozen Claude runtime unavailable, a repository-wide outcome requiring both tracks cannot be affirmative; it remains `insufficient_evidence`. The Codex track must still be reported separately from that repository outcome.

## Verification

Before result access, all commands below must finish successfully at one exact clean head:

```bash
node scripts/test-ask-benchmark-prompt-v2.mjs
node scripts/test-prompt-v2-preregistration-samples.mjs
node scripts/prompt-v2-preregistration-samples.mjs --check
node scripts/test-asset-registry.mjs
node scripts/test-portfolio-manager.mjs
node scripts/test-evolution-loop.mjs
node scripts/test-evolution-loop-integration.mjs
node scripts/test-validate-repo.mjs
node scripts/validate-repo.mjs
node scripts/adapter-runtime-bundle.mjs --check
git diff --check
```

Also verify that the run root is absent, the working tree is clean, source commit A and its tree resolve exactly, every generated binding digest resolves from the checked CAS, Codex runtime/model settings match the freeze, and Claude remains absent for the recorded unavailability reason. After execution, rerun plan/materialization/resume/report validators against the complete exact inventory before interpreting an outcome.

## Stop condition

Stop before the first measured case if any identity, byte digest, object inventory, runtime, source revision/tree, availability status, privacy boundary, output-root absence, or required command differs or lacks a final successful exit. After result access, stop and report `insufficient_evidence` without repair-in-place if any case is missing, duplicated, replaced, cross-run, cross-version, non-pair-identical, privacy-leaking, or bound to a different authority. Any need to mutate the repository, external state, evaluator, protocol, or lifecycle requires a new result-blind preregistration and separate approval.
