# Profile service backfill, day-shift operating contract

Applications still read and write both generations of the profile. A range publication advances one partition's reader checkpoint. It leaves the underlying representations and application traffic available. The dispatcher has one current work order per partition. The shift snapshot in `operations/work-orders.json` gives the decision time in UTC. Each page has its own effective time.

## Reading the checkpoint ledger

Start from the last compaction anchor for the live stream. Apply the primary's published journal entries in chain order. The parent must equal the current link, the batch must advance by one and the lower bound must equal the previous upper bound. A span is open at its lower bound and closed at its upper bound. An export can include replicas, rehearsals, worker observations and duplicate event IDs. Receipt of an event by the dashboard has no effect on the durable position.

## Moving a partition forward

A work order covers one range, projection map and source log fence. Its lower bound must match the durable checkpoint. The migration operator can publish it when both acceptance records and a release covering the work order are available.

* The row comparison must cover the full range of that partition on the requested projection map, through at least its source log fence. Both representations must yield the same digest, with no unresolved rows. Worker PASS/FAIL summaries refer to the comparison the worker was actually asked to run.
* Client certification is shared between partitions. It covers the projection map and both application builds currently serving the partition. A certificate for a different build pair cannot clear the active routes.
* Release entries are read in issuer sequence for each grant. The latest disposition controls it, even if a mirror delivered an older entry later. An effective grant from the profile change owner covers its named partition, map, inclusive batch interval and time window. A continuing grant can be used for any covered range. A revocation remains in force until the owner issues a covering grant.

## Publication receipts

Persist the work order's delivery key before enqueueing. An agent can lose the response after the primary has applied the request. The publishing generation owns a single-use send lease. A status read from the primary matches the stream and key. A terminal APPLIED receipt contains the published range and journal link. Close the item on a matching receipt. A NOT_FOUND result establishes non-publication only after the sender has been fenced and the primary has accounted for all sends up to the returned fence. A lagging primary read, a mirror read and a dashboard timeout cannot settle an outstanding send. When non-publication is established, a currently cleared work order may be sent under the same delivery key.

At handoff, advance cleared work and resolve specific open gates on other work. Independent checks and grant requests can be queued in either order. The command catalog assigns operators and distinguishes operations bound to a delivery key. Explain the effect and the remaining boundaries in each instruction. A newly published range may be closed. The next range requires its own work order.
