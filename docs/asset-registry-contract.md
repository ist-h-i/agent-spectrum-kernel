# AI Engineering Asset Registry Contract

This document defines the closed local Asset contract and registry semantics for Issue #276. The repository contains the corresponding Schemas, operations, and candidate-only sample, but this contract text alone is not evidence that a particular revision passed its required checks.

Contract revision `1.0.0` supports three Asset types: `skill`, `prompt`, and `evaluator_reference`. A later type must extend the closed union deliberately. It must not fork the common identity, provenance, lineage, dependency, lifecycle, or authority model.

## Responsibility boundary

The Asset registry owns immutable Asset identity, reconstructable metadata and history, exact dependency and derivation closure, and recorded lifecycle state under an exact registry snapshot.

It does not own Portfolio selection, adapter projection, installation, execution, evaluation results, or product-value claims. These non-equivalences are normative:

```text
content stored
!= Asset registered
!= Asset validated
!= Asset admitted
!= Asset current
!= Asset active
!= Asset executed
!= Asset demonstrated effective

valid verification evidence
!= registered Asset
!= admitted Asset
!= current or active Asset
```

The terms mean:

| Term | Meaning | Authority not implied |
|---|---|---|
| stored | An immutable object exists at its verified digest in the shared CAS. | Registry membership, lifecycle state, provenance, or quality. |
| registered | An exact verified registry snapshot contains the Asset record and content reference. | Validation outcome beyond registry invariants, admission, or currentness. |
| validated | A named validator checked a stated contract against exact bytes and inputs. | Organizational approval, admission, or runtime selection. |
| admitted | A separate lifecycle authority permits bounded eligibility in an exact scope. | Currentness or activation. |
| current | The registry-authorized current revision for one stable ID and lifecycle scope. | Membership in an active Portfolio. |
| active | A later Portfolio authority selected an exact Asset reference for a runtime role. | Execution or demonstrated effectiveness. |
| executed | A runtime used an exact projected Asset. | Correctness, safety, or value. |
| demonstrated effective | Evaluation evidence supports a bounded outcome claim. | General effectiveness outside the measured conditions. |

An Asset's `current` state and a Portfolio's `active` selection are separate. Issue #277 owns baseline, challenger, bypass, and rollback Portfolio decisions. Registration or a registry lifecycle transition must not change runtime defaults.

## Shared storage boundary

All immutable registry objects use the generic canonical JSON CAS established by Issue #274 and ADR-0001. The shared store supplies:

- SHA-256 canonical object identity;
- bounded object size;
- strict JSON parsing with duplicate-key rejection;
- canonical-form, stable-read, object-address, and tamper checks;
- normalized path containment and prohibited-symlink checks at filesystem ingress;
- immutable no-replace publication and deterministic listing.

The CAS proves object-byte integrity only. Its directory layout, a successful write, an object digest, or a verification-evidence producer signature cannot establish Asset registration or lifecycle authority.

The Asset layer may define closed object Schemas over CAS bytes. It must not define a second CAS directory, digest algorithm, canonicalizer, path-safety implementation, or mutable latest pointer.

## Closed v1 object model

The v1 model has four closed object kinds. Unknown fields, object kinds, Asset types, enum members, or contract revisions fail validation.

### Asset content package

An Asset content package is one bounded canonical JSON object containing the exact public files that make up one Asset revision. It binds:

- contract revision and object-kind discriminator;
- Asset type;
- a normalized, deterministically ordered file inventory;
- for every file, its repository-independent relative path, media type, encoding, byte length, byte digest, and encoded bytes;
- the type-specific content extension described below.

Paths use normalized repository-relative POSIX form. Absolute paths, empty or dot segments, traversal, duplicate normalized paths, prohibited symlink traversal, and file inventory drift fail closed. Encoded bytes must round-trip to the declared length and digest. The package's CAS digest binds the complete inventory, metadata, and bytes.

The package contains public Asset material only. It does not contain credentials, private evaluator logic, mutable filesystem paths, execution transcripts, or organizational approval claims.

### Asset record

An Asset record binds one logical revision to one exact content package. Its common fields cover:

- `asset_type`, stable Asset ID, and version;
- exact content-package CAS digest and content-byte identities;
- source kind and source reference, provenance evidence, and repository revision when applicable;
- represented license and owner claims with evidence status;
- exact parent and bounded derivation lineage;
- exact Asset dependencies and ASK contract compatibility;
- positive applicability for model, adapter, stack, domain, project, and task class;
- explicit non-applicability and required capabilities;
- requested permissions, possible effects, and safety classification;
- expected mechanism and immutable evidence references;
- evaluation-history references and observed cost-profile references;
- known regressions, stale or refresh conditions, retirement conditions, and an optional exact rollback target;
- the closed type extension.

The record describes facts and represented claims about immutable content. It does not self-authorize a registry lifecycle state. The registry entry carries the state established for that exact record in an exact snapshot.

Optional evidence must be omitted or represented explicitly as unknown according to its field contract; empty strings and invented placeholder evidence are not evidence. Unknown license or owner authority is valid metadata, but must remain unknown and cannot satisfy a policy that requires stronger evidence.

Applicability keeps explicit model, adapter, stack, domain, project, and task-class selectors in addition to included/excluded scopes and required capabilities. Each selector is explicitly `unknown`, `unrestricted`, or `bounded`; a bounded selector carries non-empty included and/or excluded values, while unknown and unrestricted selectors cannot carry values. This prevents an empty list from ambiguously meaning both unknown and universal compatibility.

The same value cannot appear in both sides of one included/excluded selector, including the top-level scope selector. Such a contradiction fails registration and imported-record verification instead of leaving precedence to a consumer.

Permissions and effects keep the declared values separate from their evidence references. `requested_permissions` and `possible_effects` are closed, bounded string sets; `permission_refs` and `effect_refs` cite the represented support for those declarations. Empty declaration sets under `not_evaluated` mean that this registry has not established an operational surface, not that execution is permissionless or effect-free.

Unordered metadata sets and reference collections are normalized to locale-independent code-unit order before record identity is computed. Verification requires that canonical order on stored or imported records. Reordering the same set therefore remains an idempotent registration retry rather than creating a second identity.

For `git_revision` records, the registry makes the Asset version equal the represented source revision and verifies the supplied source bytes against their declared raw digests. It does not independently query Git or prove that those bytes came from the represented commit; a consumer that requires that claim needs separate repository-authority evidence.

### Registry snapshot

A registry snapshot is the immutable commit marker for one complete registry state. It binds:

- registry contract revision, stable registry ID, positive snapshot revision, and lifecycle scope;
- the exact predecessor snapshot reference, or the explicit initial-snapshot form;
- a deterministically ordered complete inventory of exact Asset entries;
- for each entry, stable ID, version, Asset type, record digest, content digest, lifecycle state, and lifecycle scope;
- exact lifecycle-authority context references for transition batches that require authority;
- its exact CAS address digest, which binds the complete canonical snapshot object.

The snapshot inventory preserves current and non-current history. A record or content object stored in the CAS but absent from the snapshot is an orphan, not a registered Asset. An entry whose record, content, lineage, dependency, or required authority object cannot be resolved makes the snapshot invalid; verification does not return a partial view.

Every non-initial snapshot binds its immediately preceding snapshot. Revisions cannot skip, rewrite, or transplant predecessor history. The snapshot is full state rather than a mutable delta log; its predecessor link preserves the exact transition history.

### Lifecycle-authority context

A lifecycle-authority context is a distinct, exact caller-supplied trust root for a transition beyond candidate registration. It binds:

- context contract revision and a canonical internal context digest;
- the registry ID, repository ID, lifecycle scope, and exact predecessor snapshot digest;
- the complete deterministic transition batch, including exact subject record/content references, observed source states, and target states;
- an authority kind that distinguishes ordinary lifecycle authority from explicit rollback authority;
- non-empty authority ID and revision;
- an immutable authority-evidence digest.

The transition validator receives this context separately from the snapshot and recomputes the only allowed successor state from the exact predecessor and transition set. The resulting snapshot binds the context digest. Context and snapshot use a non-circular content-basis binding; neither may declare the other valid merely by repeating its digest.

The caller decides that the supplied context is the current trusted authority input. Local validation checks integrity, completeness, predecessor binding, transition semantics, and successor reconstruction. It does not authenticate a hosted source or infer organizational authority from the context's self-description.

Verification-evidence objects and producer attestations are invalid substitutes for this context. Owner metadata and repository authorship are also invalid substitutes unless a separately governed lifecycle authority explicitly accepts them.

## Closed first Asset types

Every v1 type uses the same content package, record, snapshot, exact-reference, lifecycle, and authority contracts.

### `skill`

The Skill extension identifies one normalized entrypoint within the content package and the closed Skill instruction format. All files required to identify the registered Skill revision must be in the exact content inventory. Registration proves exact public bytes and common metadata only; it does not prove that an agent followed the Skill or that the Skill improved an outcome.

### `prompt`

The v1 Prompt extension represents `prompt_template` content and identifies its normalized template entrypoint and declared template format. Template variables, renderer inputs, model context, and rendered output are not silently part of the registered content.

A rendered runtime Prompt is a different exact Asset or an exact later execution/projection record. Registering a template must not be described as registering the unmaterialized rendered baseline, a Prompt v2 challenger, or the Prompt actually executed by a model.

### `evaluator_reference`

The evaluator-reference extension represents a public, non-executable reference contract and identifies its normalized public reference entrypoint. It may name the protocol, evaluator family, or external authority reference represented by those exact public bytes. It must not embed private evaluator implementation, hidden test material, credentials, or scoring secrets.

Registration proves the identity of the public reference document only. It does not register private evaluator bytes, authorize an evaluator, select an evaluator for execution, or prove a scoring result.

The `private_evaluator_content_included: false` field is a closed caller representation, not a secrecy classifier. The registry verifies the exact bytes and rejects a caller that explicitly marks private content as included, but it cannot infer whether arbitrary bytes contain undisclosed private material. The checked sample is separately pinned to the repository's public evaluator-reference source and exact digest.

## Exact references, lineage, and dependencies

Every Asset-to-Asset reference is an exact tuple containing:

- stable Asset ID;
- version;
- Asset type;
- record CAS digest;
- content-package CAS digest.

A stable ID or version without both digests is descriptive metadata, not a resolvable authority reference.

### Derivation lineage

V1 supports a closed derivation union:

- `root`: no parent reference; or
- `full_content_revision`: one exact parent reference plus a bounded, non-empty derivation summary.

`full_content_revision` stores the complete child content package. The summary is explanatory metadata, not an executable patch and not an alternative content identity. Parent and child must have the same stable ID and Asset type, differ in version and content identity, and resolve within the verified snapshot history. Parent cycles, missing parents, cross-ID transplants, and digest substitution fail closed.

An optional rollback target uses the same exact-reference tuple. It must resolve to a different registered revision of the same stable ID and Asset type. The target preserves reconstructability intent only; it cannot authorize rollback or Portfolio selection.

### Dependency closure

Dependencies are deterministically ordered exact references. Every dependency must resolve to the declared record and content within the verified snapshot inventory. Duplicate edges, self-dependencies, missing dependencies, content or record transplant, type mismatch, and cycles fail closed.

Compatibility, applicability, and capability declarations do not weaken exact dependency closure. They are additional conditions that a consumer must evaluate for its use case; they do not permit latest-version lookup or mutable-path substitution.

Full snapshot verification recursively re-reads and validates the complete dependency and parent closure before returning a result. Returned records, references, and byte values are detached immutable values; a consumer does not continue reading mutable caller inputs after verification.

## Lifecycle states and transitions

The state of an exact Asset record is snapshot-owned:

| State | Meaning | Default resolution |
|---|---|---|
| `candidate` | Exact content and record are registered and may be evaluated. | Never selected. |
| `admitted` | Exact lifecycle authority permits bounded eligibility. | Never selected. |
| `current` | Authorized current revision for the stable ID and lifecycle scope. | The only eligible state. |
| `historical` | Reconstructable and explicitly non-current. | Never selected. |
| `superseded` | Replaced by an exact revision and ineligible as current without rollback authority. | Never selected. |
| `retired` | Reconstructable but intentionally unavailable for new selection. | Never selected. |

Candidate registration is the only state creation that does not consume a lifecycle-authority context. Registration rejects a descriptor, imported object, or caller request that attempts to create `admitted` or `current` directly.

Normal authority may approve these transitions:

- `candidate -> admitted`;
- `admitted -> current`;
- `current -> historical`;
- `current -> superseded`;
- any non-retired state to `retired` when the exact retirement subject and purpose are authorized.

`historical -> current` and `superseded -> current` are rollback-only and require a context that explicitly identifies the rollback subject and basis. `retired` is terminal in v1. Other transitions fail closed.

A transition batch is atomic at the successor snapshot boundary. Promoting one admitted revision to `current` while replacing an existing current revision must include both state changes in the same authorized batch. Verification rejects zero or multiple current entries for the same stable ID and lifecycle scope when default resolution is requested. A rollback target named in Asset metadata is a reconstructability hint only; it does not authorize the transition.

A transition to `superseded` specifically asserts replacement, so it must include a different exact revision of the same stable ID transitioning to `current` in that same batch. A standalone demotion that intentionally leaves no replacement uses `historical`, not `superseded`.

No lifecycle state asserts that the Asset is active, installed, executed, safe, correct, cost-effective, or demonstrated effective.

## Provenance, license, owner, and evidence status

Provenance, license, owner, mechanism, evaluation-history, and cost claims carry a closed evidence status:

- `verified`: the registry validator directly established the stated binding from the exact supplied evidence it is defined to check;
- `supported`: exact cited evidence supports the claim, but the local validator cannot establish the complete authority or meaning;
- `unknown`: sufficient evidence was not supplied or is outside the validator's authority.

`verified` is scoped to the named check. For example, verifying supplied bytes against their declared raw digests does not establish that they came from a represented repository commit, nor does it verify copyright ownership, license compatibility, organizational approval, safety, or effectiveness. Repository authorship and a `LICENSE` file may support a represented claim; they do not automatically prove Asset owner authority.

Permissions/effects, safety, mechanism, and evaluation-history fields use their own closed operational statuses, including `declared_by_consumer` and `not_evaluated`. Those values explicitly record an unverified boundary; they are not aliases for evidence-status `verified`, `supported`, or `unknown`, and registration does not upgrade them.

The validator must not upgrade `supported` or `unknown` based on a content digest, registration success, producer identity, evaluator reference, or nearby repository metadata. Policies and consumers decide which evidence statuses are sufficient for admission or use. Registration may preserve unknown evidence; it may not convert it into authority.

Registry v1 has no verifier that can establish license, owner, permissions/effects, safety, mechanism, or evaluation-history claims as `verified`. Registration therefore rejects caller-supplied `verified` values for those fields. A `supported` value must carry the field-specific identity and/or evidence reference required by its Schema and semantic checks; adding such a reference still does not make the claim verified.

## Registry operation semantics

The operation names below define required behavior. Their presence here is not evidence that an implementation already exposes or has verified a particular API spelling.

### Register

Registration accepts a caller-supplied source root, a closed Asset descriptor, and an exact predecessor snapshot when the registry is non-empty. It must:

1. stably read every declared source file under the source root;
2. reject path escape, prohibited symlinks, duplicate normalized paths, source drift, excess size, and inventory mismatch;
3. create and validate the canonical content package;
4. create and validate the exact Asset record, lineage, dependency closure, and metadata evidence statuses;
5. reject an existing stable-ID/version pair with different record or content identity;
6. add only a `candidate` entry while preserving the complete predecessor inventory;
7. verify the complete prospective snapshot before publishing it as the commit marker.

Identical registration against the same effective inventory is deterministic and idempotent. It must return the same exact reference or an explicit no-op; it must not create a new meaning under the same stable ID/version.

### Verify

Verification accepts an exact snapshot digest and the shared CAS. It must strictly parse and canonically verify the snapshot, recursively verify its predecessor chain, and resolve every Asset record, content package, parent, dependency, and required lifecycle-authority context.

The v1 JavaScript API returns one complete detached immutable view or throws a fail-closed `Error`. Error text is diagnostic and is not a stable typed-issue protocol in v1. Verification never returns a partial valid inventory. Schema validity or self-digest validity alone is insufficient. Verification of recorded lifecycle state does not authenticate the caller's original external authority source and must report that trust boundary accurately.

### List

Listing is read-only and requires an exact verified snapshot digest. Results are deterministically ordered by stable ID, version, and exact record identity. Filters may narrow the returned view by declared type or state but cannot change resolution rules or create an implicit latest/current pointer.

### Resolve

Resolution is read-only and requires an exact verified snapshot digest.

- Default resolution takes a stable ID and lifecycle scope and succeeds only for exactly one `current` entry.
- Resolution of any non-current state requires the exact version and explicit expected state.
- Exact non-current resolution accepts the stable ID, exact version, and explicit expected state. Full snapshot verification checks the resolved type, record digest, content digest, and complete dependency/lineage closure before returning bytes or references. A consumer that already holds an exact five-field Asset reference must compare all five returned identity fields; v1 does not expose a second exact-reference selector.

Candidate, admitted, historical, superseded, and retired entries cannot be substituted when a caller requests current authority. Retired entries remain explicitly reconstructable but unavailable for new selection.

### Apply a lifecycle transition

A lifecycle transition accepts the exact predecessor snapshot and a separately supplied lifecycle-authority context. It recomputes the complete successor inventory, validates the state graph and current uniqueness, and publishes one successor snapshot only after the full batch succeeds.

Registration, import, verification, listing, resolving, and reference export cannot be used as lifecycle-transition authority.

### Export exact local references

Reference export is read-only and requires an exact verified snapshot. The v1 export is a deterministic full-snapshot manifest containing the complete Asset inventory, every exact record/content identity, each record's sorted direct parent/dependency references, and any exact rollback-target hint. Snapshot verification has already closed every transitive parent and dependency reference before export.

The manifest contains no absolute source paths, mutable branch or latest references, unverified external bytes, runtime secrets, or private evaluator material. Export does not store, register, admit, activate, install, or execute an Asset. Selected-subset export and transfer packaging are deferred to Issue #180; that work may select from this full exact inventory but may not redefine Asset identity.

## Publication, interruption, and import semantics

The shared CAS publishes immutable objects one at a time. Registration may need to publish content and record objects before its final snapshot. Before any publication it must preflight the complete proposed inventory and every existing destination it can observe.

If publication stops after some immutable objects are written but before the final snapshot is available and fully verifiable:

- the written objects are valid CAS objects only;
- no partial registry membership or lifecycle state exists;
- existing snapshot authority remains unchanged;
- an identical retry may reuse the exact objects;
- a conflicting retry fails rather than replacing them.

An externally copied or imported object set grants no Asset authority by presence alone. A caller cannot register a verification-evidence object as an Asset record, omit one object from a claimed snapshot closure, or treat a partial transfer as a registry. Missing, extra-substituted, non-canonical, or address-mismatched closure objects make the imported snapshot invalid. Garbage collection of unreachable orphan objects is outside v1.

## Threat and negative-case matrix

The focused verification suite must cover at least these cases. Until the checks execute successfully, the corresponding properties remain unverified.

| Threat or mistake | Required fail-closed behavior |
|---|---|
| Same stable ID/version, different content or metadata | Reject the collision; never overwrite or choose one by path/order. |
| Content bytes drift after inventory | Stable re-read or digest verification fails; no snapshot is committed. |
| Coordinated content and record substitution | Exact snapshot inventory, record digest, content digest, and predecessor binding fail. |
| Duplicate JSON keys or non-canonical CAS bytes | Strict parse or canonical/address verification fails before semantic use. |
| Absolute path, traversal, or prohibited symlink | Source ingress fails before content publication. |
| Missing parent or cross-Asset parent transplant | Exact lineage closure fails. |
| Missing dependency or dependency record/content transplant | Exact dependency closure fails. |
| Parent or dependency cycle | Registration permits references only to exact predecessor inventory and immutable stable-ID/version collisions reject coordinated rewrites, so a valid multi-record cycle cannot be formed through registration. Full verification also retains deterministic defensive cycle rejection for imported object graphs. |
| Incomplete multi-object publication or import | Orphans remain unregistered; no partial snapshot is returned. |
| Stale lifecycle context | Exact predecessor/context binding fails. |
| Self-declared admitted/current state | Registration or transition validation fails. |
| Verification-evidence producer used as lifecycle authority | Authority-type and context validation fail. |
| Zero or multiple current entries used by default resolve | Resolution fails rather than choosing by version or order. |
| Historical, superseded, or retired substitution | Default resolution fails; explicit exact-state reconstruction remains separate. |
| Mutable caller input changes after verification | Detached verified values remain unchanged; consumers do not re-read the mutable input. |
| Unsupported Asset type or type-extension field | Closed Schema validation fails. |
| Owner/license/effectiveness inferred from a digest | Evidence-status validation preserves supported/unknown; no authority is granted. |
| Registration changes a runtime default | Integration verification fails; no projection, Portfolio, evaluator selection, or execution file may change from registration alone. |
| Private evaluator bytes enter the sample package | Public-content and evaluator-reference boundary validation fails. |

## Initial sample meaning

The checked-in v1 sample registry is expected to contain three candidate entries through the same common contract:

1. one existing ASK Skill as exact public Skill content;
2. the existing Prompt template that precedes the #227 Prompt v2 work;
3. one public evaluator-reference document from the Adaptive ASK infrastructure.

All three samples are `candidate`. Their purpose is to prove type-independent identity, metadata, lineage/dependency, storage, and registry behavior. The samples do not assert admission, currentness, runtime activation, execution, comparative quality, safety approval, cost, or demonstrated effectiveness.

The Prompt sample represents only the exact template bytes. It is not the unmaterialized rendered baseline and is not a Prompt v2 candidate. The evaluator-reference sample represents only public reference bytes and is not a private evaluator or an evaluation run.

## Consumer rules

Portfolio Manager, installer, evaluator, and reporting consumers must:

- start from an exact verified snapshot digest rather than a mutable path;
- retain exact record/content references through projection and reporting;
- use default resolution only for registry currentness, never as Portfolio activation;
- request non-current reconstruction with exact version and explicit state;
- preserve evidence statuses and unknowns rather than upgrading them;
- reject incomplete dependency or lineage closure;
- avoid mutable caller reads after receiving a detached verified result;
- record a separate authority or evidence object for activation, execution, and observed outcomes.

A read-only consumer may verify, list, resolve, or export exact references. It must not mutate lifecycle state as a side effect.

## Non-goals and deferred behavior

Contract revision `1.0.0` does not define:

- a hosted marketplace, remote registry, central database, or mutable latest pointer;
- garbage collection or orphan deletion;
- private evaluator bytes, encryption, secret distribution, or evaluator execution;
- automatic admission, selection, promotion, mutation, or generation;
- Portfolio baseline, challenger, bypass, or rollback selection;
- adapter installation or runtime projection;
- Prompt v2 content or rendered Prompt capture;
- matched evaluation, scoring-policy changes, product evidence, ROI, or effectiveness claims;
- migration of every existing ASK artifact into the common model.

Adding any of these behaviors requires its own authority and verification boundary. It must not reinterpret an existing content digest, Asset record, sample registration, or registry lifecycle state as proof that the deferred behavior occurred.
