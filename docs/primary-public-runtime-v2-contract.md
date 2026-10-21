# Closed primary public routing, version 2

SPEC-P24-PUBLIC-RUNTIME-V2 follows #379 and PR420/421. It is an opt-in
`closed_primary_inputs_v2` preparation in the existing comparison runner.
V1 preparation and existing V8/V9 resources/results retain their identities.

## Behavior and boundary

The source installer owns Full selection. In V2 only, the preparer renders the
three public router capability gates to consume a fixed public selection file,
`.agents/ask-primary-public-capabilities.json`. Both canonical and Codex copies
receive the same gate. The selection is computed from the existing Full
projection and pinned rendered Skill entry bytes, never inferred from installed
directories, management state, caller booleans or model settings. The preparer
re-derives every byte and mode when loading a plan. Missing, modified or conflicting
selection/Skill inputs fail before dispatch. The public selection only describes
available ASK procedures; it grants no permission, model dispatch or scoring.

Full installation still uses existing local installers. Their two newly-created
identity records are moved to controller-only preparation evidence before the
arm baseline is captured. They are absent from the V2 arm and its public input
inventory. No existing run or installer record is changed. P and K never receive
the Full list. Project docs/global configuration are not edited. All three
conditions retain the same fixed public task and verification commands.

## Formal verification contract

VERIFICATION-P24-PUBLIC-RUNTIME-V2 selects formal verification because a durable
input/projection boundary changes.

- R1: V1 is unchanged; V2 is explicit and refuses unknown modes or downgrade.
- R2: deterministic source selection and router projection; no management,
  host, secret, environment or caller field enters the public document.
- R3: public selection and all auxiliary bytes/modes are independently
  re-derived; changed/missing/list-conflicting inputs fail before start.
- R4: management records are controller-only in fresh V2 preparations; P/K
  receive no Full selection. The existing immutable-arm scope is retained.
- R5: startup/native cwd/runtime identity remain unknown; artificial observations
  never authorize execution, admission or official scoring.

The V2 public document is checked with the closed
`primary-public-capability-selection-v2.schema.json`. The contract separately
pins that schema, the preparer, public input renderer, installer renderer and
canonical router sources. These pins are preparation evidence, explicitly
`not_admitted_for_scoring`; they are not a new accepted grading selector.
V2 stdin shows digest/byte/mode pins beside each input reference. P/K cannot
receive the Full list through this rendering. The seven post-install generated
assets identify their origin as `source_public_routing_projection_v2`.

`inspectSuppliedPrimaryStartupInventory` compares an artificial inventory to
exact declared inputs and initial cwd, discarding unknown/caller closure fields.
Even a full match says only `supplied_inventory_matches_declared_inputs` with
startup closure unverified. An inventory has no evidence of absent hidden inputs.

`inspectSuppliedPrimaryAppServerVerification` consumes only an explicitly
supplied verification **segment**, not a complete session. It uses the upstream
source contract at OpenAI Codex commit
`092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`:

- `ItemStartedNotification.ts` blob `9ec8af09e9f331430354961173654ac648e13c83`;
- `ItemCompletedNotification.ts` blob `25ced4a0750fab2ee13ad98dbdaeb7e4400aad5c`;
- `ThreadItem.ts` blob `1f132df8daf86a68640e5533bfbd52819bd85bed`;
- `CommandExecutionSource.ts` blob `9432841fb7cb689ea3061b96df7622fb8e9a7040`;
- `CommandExecutionStatus.ts` blob `c58b3cc7faa49b824e7468ccd9b287c462aef9a4`;
- `CommandAction.ts` blob `91c92c9cbf8b2a42a6a5a3da756655a43c93ad82`.

These files are under `codex-rs/app-server-protocol/schema/typescript/v2/`
in the official repository. No CLI binary was invoked. The diagnostic checks
closed event fields, matching supplied thread/turn IDs, monotonic pair timestamps,
command/cwd/start/completion/zero exit and raw event pins. Descriptive commandActions
never authorize commands; unknown commands and any non-command/unknown notification
reject the whole segment. It neither filters real sessions into success nor
collects candidate edit/final-snapshot lineage. It drops output text from its
result and grants no runtime, execution, admission or scoring authority.

Verification uses normal local Node preparation and artificial event fixtures,
no Codex process or model. Independent review and exact-head CI are required.

## Remaining connection

This slice connects source-configured Full routing, not the installed runtime.
Startup closure must cover global/user instructions, metadata and later inputs
without copying them into task assets. Native start/completion must attest the
actual command cwd, stable IDs and exact commands. A schema/source processing
successor must consume these bindings equally for P/K/F after genuine runtime
qualification. Do not add an alias to V9 or mutate frozen schema/assets merely
to make new contracts pass. Current start and grading guards stay closed.
