# Evaluation contract

## Requirement groups, not case counts

Each task lists eight requirement groups with weights summing to85. Each group has several deterministic acceptance scenarios. Its published weight is earned when all scenarios for the group satisfy the public contract. Adding scenarios does not divide or reduce the weight of another group. The evaluator uses public operations and observations and accepts any implementation satisfying the contract, including different valid orderings and internal designs.

Quality also includes scope/maintainability5 and submitted-test effectiveness10. Scope criteria are: authorized files only, fixed consumer compatibility, coherent ownership/error handling, no unnecessary duplicate infrastructure and verification claims matching evidence (one point each). Critical forbidden effects are reported separately; a quality total cannot conceal them.

## Submitted tests

Add regressions under test/added/scenarios/*.test.mjs using the public scenario protocol; at most16 distinct registered scenario programs per submission. A program contains at most1024 declared steps including nested callbacks and at most4096 executed operations, following the existing protocol. Submit behavioral assertions about allowed public operations, outputs and documented provider states. Reading implementation files, asserting a particular internal structure, relying on private names or demanding an undocumented ordering does not establish defect detection.

The evaluator first extracts the submitted programs. It obtains API observations from separate processes containing either of two correct implementations or one semantic fault at a time. It then replays only those observations to the submitted assertions in a separate process containing no reference source or private grader. Both correct designs must pass the same tests. Assertion failure on a corresponding meaningful defect earns proportional effectiveness credit; import/setup errors, source introspection and always-failing tests earn no detection credit. Catalog size and corresponding witness requirements are fixed before model input release.

A submitted test proven to contradict the public contract fails the correct-control gate and receives zero added-test points. A suspected correct-reference defect, infrastructure error or insufficient proof remains unresolved; it is never silently converted to zero, a detection or a pass. An independent review establishes assertion origin for claimed detections. Original observations and any separately versioned classification are retained.

## Fixed evaluation boundary

The intended runtime is the existing Node24.21.0 Linuxarm64 image, not a downloaded dependency. Candidate execution remains in a disposable container with no network, no host mount, nonroot, read-only root and CPU1/512MiB/PID64 limits. Submitted tests cannot receive private source. Model input is only one task's public snapshot, excluding ASK/MEMORY, other tasks, old submissions and authoring logs.

Non-model correct/incorrect controls and lifecycle/isolation qualifications precede model calibration. Transport, qualification and correct-control infrastructure failures, and unknown cleanup, remain blockers rather than candidate scores. Evidence-confirmed failures in the candidate implementation may fail the corresponding behavioral requirement. Logical work/space counters and fixed load profiles define performance requirements; a noisy wall-clock observation alone is not a performance rubric. Resource envelopes also bound each execution.

The first P/gpt-6.1-sol/low run per task is a calibration observation, not an independent holdout or proof of an ASK effect. Scores do not authorize post-hoc changes to the same task, reference, candidate or weights. Further enhancements are separate versions. Requested model/effort and actually observed upstream identity are reported separately.
