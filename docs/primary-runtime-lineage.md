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
The shared producer must also remain importable in the sealed historical Full
test context. Current runner and preparation dependencies are loaded only by the
explicit synthetic collection entry. The module-owned receipt retains the
original inventory function for synchronous verification; callers cannot supply
or replace it. Historical renderer/runner bytes and manifest pins are unchanged.
A small named-export support module preserves ESM linking before dependency
evaluation: missing historical APIs reject before any old runner top-level code
can evaluate, even if synthetic collection is explicitly selected.

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

## Prospective custody and V10 connection

Spec SPEC-P24-RUNTIME-CONNECTION, revision 1; upstream #379 (PV1-3/4/5/7)
and SPEC-P24-RUNTIME-LINEAGE-1. This extends the same collector and producer.
R1: independently replay exact sent requests and accepted thread/start and
turn/start replies from bounded module-private bytes. Re-derive native cwd,
requested/thread model, provider, effort and thread/turn IDs; do not treat the
thread model as the unobserved per-turn resolved model. Initialize response
private fields remain discarded; its hash is not startup-closure evidence.
R2: an explicit V10-only runtimeLineageReceipts condition map joins owned
receipts to the fixed selector's independently reloaded plan/binding before any
write. Wrong run/plan/profile/condition/input/source and serialized receipts
reject. Missing conditions remain not_collected and failures unavailable.
R3: the existing producer retains finite projections, never raw private bytes.
Readback without live handles verifies artifact integrity only; an explicit
same-process readback rechecks all provided owned receipts and current inputs.
The runtime-binding schema remains unchanged and unqualified. No observation,
synthetic result or approval supplies execution/scoring authority.

Formal Verification Contract FVC-P24-RUNTIME-CONNECTION, revision 1 selects
formal_verification_contract under ask.verification-proof-policy@1.0.0:
state_concurrency_persistence_lifecycle_or_cross_module,
public_api_schema_or_compatibility, multi_session_multi_agent_or_handoff,
merge_release_or_stable_trace. Obligations V-R1/R2/R3 map respectively to
R1/R2/R3 in the existing test-ask-primary-runtime-lineage.mjs suite. Exercise
both profiles and P/K/F, malformed/partial replies, foreign/forged handles,
missing/failed conditions, retained input drift, output tampering and all live
start/scoring rejection paths. Additional V10/schema/producer/Full regression
checks protect unchanged consumers. No actual CLI/model/native test is proof
for this change; actual startup/runtime acceptance remains missing.

Implementation Contract IMPL-P24-RUNTIME-CONNECTION, revision 1 references
SPEC-P24-RUNTIME-CONNECTION@1 and FVC-P24-RUNTIME-CONNECTION@1.
Changes C-R1 (collector/replay), C-R2 (existing producer join/readback) and
C-R3 (artificial regression) are confined to the existing modules/tests.
No workflow, frozen asset, old run, binding schema or scoring gate changes.

## Native thread metadata compatibility

SPEC-P24-RUNTIME-STARTUP-METADATA-1 and FVC-P24-RUNTIME-STARTUP-METADATA-1
extend the existing formal connection contract. The retained installed 0.162.1
ThreadStartResponse schema (SHA256
7247cd531d3f78174444f8262fd3090d5acf8ab74084547b4e0a831d74e77c9a)
declares root optional, non-nullable instructionSources and disabledPluginIds
string arrays. Their schema defaults are not observations. The first describes
environment-native paths of currently loaded instruction files; the latter is
explicitly a saved list that does not yet filter plugin capabilities.

V-S1: accept those exact fields through the existing native reply parser,
module-owned receipt, independent reply replay and diagnostic producer. Project
only reported/not_reported, count and exact-list digest. Missing is null; an
actually reported empty array is count0 with its own digest. Never open those
paths, copy their contents, or persist raw host paths/plugin IDs. Preserve exact
ordering/duplicates in the digest, without inferring meaning from either.
V-S2: refuse null/scalar/non-string/control/oversized inputs and unknown closure
claims; cap each list at1024 entries and each nonempty entry at8192 code units.
V-S3: keep full effective input closure and plugin capability filtering
unverified, per-turn resolved model/effort unknown, runtime/start/scoring guards
closed and quality null for every P/K/F condition. Neither an empty list, source
schema, artificial transport nor approval supplies missing runtime authority.

The implementation is a bounded native DTO/replay compatibility correction. It
does not establish that the installed binary emits the fields, that their list
is complete over Skills/tools/plugins/later discovery, or that a production
dispatch path is qualified. Validation uses artificial protocol frames only.
The change alters processing source bytes: existing frozen assets/selectors and
old results remain bound to their original sources. Formal admission of a new
source requires genuine version-specific archive/reviewer/candidate identities.
Shared generated files are integrated once after the parallel performance
slice; final exact-source checks and independent review precede the one PR.
