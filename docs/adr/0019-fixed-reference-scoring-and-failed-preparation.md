# ADR-0019: Retain fixed source scores and recover closed preparation separately

- Status: Proposed
- Date: 2026-11-07
- Upstream: ADR-0016, ADR-0017, stopped standard-path handoff
- Contracts: fixed-reference-scoring@1, failed-loop-preparation@1
- Supersedes: None

Binary reference reporting cannot represent the existing fixed calculator's
partial credit, exact ranges or mandatory/critical uncertainty. Keep a separate
source-reference lane. Verify its retained source subset, packet, assessment,
fixed calculator/dependencies and independent-review hashes; rerun only the
trusted calculator. No candidate code, private rubric copying, formal admission,
evidence-truth or runtime-acceptance claim follows. Optional invalid judgments
remain recorded Unknown without deleting usable execution evidence.

Routine configured grading reuses the durable request/result/inspect transport.
A declared model port needs the existing grant and positive reported provider
closure. A local worker exit never proves unknown provider work ended.

A consumed failed selection must not be replayed or treated as a completed cycle.
A separate preparation port admits only positive closed model-free native
pre-case failures, preserves the original state and creates fresh pinned paths
and new human gates. Unknown model/owner effects remain outside this port.

Rejected alternatives: binary conversion of partial points, trusting only a
calculator's candidate-digest syntax, new-grader authority, strict loss of every
report on optional measurement failure, and clearing consumed markers for retry.
Review before changing source selection, accepting runtime truth, owner repair,
model closure inference or expanding failed-preparation admission. No new
Registry, dependency, approval type or automatic transport is introduced.
