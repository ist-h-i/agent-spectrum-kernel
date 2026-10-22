# CI suite inventory — Issue #433 first slice

Source baseline: `a6d71c6c81973f585fe1aa27e4524a5a62889846`.
The command inventory also includes the additive PR #427 registrations from
`2e19d583f885e1eedfab7429c0314dfd9a502414`: V10 schema, runtime binding,
runtime lineage, and the V2 build archive. Its `source_head` identifies that
134-command input; local-eval commands and the strict aggregate are preserved.
This table records proposed command ownership, including unchanged workflows.
Manual model workflows remain manual; presence is not execution authorization.
Fake/synthetic checks are infrastructure evidence, not real LLM quality.

## Dependencies and OS boundaries

Validate repository uses independent full-history checkouts for
independent-local-clone, common, repository-tests and personal-cli, with Node
24.19.0 and Ubuntu 24.04. The moved suites create temporary fixture roots and
consume no common-job outputs. Source fetches, generated-consistency diagnostics
and frozen wrappers retain their ordering in common. Fixed validate always
evaluates all four predecessors and accepts only exact success from each.

Both local-eval matrix entries retain host preflight, synthetic process lifecycle,
timeouts, path/permission checks, historical-root isolation, immutable Full/Core
preparation, receiver, native boundaries, controller attribution and capture
producer checks. All Mac test-file invocations remain. Eleven current-HEAD
Ubuntu invocations are instead owned by common/personal-cli: authority-v2,
build-successor-v2, review-archive-v2-scope, unsafe-actions-v8, personal CLI,
catalog24, catalog24-v8, unattended-policy, unattended, source-reviewer and
synthetic-json-pilot. Flags match. Synthetic JSON is split from its former Mac
multi-file invocation; per-file coverage is preserved. Historical working-directory
suites are never equated to current HEAD.

Context-rollover and verification-completion remain unchanged. Their floating
Node 24 and Ubuntu latest are not treated as equivalent to pinned Node/OS;
apparent duplicates remain for a later slice. No path filters, model triggers,
concurrency cancellation, protection or permissions changes are introduced.

## Command inventory

Exact original commands for changed workflows are preserved in
[ci-full-run-inventory.json](fixtures/ci-full-run-inventory.json). The focused
regression checks validate commands and local-eval per-file flags/coverage.
Shell setup, public source fetches and working-directory prerequisites remain
authoritative in the workflow files. Manual workflows in this table are unchanged.

| Workflow / job | Suite | Command |
| --- | --- | --- |
| `context-rollover.yml` / `context-rollover` | Test runtime boundary and matched evaluation | `node --test scripts/test-context-rollover.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve checkpoint and admission authority | `node scripts/test-session-checkpoint.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve checkpoint and admission authority | `node scripts/test-epic-admission-work-package-plan.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve evidence and current coverage boundaries | `node scripts/test-verification-evidence.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve evidence and current coverage boundaries | `node scripts/test-verification-scoped-reuse.mjs` |
| `context-rollover.yml` / `context-rollover` | Preserve evidence and current coverage boundaries | `node --test scripts/test-verification-reuse-completion.mjs` |
| `context-rollover.yml` / `context-rollover` | Validate schemas and repository | `node scripts/test-json-schema-validation.mjs` |
| `context-rollover.yml` / `context-rollover` | Validate schemas and repository | `node scripts/validate-repo.mjs` |
| `issue291-measured.yml` / `verify` | Validate existing synthetic successor boundaries | `node --test scripts/test-ask-benchmark-prompt-successor.mjs scripts/test-ask-benchmark-prompt-successor-report.mjs scripts/test-ask-benchmark-prompt-successor-input-guards.mjs scripts/test-ask-benchmark-prompt-successor-fake.mjs` |
| `issue291-measured.yml` / `verify` | Verify preparation workflow packaging | `node --test scripts/test-ask-benchmark-prompt-successor-workflow.mjs` |
| `issue291-measured.yml` / `verify` | Verify successor usage and collection control | `node --test scripts/test-ask-benchmark-prompt-successor-usage.mjs scripts/test-ask-benchmark-prompt-successor-control.mjs` |
| `issue291-measured.yml` / `verify` | Verify measured recovery state transitions | `node --test scripts/test-ask-benchmark-prompt-successor-measured-recovery.mjs` |
| `issue291-measured.yml` / `verify` | Verify native successor transport and normalized usage | `node --test scripts/test-ask-benchmark-prompt-successor-execution.mjs` |
| `issue291-measured.yml` / `verify` | Verify native collection and existing scoring boundaries | `node --test scripts/test-ask-benchmark-prompt-successor-scoring.mjs` |
| `local-eval.yml` / `fake` | Observe host prerequisites without Codex or auth | `node scripts/ask-local-eval.mjs preflight` |
| `local-eval.yml` / `fake` | Primary authority profile and static resource boundaries (no workers) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-authority-v2.mjs scripts/test-ask-primary-build-successor-v2.mjs scripts/test-ask-review-archive-v2-scope.mjs scripts/test-ask-primary-unsafe-actions-v8.mjs` |
| `local-eval.yml` / `fake` | Nine-primary-fixture personal roundtrip (fake provider/runner/grading only) | `node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-primary-loop.mjs` |
| `local-eval.yml` / `fake` | Personal user command loop and resume (fake dispatch only) | `node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs scripts/test-ask-personal-evolution-cli-catalog24.mjs scripts/test-ask-personal-evolution-cli-catalog24-v8.mjs scripts/test-ask-personal-evolution-unattended-policy.mjs scripts/test-ask-personal-evolution-unattended.mjs` |
| `local-eval.yml` / `fake` | Personal candidate generation adapter (fake transport only) | `node --test scripts/test-ask-personal-evolution-codex-generation.mjs` |
| `local-eval.yml` / `fake` | Personal source reviewer adapter (fake transport only) | `node --test scripts/test-ask-personal-evolution-source-reviewer.mjs` |
| `local-eval.yml` / `fake` | Fake lifecycle and failure regressions (no model calls) | `node --test scripts/test-ask-local-eval.mjs scripts/test-ask-local-codex.mjs scripts/test-ask-local-codex-time-budget.mjs` |
| `local-eval.yml` / `fake` | Synthetic JSON pilot (Ubuntu covered by Validate repository) | `node --test scripts/test-ask-synthetic-json-pilot.mjs` |
| `local-eval.yml` / `fake` | User repository comparison preparation and execution (fake runner only) | `node --test scripts/test-kernel-principles.mjs scripts/test-ask-user-comparison-prepare.mjs scripts/test-ask-user-comparison.mjs scripts/test-ask-user-comparison-logs.mjs scripts/test-ask-user-comparison-unattended.mjs scripts/test-codex-output-observer.mjs` |
| `local-eval.yml` / `fake` | Single-shot lifecycle regressions (entirely fake I/O) | `node --test scripts/test-ask-user-comparison-single-shot.mjs` |
| `local-eval.yml` / `fake` | Historical context isolation boundaries (current HEAD) | `node --test scripts/test-historical-full-test-root.mjs` |
| `local-eval.yml` / `fake` | Prepare isolated immutable Full test context | `node scripts/prepare-historical-full-test-root.mjs "$RUNNER_TEMP/ask-historical-full" > "$RUNNER_TEMP/ask-historical-path"` |
| `local-eval.yml` / `fake` | Full reference closure and three-arm synthetic protocol (no Codex) | `node --test scripts/test-ask-local-full-package.mjs scripts/test-ask-local-three-arm.mjs scripts/test-ask-local-three-arm-qualification.mjs` |
| `local-eval.yml` / `fake` | Opt-in shared core, Full projections and offline comparison (no Codex) | `node scripts/generate-ask-core-bundle.mjs --check` |
| `local-eval.yml` / `fake` | Opt-in shared core, Full projections and offline comparison (no Codex) | `node --test scripts/test-ask-core-bundle.mjs` |
| `local-eval.yml` / `fake` | Mac native adapter proposal and task prequalification (synthetic only) | `node --test scripts/test-ask-core-native-preparation.mjs` |
| `local-eval.yml` / `fake` | Fixed synthetic process receiver and protected offline results (no native CLI) | `node --test scripts/test-ask-core-native-receiver.mjs` |
| `local-eval.yml` / `fake` | Exact authority lifecycle, new-session adapter and scratch integration (synthetic only) | `node --test scripts/test-ask-core-native-boundaries.mjs scripts/test-ask-core-native-connection.mjs` |
| `local-eval.yml` / `fake` | Core condition grading authority and scored offline replay (synthetic only) | `node scripts/generate-ask-core-grading-schemas.mjs --check` |
| `local-eval.yml` / `fake` | Core condition grading authority and scored offline replay (synthetic only) | `node scripts/test-ask-benchmark-portfolio-score.mjs --core-grading-only` |
| `local-eval.yml` / `fake` | Native compatibility record bindings without controller trust (synthetic only) | `node --test scripts/test-ask-core-native-compatibility-provenance.mjs` |
| `local-eval.yml` / `fake` | Owner-attributed controller context boundaries (synthetic only) | `node --test scripts/test-ask-core-controller-attribution.mjs scripts/test-ask-core-evaluator-dependency-closure.mjs` |
| `local-eval.yml` / `fake` | Saved capture to original normalizer and terminal scoring inputs (synthetic only) | `node --test scripts/test-ask-core-capture-producer.mjs` |
| `validate-calibration-input-package.yml` / `validate` | Check syntax and public input package boundaries | `node --check scripts/ask-benchmark-calibration-input-package.mjs` |
| `validate-calibration-input-package.yml` / `validate` | Check syntax and public input package boundaries | `node --test scripts/test-ask-benchmark-calibration-input-package.mjs` |
| `validate.yml` / `common` | Verify CI coverage preservation and strict aggregate | `node --test scripts/test-ci-full-run.mjs` |
| `validate.yml` / `common` | Run ASK setup planning and exact apply tests | `node scripts/test-ask-setup.mjs` |
| `validate.yml` / `common` | Run model-free install and recovery release smoke | `node scripts/test-release-install-recovery.mjs` |
| `validate.yml` / `common` | Run public first-workflow preparation regressions | `node --test scripts/test-first-workflow-preparation.mjs` |
| `validate.yml` / `common` | Run offline pragmatic evaluation report regressions | `node --test scripts/test-ask-pragmatic-evaluation-report.mjs` |
| `validate.yml` / `common` | Verify prospective performance probe (synthetic controls only) | `node --test scripts/test-ask-benchmark-pf-performance-probe.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-execution-input.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-public-runtime-v2.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-protocol-catalog-probe.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-stderr-diagnostics.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-sqlite-startup-diagnostics-v3.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --test scripts/test-ask-primary-scoring-version.mjs scripts/test-ask-primary-processing-source.mjs scripts/test-ask-primary-resource-authority-writers.mjs scripts/test-ask-primary-runner-async-local-storage.mjs scripts/test-ask-primary-evaluation-private-grading.mjs scripts/test-ask-primary-evaluation-grading.mjs scripts/test-ask-benchmark-frozen-authority-modes.mjs` |
| `validate.yml` / `common` | Verify explicit primary scoring-version connection (model-free) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-saved-scoring.mjs` |
| `validate.yml` / `common` | Qualify prospective rule-batch contract and frozen preparation (model-free) | `node --test scripts/test-rule-batch-contract-v2.mjs scripts/test-rule-batch-comparison-preparation.mjs` |
| `validate.yml` / `common` | Run UI harness and Skill-reference regressions | `node --test scripts/test-codex-skill-reference-preflight.mjs scripts/test-skill-assets.mjs scripts/test-skill-reference-canonical.mjs scripts/test-ui-ux-adapter-assets.mjs docs/fixtures/ui-ux-design/fixture-state.test.mjs scripts/test-prompt-v2-historical-renderer.mjs` |
| `validate.yml` / `common` | Run dependency-free scenario visual review regressions | `node --test scripts/test-scenario-visual-review.mjs` |
| `validate.yml` / `common` | Check adapter runtime bundle freshness | `node scripts/adapter-runtime-bundle.mjs > "$RUNNER_TEMP/ask-expected-runtime-bundle.json"` |
| `validate.yml` / `common` | Verify bounded full-target streaming snapshots (artificial only) | `node --test scripts/test-target-snapshot-streaming.mjs` |
| `validate.yml` / `common` | Rehearse parent rollback and return to pre-install absence (artificial only) | `node --test scripts/test-personal-prompt-preinstall-return.mjs` |
| `validate.yml` / `common` | Run synthetic JSON pilot fake-only regressions | `node --test scripts/test-ask-synthetic-json-pilot.mjs` |
| `validate.yml` / `common` | Run portfolio aggregate v2 component sensitivity tests | `node scripts/test-ask-benchmark-portfolio-aggregate-result-v2.mjs` |
| `validate.yml` / `common` | Run portfolio consumer sensitivity detail tests | `node scripts/test-ask-benchmark-portfolio-consumer-report.mjs` |
| `validate.yml` / `common` | Run nondegenerate high-impact sensitivity and exact Evolution tests | `node scripts/test-ask-benchmark-portfolio-high-impact-sensitivity.mjs` |
| `validate.yml` / `common` | Run nondegenerate high-impact sensitivity and exact Evolution tests | `node scripts/test-evolution-loop-integration.mjs --high-impact-population` |
| `validate.yml` / `common` | Run successor snapshot and source-session regressions (current HEAD) | `node --test scripts/test-ask-benchmark-source-session.mjs scripts/test-successor-process-state.test.mjs scripts/test-frozen-evaluator-fixture.test.mjs` |
| `validate.yml` / `common` | Run successor snapshot and source-session regressions (current HEAD) | `node --test scripts/test-ask-benchmark-calibration-source.mjs scripts/test-ask-benchmark-prompt-successor.mjs scripts/test-ask-benchmark-prompt-successor-delivery.mjs scripts/test-ask-benchmark-prompt-successor-native.mjs scripts/test-ask-benchmark-prompt-successor-report.mjs scripts/test-ask-benchmark-prompt-successor-scoring-inputs.mjs` |
| `validate.yml` / `common` | Run successor snapshot and source-session regressions (current HEAD) | `node --test scripts/test-ask-benchmark-prompt-successor-integration.mjs scripts/test-ask-benchmark-successor-input-snapshot.mjs scripts/test-ask-benchmark-evaluator-root-manifest.mjs` |
| `validate.yml` / `common` | Run bounded successor scoring authority regressions (current HEAD) | `node --test scripts/test-ask-benchmark-prompt-successor-input-guards.mjs` |
| `validate.yml` / `common` | Run bounded successor scoring authority regressions (current HEAD) | `node --test scripts/test-ask-benchmark-prompt-successor-scoring-contract.mjs` |
| `validate.yml` / `common` | Run session checkpoint and resume tests | `node scripts/test-session-checkpoint.mjs` |
| `validate.yml` / `common` | Validate repository consistency | `node scripts/validate-repo.mjs` |
| `validate.yml` / `common` | Show generated validation report diff on failure | `node scripts/validate-repo.mjs --write-report` |
| `validate.yml` / `common` | Run baseline semantic review route contract tests | `node scripts/test-review-route.mjs` |
| `validate.yml` / `common` | Run Execution Envelope record contract tests | `node scripts/test-execution-envelope-record.mjs` |
| `validate.yml` / `common` | Run installed Codex runner Execution Envelope conformance tests | `node scripts/test-codex-runner-execution-envelope-conformance.mjs` |
| `validate.yml` / `common` | Run managed JSON Schema validation tests | `node scripts/test-json-schema-validation.mjs` |
| `validate.yml` / `common` | Run exact Codex risk approval tests | `node scripts/test-codex-risk-approval.mjs` |
| `validate.yml` / `common` | Run review decision matrix tests | `node scripts/test-review-decision-matrix.mjs` |
| `validate.yml` / `common` | Run claim evidence status contract tests | `node scripts/test-claim-evidence-status.mjs` |
| `validate.yml` / `common` | Run one-task Skill effectiveness outcome contract tests | `node scripts/test-skill-effectiveness-outcome.mjs` |
| `validate.yml` / `common` | Run verification proof policy contract tests | `node scripts/test-verification-proof-policy.mjs` |
| `validate.yml` / `common` | Run autonomous development control tests | `node scripts/test-ask-autonomous-development.mjs` |
| `validate.yml` / `common` | Run epic admission and Work Package Plan contract tests | `node scripts/test-epic-admission-work-package-plan.mjs` |
| `validate.yml` / `common` | Run generic content-addressed store tests | `node scripts/test-content-addressed-store.mjs` |
| `validate.yml` / `common` | Run Asset Registry contract tests | `node scripts/test-asset-registry.mjs` |
| `validate.yml` / `common` | Check the exact candidate-only Asset Registry sample | `node scripts/asset-registry-samples.mjs --check` |
| `validate.yml` / `common` | Run evidence-conditioned Portfolio Manager contract tests | `node scripts/test-portfolio-manager.mjs` |
| `validate.yml` / `common` | Run evidence-conditioned Portfolio Manager contract tests | `node --test scripts/test-portfolio-subscription-policy.mjs` |
| `validate.yml` / `common` | Check the exact Portfolio Manager sample | `node scripts/portfolio-manager-samples.mjs --check` |
| `validate.yml` / `common` | Run governed Evolution contract tests | `node scripts/test-evolution-loop.mjs` |
| `validate.yml` / `common` | Run governed Evolution full-closure integration tests | `node scripts/test-evolution-loop-integration.mjs` |
| `validate.yml` / `common` | Verify opt-in Prompt repetition recommendation bridge (artificial only) | `node --experimental-test-module-mocks --test scripts/test-personal-prompt-repetition-statistics.mjs scripts/test-personal-prompt-repetition-evaluation.mjs scripts/test-personal-prompt-repetition-driver.mjs` |
| `validate.yml` / `common` | Run personal observation and generated candidate contracts (model-free) | `node --test scripts/test-ask-personal-evolution-observation.mjs scripts/test-ask-personal-evolution.mjs scripts/test-ask-personal-evolution-generation.mjs scripts/test-ask-personal-evolution-generation-connector.mjs scripts/test-ask-personal-evolution-saved-results-mode.mjs scripts/test-ask-personal-evolution-primary-pair.mjs scripts/test-ask-personal-source-install.mjs scripts/test-ask-personal-prompt-runtime-v2.mjs scripts/test-personal-prompt-target-application.mjs scripts/test-personal-prompt-codex-handover.mjs scripts/test-personal-prompt-owner-manual-recovery.mjs scripts/test-codex-installer-preflight-order.mjs` |
| `validate.yml` / `common` | Verify real personal source reviewer contract (fake transport only) | `node --test scripts/test-ask-personal-evolution-source-reviewer.mjs` |
| `validate.yml` / `common` | Check the exact governed Evolution sample | `node scripts/evolution-loop-samples.mjs --check` |
| `validate.yml` / `common` | Run portfolio catalog tests | `node scripts/test-ask-benchmark-portfolio-catalog.mjs` |
| `validate.yml` / `common` | Run portfolio policy tests | `node scripts/test-ask-benchmark-portfolio-policy.mjs` |
| `validate.yml` / `common` | Run prospective task evidence partial readout tests (model-free) | `node --test scripts/test-ask-task-evidence-profile.mjs` |
| `validate.yml` / `common` | Run prospective task evidence partial readout tests (model-free) | `node scripts/test-ask-benchmark-portfolio-result-set.mjs --task-evidence-readout-only` |
| `validate.yml` / `common` | Run portfolio design pre-admission tests | `node scripts/test-ask-benchmark-design-admission.mjs` |
| `validate.yml` / `common` | Run portfolio independent design review tests | `node scripts/test-ask-benchmark-design-review.mjs` |
| `validate.yml` / `common` | Run portfolio admission decision overlay tests | `node scripts/test-ask-benchmark-admission-decision.mjs` |
| `validate.yml` / `common` | Guard admitted fixture invariance | `node scripts/test-ask-benchmark-admitted-fixture-invariance.mjs` |
| `validate.yml` / `common` | Run general benchmark tests | `node scripts/test-ask-benchmark.mjs` |
| `validate.yml` / `common` | Run adaptive portfolio execution tests | `node scripts/test-ask-benchmark-execution.mjs` |
| `validate.yml` / `common` | Run admitted portfolio propagation preparation tests | `node scripts/test-ask-benchmark-admission-propagation.mjs` |
| `validate.yml` / `common` | Run verification command evidence contract tests | `node scripts/test-ask-benchmark-command-evidence.mjs` |
| `validate.yml` / `common` | Verify read-only saved primary command capture | `node --test scripts/test-ask-primary-saved-command-capture.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v2 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v3 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v4 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v5 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --command-evidence-v6 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --evaluation-v7 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --evaluation-v8 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-unsafe-actions-v8.mjs scripts/test-ask-primary-v8-resource-closure.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-classification-v7.mjs scripts/test-ask-primary-runtime-shell-v7.mjs scripts/test-ask-primary-evaluation-correctness-v7.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-registered-fixture-v7.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --experimental-test-module-mocks --test scripts/test-ask-primary-authority-v2.mjs scripts/test-ask-primary-build-successor-v2.mjs scripts/test-ask-review-archive-v2-scope.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-evidence-v3.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-evidence-v4.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-discovery-grammar-v9.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node scripts/generate-ask-primary-grading-schemas.mjs --evaluation-v9 --check` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-evidence-v9.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-command-literal-word-v5.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-auxiliary-shell-v6.mjs` |
| `validate.yml` / `common` | Verify prospective primary evidence and public review recognition (artificial inputs only) | `node --test scripts/test-ask-primary-evidence-recognition-v2.mjs scripts/test-ask-review-target-requirement-v2.mjs` |
| `validate.yml` / `common` | Verify literal body and review target diagnostics (no execution) | `node --test scripts/test-ask-saved-command-body-observation.mjs scripts/test-ask-review-target-requirement.mjs` |
| `validate.yml` / `common` | Verify bounded private runtime observation transport | `node --test scripts/test-ask-benchmark-runtime-observation.mjs` |
| `validate.yml` / `common` | Run verification evidence exact-reuse tests | `node scripts/test-verification-evidence.mjs` |
| `validate.yml` / `common` | Run verification scoped reuse and coverage tests | `node scripts/test-verification-scoped-reuse.mjs` |
| `validate.yml` / `common` | Run adaptive portfolio normalized result tests | `node scripts/test-ask-benchmark-normalized-results.mjs` |
| `validate.yml` / `common` | Run terminal inventory protocol ordering regressions | `node --test scripts/test-ask-benchmark-terminal-inventory-order.mjs` |
| `validate.yml` / `common` | Run evaluator isolation boundary tests | `node scripts/test-ask-benchmark-evaluator-boundary.mjs` |
| `validate.yml` / `common` | Run build-option fixture contract tests | `node scripts/test-ask-benchmark-mn-build-option-update.mjs` |
| `validate.yml` / `common` | Run schema-field public source tests (current HEAD) | `node --test scripts/test-ask-benchmark-mn-schema-field-source.mjs` |
| `validate.yml` / `common` | Run frontend-default public source tests (current HEAD) | `node --test scripts/test-ask-benchmark-mn-frontend-default-source.mjs` |
| `validate.yml` / `common` | Run practice-frequency public source tests (current HEAD) | `node --test scripts/test-ask-benchmark-pf-api-pagination-source.mjs scripts/test-ask-benchmark-pf-frontend-async-source.mjs scripts/test-ask-benchmark-pf-ci-cache-source.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node --test scripts/test-ask-benchmark-prepare-capability.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-pf-api-pagination.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-pf-frontend-async.mjs` |
| `validate.yml` / `common` | Run practice-frequency fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-pf-ci-cache.mjs` |
| `validate.yml` / `common` | Run schema-field fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-schema-field-alignment.mjs` |
| `validate.yml` / `common` | Run frontend-default fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-frontend-default-fix.mjs` |
| `validate.yml` / `common` | Run documentation/config fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-doc-config-correction.mjs` |
| `validate.yml` / `common` | Run focused regression fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mn-focused-regression-test.mjs` |
| `validate.yml` / `common` | Run CI-evidence review fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-ci-evidence-gap.mjs` |
| `validate.yml` / `common` | Run accessibility interaction review fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-accessibility-interaction-review.mjs` |
| `validate.yml` / `common` | Run data migration handoff fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-data-migration-handoff.mjs` |
| `validate.yml` / `common` | Run frontend state review fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-frontend-state-review.mjs` |
| `validate.yml` / `common` | Run IaC rollback design fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-iac-rollback-design.mjs` |
| `validate.yml` / `common` | Run performance investigation fixture source-freeze tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-performance-investigation.mjs` |
| `validate.yml` / `common` | Run CI-evidence review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-ci-evidence-gap-review-archive.mjs` |
| `validate.yml` / `common` | Run accessibility interaction review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-accessibility-interaction-review-review-archive.mjs` |
| `validate.yml` / `common` | Run data migration handoff review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-data-migration-handoff-review-archive.mjs` |
| `validate.yml` / `common` | Run frontend state review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-frontend-state-review-archive.mjs` |
| `validate.yml` / `common` | Run IaC rollback design review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-iac-rollback-design-review-archive.mjs` |
| `validate.yml` / `common` | Run performance investigation review archive contract tests | `node scripts/test-frozen-evaluator-fixture.mjs test-ask-benchmark-mp-performance-investigation-review-archive.mjs` |
| `validate.yml` / `common` | Run evaluator-authority integration contract tests | `node scripts/test-ask-benchmark-portfolio-evaluator-result.mjs` |
| `validate.yml` / `common` | Run portfolio raw engineering result score tests | `node scripts/test-ask-benchmark-portfolio-score.mjs` |
| `validate.yml` / `common` | Run portfolio engineering result-set tests | `node scripts/test-ask-benchmark-portfolio-result-set.mjs` |
| `validate.yml` / `common` | Run portfolio repetition report tests | `node scripts/test-ask-benchmark-portfolio-repetition-report.mjs` |
| `validate.yml` / `common` | Run portfolio paired comparison report tests | `node scripts/test-ask-benchmark-portfolio-paired-comparison-report.mjs` |
| `validate.yml` / `common` | Run portfolio aggregate result tests | `node scripts/test-ask-benchmark-portfolio-aggregate-result.mjs` |
| `validate.yml` / `common` | Run portfolio directional outcome report tests | `node scripts/test-ask-benchmark-portfolio-directional-outcome-report.mjs` |
| `validate.yml` / `common` | Run portfolio mechanism observation scorecard tests | `node scripts/test-ask-benchmark-portfolio-mechanism-scorecard.mjs` |
| `validate.yml` / `common` | Run legacy calibration migration tests | `node scripts/test-ask-benchmark-portfolio-legacy-calibration-migration.mjs` |
| `validate.yml` / `common` | Run Prompt v2 preregistration contract tests | `node scripts/test-ask-benchmark-prompt-v2.mjs` |
| `validate.yml` / `common` | Run Prompt v2 preregistration authority fixture tests | `node scripts/test-prompt-v2-preregistration-samples.mjs` |
| `validate.yml` / `common` | Check Prompt v2 preregistration authority fixture freshness | `node scripts/prompt-v2-preregistration-samples.mjs --check` |
| `validate.yml` / `repository-tests` | Run repository validation tests | `node scripts/test-validate-repo.mjs` |
| `validate.yml` / `personal-cli` | Verify personal CLI and unstarted preparation recovery (model-free) | `node --experimental-test-module-mocks --test scripts/test-ask-personal-evolution-cli.mjs scripts/test-ask-personal-evolution-cli-catalog24.mjs scripts/test-ask-personal-evolution-cli-catalog24-v8.mjs scripts/test-ask-personal-evolution-cli-recovery.mjs scripts/test-ask-personal-evolution-unattended-policy.mjs scripts/test-ask-personal-evolution-unattended.mjs scripts/test-ask-personal-evolution-rejection.mjs` |
| `verification-completion.yml` / `verification-completion` | Validate repository consistency before fixture suites | `node scripts/validate-repo.mjs --write-report` |
| `verification-completion.yml` / `verification-completion` | Run runtime measurement and provider boundary tests | `node --test scripts/test-verification-reuse-measurement-core.mjs scripts/test-verification-reuse-false-blocking.mjs` |
| `verification-completion.yml` / `verification-completion` | Run paired measurement and handoff integration tests | `node --test scripts/test-verification-reuse-measurement.mjs` |
| `verification-completion.yml` / `verification-completion` | Measure public fixture without model credentials | `node scripts/verification-reuse-measurement.mjs --provider fixture --repetitions 2 --output "$RUNNER_TEMP/verification-reuse-measurement" > /dev/null` |
| `verification-completion.yml` / `verification-completion` | Run decision-point protocol and accounting tests | `node --test scripts/test-verification-decision-core.mjs` |
| `verification-completion.yml` / `verification-completion` | Run real-Git multirevision and completion tests | `node --test scripts/test-verification-reuse-completion.mjs` |
| `verification-completion.yml` / `verification-completion` | Preserve exact and scoped evidence compatibility | `node scripts/test-verification-evidence.mjs` |
| `verification-completion.yml` / `verification-completion` | Preserve exact and scoped evidence compatibility | `node scripts/test-verification-scoped-reuse.mjs` |
