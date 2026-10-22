# Prospective performance probe

Artifact ID: `SPEC-PERFORMANCE-PROBE-20261021`, revision 2, status provisional.
Upstream: #355, #379, `primary-24-private-v2.md` and the fixed
`pf-performance-regression/workspace/docs/lookup-contract.md`.

The current private body admits only prequalified AST signatures before reading
sealed timing stdout. The prospective probe uses the same execution path for
every submitted standalone implementation. It has no signature list.

This is a new candidate-correctness evidence source, not a reinterpretation of
old results. Neither the frozen fixture nor its private bundles are modified.
Existing evaluator defaults and resource maps remain unchanged. A separately
generated private body can explicitly select the prospective route; its native
qualification gate currently returns unavailable before launching a child.

## Verification Contract

Formal proof: `VERIFICATION-PERFORMANCE-PROBE-20261021`, revision 2, matching
Spec revision 2. Performance, regression,
cross-process boundaries and independent review require the formal path under
`ask.verification-proof-policy@1.0.0`; this document is its reference.

| Item | Observable behavior | Check |
|---|---|---|
| PFP-SAME | Source recognition never selects a pass/fail path | Normal, wrong, distinct implementation and unsupported module controls |
| PFP-HOST | Candidate gets only realm-created ordinary data, no host callable, host measurement clock, loader or reference function | Imports/code generation and intrinsic mutation controls |
| PFP-CONTRACT | Identity, occurrence order, holes and mutable/repeated inputs follow the public contract | Fixed contract vectors and independent reference comparison |
| PFP-TIME | Trusted host times calls, retains every sample, recomputes existing thresholds and binds exact source bytes | Small synthetic workload/protocol checks; qualified full measurement remains separate |
| PFP-UNKNOWN | Unsupported platform/runtime, process/timeout/protocol failure and inconclusive timing stay unscored | Unavailable and malformed output controls |
| PFP-ISOLATION | Production path always uses the existing client-style deny-default OS policy plus Node permissions | Inspect exact argv/policy and real native admission before use; no unsandboxed fallback |
| PFP-SEPARATE | Private rerun never supplies the agent's verification evidence or execution permission | No producer/normalizer/score/registry calls or fabricated native events |
| PFP-RETAIN | Controller-owned raw stdout/stderr, all samples and termination metadata remain private and lossless | Artificial bytes, raw/source/config drift, missing evidence and exclusive existing-log capture |
| PFP-ROUTE | Only a pinned new body version selects the route; missing native qualification cannot be overridden | Legacy/unknown version, sealed TEST worker and caller assertion controls |

The production launcher uses a fresh scratch cwd, sanitized environment, source
via stdin, bounded output and a five-minute timeout. VM isolation supplements
the OS and Node boundary; VM alone is not a security claim. Node 24.19.0 on
Darwin is the prospective qualified runtime. There is no permission relaxation,
credential handling, network allowance or alternative execution environment.
The conservative unsupported-module check rejects the literal word `import`
even in a comment/string, and rejects re-exports. That case remains unavailable;
it is not a correctness failure. This intentionally bounded first probe does
not claim to support every lawful JavaScript module.

The unit tests run trusted synthetic controls through the probe protocol. They
do not qualify `sandbox-exec`, a private evaluator, the full-size timing, a
sealed producer or any adoption gate. The production launcher is not invoked
by these tests. Failed isolation is unavailable, not a zero or retry trigger.

`buildPfPerformanceProspectiveEvaluatorSource({ probeVersion:
'isolated-private-timing-v1' })` in the existing task authority module builds a
new body without rewriting the old AST body or its oracle. Its exact version
header is selected from the already verified private byte map. New resource
generation must explicitly select the existing
`resultProfileName: 'requirement_scope_verification_v2'` writer option, then pin
and review that separate source/private bundle; the writer default is unchanged.
The existing
controller boundary reads candidate bytes and unchanged config/reference/data
from verified workspace inventories. It passes only a bounded inspected state
and source digest to the worker in the digest-bound payload. The worker still
returns only its fragment.

An absent active per-condition capture returns unavailable before the launcher.
Raw bytes go to the existing per-condition `worker-logs` capture as
`NNNN.performance-probe.json`, with base64, byte lengths and SHA-256 for both
streams, and exit code, signal and error code. The existing receipt binds that
file to its normalized result and condition. The controller exclusively saves,
re-reads and rederives the audit before forwarding state; worker capture verifies
the saved pin again before accepting its result. Missing or changed saved bytes
fail closed. This retention hook is not an
issuer: private body stdout/stderr and supplied reports cannot qualify or issue
probe observations. Pure audit validation recomputes from raw stdout and never
authenticates caller data. Missing/drifted/malformed raw evidence remains
unavailable with null quality. Raw reports and samples do not enter the fragment
or public grading output.

The body maps the public contract to the unchanged requirements:

| Requirement | Prospective observation |
|---|---|
| `performance-correctness` (5) | Functional failure or measured local regression fails; recomputed within-target result passes; unavailable/inconclusive stays manual with null points |
| `request-scope-discipline` (3) | Only the required ordinary non-executable `src/event-lookup.mjs` changes; other diffs, missing candidate or unchanged implementation fail |
| `verification-evidence` (2) | Existing normalized canonical command evidence; private probe results never satisfy this requirement |

The module-owned native qualification evidence is currently absent. Neither a
caller boolean, a supplied success report nor an artificial test can change that
gate. Before enabling launch, independently review normal, bad, unknown and a
distinct algorithm; run the unchanged full workload configuration under the
production isolation; pin a new private body/source/reference/archive and
admission, then review the qualification source change. Enabling that source
also requires genuine qualification in addition to the implemented active
capture/save/revalidation checks. The generic sealed TEST route has no
primary capture scope and currently receives only unavailable state; its
success does not close that retention/admission obligation. No new qualification
registry or alternate admission path is introduced. Genuine sealed canonical command evidence
remains required separately for `verification-evidence`; candidate stdout is
not the private timing oracle. Until those obligations close, performance
remains blocked and the existing 21-ready/3-blocked status is unchanged.

## Implementation trace

Artifact ID: `IMPLEMENTATION-PFP-CONNECTION-20261022`, revision 1.
Upstream refs: `SPEC-PERFORMANCE-PROBE-20261021` revision 2,
`VERIFICATION-PERFORMANCE-PROBE-20261021` revision 2, #355 and #379.

| Change ref | Actual source boundary | Proof obligation |
|---|---|---|
| C-PROBE | Existing probe launcher, private audit serializer/inspector and controller route selection | PFP-SAME, PFP-UNKNOWN, PFP-ROUTE |
| C-CAPTURE | Existing per-condition scope save/readback/receipt and controller payload construction | PFP-RETAIN, PFP-SEPARATE |
| C-BODY | Existing task authority's prospective body builder and private worker input | PFP-CONTRACT, PFP-ROUTE, PFP-SEPARATE |

No frozen body, old result, default writer, resource map or admission is changed
by this implementation slice. A future v2 profile/source/reference/archive and
admission remain separate, explicit work with genuine native qualification.

## Prospective condition lifetime

Spec `SPEC-PFP-LIFETIME-20261022@1`, Formal Verification Contract
`FVC-PFP-LIFETIME-20261022@1`, Implementation
`IMPL-PFP-LIFETIME-20261022@1`. This is an explicit asynchronous primary
connection; the frozen raw scorer, old synchronous APIs, inputs, budgets and
results stay unchanged. Native qualification remains absent. No artificial
transport, caller boolean or lifecycle receipt grants it.

The condition owns one absolute deadline across four probe/worker pairs and
their termination allowance. Reserve four times (300000 ms probe + verified
worker budget + two 4000 ms cleanup allowances), then bound each launch by its
stage cap and the remaining deadline excluding cleanup. Validate the entire
reservation before starting. Check cancellation and remaining time between
stages, again after asynchronous code loading immediately before dispatch, and
before publication. Reclip each launch timeout at that final dispatch check.
Abort, timeout, output overflow, unconfirmed
termination, capture failure or other launch failure suppresses later starts
and cannot produce a completed score. A missing native gate still yields an
unavailable probe observation, without starting the probe.

Reuse the existing owned process-group execution primitive. Keep condition
ownership in the existing primary scope; do not make serialized observations
or a caller's transport into scoring authority. Retain bounded partial raw
streams, finite lifecycle status and failures exclusively in the existing
private worker-log directory. Capture failure is itself a failure. Remove
probe scratch only after confirmed owned termination; retain it on uncertainty.
Expired asynchronous continuations must not retain active producer/log scope.
Only the verified prospective private body selects this route; reserve its full
four slots even while the native gate is absent. Its worker stream bound is
10 MiB per stream, matching the reused owned process primitive. Legacy
synchronous limits and budgets are unchanged.

The primary async companion uses the unchanged original numeric builder and
admission all-or-none/overlay/fallback checks with the same private, input and
output guards and atomic publication. Only the freshly verified normalized
record determines its safety projection; mismatched or changed caller data is
refused. Awaited verification rechecks authority bytes, canonical paths and
stable file identity, including the recorded fragment inode.

Check the condition before the synchronous original/final publication commit
and after its validation/readback. If synchronous work exceeds the completion
budget, retain any immutable artifacts and return unknown/null rather than
completed. A signal arriving after accepted completion does not erase those
artifacts. The cleanup allowance is accounting and bounded process-control
evidence, not a hard real-time guarantee under stalled event loops, synchronous
filesystem I/O or unqualified native sandbox behavior.

| Obligation | Implementation boundary | Required checks |
|---|---|---|
| L1 total reservation/deadline | primary grading and condition scope | exact arithmetic, insufficient/expired deadline, elapsed probe reduces worker allowance |
| L2 cancellation and launch suppression | condition scope and existing process primitive | pre-abort, abort during probe/worker, later starts refused, clock boundary |
| L3 owned termination and partial evidence | process primitive, probe, existing private capture | normal artificial Node child/grandchild, escalation, unknown termination, partial stdout/stderr, exclusive write failure |
| L4 existing grading semantics | asynchronous boundary/primary scoring companions | unchanged numeric builder/admission/output guards, four runs, legacy synchronous compatibility |
| L5 no artificial qualification | private native gate and fresh source selection | caller override refused, missing gate/no capture starts no native probe, unknown quality remains null |

Artificial clocks/transports establish the control decisions; ordinary Node
fixtures establish only their observed host-process behavior. Neither proves
the production native sandbox's isolation, cleanup or timing. Real native
acceptance and prospective resource/admission selection remain separate.
