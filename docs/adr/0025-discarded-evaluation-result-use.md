# ADR 0025: Discarded evaluation result use

Status: Accepted for the result-only supervised workflow.

A rejected candidate and a discarded evaluation result are different decisions.
Previously both could carry report summaries, failures and observed costs into
new authoring. Explicit result discard must prevent that reuse without deleting
candidate Assets or rewriting evidence.

Add one typed result disposition. A human result-only `discarded` decision sets
it before completion; an explicitly authorized host may append it to a completed
rejected/retained result with exact journal/report/decision/revision bindings.
The shared validator checks those bindings on read. A completed parent operation is required for historical append, and parent/cycle locks protect it; no worker or Asset lifecycle operation is involved.

Keep raw reports, revisions and accounting unchanged. Standard continuation reads
return report null, and a separate closed discarded-continuation projection
carries only lineage and the discard reason. It omits performance, quality and
failure data rather than inventing zeros. Direct preparation refuses revision
and result-summary overrides. Native/component builders require fresh feedback
and do not learn measured costs from the discarded report. Operations stop
instead of automatically advancing another cycle.

Do not infer discard from every rejected result or parse human reason prose as
control authority. Existing rejection and legacy continuations retain their
behavior. Applied or owner-change cycles are not a discard target; this change
adds no rollback or physical deletion and does not inherit approval.

The compatibility cost is a new state marker, projection and source pin. Frozen
older controllers remain archival; future preparation must use a controller
that recognizes the marker. A deliberate future change to result eligibility
requires a separately defined human-authorized lifecycle, not marker removal.
