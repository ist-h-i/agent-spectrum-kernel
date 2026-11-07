# Prepare a fresh run after a closed pre-evaluation failure

Specification and Formal Verification Contract `failed-loop-preparation@1`.
Do not relax completed-only `next` and do not replay a consumed uncertain stage.
The new `recover-preparation` CLI prepares a new configuration/run, preserving the
original failed journal, candidate, files and result. It performs no generation,
trial, grading, adoption, cleanup or model call.

Require an exact original profile/config/journal match, a pre-case pending
`generate`, `register` or `select` job, no trials/approval/owner effects, and an
original shipped command that declares no model calls. A positive job-bound failed
result plus closed local transport (integer exit code, no signal) is mandatory.
Unknown model work, missing closure, active journal locks and owner/after-case
operations remain inspection-only. This intentionally narrow path resolves the
observed failed native selection; practical individual-trial recovery remains in
its existing runner. No claim of automatic partial-owner repair is introduced.

The host AI may supply a corrected replacement profile. It must keep the same
protected/store root, normal target and baseline/source identity; only fresh
worker destinations are allocated. New paths cannot overlap prior source/run,
Registry or owner paths. An immutable receipt makes successful preparation
idempotent; incomplete preparation is preserved without overwrite or execution.
The new feedback retains a bounded failure summary and original evidence digests,
never completion/quality claims or inherited approval. Both normal human gates
remain. The host AI owns routine correction and preparation, not the human.

R-01: an exact closed model-free pre-case failure prepares fresh paths and returns
to a fresh case gate under software fixtures; original bytes/journal unchanged.
R-02: no retry/approval reuse; model work, missing closure, different baseline,
active lock, overlapping paths and different original identities refuse.
R-03: repeated successful preparation returns its exact receipt; partial outputs
are not overwritten, and original failed state never becomes completed.

Implementation Contract:
- Artifact ID: `failed-loop-preparation-implementation@1`.
- Upstream refs: stopped standard-path handoff, `native-loop-continuity@1`.
- Actual change boundary: read-only failed-history admission, fresh configuration,
  bounded feedback and existing CLI; original journals remain untouched.
- Verification attempted / evidence: source-bound software results accompany delivery.
- Selected proof: Formal `failed-loop-preparation@1` above.
- Handoff state: implementation in progress; no real failed run is resumed.

A separate [retained Full authoring recovery](instruction-loop-retained-authoring.md)
port handles positive closed inline authoring followed by materialization failure,
without weakening this model-free native admission or replaying its model.
