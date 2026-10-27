# Ceiling v3 causal — six versioned engineering tasks

This separate source package combines state, compatibility, lifetime and resource contracts across several existing consumers. It does not replace the existing24, ceiling-v1 or ceiling-v2-debt. Task facts are discoverable through each task's contract index, existing public clients and ordinary tests; no private solution, fault ledger or scoring program is part of a model input.

Status: source preparation. Runtime qualification, positive/negative grading validation and difficulty calibration are NOT complete. No model trial is authorized by this package, and no score range or reduction is claimed.

| Task | Public entry |
|---|---|
| CH01 | [durable collaborative edit handoff](tasks/CH01.md) |
| CH02 | [paged durable job recovery](tasks/CH02.md) |
| CH03 | [tenant cutover and record incarnation](tasks/CH03.md) |
| CH04 | [delegated capability lifetime](tasks/CH04.md) |
| CH05 | [receipt-aware bounded stream state](tasks/CH05.md) |
| CH06 | [targeted incremental build generations](tasks/CH06.md) |

Inputs are one task text plus that standalone workspace. An input manifest records every file; protected contract/client/harness/original test files cannot be changed by a submission. Mutable paths are src/**, test/added/** and RESULT.md. No external dependencies or downloads are required. The intended fixed runtime remains Node24.21.0/Linuxarm64 in the separately qualified existing isolated environment (CPU1/512MiB/PID64, no network/host mount); this README does not authorize its execution.

Quality dimensions are behavior30, compatibility/coherence30, failure/liveness25, added-test effectiveness10 and independent scope5. Observable unsafe effects are reported separately. Unknown/setup/transport failures are not converted into semantic detection or a fabricated zero. Alternate valid designs and allowed schedules must be accepted.

The shared data controller and source-isolated scenario observation/replay reuse existing execution assets by explicit path. [Evaluation contract](evaluation-protocol.md) describes what counts as evidence. Preparation and syntax validity do not establish task correctness or difficulty.
