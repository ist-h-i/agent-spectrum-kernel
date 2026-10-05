# Opt-in turn-received time budget

A fixed process timeout includes CLI startup as well as task work. New plans may
opt into `codex_turn_received_budget_v1` through the descriptor's `timePolicy`:

```json
{"kind":"codex_turn_received_budget_v1","startup_ms":120000,"task_ms":120000,"absolute_ms":240000,"start_event":"single_thread_then_turn_started_received","clock":"controller_monotonic","retry":0}
```

The same policy applies to both conditions. The values are provisional operating
budgets, not latency percentiles, an SLA, a performance improvement or a guarantee
of completion. Startup causes remain unknown. The 240-second limit covers one
trial process: two trials can consume 480 seconds, separately from the control,
grading, persistence and residual-process cleanup. Token limits remain post-trial
checks (30,000 per trial, 60,000 cumulative by default), so usage can exceed them.
New v6/v7 plans may explicitly select the [comparison token policy](local-codex-token-budget.md)
without changing this time policy or legacy defaults.

## Start observation and trust

The controller accepts one well-formed `thread.started` from the direct pinned
CLI stdout pipe, followed by one `turn.started`. The receipt of the complete
JSONL start event begins the task budget. This is an operational turn observation,
not proof of authentication, network readiness or model inference starting.
Saved CLI events demonstrate the event vocabulary; real-time flushing and latency
are not established by the model-free tests. No timestamp from the CLI or a task
file changes a deadline. Delayed receipt consumes startup time; it never earns a
retrospective extension.

`process.hrtime.bigint()` supplies the controller's monotonic clock, beginning
before `spawn`. The startup deadline is 120 seconds from that point. After a
valid start, the deadline is the earlier of 120 seconds after receipt and the
absolute 240-second process cap. Deadline checks precede event acceptance; an
event exactly at the deadline fails. Starts cannot reset the budget.

The stream parser rejects duplicate JSON keys, malformed UTF-8, incomplete final
lines, lines above 64 KiB, unknown event/item types, duplicated or out-of-order
starts, completion before start and events after completion. Total stdout and
stderr retain the existing separate 1 MiB limits. Task item contents, including
embedded JSON, are never interpreted as control events. Only two narrowly
recognized pinned CLI startup warnings are nonfatal; other errors stop execution.

The CLI and its direct stdout transport are trusted. These events are not signed:
an actor able to write valid top-level JSON directly to that pipe could spoof a
start. A thread ID, session identity and task-start turn identity are corroborated
after execution, before accepting the result or starting the other condition.
Missing or inconsistent identity fails. This later check does not retroactively
prevent progress after a forged start. The absolute cap remains independent of
all events. If stronger readiness attestation is required, use a fixed process
budget rather than treating this channel as such an attestation.

## Execution and compatibility

Only opt-in connection trial plans use the small asynchronous child runner.
The CLI receives the same stdin, argv, environment, denies and working directory;
no shell, daemon, session tailer or additional CLI call is introduced. The child
inherits umask 077, with the controller's umask restored immediately after spawn.
Detached POSIX process groups, SIGKILL at failure/deadline, the existing bounded
residual cleanup and private evidence sealing are retained. After a stop request,
an independent 2-second pipe-drain watchdog bounds waiting for `close`, even if
the original group is gone or a kill fails. Expiry destroys the parent pipes,
unrefs the child and marks cleanup explicitly unknown; it does not prove that
an escaped descendant was terminated. Late callbacks cannot change the terminal
result. Cleanup faults or
residual detection stop the comparison. JS timers cannot promise hard real-time
termination while the supervisor itself is suspended; late callbacks check the
monotonic deadline before accepting events. Persistence and OS cleanup are not
included in the process budget or given an unproven hard wall-time guarantee.

Plan kinds v4 (closed reads) and v5 (declared denies) explicitly bind the time
policy and the 240-second process constraint. The exact permission includes the
policy, plan, source and command digests. An implementation or a descriptor is
not execution authorization: a new reviewed plan and fresh one-shot approval are
required. Consumed grants are never reused. v1–v3 retain their original fixed
120-second behavior and synchronous API; v4/v5 evaluation returns a Promise, so
callers must await it. The CLI entrance awaits both forms.

Session discovery retains bounded exact filename probing for the selected new
thread and expands only its maximum time window to the bound 240-second cap.
It does not scan unrelated history. `time-budget.json` records the policy digest,
monotonic receipt elapsed time, actual cap, thread identity, completion observation
and stop reason. Simulation may impose a shorter, plan-bound absolute cap for
failure tests. Advisory timing v1 remains separate and cannot authorize retries,
promote identity, usage or grading. Old saved reports replay as saved, without
adding new timing records or recomputing old outcomes.

A partial token event does not replace known final usage. Process failure,
identity mismatch, missing completion, unknown final usage, provider stop,
token thresholds and evidence/cleanup faults keep the second condition unstarted.
There are no retries. An uncompleted or timed-out task is not comparative evidence
of kernel superiority.

## Alternative and verification boundary

A fixed 240-second process limit would be simpler and avoid event-driven budget
changes. It would still let differences in startup time reduce the task time
available to each condition. The opt-in policy addresses that allocation problem
within the stated CLI trust boundary, at the cost of bounded streaming and async
lifecycle code. Neither choice fixes an unmeasured startup cause.

Model-free checks cover virtual-clock deadline boundaries, delayed/missing/duplicate
starts, event spoof strings, parser failures, output limits, process timeout,
identity and usage failures, equal policies, one-shot claims and identical offline
replay. Native CLI flush behavior, authentication, actual host performance and
real OS completion remain unverified. No real trial or grant is part of this change.

Implementation Contract: `issue315-turn-budget-implementation@1`, upstream
`issue315-turn-budget-spec@1` (approved bounded implementation: startup120/task120/
absolute240; both conditions; retry0; no real execution), change C5 connection-only
time policy, runner, tests, docs and model-free CI.

Formal Verification Contract: `issue315-turn-budget-verification@1`, selection
`ask.verification-proof-policy@1.0.0` formal path for asynchronous lifecycle,
cross-module contracts and regressions. Obligations O16 deadline/stream/cleanup
fail-stop, O17 equal conditions/unknown usage/identity/new permission binding,
O18 old-plan and sealed replay compatibility. Evidence must be model-free focused
and combined tests, repository validation, independent review and exact-head CI;
none establishes real CLI readiness, latency or three-OS verification.
