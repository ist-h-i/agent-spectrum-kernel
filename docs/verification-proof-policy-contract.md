# Verification Proof Policy Contract

Policy revision `ask.verification-proof-policy@1.0.0` defines the one
adapter-neutral authority for choosing how a verification obligation is
represented. Its canonical machine-readable contract is
`schemas/verification-proof-policy.schema.json`; adapters, Skills, lifecycle
documents, and prompts project that revision and do not define another path
vocabulary or selector.

## Responsibility boundary

This policy owns:

- selection of exactly one verification proof path before an implementation
  completion claim;
- the closed compact-eligibility and formal-trigger vocabularies;
- the bounded authority of a Compact Proof;
- the only valid path transition and its evidence-retention rule; and
- compatibility between new selections and existing Formal Verification
  Contract artifacts.

The canonical Schema owns the exact fact IDs, trigger IDs, path values, record
shape, and structural transition constraints. This document explains their
meaning; copied ID lists in lifecycle docs, Skills, prompts, or adapters are not
selection authority. `scripts/verification-proof-policy.mjs` evaluates the
canonical records rather than inferring a path from prose or a diff.

This policy does not own command execution, execution-evidence storage or
producer trust, Asset identity, Portfolio activation, checkpoint state,
Execution Envelope authority, approval, release state, or benchmark outcomes.

## Exactly two paths

When verification applies, a valid selection chooses exactly one of:

- `compact_proof`; or
- `formal_verification_contract`.

There is no third fallback path. A selection record is not required when the
task makes no behavior, correctness, or completion claim. Otherwise selection
occurs from observed task, risk, scope, applicability, and upstream-proof facts
before the implementation completion claim. A label, prose assertion, small
diff, or adapter profile name is not selection evidence.

Compact selection is valid only when every compact-eligibility fact defined by
the canonical Schema is evidenced and no formal trigger is present. In human
terms, the work is localized and reversible, has one observable behavior and
one focused check, stays within one session without durable handoff, crosses no
protected boundary, has consistent local upstream proof, and supports only its
localized completion claim. The corresponding lifecycle `claim_type` remains
the canonical `completion`; localization is a proof-policy eligibility
constraint, not a parallel claim vocabulary.

The formal path is required whenever the Schema identifies a formal trigger or
compact eligibility is incomplete. The trigger vocabulary covers work whose
proof depends on reproduction or regression, public or cross-module contracts,
state or lifecycle behavior, protected risk or external effects, hard-to-reverse
boundaries, performance or reliability, multiple actors or sessions, stable
merge/release trace, specialized checks, unresolved upstream proof, or an
explicit formal request. This description does not extend or replace the
Schema's closed trigger IDs. Unknown fact or trigger IDs are invalid rather
than new policy extensions. Every formal selection names at least one canonical
formal trigger; an empty trigger set cannot authorize that path.

## Compact Proof semantics

`compact_proof` is a verification proof artifact for one bounded localized
completion. Its human rendering remains exactly:

```text
Proof:
- Behavior:
- Focused check:
- Result or missing evidence:
- Broader check required when:
```

The canonical data record binds that rendering to:

- the selected localized behavior;
- one focused check ID and exact command;
- either an observed `passed` or `failed` result, or an explicit `missing`
  result;
- for an observed result, the same check ID and command, exact exit/result
  text, and at least one execution-evidence reference; and
- the condition that requires broader verification.

A `passed` result supports completion only when its evidence reference resolves
to matching observed execution evidence under the current evidence authority.
A `missing` result records the next check required. A `missing` or `failed`
result is recordable but is insufficient for a completion claim. Schema
validity or self-consistent prose alone is not proof that a command ran.

Compact Proof may support only the localized behavior completion represented by
its selection. It cannot authorize merge, release, performance, security,
reliability, broad no-regression, production, external-readiness, or any other
claim for which the canonical Schema requires the formal path.

Compact Proof is distinct from all of the following:

- the generic lifecycle artifact whose `artifact_type` is `compact`;
- the no-claim localized trace exemption in
  `docs/lifecycle-traceability-contract.md`; and
- the Codex compact runtime profile.

None of those concepts selects or implies `compact_proof`.

## Formal Verification Contract compatibility

`formal_verification_contract` uses the existing Verification Contract shape
defined by `docs/lifecycle-artifact-contract.md`. Existing lifecycle artifacts
whose `artifact_type` is `verification` remain valid and readable without
rewriting, migration, or reserialization. A formal selection references the
existing artifact ID; it does not copy the contract into the selection record.

Merge and release claims always use the formal path and the stable trace mapping
required by `docs/lifecycle-traceability-contract.md`. A formal trigger found
after an initial compact selection also activates the formal path; retained
compact evidence does not waive a new formal obligation.

## Monotonic selection history

A selection history permits an initial compact or formal selection and one
direction of transition:

```text
compact_proof -> formal_verification_contract
```

The formal path is absorbing. Resume, a failed check, adapter change, or a new
selection attempt cannot restore compact after formal was selected. Upgrade
retains every already executed compact evidence reference. Retention preserves
history; it does not assert that an earlier focused check satisfies a newly
discovered formal obligation.

Conflicting upstream proof does not permit the consumer to choose a convenient
path or omit a trigger supplied by the selector. The canonical selector compares
JSON-compatible values for each upstream field, selects the formal route when
one field has distinct values, and validation requires the
`missing_or_conflicting_upstream_proof` trigger. The selection remains blocked
until the conflict is resolved by the owning lifecycle authority.

## References and evidence authority

Implementation output references the selected proof selection/artifact and its
executed evidence. It does not repeat unchanged Compact Proof or Formal
Verification Contract fields. Lifecycle claim mapping remains governed by
`docs/lifecycle-traceability-contract.md`.

An execution-evidence reference resolves either against the bounded current
execution observation supplied to the verifier or against the existing Issue
#274 verification-evidence boundary. This policy creates no evidence store,
mutable proof-path registry, admission state, or alternate provenance model.
Issue #275 may carry references across a checkpoint but cannot downgrade a
formal selection. Issues #276 and #277 may later identify and activate an exact
policy Asset revision; neither owns per-task proof-path selection.

## Compatibility and validation

- Legacy Formal Verification Contract artifacts remain unchanged and readable.
- Historical pre-compact prompt fixtures and benchmark oracles are not migrated
  by this policy.
- Adapters must project the same policy revision and both path values, then
  reject a projected path that disagrees with the canonical selection.
- Deterministic byte comparisons establish two separate proxies: the Compact
  Proof rendering is smaller than a fixed formal block, and the generated
  localized Codex verification prompt is smaller than its immutable
  pre-compact formal-prompt fixture. Neither establishes token, latency,
  quality, runtime activation, or benchmark effectiveness.
- Rolling back adapter projections restores the prior formal-selection behavior;
  it does not erase selection history, rewrite evidence, or reinterpret an
  existing formal artifact.
