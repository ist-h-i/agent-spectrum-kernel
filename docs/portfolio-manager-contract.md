# Local Portfolio Manager Contract

This document defines the local Portfolio Manager boundary for Issue #277. It
builds on the Asset Registry contract from Issue #276 and the exact verification
evidence contract from Issue #274. Contract text is not evidence that a
particular manifest, lock, selection, or repository revision passed validation.

The closed Schemas are authoritative for serialized field names and enum
spellings. This document uses conceptual names when the invariant does not
depend on a particular spelling. A consumer must not use that distinction to
accept aliases, unknown fields, or open-ended values: persisted objects and
selector inputs remain closed at the Schema boundary.

## Responsibility and authority boundary

The Portfolio Manager owns immutable Portfolio configuration, exact lifecycle
history, deterministic pre-result resolution, and typed failure disposition. It
does not own candidate generation, Asset admission, evaluation, execution, or
external authority authentication.

These non-equivalences are normative:

```text
manifest stored
!= manifest current
!= Asset selected
!= Asset projected or installed
!= Asset executed
!= Asset demonstrated effective

Asset current in a registry snapshot
!= Asset active in a Portfolio

Asset registration authority
!= verification-evidence producer or evaluator
!= Portfolio activation authority
!= Portfolio rollback authority

selection digest
!= evaluation result
!= promotion recommendation
```

In particular, writing a valid manifest to the shared content-addressed store
does not activate it. A manifest becomes current only through an exact verified
Portfolio lock transition. Resolving a current manifest produces a decision
record; it does not execute the selected Assets or establish that they work.

## Shared storage and identity

Every persisted Portfolio manifest, lock, authority-context object, selector
context, and selection record uses the canonical JSON content-addressed store
shared with Issues #274 and #276. Portfolio code must reuse its
canonicalization, SHA-256 identity, bounded-object checks, stable reads,
path-containment checks, and immutable no-replace publication.

The Portfolio Manager must not create:

- a Portfolio-only CAS or object layout;
- a second digest or canonicalization algorithm;
- a mutable `latest` or mutable `current` pointer;
- a database or mutable index that has lifecycle authority;
- a path, timestamp, or process-local identifier that substitutes for an exact
  content address.

The word `current` below is a state inside one exact verified lock. A caller
must supply that lock by exact identity; the manager never discovers currentness
through a mutable lookup.

Unordered sets are normalized in locale-independent code-unit order before
identity calculation. Persisted objects that are not already in canonical
order fail verification rather than being silently rewritten.

## Closed object model

Issue #277 has five closed objects or inputs:

1. an immutable Portfolio manifest revision;
2. a full immutable Portfolio lock;
3. a caller-supplied Portfolio authority context;
4. a closed pre-result selector context;
5. a Portfolio selection record derived from that exact context.

Unknown object kinds, contract revisions, fields, enum members, duplicate set
members, mutable references, and unresolved internal contradictions fail
closed.

### Portfolio manifest

A manifest is stored configuration without activation authority. It binds all
of the following as one immutable revision:

- stable Portfolio identity, positive revision, represented source revision,
  repository identity, and lifecycle scope;
- the exact Asset Registry identity, snapshot revision, and snapshot digest;
- zero or more exact five-field Asset references, each with its expected
  Registry state and lifecycle scope;
- each Asset's Portfolio role (`baseline`, `challenger`, or `experimental`) and
  assurance lane (`exploratory`, `challenger`, `admitted`, or
  `high_impact_active`);
- closed positive and negative selectors for task class, project, model,
  adapter, stack, domain, required capabilities, and risk class;
- exposure mode (`active`, `shadow`, or a bounded `canary`), prohibited task
  classes, activation requirements, and an explicit failure action for every
  eligibility condition;
- token, duration, and cost estimates represented as known values or explicit
  unknowns, plus exact limits and safety guardrails;
- exact verification-evidence requirements, accepted producer/evidence levels,
  required obligations, material freshness and invalidation identities;
- approval constraints and explicit conflict handling; and
- the exact rollback target manifest and expected Asset-set digest, or an
  explicit initial form with no rollback target.

An exact Asset reference means stable Asset ID, version, Asset type, record CAS
digest, and content-package CAS digest. Stable IDs, versions, filesystem paths,
or mutable branch names alone are not resolvable Portfolio references.

Zero Asset entries is not an omitted decision. It is the explicit Kernel-only
Portfolio form. An empty or absent list in any other form must not be interpreted
as a request for Kernel-only or Full ASK.

A manifest is invalid when it contains contradictory include/exclude values,
ambiguous overlapping selectors without an explicit conflict rule,
role/lane/exposure contradictions, an Asset outside the bound Registry scope or
applicability, a rollback target with a different Portfolio identity or scope,
or any reference whose exact identity cannot be reconstructed.

### Registry state, role, and exposure

Portfolio eligibility does not weaken Asset Registry lifecycle rules:

| Portfolio use | Permitted Registry state | Permitted exposure | Additional condition |
|---|---|---|---|
| exploratory experiment | `candidate`, `admitted`, or `current` | `shadow` only | It cannot change the active baseline. |
| challenger comparison | `candidate`, `admitted`, or `current` | `shadow` or bounded `canary` | Canary bounds and prohibited tasks are exact manifest inputs. |
| admitted baseline | `current` only | `active` | Normal activation authority is required. |
| high-impact active | `current` only | `active` | Exact separately trusted activation approval is required. |

An Asset revision that is `historical`, `superseded`, or `retired` in the bound
Registry snapshot is ineligible for new selection. A candidate whose Registry
metadata excludes automatic Portfolio activation may be represented only in an
allowed shadow/challenger use. It must not silently become the active baseline.

### Portfolio lock

The lock is the sole Portfolio lifecycle commit marker. It is a complete
immutable snapshot, not a mutable pointer or an authorization delta. It binds:

- the stable Portfolio identity, positive lock revision, repository identity,
  and lifecycle scope;
- the exact predecessor lock, or an explicit empty initial form;
- a deterministically ordered complete inventory of exact manifest revisions
  and digests in lifecycle states `current`, `historical`, `superseded`, or
  `retired`;
- the exact authority-context digest for each non-empty successor transition;
- the exact current-manifest digest; and
- the exact digest of the current manifest's Asset set.

The empty initial lock has no entries, no current manifest, and no authority
context. Every non-empty successor requires a separately supplied exact
Portfolio authority context. Every non-empty verified lock has exactly one
`current` entry. Historical, superseded, and retired entries remain
reconstructable and are ineligible for default resolution.

Lock verification starts from the initial lock and verifies every predecessor
and successor. It re-reads every manifest and the exact bound Registry snapshot,
then closes every Asset reference, expected state and scope, dependency, and
required authority context. A missing predecessor, skipped revision, partial
transition, transplanted manifest, wrong Asset digest, unknown lifecycle state,
or mismatch between current manifest and Asset-set digest invalidates the
complete lock. Verification never returns a partial history as current.

### Portfolio authority context

Portfolio authority is a caller-supplied current trust root. The local manager
verifies the context's closed shape, internal digest, Portfolio/repository/scope
binding, exact predecessor lock, complete transition batch, authority kind,
authority identity and revision, and immutable authority-evidence digest. It
reconstructs the only permitted successor lock from those inputs.

The caller is responsible for establishing that the supplied authority identity
and evidence are currently trusted. The local validator does not authenticate
an organization, repository host, or human identity. It also must not infer
Portfolio authority from any of the following:

- a manifest or Asset digest;
- an Asset Registry lifecycle context;
- Asset owner, author, or repository metadata;
- successful registration or validation;
- a verification-evidence object, producer, or evaluator;
- a result, score, or recommendation; or
- the existence of an older lock or rollback target.

Normal activation and rollback are different authority kinds. A normal
activation context may add an absent exact manifest as current, atomically move
the former current to historical or superseded, or retire an eligible
non-retired manifest. It cannot reactivate a historical or superseded manifest.
Only an exact rollback context may perform that reverse transition. Retired is
terminal.

### High-impact activation approval

The `high_impact_active` lane requires an exact approval supplied through a
separately trusted activation authority. That approval must bind the exact
manifest revision and digest, exact Asset set, repository and lifecycle scope,
risk/task applicability, authority identity and revision, and immutable approval
evidence. It is additional to ordinary activation and must satisfy the
manifest's closed independent-review constraint. A related Asset, an older
version, the same owner, an approval of the Registry lifecycle state, or a broad
unbound approval cannot satisfy it.

Missing or unknown operational metadata cannot be interpreted as evidence that
activation is low impact. If the manager cannot establish the bounded exposure,
prohibited-task enforcement, required capability state, safety constraints, or
exact approval for a high-impact activation, resolution stops. No downgrade may
erase the fact that high-impact approval was required.

## Closed pre-result selection boundary

Portfolio resolution occurs before Asset execution and before result material
exists. The closed selector context may contain only:

- the exact Portfolio lock identity;
- exact repository, project, source revision, and tree identities;
- task class, model, adapter, stack, domain, and risk class;
- actual adapter/runtime capabilities known at the boundary;
- bounded operation scopes known at the boundary;
- token, duration, and cost budgets, each represented as known with a value or
  unknown without one; and
- exact current-state or invalidation digests required by the manifest.

The selection phase is explicitly pre-result. Timestamps are not part of its
digest identity. The selector must recursively reject keys, labels, or nested
payloads that encode or semantically substitute for:

- `result`, `score`, `correctness`, `recommendation`, or `completion_claim`;
- measured outcomes, post-execution telemetry, or observed quality;
- hidden tests, hidden answers, oracle material, or private evaluator outcomes;
- evaluator decisions, promotion decisions, or post-result classifications;
- outputs or artifacts produced after the exact selection boundary.

Renaming, nesting, encoding, or wrapping outcome-derived material does not make
it a valid selector input. The public selection operation accepts structured
closed input, not arbitrary directories. A wrapper that derives input from a
filesystem must apply the repository's existing result-like artifact rejection
before calling the manager and must not pass mutable file contents after the
selection boundary.

The selection record itself may report the manager's typed pre-result decision.
It must not contain an evaluation outcome or promotion recommendation.

## Applicability and capability resolution

Applicability is evaluated independently for project, model, adapter, stack,
domain, task, risk, and capability dimensions. For every dimension:

- an explicit exclusion wins over an inclusion;
- `unknown` is not equivalent to unrestricted;
- an empty value is not interpreted as either unknown or unrestricted;
- unresolved include/exclude conflicts fail closed;
- a match in one dimension does not waive a mismatch in another; and
- adapter capabilities are actual selector facts, not inferred from the model
  name or another adapter.

An Asset cannot be transplanted to a different project, model, adapter, stack,
domain, risk class, or lifecycle scope merely because its digest verifies. A
missing required capability produces the manifest's explicit typed failure
action. Adapter differences remain visible in the selection record, including
any allowed downgrade; they are never normalized away as a successful full
selection.

Prohibited task classes override positive selectors, challenger/canary
eligibility, and general approval. A canary must have exact deterministic bounds;
an absent or unknown bound is not an unbounded canary.

## Evidence and exact material freshness

Evidence requirements reuse the Issue #274 verification-evidence and exact
reuse contracts. For each requirement, the manager binds the expected evidence
identity, target repository/revision/tree, consumed-input identities including
the exact Portfolio selection-basis digest, gate and command identities, runner
and adapter, toolchain and environment, accepted producer/evidence level,
required obligations, and exact current-state/invalidation identities. Each
requirement includes a `repository-tree` current-state reference equal to its
verification target tree; any additional state references are matched by exact
ID and digest at pre-result selection time.

The manager validates a reuse plan against the actual evidence objects in the
shared CAS. Exact reuse, or an independent-judgment disposition explicitly
allowed by the manifest, is eligible only when every required material binding
matches. Missing evidence, an authority or coverage mismatch, a non-passing
record, an exact PASS/FAIL conflict, an unknown dependency, or an invalidation
digest change is not fresh evidence and must take the configured typed failure
path.

Freshness in this contract is exact material-identity freshness. It is not age,
wall-clock TTL, file modification time, or a mutable "last checked" value. The
manager must not claim temporal freshness unless a later contract supplies an
exact external currentness authority. Stale evidence cannot remain selectable
through omission or a default; any permitted exception must itself be an exact,
explicitly trusted input recognized by the manifest contract.

## Budgets and unknown values

Token, duration, and cost estimates and limits preserve the distinction between
known and unknown. Unknown is not zero, free, within budget, or unlimited.

When a rule needs a value that is unknown, the manager applies the manifest's
explicit unknown-budget action. When a known value exceeds a bound, it applies
the explicit over-budget action. Those actions may be bypass or stop as allowed
by the closed rule; they cannot silently select the Asset. A downgrade is valid
only when the manifest defines a lower bounded mode whose own requirements and
budget are satisfied.

## Typed deterministic resolution

For the same verified lock, authority contexts, selector context, budgets,
Registry snapshot, and exact evidence state, resolution must produce
byte-identical canonical selection content and the same CAS digest.

The manager evaluates in this order:

1. full lock history and every trusted Portfolio authority context;
2. the sole current manifest and its exact shared-CAS address;
3. the exact Registry snapshot/history and required Asset lifecycle contexts;
4. every Asset reference, expected state and scope, dependency closure, and
   applicability;
5. selectors, exclusions, prohibited tasks, capabilities, exposure and lane
   rules, safety constraints, and budgets;
6. exact verification evidence and material freshness; and
7. high-impact activation approval.

Expected eligibility failures use closed typed decisions: `bypass`,
`downgrade`, or `stop`. A successful bounded selection uses `selected`. The
fixed precedence is:

```text
stop > downgrade > bypass > selected
```

Within one severity, reason codes are code-unit sorted. Selected and omitted
Assets use a stable order over stable Asset ID, version, record digest, and
role. Structural, Schema, CAS, tamper, history, or authority-closure corruption
must prevent selection; a caller may surface that prevention only as a typed
stop, never as an ordinary fallback.

A bypass is explicit. It records that bypass was used, a non-empty closed
reason set, no selected Assets, and the exact inputs that caused it. An empty
selection is not an implicit bypass.

A downgrade is explicit. It records omitted and retained Assets, affected
capabilities, budget disposition, and exact typed reasons. Its effective Asset
set and evidence assurance must not be greater than the verified inputs. A
missing capability or evidence requirement cannot be relabeled as a successful
undowngraded selection.

A stop decision carries one or more closed Portfolio reason codes. Mapping a
Portfolio decision into an execution-envelope stop reason is a consumer
responsibility outside this manager; a generic string or thrown-message parser
does not establish that mapping.

The selection record binds the exact lock, current manifest, Registry snapshot,
authority contexts through the verified lock, the stored exact selector-context
object and its self digest, evidence and budget identities; explicit selected
and omitted Assets; adapter/capability downgrades; budget disposition; rollback
target; typed reasons; and its own digest calculated with the digest field
excluded. Publication to the shared CAS proves record identity only. It does
not execute the record or authorize a later promotion.

There is no default or fallback result named Full ASK. Kernel-only may be
selected only by an explicit zero-Asset current manifest or an explicit typed
fallback rule in the verified manifest. A missing, invalid, stale, conflicting,
or inapplicable Portfolio must not silently activate Full ASK.

## Exact rollback

Rollback is a lifecycle operation, not a Portfolio role and not a result-driven
recommendation. It requires a separate exact rollback authority context. The
target must be an exact `historical` or `superseded` manifest in the verified
predecessor lock for the same Portfolio, repository, and scope.

The rollback transition binds:

- the exact predecessor lock and complete atomic transition batch;
- the target manifest revision and digest;
- the target's expected Registry snapshot and exact Asset-set digest;
- the former current manifest and its resulting non-current state; and
- rollback authority identity, revision, and immutable evidence digest.

Verification re-resolves the target manifest and exact Asset set. A missing or
changed reference, Registry/Asset transplant, digest drift, scope mismatch,
retired target, or incomplete transition stops rollback. The manager must not
substitute a newer Asset revision, a mutable current Registry entry, or a
similar manifest.

A successful rollback atomically makes the exact target current and moves the
former current out of current. It preserves every lock, manifest, selection,
and authority-history object; it does not delete, overwrite, or rewrite prior
history. The successor lock's current-manifest and Asset-set identities must
equal the exact target identities.

## Samples and benchmark non-mutation

Checked samples may bridge to existing benchmark condition IDs and frozen
configuration digests by exact reference only:

- Kernel-only uses an explicit zero-Asset current manifest.
- Adaptive ASK may reference the checked candidate Assets only in permitted
  shadow/challenger lanes. When their Registry state or activation metadata is
  insufficient, the sample records the corresponding typed downgrade or bypass
  and does not claim active execution.

The current ASK Skills are initial reference Assets, not a permanent mandatory
bundle. Representing them in a sample does not authorize them for every task,
project, model, adapter, capability set, or risk class.

Portfolio fixtures, generators, and tests must not modify benchmark configs,
fixtures, pre-result selections, normalized results, evaluator outputs, scores,
reports, or frozen result digests. A bridge proves exact correspondence to an
existing condition identity; it is not a new benchmark result or effectiveness
claim.

## Consumer obligations

A consumer of this contract must:

- verify the complete lock, exact current manifest, Registry snapshot, Asset
  closure, authority contexts, and exact evidence before resolution;
- provide the actual adapter capabilities and preserve unknown budget or
  applicability values;
- act only on an explicit typed selection result;
- preserve the exact selection digest if a later execution or evaluation needs
  to cite what was selected; and
- keep execution and post-result data outside the pre-result selector boundary.

The exact selection identity and its evidence bindings are designed for reuse
through the Issue #274 evidence boundary and for consumption by Issues #197 and
#198. Those consumers do not gain Portfolio activation or rollback authority by
reading the record.

The Portfolio Manager exposes local operations for manifest validation and
publication, empty-lock creation, exact authority-context construction,
lifecycle transition and verification, current-manifest resolution,
pre-result selection publication/verification, exact rollback, and portable
sample references. These operations do not expose mutable latest lookup, trusted
authority injection through public CLI flags, outcome-derived selector input,
or timestamps in digest identity.

## Deferred work

The following are deliberately outside Issue #277:

- candidate generation, mutation, autonomous promotion, and the Issue #278
  evolution/evaluation loop;
- scoring, recommendation, evaluator-authority changes, and private evaluator
  execution;
- Asset installation, adapter projection, runtime execution, and new adapter or
  stack overlays;
- hosted distribution, remote coordination, mutable indexes, garbage
  collection, deployment, and organizational authority authentication;
- claims of effectiveness, safety, cost benefit, or product value; and
- a single scalar score that erases safety, cost, variance, applicability, or
  task-class differences.

Those later systems may consume exact Portfolio identities. They must not
retroactively alter a manifest, lock, authority context, pre-result selection,
or frozen benchmark result governed by this contract.
