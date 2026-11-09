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


## Repair a grader before the first Eval approval

Use `reconfigure-evaluation --root OLD_RUN --profile OLD_PROFILE --config OLD_CONFIG
--replacement-profile REPAIRED_PROFILE --output-root FRESH --id NEW_ID` only while
the original run is awaiting its first evaluation judgment. It requires no pending
work, trials or case decision and exactly generate/register/select outputs. The
retained positive provider receipt and exact request/response remain authoritative.
Only task command definitions and per-case graders may change; public case files,
criteria references, policy, authoring request, baseline and owner stay fixed.

The CLI prepares files only. Advance the fresh config (or use `operate` with an
explicit cycle budget for standard report-recovery parent binding) to validate,
register and select the retained candidate with zero authoring calls. Review the
exact new case packet before authorizing any Eval. The previous packet does not
approve the repaired runtime, and this port cannot import completed trials.

Caller-owned fixed graders can use `instruction-loop-grade-response.mjs` to
project the full assessment schema to model-owned five-part judgments. A finite
compatibility correction may remove only exactly matching fixed coverage while
retaining raw replies and original/normalized digests. Conflicting coverage or
other metadata remains invalid. This helper neither grades source nor grants
model permission. Keep projected packet/capsule inventories identical for the
existing retained-source binding; never exempt a schema file from that binding.

## Reselect cases without changing the candidate

If a generated candidate reveals that the initial catalog does not test its
main effect, do not approve an unsuitable packet or edit its pinned files.
Before any approval or trial, prepare a separate replacement profile and run:

```text
node scripts/supervised-instruction-loop-cli.mjs reselect-evaluation \
  --root OLD_RUN --profile OLD_PROFILE --config OLD_CONFIG \
  --replacement-profile NEW_CASE_PROFILE --output-root FRESH_ROOT --id NEW_ID
```

The replacement can change the catalog, selection and case inputs/criteria,
plus task commands and graders. Baseline, authoring goal/input, owner, repetition
count and trial budget must stay fixed. No generation model or Eval is run by
this command. Advance the fresh configuration to obtain a new approval packet.
Old approval is never carried forward. The existing candidate stays untouched;
the isolated reconstruction must match every original source and Full file.
The original commit is retained only after the materialized Git tree matches,
so installed provenance also remains identical. Do not
advance the old gate while using this origin; its drift invalidates the new run.
Review the actual new cases, comparison settings and scoring limits before
approving Eval. Candidate application requires its own later approval.
