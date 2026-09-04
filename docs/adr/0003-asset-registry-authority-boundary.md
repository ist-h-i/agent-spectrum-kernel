# ADR-0003: Separate Asset registry identity from lifecycle and Portfolio authority

- Status: Proposed
- Date: 2026-08-25
- Scope: Issue #276 local Asset contract and registry
- Related contract: `docs/asset-registry-contract.md`
- Supersedes: None

## Context

ASK needs one common identity and history boundary for heterogeneous AI engineering Assets. Skills, Prompt templates, and public evaluator references are the first supported types, but the boundary must remain usable by later Asset types without giving each type a different storage, provenance, dependency, or lifecycle model.

ADR-0001 already establishes a bounded canonical JSON content-addressed store (CAS). That store proves object-byte integrity under an exact digest. It deliberately does not establish admission, currentness, producer acceptance, execution, or effectiveness. Creating an Asset-specific store would duplicate canonical identity, stable-read, path-safety, and no-replace publication behavior while introducing a second incompatible meaning for a content-addressed reference.

Asset lifecycle also needs authority that object storage cannot supply. A record can truthfully describe exact Asset bytes and the evidence available for their source, license, owner, dependencies, and evaluation history. It cannot authorize itself as admitted or current. Likewise, a valid verification-evidence object and its authenticated producer remain verification authorities only; they do not become Asset owners or lifecycle approvers.

Finally, a registry-level `current` Asset revision and an actively selected runtime Portfolio answer different questions. Issue #276 needs reconstructable Asset history and current revision authority. Issue #277 will decide which exact Assets form a baseline, challenger, bypass, or rollback Portfolio. Combining those decisions here would make registration mutate runtime selection before the Portfolio contract exists.

## Decision

### Reuse one shared CAS

The Asset registry reuses the generic CAS introduced by Issue #274. Asset content packages, Asset records, registry snapshots, and any persisted lifecycle-authority contexts use the same bounded canonical JSON object layout, digest calculation, stable-read checks, path containment rules, and immutable no-replace publication primitive.

The registry does not create an Asset-only object directory, digest scheme, mutable database, or second canonicalization implementation. An Asset-specific object Schema may add meaning to CAS bytes, but does not change CAS identity or storage authority.

### Use a content, record, and snapshot model

The common Asset boundary has three immutable layers:

1. An **Asset content package** contains a bounded, normalized inventory of the exact public Asset bytes.
2. An **Asset record** binds a stable Asset ID and version to the exact content package and to closed common metadata, exact lineage, and exact dependencies.
3. A **registry snapshot** is the commit marker over a complete verified Asset inventory and its lifecycle states. It binds its exact predecessor when one exists.

Content and record objects that exist in the CAS but are absent from an exact verified registry snapshot are stored only. They are not registered. Registration creates a candidate entry only after the complete snapshot and every referenced object have passed verification.

### Keep lifecycle authority caller-supplied and separate

A transition beyond `candidate` requires a distinct, exact lifecycle-authority context supplied by the caller as the current trust root. The context binds the predecessor snapshot, the complete transition batch, the exact subjects and target states, the authority reference, and immutable authority-evidence reference. The resulting snapshot binds that context.

The local validator verifies the context's integrity and all cross-object bindings. It does not infer that a content digest, repository author, owner claim, registration event, verification result, verification-evidence signature, or producer identity has organizational lifecycle authority. Authentication of the external authority source remains a caller and repository-governance responsibility.

Registration is candidate-only. Candidate registration cannot carry a lifecycle context that silently makes the Asset admitted or current. Rollback is a separate explicit transition authority, not a consequence of retaining historical bytes or naming a rollback target.

### Keep registry currentness separate from Portfolio activation

Within an exact registry scope, `current` identifies the authorized current revision of a stable Asset ID. It does not mean that the Asset is installed, projected into an adapter, selected in an active Portfolio, executed, or demonstrated effective.

Issue #277 will own active Portfolio selection and rollback among exact Asset references. Installers and runtimes will own projection and execution. Evaluation records will own observed outcomes. Registration and a `current` lifecycle transition therefore do not change runtime defaults.

### Preserve complete immutable history

Registry snapshots are full immutable commit markers with exact predecessor links. Verification recursively re-reads the predecessor chain and every content, record, lineage, dependency, and lifecycle-authority object needed by the selected snapshot before returning a detached result.

Historical, superseded, and retired entries remain reconstructable. Default resolution accepts only one exact `current` entry for the requested stable ID and lifecycle scope. Reconstructing any other state requires an exact version and explicit expected state.

Publication of multiple immutable CAS objects is not a filesystem transaction. A process failure may leave valid unreferenced content or record objects. Such orphans grant no registration or lifecycle authority because the final verified snapshot is the only registry commit marker. Retrying identical publication is idempotent.

## Alternatives considered

### Create an Asset-specific CAS

Rejected. It would duplicate the Issue #274 canonicalization, path-safety, stable-read, and immutable-publication boundary and make references incompatible without a demonstrated storage-contract conflict.

### Treat a stored Asset record as registered and current

Rejected. Storage proves only that immutable bytes exist. A self-declared state in the same object cannot establish external lifecycle authority or distinguish an interrupted multi-object publication from a committed registry state.

### Reuse verification-evidence producer authority for Asset lifecycle

Rejected. ADR-0001 producer attestation authenticates verification evidence for a current gate requirement. It does not establish Asset ownership, admission, activation, rollback, safety, or effectiveness.

### Maintain a mutable `current` pointer or path

Rejected for the local MVP. A mutable pointer permits stale or coordinated substitution outside the immutable snapshot digest and weakens reconstruction. Consumers instead receive an exact snapshot digest and resolve within that snapshot.

### Make `current` mean actively selected at runtime

Rejected. It would collapse registry lifecycle into the Portfolio Manager and runtime planes, prematurely implement Issue #277, and let registration or revision maintenance change runtime behavior.

### Store only repository paths and read Asset bytes on demand

Rejected. A path is mutable and cannot preserve exact historical bytes, prevent substitution, or support deterministic local reference export.

## Consequences

- ASK has one content-addressed storage identity across verification evidence and Assets while retaining separate semantic Schemas and authorities.
- A consumer must hold an exact registry snapshot digest and the shared CAS; a mutable directory or latest-file convention is not registry authority.
- Lifecycle callers must supply current authority context. A snapshot alone proves its immutable recorded state, not that the external authority source was authentic when supplied.
- Full verification performs more reads than a mutable index because it closes predecessor, content, lineage, dependency, and transition references before returning a detached result.
- Stable ID/version collisions with different content or metadata fail closed. Identical publication can be retried without changing identity.
- Interrupted publication can leave immutable orphan objects. They are safe but require a separately designed garbage-collection policy if storage reclamation becomes necessary.
- The first Skill, Prompt template, and public evaluator-reference samples demonstrate the shared contract only. Their registration does not establish quality, safety approval, currentness, Portfolio activation, execution, or effectiveness.
- `current` Asset revisions remain available as exact inputs to Issue #277, but Issue #277 may not replace them with mutable paths or infer activation from registry state.

## Review triggers

Revisit this decision before:

- introducing an object that cannot fit the shared CAS size or canonical JSON constraints;
- adding a second digest, storage layout, mutable index, database, remote registry, garbage collector, or distributed publication protocol;
- allowing encrypted or private evaluator bytes into the public Asset content package;
- adding an Asset type whose identity, provenance, lineage, dependency, or lifecycle semantics cannot satisfy the common closed contract;
- accepting patch-only or executable derivations instead of storing complete exact content;
- changing external lifecycle authority authentication, organizational owner approval, authority revocation, or key custody;
- making registry `current` imply Portfolio `active`, installation, execution, or demonstrated effectiveness;
- permitting any verification-evidence producer or evaluator to authorize Asset admission, currentness, activation, or rollback.

## Deferred decisions

- baseline, challenger, bypass, and rollback Portfolio selection under Issue #277;
- candidate comparison, recommendation, human-approved Portfolio update, and evolution-loop measurement under Issue #278;
- transfer packaging and installer projection under Issue #180;
- hosted storage, remote coordination, mutable indexes, garbage collection, and distributed transactions;
- private evaluator content, encryption, secret custody, and evaluator execution authority;
- organization-backed owner or lifecycle-authority enrollment and revocation;
- automatic admission, promotion, activation, mutation, or generation;
- product-value, effectiveness, cost, and performance claims.

This ADR composes with ADR-0001 and ADR-0002. It does not supersede either decision.
