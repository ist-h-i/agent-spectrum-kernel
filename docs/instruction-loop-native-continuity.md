# Native standard-loop continuity

Specification and Formal Verification Contract `native-loop-continuity@1`.
Upstream: the stopped standard-path run and its read-only STOP-HANDOFF on
2026-11-07. Individual candidates and new operational evaluations remain stopped.

Confirmed failure: native host inputs were hash-read with a 16 MiB bound, then
JSON-parsed with the 1 MiB default. A valid pinned 4,624,041-byte template failed
before selection completed. Reuse the already reviewed local fix from commit
`38dd6e55cca6b41509e057e10d18c2ca0ee981a5`: both template and prepared trial
configuration reads use the existing 16 MiB host bound. CAS defaults, digests,
public case identities, process/once-only controls and authority do not change.
Do not copy any stopped candidate or user data into this repository.

Verification: a >1 MiB input reaches the unchanged public-input identity check;
a >16 MiB input and a wrong digest remain refused before native allocation.
The larger prepared-trial read is also changed; actual native model execution
is not tested or authorized by these software checks.

Remaining integration under investigation: package inventory representation versus
exact delivered inventory (path, mode, SHA prefix and existing task wrapper),
fixed partial-credit reference reporting and source/independent evidence, and a
fresh-run recovery path for consumed failed stages. Preserve both original
identities and bytes, fixed weights, unknowns, failures and original attempts.
Do not weaken identity checks, reinterpret partial credit as binary pass/fail,
resume a consumed uncertain stage, inherit old case approval or start an Eval.

Implementation Contract:
- Artifact ID: `native-loop-continuity-implementation@1`.
- Upstream refs: `native-loop-continuity@1`, stopped-run handoff and original fix.
- Actual change boundary: native host read bounds, regression and existing CI owner.
- Verification attempted: retained software fixtures; evidence accompanies delivery.
- Evidence references: original source commit and source-bound test logs.
- Selected proof: Formal `native-loop-continuity@1` above.
- Handoff state: remaining package/report/recovery connections are not yet complete.
