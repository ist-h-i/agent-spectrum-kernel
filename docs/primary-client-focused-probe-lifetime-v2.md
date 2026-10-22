# Prospective client / focused probe lifetime V2

Artifact ID: `primary-client-focused-probe-lifetime-v2`.
Upstream: parent-authorized ASK v1 implementation, existing
`mn-client-compatibility-fix` / `mn-focused-regression-test` tasks,
`primary24-native-acceptance-pinned-minimum-plan-2`, main
`e54baee215ee613227baba337da13bb8b5268537`.

This is an **unselected, unqualified prospective implementation**. Both
production qualification values remain module-private `null`. A caller flag,
execution context, artificial transport, receipt or human approval cannot open
either gate. No existing task asset, run, criterion, budget or admission changes.

## Specification and ownership

The current client source drops child streams and unconditionally removes its
scratch directory. The focused source additionally eagerly starts later trials
after an unavailable observation. The new versions preserve task criteria and
use the existing `executeCodexSession` owner for cancellation, bounded process
execution and process-group termination. A thin single-trial adapter captures
bounded candidate streams and a finite completion receipt. It saves no stdin,
argv, environment, cwd, fd3, fd4, MAC, key, nonce or token.

Cleanup requires an owner-observed spawn PID, terminal status/signal, absence
of that owned process group, and no transport/cleanup uncertainty. Unknown
termination retains scratch and makes the observation unavailable. Capture
failure and cancellation also stop the new evaluation. Writes are exclusive,
with private output roots and mode-0600 artifacts; failures cannot overwrite
prior evidence or turn into quality zero.

Client keeps its exact probe/policy, 5-second child limit and 16-KiB stream
bound. Focused keeps its internal channel/MAC checks and 15-second parent
limit; a trusted parent verifies the internal receipt and emits only bounded
candidate stdout/stderr frames and a finite result. Its key material and raw
control frames are not saved by the outer capture adapter. Parent stderr and
unknown frames refuse the observation. A legitimate mutant assertion failure
is a finite inner result under a successful parent exit; a failed parent is
infrastructure failure. Trials are sequential, with no later dispatch after
unavailable, cancellation, unknown termination or capture failure.

Each process reservation includes the requested child limit and 4 seconds for
the existing owner's shutdown. The effective limit is also bounded by the
caller deadline using wall and monotonic time. No new frozen experiment budget
is selected by this implementation.

## Formal Verification Contract

Selection: `formal_verification_contract`; lifecycle, cross-module contracts,
regression and multiple actors require formal proof. Scope is new code and
new artificial verification only.

| Obligation | Observable check |
| --- | --- |
| V2-PIN | Exact legacy digest and unique anchors; pure source transform; unchanged scoring text and old assets |
| V2-GATE | Null qualification refuses before scratch, randomness, context access or process dispatch |
| V2-OWNER | Existing process owner; only observed PID queried; terminal group absence before cleanup; uncertain retention |
| V2-CAPTURE | Bounded raw candidate streams, finite receipt, exclusive writes; no secret/control channels persisted |
| V2-STOP | Sequential client/focused scheduling; first unavailable/cancel/unknown/save failure prevents later trials |
| V2-ADVERSARIAL | Normal, failed-parent, cancellation, group query error, missing exit, invalid framing, overflow and save failure |
| V2-LIMIT | Artificial clocks and transport check deadline and output bounds without native execution |

New targeted test commands (no existing unresolved suites are restarted):

```sh
node --test scripts/test-ask-primary-native-probe-lifetime.mjs scripts/test-ask-benchmark-mn-client-probe-v2.mjs scripts/test-ask-benchmark-mn-focused-probe-v2.mjs
```

Evidence and final independent review are recorded in the task handoff rather
than inferred from this specification.

Evidence required before a local implementation completion claim: terminal
exit receipts and matching source hashes for the new artificial checks, a pure
exact-pin construction/preservation check, and independent review of the final
diff. Missing terminal receipts, predicate drift or private-criteria disclosure
block that claim. Broader existing verification with unknown results remains
insufficient evidence; it is neither replaced by these checks nor restarted.
Merge/publication claims additionally require the parent's publication decision
and the repository's then-applicable checks; this local slice makes neither.

## Explicit enabling blockers

Verified by independent design review: the existing sealed worker does not
carry a live controller `AbortSignal` across its process boundary. A detached
probe started inside that worker would not be owned by merely killing the
outer worker. `privateNativeProbeContext` is forwarding data, not authority or
proof that this lifetime is connected to the controller.

Before selection/admission, execute probes under the controller owner (as the
performance path does) and bind sanitized, source-pinned observations into the
sealed payload, or implement a genuine reviewed IPC lifetime join. The focused
internal fd3/fd4/MAC contract also needs real qualification under that owner.
These are unresolved enabling requirements, not established runtime behavior.

No real native, Codex, model or key generation is run for this work. No runtime
acceptance or score is claimed. Existing sessions 92279 / 25371 / 26799 and
their missing results remain untouched and unknown; the new artificial checks
do not replace their evidence. PR publication is held by the parent.
