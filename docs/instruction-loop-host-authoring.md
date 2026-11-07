# Durable external-host component authoring

Specification `instruction-loop-host-authoring-spec@1`, upstream: the authorized
post-merge completion task and `instruction-loop-readiness-spec@1`.

The standalone environment authoring prepare/import APIs already validate bounded
Markdown changes. The supervised component generator must now suspend after its
exact preparation and accept a bound external-host result without redoing
composition, dispatching a second model, or bypassing either human judgment.
This is a host protocol, not an authenticated Claude app dispatcher.

For component profiles only, `candidate.authoring.provider.kind: external_host`
selects this port. Generation persists its exact private continuation and public
generation input, returning `awaiting_authoring`. Repeated advance/inspect returns
the same request. Only the host's own approved application can execute it.

The supervised CLI offers `authoring-request`, `authoring-claim` and
`authoring-complete`, each with the active cycle's `--root` and `--config`.
Claim uses `--claim FILE`; completion uses `--submission FILE`.
The operation status exposes its current cycle root/config for these commands.
Neither command accepts human decision flags or executes an application.

A claim has exactly `{handoff_digest, execution_id, provider, evidence_kind}`.
Execution/provider IDs are bounded public identifiers; evidence_kind is synthetic
or host_reported. Real host claims require the existing host model-call grant
(`--allow-model-calls`). The durable single claim is written before execution;
only its first successful response has `claim_created: true`. Repeated identical
claims return false, conflicting claims refuse. A lost response requires
inspection of the existing host execution; it never authorizes relaunch.

A completion has exactly `{handoff_digest, claim_digest, response, closure}`.
Closure has exactly `{status: completed, termination_confirmed: true,
evidence_ref}`. This assertion is host-reported evidence, not proof that ASK has
authenticated a model or independently verified remote termination. The result
must match the exact claim, original authoring request and editable inventory.
Malformed/out-of-scope responses refuse before an immutable completion is stored.
Identical completion retries are idempotent; conflicting completions refuse.
An uncertain host invocation retains the existing claim and waits; no automatic
model retry or claim takeover is provided by this protocol.

On next advance, the same reserved generate job imports the validated response,
registers the candidate and reaches the original human case gate. Completion is
not case approval, change approval, installation permission or a trial. Response
loss after the candidate is complete is recovered from the existing owned
candidate evidence. A crash during partially completed local finalization stays
explicitly uncertain; no unknown effects are overwritten or blindly replayed.
The stage persists a positive preparation receipt before returning the handoff.
If that response is lost before the supervisor publishes its handoff digest,
inspection can restore the same handoff using that exact-job receipt. An already
published journal digest always takes precedence. A crash inside preparation
before positive completion evidence remains partial/unknown, never regeneration.

Private checkpoints retain trusted options/continuation and are not portable
packages. Public request retrieval returns only the existing bounded generation
input, digests and host protocol information. Source/profile pins, coordinator
locks and exact pending-job checks protect request/claim/completion operations.
The generic Full/native command runtime and automatic assessor ports keep their
existing supported kinds. Fixed helpers remain uneditable.

Formal Verification Contract `instruction-loop-host-authoring-verification@1`:
- H-01: Codex/Claude-format synthetic component generation suspends deterministically
  without any model, Eval, owner write or extra human gate; restart does not redo
  preparation and exact context is available to the host.
- H-02: claims are exclusive, idempotent and model-grant gated; completion binds
  job/profile/request/claim and validates inventory/closure before publishing.
- H-03: malformed/transplanted/drifted results refuse; response loss and completed
  generation recovery preserve identity, resources and both human gates.
- H-04: CLI and bounded operation expose the same port; supported old profiles,
  source pins, existing tests/fixtures and unconditional CI ownership remain.

Implementation Contract:
- Artifact ID: `instruction-loop-host-authoring-implementation@1`.
- Upstream refs: this specification and parent completion authorization.
- Actual change boundary: component preparation/continuation, durable host port,
  supervisor pending status, standard runtime/CLI, Skill/doc guidance and tests.
- Verification attempted / Evidence: final host-port tests 8/8; existing authoring,
  compiler, runtime, operation, supervisor, provider and CI ownership regression
  53/53; repository validation and independent review. Source-bound logs accompany
  delivery; no real-model/owner/app acceptance is implied.
- Selected proof: Formal `instruction-loop-host-authoring-verification@1` H-01..04.
- Handoff state: locally verified for review; remote CI and authenticated
  real-world acceptance remain separate. No real model, new operational Eval,
  actual-user owner or authenticated app was invoked.
