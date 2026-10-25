# Stream API debt-v2

## A: two wire formats, one state

`src/pipeline.mjs` exports `createPipeline({windowSize,allowedLateness,sink,checkpoint?})`.
`src/processor.mjs` keeps `createProcessor(options)` with ingest/advanceWatermark/stats for old clients. `src/legacy.mjs` keeps `createLegacyConsumer(pipeline)` with push(legacyEvent), watermark(tenant,value). Both APIs operate on the supplied pipeline's same state; a consumer-local duplicate cache may not suppress a newer revision.

Canonical event: `{tenantId,eventId,revision,eventTime,amountMinor,deleted}`. Legacy event: `{tenant,id,rev,at,cents,remove}` with corresponding values. IDs are nonempty strings, revision/time nonnegative safe integers, deleted/remove boolean, and amount/cents canonical signed decimal integer text (`0` or `-?[1-9][0-9]*`, no -0/trailing newline). Extra metadata is ignored. Presence of tenantId selects canonical parsing; do not fall back to legacy if that canonical input is malformed. Inputs and returned checkpoints are caller-owned copies.

For each tenant/ID, larger revision replaces prior contribution; older revision and exact duplicate are accepted no-ops. Equal revision with different amount/deleted is revision_conflict. An active ID changing eventTime is event_time_conflict. eventTime is immutable even when reactivating a deletion. Deleted records retain revision until window closes. Exact integer sum includes negative amounts and values beyond Number precision.

`ingest(input)` returns `{accepted:true}` or `{accepted:false,reason}`. Rejection order is malformed→invalid_event, active-ID time mismatch→event_time_conflict, closed window→closed_window, equal-revision contradiction→revision_conflict. Each rejected input calls `sink.reject({event:<original input copy>,reason})` once; older revisions/duplicates do not call reject.

## B: atomic batch and watermark

`ingestBatch(inputs)` accepts at most256 inputs. Empty is accepted. A nonarray/oversized batch returns `{accepted:false,index:null,reason:'invalid_batch'}` without sink callbacks. For a valid-size batch, simulate in input order including earlier revisions from that batch. At its first rejected member return `{accepted:false,index,reason}`, reject that original member exactly once and apply none of the batch, including no new empty windows/tenant state. Success returns `{accepted:true,count:inputs.length}`. Batch never advances watermark or finalizes output.

`advanceWatermark(tenant,value)` accepts nonempty tenant and monotone nonnegative safe integer; otherwise returns `{accepted:false,reason:'invalid_watermark'}` without side effects. Initial watermark is -Infinity. Fixed UTC window floor(time/width)*width closes iff end+allowedLateness<=watermark of that tenant. Finalize each observed window once, ascending start for one advance, including zero sums; never emit an unobserved empty window. `sink.finalize({tenantId,start,end,amountMinor})` and reject are synchronous, nonfailing protected ports. A rejected input cannot open a window.

## C: checkpoint compatibility and bounded retained state

`exportCheckpoint()` returns a detached JSON `{version:2,windowSize,allowedLateness,watermarks:[[tenant,wm],...],events:[canonical latest events...]}`. Array order is not a correctness criterion. Export retains one latest active event per ID, including tombstones, and watermarks; closed details/output/rejection histories are absent. Tenant watermarks may remain for observed tenants. Growing live IDs/windows/tenants needs growing memory; constant memory is not required for unbounded live cardinality.

Constructor also accepts valid v1 checkpoints `{version:1,windowSize,lateness,tenantWatermarks:{tenant:wm},rows:[legacy events...]}`. Restore emits neither finalize nor reject, preserves watermark and latest active revision/tombstone, and omits already-closed rows. Checkpoint/config must agree or constructor throws Error with code invalid_checkpoint. Malformed checkpoints throw the same code, without sink callbacks. Export after v1 restore uses version2. No disk or process-global state is permitted; separate pipeline instances are independent.

`stats()` is diagnostic JSON only; its field names/internal containers are not graded. Public exact sums, checkpoint replay and process measurements establish behavior.

Run `npm test`. Add ordinary tests under test/added and source-isolated scoring scenarios under test/added/scenarios as described in scenario-tests.md. Mutable paths: src/**, test/added/**, RESULT.md only. Retain logs under test/added/artifacts or /tmp.

## Non-goals

No disk durability, asynchronous sink retry, distributed watermark coordination, concurrent multi-thread mutation, or auditing of already-closed event IDs is required. Calls and protected synchronous sink callbacks are serialized in one process. Width is a positive safe integer and lateness a nonnegative safe integer supplied by valid callers.
