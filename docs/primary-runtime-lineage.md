# Owned runtime lineage implementation

SPEC-P24-RUNTIME-LINEAGE-1; upstream #379, #427, #429.
Formal Verification Contract VERIFICATION-P24-RUNTIME-LINEAGE-1 applies to the
new collector/opaque receipt/verifier/producer connection and runner regression.

Implement one bounded initialize/initialized/thread/start/turn/start lifecycle
through executeCodexSession's existing onStdinReady/onOutput seam. Correlate
thread/turn/item identities, native verification cwd and command pairs, edit
pairs before final verification, usage and final response. Stop on unknown RPC,
approval/auth request, late/unmatched items, unknown stderr or incomplete
termination. Snapshot the whole condition arm before and after, preserve scope
and require changed work products to have paired edit evidence. Keep stream
framing/byte/event bounds and abort cleanup owned by the existing runner.

The initial implementation is exercised only through synthetic prepared plans
and an explicit fake transport. Real plans reject before spawn and ownership/
start consumption because effective startup-input closure remains unobserved.
No caller data, artificial output, serialized/hash-recomputed receipt or public
origin boolean can qualify a runtime. A module-private WeakMap binds each issued
synthetic receipt to the original input/source/workspace snapshots. The verifier
rechecks current bytes, and the existing producer accepts only that owned handle
to emit a closed, explicitly synthetic diagnostic artifact. Producer readback
requires the same live handle and exact source/artifact pins. These records never
enter normalization, private grading or the existing execution producer scope.

L1: finite RPC/lifecycle with original-line hashes and ordered native pairs;
L2: paired edits, immutable input scope and retained final inventory;
L3: source/input/condition/producer pins, object identity and replay refusal;
L4: explicit synthetic origin, unknown effective startup/provider-per-turn model
identity, no execution/scoring authority and no real dispatch;
L5: timeout/interruption/unknown output/late events/cleanup failures unavailable;
L6: existing V10 preparation, launch and scoring guards remain in place for P/K/F
and both profiles. Tests run Node fake processes only, never a native binary.

This connects executable collection and diagnostic consumption, not another
preparation contract. Unknown startup instructions/tools/plugins/global inputs,
actual native event compatibility, effective provider/model per turn, true read
isolation and controller/runtime qualification require measured evidence. The
limited catalog responses cannot supply these. No base/developer instruction,
managed policy, auth, home or database setting is overridden to manufacture it.

Touching comparison/producer changes selected processing source bytes and their
dependency graphs. Frozen V10 resources/selectors remain bound to old exact
sources and cannot be repinned or admitted to this implementation by copying old
decisions. The fixed24 public/private task bodies remain usable as retained data
for a separately reviewed successor source binding. Runtime acceptance stays
unmet and no old quality-null result is rewritten.

Accepted native item/terminal/usage frames are retained in module-private memory
and re-derived by the verifier. All exact sent RPC frames are pinned. A separate
hash covers all observed stdout bytes, including rejected/unparsed output, but
private handshake fields, deltas, stderr and rejected raw frames are never saved.
`semantic_replay_coverage` explicitly limits semantic replay to accepted native
frames; this is not complete startup/raw-session verification. Persisted output
contains only finite projections, digests and counts, never raw streams.

Validated partial evidence survives failure, including snapshot I/O failures.
The final attempt for every required check must pass after the final edit; prior
failed attempts remain diagnostic history. Verification/terminal/close snapshots
must agree. Original source and all prepared baseline inventories are rechecked.
Producer placement refuses overlap with source/plan/baseline trees before writes.
Normal exploration commands and unobserved asynchronous notification variants
remain unsupported, rather than being silently classified as safe or accepted.
