# Reporting contract index

- jobs.md: state, claim/run/cancel and external output semantics.
- records.md: legacy wire and persisted record compatibility.
- recovery.md: paged recovery, interruption and resource observations.
- scenario-tests.md: source-isolated additional test format.

src/queue.mjs exports createQueue({store,sink,renderer?,faults?,leaseMs=10}) returning enqueue,snapshot,claim,run,cancel,recover,recoverPage. Fixed callers use these public methods; internal modules and representation are not graded. All returned JSON is a detached value.
