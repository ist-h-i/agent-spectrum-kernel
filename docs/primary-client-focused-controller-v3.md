# Client / focused controller observations V3

Artifact ID: `primary-client-focused-controller-v3`.
Upstream: the parent-authorized local controller connection task, commit
`9bd053b03bf687c81c9d1d4dd8dc4f048d1d0d05`, the V2 lifetime contract, and
`primary24-native-acceptance-pinned-minimum-plan-2`.

V3 moves private probes out of the sealed worker. The existing controller
condition scope owns an awaited probe callback, its AbortController, deadline
and completion, then starts the existing sealed worker with sanitized,
source-bound observations. The worker consumes observations and never starts a
native child, generates keys or receives a live execution context.

Both native qualification constants remain private `null`. No callback,
packet, finite receipt, artificial result or approval opens them. The default
production path records qualification refusal with zero observed starts and
does not dispatch a worker. V3 is not selected or admitted by this code change.

## Private plan and source custody

The client route requires the exact prospective body and probe-script hashes.
Its packet binds candidate bytes, normalized result, owner/round identity,
legacy/script pins and the saved receipt digest. The body retains its old
criteria while consuming that closed packet.

The focused builder extracts a bounded private execution recipe from the
exact old private source. Defaults, mutation literals and predicates remain
private; no private criteria are copied into public source or test fixtures.
Control/calibration dependencies select only the trials that the original
private code would execute. Skipped slots are explicit. This is not a fixed
21-trial superset: an unused trial cannot make a later required trial missing.
The maximum is 21 trials per worker, with separate observations for every one
of the four original worker executions.

Focused packets bind each ordered step/site/loop context/request to source,
test, loader, owner/round and receipt pins. Unknown, reordered, duplicate,
missing, transplanted and unconsumed executed observations refuse completion.
The original private criteria and function default are preserved by source
transformation; this does not constitute native execution evidence.

## Ownership and evidence

The scope registers the callback before invoking it, refuses concurrent work,
and joins pending owned work on close. The existing `executeCodexSession`
process-group primitive remains the process owner. Only confirmed completion
and group absence permit scratch cleanup. An unavailable/cancelled/unknown or
incomplete capture stops later probes and worker dispatch.

Private raw streams retain their original byte bounds and exclusive files.
No secret stdin, fd3/fd4 carrier, authentication value, argv/environment or cwd
is saved. Failure sidecars distinguish actual finite lifecycle metadata,
unavailable metadata, verified raw streams and missing/changed capture; they
never fill unknown starts with zero. The final controller audit includes
observed, skipped, unavailable and not-started slots. Worker receipts re-read
and bind the audit, process receipts and stream pins, preserving worker raw
logs before rejecting a changed join.

For manifest worker budget `W`, the condition reserves:

- client: `4 * (1 * (5000 + 4000) + W + 4000)` milliseconds;
- focused: `4 * (21 * (15000 + 4000) + W + 4000)` milliseconds.

The existing performance reservation and routes are unchanged. A scope's body
hint must match the verified sealed payload before dispatch. These are bounded
requests and shutdown reservations, not proof of host real-time behavior or a
guarantee that arbitrary JavaScript callbacks can be forcibly interrupted.

## Formal Verification Contract

Selected path: `formal_verification_contract` (lifecycle/cross-module,
regression, private-data and multi-agent proof obligations).

| Obligation | Required evidence |
| --- | --- |
| C3-CUSTODY | Exact body/fixture/script/plan route, request and owner pins; no caller qualification |
| C3-ADAPTIVE | Private defaults and predicates preserved; normal guard mismatch skips; missing/unavailable stops |
| C3-OWNER | Registered callback, cancellation and close join, worker gate, four separate rounds and counted starts |
| C3-FAILURE | Partial raw and finite sidecar retained; unknown/cancel/save-failure suppress subsequent starts |
| C3-JOIN | Saved audit/receipt/raw re-read; packet tamper/reorder/replay/missing evidence rejected |
| C3-WORKER | Artificial transport through the existing sealed boundary and ordinary Node worker consumes the packet |

New focused checks use only the new lifetime/client/focused/controller test
files and the separately recorded new sealed-boundary test. Each terminal
receipt identifies its own source snapshot; earlier test counts are not added
or transferred. Historical unknown sessions 92279 / 25371 / 26799 are neither
restarted nor replaced.

Local completion requires matching source hashes, terminal artificial-test
receipts, a passing new sealed-worker proof and independent final review.
Missing terminal evidence, private predicate drift/disclosure, incomplete
failure chains or an unverified worker join block that claim. Publication,
source/resource/admission selection and actual native/runtime qualification
remain separate, unmet gates.

The artificial sealed-worker proof exercises packet consumption with a test
condition owner. It does not enter the production ALS log-capture scope, so
the pending native audit to worker-receipt join is covered by separate unit
checks and source review, not by those two worker tests. Positive and changed
audit cases inside a genuine production owner/admission scope remain required
before claiming that production log connection has been observed.

## Real acceptance and diagnostic V4

Native client acceptance eventually invokes the original Darwin sandbox/Node
probe; focused acceptance also invokes its authenticated parent/child channels
and generates ephemeral key/nonce/token material. These create fresh scratch
and private logs and require a new specifically approved native plan. They are
not run by these artificial tests. No existing database, authentication, HOME
or permissions are changed.

These Node/sandbox task checks do not require Codex startup diagnostic V4 to
succeed. Actual nine-condition model comparison does require a genuine Codex
runtime/transport acceptance, in addition to the relevant task qualification
and admission. V4's historical unknown verification and consumed live-start
approvals remain unchanged; this work neither diagnoses SQLite's cause nor
authorizes another Codex/native/model start. Push and PR publication are held.
