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

For identical inputs it must produce the same managed asset bytes and provenance metadata. Every generated asset records or is covered by:

- `profile_id` and adapter ID;
- canonical revision and source digest;
- renderer ID and renderer version;
- managed path ownership;
- drift policy;
- supported lifecycle operations.

Renderer output may contain tool-native prompts, commands, hooks, permissions, or runner configuration. It may reference canonical contracts but must not fork their normative content. A renderer must fail or report drift when its named canonical digest no longer matches the input source.

## Privacy and event boundary

Profiles declare whether event collection is disabled, local opt-in, or locally enabled. External publication remains `disabled` or `approval_required`; a profile cannot silently enable it. Raw prompts and sensitive payload storage are prohibited by this schema. Normalized event schema references identify event meaning, not proof that a collector ran.

## Conformance and consumers

`docs/fixtures/adapter-runtime-profiles.json` contains representative Claude and Codex profiles. `node scripts/validate-repo.mjs` checks profile structure, required capability coverage, support/evidence downgrade consistency, provenance, lifecycle ownership, privacy boundaries, and the absence of model-dependent fields.

Child runtime work in #163 and #164 must consume this contract and schema. Those implementations may add adapter-owned renderer or collector fields only through a schema revision; they must not add independent canonical workflow, risk, evidence, lifecycle, traceability, or normalized-event definitions.

## Compatibility rule

Schema additions are backward-compatible only when existing profiles remain valid and existing downgrade behavior is not weakened. Renaming or removing capability IDs, changing downgrade meaning, or changing canonical ownership requires an explicit schema version change and migration guidance. Generated assets remain replaceable projections and must retain rollback and detach paths.
