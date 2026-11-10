# Specification index

The index links to contracts; it is not a duplicate specification. IDs stay stable across test/file renames.

| ID | Authoritative rule | Current paths to inspect | Existing validation entry |
|---|---|---|---|
| RC-OWN-01 | contracts.md §1 | portal access, artifacts, jobs; core workspace-store | portal test scoped access |
| RC-APR-02 | contracts.md §2 | portal app/jobs; core fix-flow | portal test publish guards |
| RC-CON-03 | contracts.md §3 | portal store/jobs/provider | portal test revisions |
| RC-REC-04 | contracts.md §4 | jobs/provider/state/history | portal smoke is not restart proof |
| RC-LEG-05 | contracts.md §5 | core normalize/fix-flow/cycles; portal workflow | legacy core suite + portal workflow |
| RC-ASY-06 | contracts.md §6 | browser app; portal reviews/artifacts | interactive checks required |
| RC-UI-07 | contracts.md §7 | portal public and API | browser evidence required for interaction claims |
| RC-ARC-08 | contracts.md §8; ADR-007 | all boundary adapters | source review and compatibility probes |
| RC-PER-09 | contracts.md §9; release.md | portal queries/export/queue | local work-count checks; production measurements absent |

The source list is a starting point, not an exhaustive test selection. Follow callers and actual paths when this index is incomplete. An empty validation entry means no evidence is supplied, not that behavior is correct or incorrect.
