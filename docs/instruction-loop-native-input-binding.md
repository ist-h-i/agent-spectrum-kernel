# Bind public packages to native delivered inputs

Specification and Formal Verification Contract `native-input-binding@1`.
The stopped standard-path selection compared a package inventory's identity to a
native delivery inventory with a different path/mode/SHA representation and an
existing task wrapper. Preserve both identities instead of disabling comparison.

A native profile may pin `publicInputBindings: {path,digest}`. The JSON artifact
has kind `native_public_input_bindings_v1` and `cases`, each with `case_id`,
`package_inventory`, `source_root`, `path_prefix` (empty or `workspace/`), and
`extra_files` (optional existing `task.md` source/digest only). The package
inventory's canonical digest must equal the controller catalog identity. Every
package file must match the exact template delivery bytes and size after the
explicit prefix/SHA normalization. Existing mode differences are retained and
reported. No arbitrary file insertion or problem/wrapper regeneration is allowed.

Every template row for a case must agree. Source files are stable regular files;
source paths, bytes, digests and delivery modes are verified before preparation,
then rechecked during copying. The preparation request carries the resolved
source pins. The existing native preparer copies only those declared public files
into fresh workspaces. A partial template snapshot therefore no longer requires a
consumer-specific copying script. Private grading inputs are never discovered or
copied automatically. Existing profiles without this additive input keep strict
identity behavior. The human case packet contains both identities and the mapping;
there is no model execution or approval reuse during binding/preparation.

Proof B-01: preserve exact normal and prefixed package bytes, including an existing
pinned task wrapper; report mode changes and both identities.
Proof B-02: reject changed bytes/digests/size, incomplete/duplicate mappings,
traversal/symlink sources and inconsistent template rows before native allocation.
Proof B-03: use the resolved source pins in native preparation; legacy direct
inventory identity and both human decisions remain in force.

Implementation Contract:
- Artifact ID: `native-input-binding-implementation@1`.
- Upstream refs: stopped-run handoff, `native-loop-continuity@1`.
- Actual change boundary: package/delivery binding, native selection/preparation,
  existing source pins and fixture checks.
- Verification attempted / evidence: source-bound software results accompany delivery.
- Selected proof: Formal `native-input-binding@1` above.
- Handoff state: local software fixtures and independent review passed; publication and actual receiving/model use remain pending.
