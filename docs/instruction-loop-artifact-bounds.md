# Keep supervised metadata within its existing journal bound

Specification and Formal Verification Contract `loop-artifact-bounds@1`.
A valid native template can exceed1MiB; after preparing it, its selected inventory
travels in request/result/sidecar metadata. Hashes and writes already allow16MiB,
but several boundary readers inherited the CAS1MiB default. This is a reproducible
protocol mismatch, not an evaluation-quality failure.

Share the existing16MiB loop metadata ceiling across transport request/result,
configuration/continuation/CLI, native sidecars and worker settings boundaries.
Check oversized transport requests before reserving a worker directory. Include
the reader helper in the relevant runtime source pins. Keep request/result digests,
positive closure, once-only reservation and both human judgments unchanged.

CAS object limits, public task/source bytes, archives, stdout, private grading
inputs and small closed AI-recovery assessment semantics retain their separate
limits. Component authoring's JSON envelope can use the loop reader while its
existing2MiB aggregate Markdown semantic constraint remains in force. Frozen
historical primary policies and live processes are unaffected.

A-01: >1MiB request, result, native profile/sidecar and repeated inspection work
within16MiB without replay or model dispatch.
A-02: >16MiB request refuses before worker reservation; wrong digests still refuse.
A-03: large practical settings/pins and model-free recovery settings are read
consistently; ordinary CLI and continuation retain existing behavior.

Implementation Contract:
- Artifact ID: `loop-artifact-bounds-implementation@1`.
- Upstream refs: native4,624,041-byte template failure and fixed-reference-scoring@1.
- Actual change boundary: loop IPC/settings/config metadata boundary readers and
  existing request writer; shared helper, source pins and CI fixture ownership.
- Verification attempted / evidence: bounded synthetic fixtures; no real Eval.
- Selected proof: Formal `loop-artifact-bounds@1` above.
- Handoff state: software verification in progress; no actual model/owner claim.
