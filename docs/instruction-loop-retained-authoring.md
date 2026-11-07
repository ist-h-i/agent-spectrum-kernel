# Retained Full authoring recovery

Spec `retained-full-authoring@1` addresses a closed provider answer followed by
trusted source materialization failure. `recover-authoring --root OLD_RUN
--profile OLD_PROFILE --config OLD_CONFIG --output-root FRESH --id NEW_ID`
prepares a fresh Full practical profile/config. It starts no model, Eval or owner
operation. Advance the returned config normally, without a model grant for
retained generation. The exact original answer goes through normal source
validation, Full installers, Registry registration and case selection. The two
human judgments remain fresh. Do not replay the consumed original run.

Admission requires an inline Full practical generation failure before all case
and lifecycle effects, the original pinned profile/runtime and unchanged journal,
and positive local child termination with a successful provider turn. The
complete JSONL must contain exactly one answer matching the retained JSON. New
receipts also bind request digest and answer bytes; legacy input identity is
explicitly reconstructed from the pinned profile/source, not represented as a
captured prompt or model-context attestation. Local evidence does not establish
remote closure. Unknown, failed, truncated or ambiguous responses are refused.

The pinned origin retains prior execution, response, job, journal, profile and
config identities. It never clears the original failure or recounts prior token
usage as a new invocation. A changed authoring request cannot use that answer.
Subsequent cycles restore the original Codex authoring port with a fresh session;
they do not reuse the retained answer. Partial preparation is preserved; a
matching preparation is idempotent before dispatch. Root overlap and symlinks
are refused. Callers must prepare task wrappers for fresh Eval roots; this port
does not rewrite caller executable commands or grant additional filesystem access.
An optional `--replacement-profile` may change only pre-case task command
conditions (for example a host wrapper that supports fresh roots). The source,
authoring input, cases, selection and owner identity remain exact. New command
conditions are bound into the fresh case approval packet.

The trusted source writer's existing `verification-proof-policy-cases.json` is
an explicit derived binding. Only its known path is admitted, committed when
present, and subject to the unchanged writer/validator mode and path guards.
Older sources without that optional derived file remain supported.

Formal Verification Contract R01..R07:

- R01: reproduce the legitimate derived-path failure, then commit that binding
  while rejecting executable/untracked/mode mutations and retaining legacy sources.
- R02: accept only positive closed, exact request/answer evidence; fail before
  allocation on closure/input/profile/runtime/journal/response mismatch.
- R03: preserve consumed state and every original artifact; no model dispatch or
  duplicate usage; distinct paths and no carried approval.
- R04: preserve partial preparations; compare expected outputs on idempotent calls.
- R05: normal source/install/Registry/case lifecycle consumes the retained answer;
  both human judgments remain necessary before their dependent operations.
- R06: restore a fresh automatic authoring session for the next cycle.
- R07: legacy fixture and closed model-free native preparation paths retain their
  original behavior and limits.

Implementation Contract:

- Artifact: `retained-full-authoring-implementation@1`.
- Upstream: requested resumable standard improvement loop; ADR-0019; R01..R07.
- Boundary: Full source derived binding, positive retained-response admission,
  fresh preparation CLI, normal provider consumption, next-cycle provider and pins.
- Verification: synthetic closure/tamper/overlap/idempotence/two-gate/next-cycle
  tests; Full source validation; practical/native/component compatibility;
  unchanged repository validator; independent review before publication/merge.
- Evidence: actual logs and immutable delivery commit in the handoff.
- Proof: Formal R01..R07; software tests imply no improvement effectiveness.
- Handoff: actual retained candidate preparation and static checks only; new Eval
  cases and actual target application still require the user's separate judgments.
