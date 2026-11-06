# Ceiling V4 continuity pilot — two versioned tasks

This separate package preserves the existing24 and ceiling-v1/v2/v3. It focuses on continuity across live legacy consumers, persistent wire records, service replacement and independently committed effects. It is an authored source package: runtime validation and model difficulty are **not yet verified**.

| Task | Entry | Primary axis |
|---|---|---|
| CH01 | [ledger format migration](workspaces/ch01-ledger-format-migration/task.md) | legacy/current compatibility during durable migration |
| CH02 | [reservation/delivery recovery](workspaces/ch02-reservation-delivery-recovery/task.md) | consistency across independent effects and interrupted recovery |

Each standalone input contains only its task, public contracts, initial source, fixed consumers/providers and ordinary tests. No private reference, grading scenarios, defect ledger, earlier solution or authoring log belongs in a model input. Mutable paths are src/**, test/added/** and RESULT.md; all other paths are protected. No network or package installation is required. The candidate may replace its source structure while preserving every fixed consumer and observable contract; matching an author's design is not required.

[evaluation-protocol.md](evaluation-protocol.md) defines the requirement-group scoring and submitted-test boundary. Source preparation, case counts and static review do not establish difficulty or readiness. A separate execution authorization and source-bound non-model validation are required before any model calibration. No target score is an acceptance cap or scoring adjustment.
