# Canonical ASK / Adapter Runtime Boundary Contract

This contract defines the ownership boundary between canonical Agent Spectrum Kernel semantics and capability-specific runtime projections. It is the source of truth for the adapter profile schema; Claude and Codex renderers consume it instead of defining independent workflow meaning.

## Boundary invariant

Canonical ASK owns what a workflow, gate, evidence state, stop, approval, artifact, trace, and normalized event means. An adapter owns how those semantics are discovered, rendered, executed, enforced, and observed in one runtime.

An adapter may produce a different internal trace, use different orchestration, or omit an unsupported surface. It must not:

- copy and independently maintain canonical workflow procedures;
- replace canonical risk, evidence, approval, stop, lifecycle, traceability, or event semantics;
- infer runtime support from projected files alone;
- emulate an unsupported capability with prose;
- embed a current model name as a canonical workflow dependency;
- upgrade a claim when runtime or load evidence is missing.

## Field ownership

| Concern | Canonical ASK owns | Adapter runtime owns |
|---|---|---|
| Workflow meaning | Applicability signals, contracts, gates, lifecycle semantics, normalized output meaning | Discovery surfaces, invocation entry points, orchestration mechanism |
| Risk and approval | Risk classes, approval-required actions, stop semantics | Sandbox, permission, hook, and manual enforcement surfaces |
| Evidence | Evidence states, claim sufficiency, downgrade requirement | Detection probes, runtime observations, evidence locators |
| Rendering | Required semantics and canonical revision | Renderer identity, deterministic inputs, output roots, asset kinds |
| Generated assets | Provenance and drift requirements | Managed paths, ownership, install/update/rollback/detach implementation |
| Events and privacy | Normalized event meaning and prohibited claim upgrades | Collector path, local storage mode, unavailable events, adapter-specific health reporting |
| Optimization | Correctness, risk, evidence, and approval invariants | Effort, context/tool budget, agent count, retry, fallback, and output detail |

Canonical sources include `AGENTS.md`, canonical `skills/*/SKILL.md`, `docs/*-contract.md`, and canonical schemas. Generated adapter assets are projections, never competing normative sources.

## Adapter runtime profile

`schemas/adapter-runtime-profile.schema.json` is the portable profile contract. A profile records:

- canonical contract revision and source digest;
- adapter identity without a model dependency;
- capability support and evidence as separate axes;
- the claim downgrade required by the available evidence;
- adapter-owned rendering inputs and output ownership;
- managed-asset lifecycle and drift policy;
- privacy and normalized-event boundaries.

### Canonical source digest

`source_paths` contains normalized, repository-relative canonical ASK files only. Paths are unique, lexicographically sorted, and may not be absolute, contain `..`, traverse a symlink, point into `adapters/`, or escape the repository root. Every path must exist.

Canonical serialization is byte-preserving and deterministic. For each sorted path, append these bytes to one SHA-256 input stream:

```text
UTF8(path) + NUL + UTF8(raw_byte_length) + NUL + raw_file_bytes + NUL
```

The stored form is `sha256:<64 lowercase hex>`. Validation recalculates the digest from the current canonical files. A missing path, non-canonical path, unsafe path, or digest mismatch is drift and fails validation.

### Capability support

| Status | Meaning |
|---|---|
| `supported` | The adapter implements the capability at the stated evidence level. |
| `partial` | Only a named subset is implemented; limitations and a safe downgrade are required. |
| `unsupported` | The adapter does not implement the capability. It must not be emulated. |
| `unknown` | Available evidence cannot establish whether the capability is implemented. |

### Evidence level

Evidence level is monotonic and never inferred from a stronger-looking support label:

```text
none < projected < runtime_detected < executed < behavior_verified
```

- `projected`: deterministic assets or configuration exist.
- `runtime_detected`: a runtime-local probe detected the projected surface.
- `executed`: the runtime exercised the surface in a bounded run; this is runtime-observed evidence, not correctness proof.
- `behavior_verified`: a fixture or check behaviorally evidenced the stated capability.

These are the canonical machine values established by #157. “Detected”, “runtime-observed”, and “behaviorally evidenced” in architecture prose map to `runtime_detected`, `executed`, and `behavior_verified`; adapters must not introduce aliases as competing schema values.

Projection is not detection, detection is not execution, and execution is not behavioral correctness.

Every non-`none` capability evidence reference is a typed result reference with `record_id`, `evidence_kind`, `artifact_ref`, `result`, `evidence_level`, and `artifact_digest`. Evidence artifacts conform to `schemas/adapter-runtime-evidence.schema.json`, use the same SHA-256 form, must exist inside the validation root, and contain a unique matching record for the same adapter and capability. The record binds its observed inputs with the canonical path-set serialization above.

Evidence kind is fixed by level:

| Evidence level | Required result kind |
|---|---|
| `projected` | `projection_manifest` |
| `runtime_detected` | `runtime_probe_result` |
| `executed` | `bounded_run_result` |
| `behavior_verified` | `capability_fixture_result` |

Implementation source alone is not an `executed` result. Missing, failed, stale, wrong-kind, wrong-capability, or digest-mismatched evidence cannot raise a capability level.

`runtime_probe_result`, `bounded_run_result`, and `capability_fixture_result` additionally bind a verifier path, registered fixture ID, target paths, expected result, actual result, and exit status. Verifier and target paths must also be present in `observed_paths`, so their bytes participate in `subject_digest`. A passing string in a checked-in artifact is insufficient: the repository validator must recognize and execute the named verifier fixture. Unknown fixture IDs fail closed. Profiles in this revision intentionally remain at `projected` unless such a verifier is registered.

### Required downgrade

The profile must preserve the strongest claim allowed by both axes:

| Condition | Required downgrade behavior |
|---|---|
| `unknown` support | `unknown` |
| `unsupported` support | `unsupported` |
| `partial` support | `insufficient_evidence`, `manual_step`, or `omit` |
| `supported` + `none` | `insufficient_evidence` |
| `supported` + `projected` | `claim_projection_only` |
| `supported` + `runtime_detected` | `claim_runtime_detection_only` |
| `supported` + `executed` | `claim_execution_only` |
| `supported` + `behavior_verified` | `claim_behavior_verified` |

Missing repository, diff, skill-load, runtime, or verification evidence remains unavailable or insufficient. Hook or collector failure may lower observability confidence; it must not silently change the engineering decision unless the missing evidence is required for that decision.

## Deterministic rendering contract

A renderer consumes only:

1. the canonical revision and digest named by the profile;
2. the profile itself;
3. explicitly named adapter-owned renderer inputs.

`rendering.renderer_inputs` separates `canonical` and `adapter_owned` inputs. Every entry records a normalized path, semantic role, and SHA-256 digest. `renderer_profile` and `rendering.plan_shaping_options` select the installer plan whose resolved Skill/template/runtime/config closure must exactly match those entries. Plan-shaping options are `skills`, `skip-runtime`, `skip-hooks`, `skip-prompts`, and `skip-command`; they change renderer inputs or projected bytes and therefore participate in the pure projection fingerprint. Canonical input paths are also the exact `canonical_contract.source_paths`; adapter-owned inputs are hashed separately and never folded into canonical ownership. Adapter ID, renderer ID, renderer version, pure plan builder, input closure, and managed-asset projection are one registry entry; aliases or independent parallel resolvers are invalid.

The deterministic boundary ends at the pure source projection plan. Applying that plan to a target is state-dependent. `force`, previous state, target partial-file state, and whether stale ownership is pruned affect lifecycle application rather than source projection bytes. The plan builder receives the selected profile, plan-shaping options, previous state, and prune policy and returns both `projected_managed_assets` and the post-apply `actual_installed_inventory`. Without prune, the latter includes retained stale ownership from the previous state.

Applied provenance records CLI options, source revision, previous managed-state digest, the managed subset digest for partial files, and the pre-apply target partial-file state digest for settings such as merged hooks. Install state separates `last_applied_provenance` from `last_changed_provenance`: every successful invocation refreshes the former, while only a managed-byte or managed-subset mutation advances the latter. Managed-subset identity covers projected inventory, actual inventory including retained-stale classification, selected Skills/commands/prompts/runtime, and partial ownership. Changing Git revision or target-owned hook state therefore changes persisted application provenance without pretending the pure source plan changed or sacrificing managed-byte idempotency.

For identical inputs it must produce the same managed asset bytes and provenance metadata. Every generated asset records or is covered by:

- `profile_id` and adapter ID;
- canonical revision and source digest;
- renderer ID and renderer version;
- managed path ownership;
- drift policy;
- supported lifecycle operations.

Renderer output may contain tool-native prompts, commands, hooks, permissions, or runner configuration. It may reference canonical contracts but must not fork their normative content. A renderer must fail or report drift when its named canonical digest no longer matches the input source.

### Codex compact runtime profiles

Codex explicit entry prompts are adapter-rendered compact profiles. When the command already fixes implementation, investigation, review, verification, or handoff mode, the rendered profile invokes its primary canonical contract directly and skips `operating-mode-router` and `skill-router`. Review still uses `review-router` because changed-file signals determine its required gates. Decisive signals that remain unknown after task-class selection map directly to their canonical contracts through `schemas/compact-profile-control-map.json`; they are not removed with the upper routers. Skipping an upper router does not remove scope, verification, risk, approval, evidence, stop, or output constraints.

Shared adapter runtime profile schema revision `1.1.0` defines `rendering.compact_profiles`. The Codex plan derives prompt metadata and install-state copies from that shared profile field; those copies are generated provenance, not an independent schema or source of truth. The header references the shared `canonical_contract.revision`, byte-preserving `canonical_contract.source_digest`, and `profile_fingerprint`; it defines no second canonical digest.

The prompt body remains self-contained for critical controls because Codex-controlled Skill loading is not guaranteed to be observable. Scope, verification, risk/approval, evidence, missing-evidence, and output fallback text is generated from the typed attributes in `schemas/compact-profile-control-map.json`, not hand-maintained in prompt templates. Risk attributes require exact action, risk classification, impact, reversibility, external visibility, safer alternative, preconditions, specific-action approval, and approved-action-only execution. Unknown controls, changed required attributes, general approval, and hand-maintained control text fail rendering. Runner preflight and the static doctor probe separately compare the shared projection's raw renderer-input digests with root canonical sources and verify every selected Codex discovery asset at `.agents/skills/<skill>/SKILL.md` against its `codex_skill` managed record. A root canonical Skill never substitutes for a missing, modified, non-regular, or symlinked Codex discovery asset.

Codex diagnostics keep projection, load, output, and application claims separate:

1. `requested_contracts` lists intent and does not create an evidence level;
2. matching installer state and managed prompt bytes use canonical `evidence_level: projected`;
3. runner-observed prompt/profile detection uses `evidence_level: runtime_detected`; Codex-controlled contract loading remains `evidence_level: none` with missing evidence;
4. a bounded output accepted by `ask-sensors` uses `evidence_level: executed` only for the inspected output contract. Workflow-contract, risk/approval-contract, and verification-contract application remain `evidence_level: none` unless separately observed; the runner's overall `executed` status does not upgrade them.

`ask-doctor --runtime-probe` validates requested metadata, projected bytes, canonical source digests, prompt references, and state consistency only. It reports runtime load, applied-output, workflow, risk/approval, and verification application evidence as unavailable because it does not execute Codex.

`generated_assets.managed_assets` is the static projected inventory for the Profile's declared plan-shaping options. Each entry names a normalized relative path, asset kind, ownership mode (`full_file`, `selected_files`, `partial_file`, or `runtime_directory`), and inventory source. `asset_kinds` and inventory kinds must cover each other. The shared pure plan builder resolves the exact Skill, command, prompt, non-core required asset, runtime file, partial file, and runtime directory set; the validator consumes that same builder. Validation rejects both missing and unexpected static entries and requires the registered inventory source to be a regular, non-symlink file.

The applied install state separately records `actual_installed_inventory`. It must exactly cover the state-owned full files, partial files, and runtime directories after application, including retained stale entries only when prune is disabled. Removing a managed partial subset may retain its pre-change value in the rollback snapshot without retaining current lifecycle ownership. Rollback and detach consume this actual state boundary, not the static Profile inventory.

Absolute paths, `..`, non-normalized paths, symlink traversal, and canonical/core-owned targets are forbidden. In particular, adapters cannot own root `AGENTS.md`, `CUSTOM_INSTRUCTIONS.md`, `manifest.json`, canonical `skills/`, canonical `schemas/`, or canonical contract documents. Install/update/rollback/detach must use the same inventory boundary.

## Privacy and event boundary

Profiles declare whether event collection is disabled, local opt-in, or locally enabled. External publication remains `disabled` or `approval_required`; a profile cannot silently enable it. Raw prompts and sensitive payload storage are prohibited by this schema. Normalized event schema references identify event meaning, not proof that a collector ran. `local_opt_in` and `local_enabled` require at least one regular, non-symlink schema registered by path and matching `$id` in `schemas/normalized-event-schema-registry.json`.

## Conformance and consumers

`docs/fixtures/adapter-runtime-profiles.json` contains representative Claude and Codex profiles, and `docs/fixtures/adapter-runtime-evidence.json` contains their typed repository evidence records. `node scripts/validate-repo.mjs` checks profile structure, required capability coverage, support/evidence downgrade consistency, provenance, lifecycle ownership, privacy boundaries, and the absence of model-dependent fields.

Projection evidence is profile-scoped. It records `profile_id`, `renderer_profile`, and a profile fingerprint derived from canonical digest, renderer ID/version/profile, plan-shaping options, renderer input digest, and static projected inventory digest. The repository fixtures provide evidence only for their declared default options; a non-default plan must use its own projection fingerprint and cannot reuse that static Profile evidence. Adapter-global evidence must declare a different scope and cannot satisfy a profile projection claim. Registered verifier fixtures bind both their declared verifier path and executable check callback.

Child runtime work in #163 and #164 must consume this contract and schema. Those implementations may add adapter-owned renderer or collector fields only through a schema revision; they must not add independent canonical workflow, risk, evidence, lifecycle, traceability, or normalized-event definitions.

## Compatibility rule

Schema additions are backward-compatible only when existing profiles remain valid and existing downgrade behavior is not weakened. Renaming or removing capability IDs, changing downgrade meaning, or changing canonical ownership requires an explicit schema version change and migration guidance. Generated assets remain replaceable projections and must retain rollback and detach paths.
