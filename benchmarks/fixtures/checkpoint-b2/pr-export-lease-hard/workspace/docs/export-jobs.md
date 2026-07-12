# Export job state contract

Every job is tenant-scoped. Owners and operators may act only on jobs whose `tenantId` equals the authenticated
principal's tenant. Job IDs are not authorization boundaries.

A queued job can be claimed by at most one worker. Claiming increments `attempts` exactly once and creates a
lease. A running worker may complete or fail a job only when it owns the lease and `now < leaseExpiresAt`.
Expired or replaced workers must not change the job.

Retryable failures are automatically requeued only while `attempts < maxAttempts`; otherwise the job remains
`failed`. Manual retry is valid only for `failed` jobs below the same limit. Rejected transitions must not clear
`lastError`, alter `availableAt`, or otherwise partially mutate the job.

Backoff after attempt `n` is `baseDelayMs * 2 ** (n - 1)`. A job is claimable when `availableAt <= now`.
Results are cloned before storage so callers cannot mutate persisted output.
