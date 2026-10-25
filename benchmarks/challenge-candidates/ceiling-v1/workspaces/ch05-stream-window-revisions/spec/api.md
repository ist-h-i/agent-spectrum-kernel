# Stream API v1

`src/processor.mjs` exports `createProcessor({windowSize, allowedLateness, sink})`.
Configuration is valid: positive safe integer windowSize and nonnegative safe integer allowedLateness.
All methods are synchronous. They must not mutate caller input or throw for a rejected input.

- `ingest(event)` returns `{accepted:true}` or `{accepted:false,reason}`. An event has nonempty string tenantId/eventId, safe integer revision >= 0, safe integer eventTime >= 0, signed canonical decimal integer amountMinor (`0` or `-?[1-9][0-9]*`), boolean deleted. A malformed event is rejected with `invalid_event`; a closed window with `closed_window`; a same-revision different-content event with `revision_conflict`; changed eventTime on an active ID with `event_time_conflict`. Rejection also calls `sink.reject({event,reason})` exactly once. Older revisions and exact duplicates are accepted no-ops. Input eventTime is immutable for each tenant/ID. Detection of violations after disposing closed history is not required: the producer guarantees immutability.
- `advanceWatermark(tenantId,value)` returns `{accepted:true}` for a nondecreasing safe nonnegative integer value; otherwise `{accepted:false,reason:'invalid_watermark'}` without changing state or invoking the event rejection sink. Initial watermark is negative infinity. Tenant IDs are nonempty strings. Closure is `windowEnd + allowedLateness <= watermark`.
- `stats()` returns JSON-serializable diagnostic counts; its field names and internal structure are not correctness criteria. Retained memory is measured from the process, not trusted from this method.

`sink.finalize({tenantId,start,end,amountMinor})` is synchronous and cannot fail. It is called once for each closed window that has observed at least one accepted event, including zero totals. No output is needed for an unobserved empty window. Closures caused by one watermark are emitted in ascending start order. A rejection does not open a window. `sink.reject` is synchronous and cannot fail. No internal output/rejection history is required. The supplied sink may collect for tests or only retain a rolling digest for load measurement.

An active ID retains its latest revision including a deletion marker until closure. Revisions never transfer an ID to a different window. State for active IDs/windows and tenant watermarks may grow with live input; constant memory independent of those cardinalities is not required. Closed event details and already delivered outputs must not remain indefinitely. Tenant watermark metadata may remain for every observed tenant so old input can still be rejected. No requirement to forget tenant watermarks conflicts with that obligation.

`harness/consumer.mjs` is the fixed client. `data/normal.json` is ordinary input. `small-check.mjs` is only a small-input calculator for one tenant/window and valid, contradiction-free input; it does not implement watermark/rejection semantics.

Run `npm test` (Node 24.21.0; no installation needed). Add tests under `test/added/` and submit src, those tests, and RESULT.md. Do not modify spec/data/harness/original test/package files.

追加テストの有効性 10 点の提出形式・分離実行は `scenario-tests.md` に従う。通常の追加テストは `test/added/` で実行でき、採点用 scenario は `test/added/scenarios/` に置く。
