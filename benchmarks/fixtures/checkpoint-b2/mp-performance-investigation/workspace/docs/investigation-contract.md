# Summary service incident contract

The regression window begins with release `2026.08.16-1`, deployed at 09:30 UTC.
Compare the supplied pre-release and post-release windows; no other time range is in scope.
Tenant mix, request volume, database query latency, garbage-collection pauses, cache reuse, and summary-build CPU are candidate signals rather than conclusions.
A correlated signal may support a hypothesis, but only a controlled intervention can establish causality.
No production configuration change, deployment, traffic shift, or cache flush is authorized by this task.
The next check must be bounded to a local replay or read-only staging observation and must state when to stop.

The summary cache is intended to reuse an entry for the same `tenantId` and `windowMinutes` during its 60-second lifetime.
`requestId` is trace metadata and is not part of the reusable summary identity.
Every material conclusion must cite a supplied path and line.
