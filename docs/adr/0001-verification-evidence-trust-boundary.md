# ADR-0001: Verification evidence trust boundary

- Status: Proposed
- Date: 2026-08-24
- Scope: Issue #274 Slice 1 exact verification-evidence reuse
- Related contract: `docs/verification-evidence-contract.md`

## Context

Content addressing proves that bytes have not changed under a digest. It does not prove who produced those bytes, whether that producer was authorized, or whether a reuse plan actually resolved the evidence object it cites. The first Slice 1 draft also stored printable command arguments. Those properties allowed a self-consistent artifact to overstate producer authority or coverage and allowed sensitive argument material to enter a transferable object.

Slice 1 needs portable local evidence without introducing a hosted identity service, a mutable admission database, or raw execution logs. Imported objects may be stored before they are trusted, but they must not authorize reuse until the current gate requirement explicitly accepts their authenticated producer.

## Decision

### Producer attestation

Every verification-evidence object carries an Ed25519 producer attestation.

- `producer.identity_digest` is the SHA-256 digest of the producer's DER-encoded SubjectPublicKeyInfo bytes.
- `producer.kind` and `producer.identity_digest` are signed together with the complete bounded evidence payload.
- The signed payload is canonical JSON for `{ context, evidence }`, where `context` is `ask.verification-evidence.producer-attestation.v1` and `evidence` excludes only the derived evidence ID/digest and the attestation fields themselves.
- The attestation embeds the public SPKI bytes, payload digest, and signature. Validation checks canonical base64, Ed25519 key type, the SPKI fingerprint, the payload digest, and the signature.
- A content digest is integrity evidence only. It is never producer provenance.

The private key is not stored in evidence and the CLI does not accept a private-key path. A runner creates an attested evidence object through the library boundary, and CLI `put` accepts only an already attested, sealed object.

### Trusted ingress and imported evidence

The current verification requirements object is the decision-time trust root for Slice 1. Each gate declares accepted producer pairs as `{ kind, identity_digest }`; kinds and identities are not accepted through independent cross-product arrays. Requirements must come from the current caller's trusted control input, not from the evidence object or transfer being evaluated.

The content-addressed store is not an admission registry. It may contain correctly signed evidence from an unaccepted key. Export and import preserve the original signature and identity, but neither operation grants authority. The exact planner revalidates every stored signature and reuses an object only when the bound current requirement accepts the exact producer pair and evidence level.

Changing or retiring a producer key changes its identity digest. Current requirements must omit a retired digest; evidence from that key then becomes non-reusable without deleting the immutable object. Key distribution, hardware custody, organizational identity proof, and revocation feeds are deployment concerns outside Slice 1.

### Command privacy and exact identity

Evidence never stores or hashes raw command arguments. The execution adapter supplies an ordered list of non-secret argument identities: a public argument uses a digest of public material, while a secret-bearing position uses a digest of an opaque, non-secret version reference issued by the secret authority. The actual secret value is not an accepted input to the identity helper. Evidence stores the executable, repository-relative working directory, identity scheme, argument count, opaque-reference count, and a domain-separated SHA-256 digest of that ordered identity list.

The identity digest remains part of `reuse_identity_digest`, so a public argument or opaque secret-version change invalidates exact reuse without placing arguments, prompts, tokens, paths, transcripts, or an offline verifier for the secret value in the evidence or transfer. If a secret authority cannot supply a non-secret opaque version identity, the execution cannot produce exportable exact-reuse evidence under this contract.

### Plan authorization

A reuse plan is not authorizing evidence by itself. Full plan validation requires both:

1. the exact bound requirements object; and
2. the content-addressed store from which every disposition is resolved.

Validation re-reads and validates all candidate evidence, recomputes every gate disposition, and compares the recomputed dispositions with the plan. Schema, self-digest, or reference-shape validation alone cannot establish coverage.

### Multi-object import

Import validates the complete transfer and preflights every existing destination before publishing a new object. Publication remains a series of immutable no-replace CAS writes, not a multi-file filesystem transaction. A process or filesystem failure may therefore leave a valid prefix of previously missing immutable objects. There is no mutable admission state to partially advance; import is idempotent and can be retried with the same transfer.

## Alternatives considered

### Unsigned producer strings plus content digests

Rejected. An attacker can copy an accepted producer string or digest into newly created content. Hash integrity does not authenticate the producer.

### Kind and identity allowlists as separate arrays

Rejected. Their cross product can authorize a key under a role that the requirement did not intend to grant.

### HMAC with a shared secret

Rejected. Every verifier able to validate evidence would also be able to forge it, and portable transfers would require distributing the shared secret.

### Local sidecar trust receipts

Rejected for Slice 1. Sidecars make portable transfer and content identity depend on local mutable state. A later admission layer may add separately scoped trust decisions without changing the original evidence.

### Hosted signing or identity service

Deferred. It would add availability, credential, deployment, and organizational identity dependencies beyond the local-first slice.

### Printable argument allowlist or secret scanner

Rejected. A denylist cannot reliably identify positional credentials, prompts, transcripts, or new secret formats. The closed public/opaque identity input keeps actual argv outside the contract instead of trying to sanitize it after receipt.

### Unkeyed digest of the actual argument vector

Rejected. Even without literal strings, a portable unkeyed digest lets a transfer recipient test predictable or low-entropy secret candidates offline when the surrounding arguments are known. Exact identity therefore consumes only public identities and non-secret opaque secret-version references, never secret values.

## Consequences

- Evidence authenticity is verifiable offline and survives transfer.
- Trust is explicit and current: storing or importing an object does not authorize it.
- Producer key rotation invalidates reuse until requirements accept the new fingerprint.
- Consumers must retain the trusted requirements input and evidence store when validating a plan.
- Raw argv is neither an identity-helper input nor reconstructable from the artifact; diagnostics must use a separate privacy-controlled execution record outside this contract.
- The implementation uses Node.js built-in Ed25519 support and adds no dependency.

## Deferred decisions

- hosted storage and coordination;
- organization-backed producer enrollment and revocation distribution;
- mutable indexes, admission state, and garbage collection;
- scoped or semantic reuse;
- release, merge, review approval, and independent semantic judgment.
