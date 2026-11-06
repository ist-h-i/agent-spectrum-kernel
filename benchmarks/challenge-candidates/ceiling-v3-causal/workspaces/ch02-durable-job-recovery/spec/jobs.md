# Job and external-effect behavior

Identity is the pair(tenantId,requestId), encoded by protected jobKey. enqueue accepts JSON payload accepted by payloadDigest (rendering may later reject it with PERMANENT), is idempotent for equal JSON meaning, and rejects a changed payload under an existing identity without changing durable state or sink. Tenant identity is never omitted from data, receipt or key. States are queued,running,confirming,succeeded,cancelled,failed. A running lease has worker, positive-safe token and expiry; receipts occur only on success, and permanent failure retains its reason.

claim(worker) chooses available work; no fairness order is fixed. The lease is current only while state, worker, token and unexpired time all match. A lease issued after another lease has expired has a different token even for the same worker and across another queue instance/recovery. Existing valid leases and their numeric identities survive migration. All calls and fault hooks are synchronous; another finite public operation may run from a hook. Safe-integer inputs and a finite history are supplied.

run(key,worker) cannot change the replacement owner's state or reason after losing ownership. It records a successful receipt, permanent failure, retryable state or uncertain sink outcome durably as appropriate. PROCESS_CRASH escapes as an interruption, not a normal failure. RENDERER_PERMANENT/PERMANENT are permanent errors; RETRYABLE may later progress. All hooks before/after render,put and completion may interleave cancellation, expiry/reclaim or another recovery. Independent jobs must still progress under fair retries.

The sink linearizes output with putIfAbsent(key,digest,bytes) and cancellation with closeIfAbsent(key). A stored value with matching digest is authoritative success even if a store label says failed/cancelled. Closed absence is authoritative cancellation. A cancellation cannot honestly report cancelled while a matching stored receipt exists. A late put cannot reopen a closed sink. Unknown replies preserve the actual durable outcome; recover/cancel/run may resolve it using supported sink operations. Foreign-digest effects must never become this job's success. A previously terminal permanent failure with no output retains its reason. Active running leases without sink evidence remain active. No distributed store+sink transaction or rollback is provided.

Protected renderer maps JSON payload to deterministic bytes; valid reports have title:string and rows:array. Faults exposes finite synchronous hooks and explicit interruption. Public sink observations are not permitted as a substitute for the declared key/digest receipt semantics. Client responses omit payload bytes. Cross-tenant content/receipt exposure and false cancelled finality with stored output are safety violations when observed, separate from functional points.

## Returns and error priority

The following return values are detached JSON values. Additional private record fields are permitted; no caller relies on object identity. A thrown error has a message; only the codes explicitly specified here or in records.md/recovery.md are contractual. Exact generic error text is not graded.

| Operation / condition | Public result |
| --- | --- |
| enqueue with valid identity and fresh/equal payload | Current durable job for that identity. Equal submission creates no second logical job. |
| enqueue invalid nonempty-string tenant/request or payload not accepted by payloadDigest | Throw without durable or sink mutation. Identity validation precedes payload validation. |
| enqueue existing identity with different payload digest | Throw payload-conflict error without changing that identity or sink. |
| snapshot missing key | null. |
| snapshot existing valid current/legacy record | Current-format normalized job; snapshot itself does not migrate storage or alter sink. Invalid record throws INVALID_RECORD. |
| claim with no eligible job | null. Eligibility and valid-lease exclusions follow the behavior above. |
| claim with eligible work | The job with its newly issued running lease. Choice among eligible jobs is unspecified. |
| run missing key, not running, wrong worker, or lease expired at entry | null, with no mutation or sink effect. Ownership/expiry rejection occurs before renderer, sink write and fault hooks. |
| run valid at entry, ownership lost during a hook | The then-current durable job (or null if absent); the old owner cannot alter it or create output after loss. |
| run retains ownership through completion/recoverable error | Current durable job reflecting the observed output, permanent failure, retryable state or unresolved result required above. Retryable reason text is opaque. |
| cancel missing key | null. |
| cancel existing key | Current durable job reflecting authoritative stored/closed evidence or confirming when the outcome remains unknown. |
| recover succeeds | Array of current durable records after whole-store recovery. No array order is required. |
| recoverPage succeeds | The object and page-order semantics in recovery.md. |

PROCESS_CRASH from an invoked fault boundary escapes immediately instead of becoming a normal return or retryable reason. Invalid recoverPage cursor/limit takes precedence over record validation in the selected or unselected page, with no effects attributable to the rejected call. Recovery record-validation failure precedes that recovery call's migration or sink changes. Independently completed actions performed by an interleaved hook retain their own effects; they are not rolled back as effects of the outer call. Invalid records are exercised through snapshot/recovery; other queue operations receive valid durable records. Nonempty worker strings and safe leaseMs are supplied. These are observable outcomes and priorities, not an implementation sequence.
