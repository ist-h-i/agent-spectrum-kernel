# Reference evidence and a fresh human adoption decision

This optional path uses a retained, externally measured same-candidate comparison
as **reference evidence**, then returns to the existing source application and
version lifecycle. It does not evaluate instruction effectiveness, replace the
standard baseline/candidate Eval, create a formal score, or start model calls.
It does not change ordinary review workflows.

For example, three implementation contexts can all use one ASK candidate. Their
observations may inform a human decision, but cannot identify the effect of that
candidate versus its baseline. Different setup, permissions, retries and missing
usage remain limitations. A successful application check is not automatic
adoption advice.

## Two fresh judgments, not imported authority

1. Prepare the reference packet. The controller freezes the supplied evidence
   bytes, registered candidate, source revision, baseline revision, instruction
   environment identity, original unresolved gate and current runtime policy.
   It stops at `awaiting_reference_review`, before application planning.
2. The host asks a human to review the experiment's case-approval evidence,
   inputs, complete attempt inventory, raw receipts and limitations. An exact
   `approved` decision authorizes using this evidence for a subsequent judgment.
   It does not approve or execute the original cases. `deferred` preserves the
   same packet. `rejected` uses existing retirement/owned-cleanup behavior when
   a source-repository owner exists, or retains materializations in result-only mode.
3. The existing planner prepares the exact source delta and owner destination.
   The controller stops at a **different** change/adoption packet. A fresh human
   approval of this packet is required to proceed. The earlier case approval,
   reference-use decision and any old packet cannot approve it.
4. Application follows the existing host source request/claim/completion port.
   An open PR does not activate a version. The normal merge's exact base, head,
   parents and tree plus retained CI/review evidence must pass the existing
   checks. Registry activation and cleanup then run once through existing ports.
   Activation still does not claim a physical home-directory installation.
5. The existing next-cycle preparation uses the verified merged source as the
   new baseline after adoption. Rejection keeps the prior baseline. Reference
   provenance, failed-attempt counts, public limitation summaries and unknowns
   are carried separately from standard evaluation metrics. Every new cycle
   still requires fresh case and adoption decisions.

The original `evaluation_decision` remains absent, `outputs.evaluate` remains
absent and standard `trials` remain empty. External attempts are stored in their
own inventory, never counted as standard baseline/candidate executions. Standard
report revisions and historical completed-evaluation imports are different paths.

## Existing unrun cycles and runtime upgrades

A historical runtime's source pins must not be rewritten to current code. Use
`prepare-reference-evidence` to make a fresh decision coordinator from a closed
Full authoring result whose old coordinator is still waiting for its first case
judgment. Preparation preserves the old journal, source, Full snapshot and
archive. It copies the exact retained candidate into independently owned
source/Full/archive locations under a fresh output root and creates a current
profile/configuration. It does not regenerate the candidate, rerun installers or
run the old cases.

```sh
node scripts/supervised-instruction-loop-cli.mjs prepare-reference-evidence \
  --root /private/operator/old-run \
  --profile /private/operator/old-profile.json \
  --config /private/operator/old-config.json \
  --output-root /private/operator/fresh-decision \
  --id reference-decision-1 \
  --reference-evidence /private/operator/reference-manifest.json
```

Paths are illustrative. The output root must be fresh, inside the configured
protected root and outside original source, state and owner locations. Existing
ancestors must use their canonical host casing. Ownership overlap also rejects
Unicode-normalization and case-only aliases of reserved paths, including absent
evaluation/staging destinations. This deliberately refuses ambiguous case-only
destinations on case-sensitive hosts too. A partial
preparation is retained for inspection, not silently overwritten. Old pending,
uncertain, approved or partly executed evaluation work is ineligible.

For an already current, unexecuted Full practical coordinator with a source
repository owner or explicit result-only mode, attachment is available:

```sh
node scripts/supervised-instruction-loop-cli.mjs advance \
  --root /private/operator/current-run \
  --config /private/operator/current-config.json \
  --reference-evidence /private/operator/reference-manifest.json
```

For a prepared historical bridge, first use `status --root <prepared run_root>`
to read its reference packet and digest. The host reads each packet and sends
each separate human decision using
`advance --decision approved|rejected|deferred --packet <pending_packet_digest>
--reason <human reason>` with the same root and configuration. Attachment and a
decision cannot be submitted together. No model-call flag is needed. `next`
prepares the following cycle after completion without executing it.

## Closed reference manifest

`instruction_loop_reference_evidence_v1` contains exactly these fields:

- `kind`: the versioned kind above.
- `candidate_digest`: canonical digest of the registered candidate that was
  measured. Historical preparation binds this original identity separately from
  the new copies' ownership handles.
- `source_revision`, `baseline_revision`, `environment_object_digest`: exact
  identities of the retained candidate. Each attempt repeats the same source
  revision and instruction environment digest.
- `artifacts`: unique `{id, role, path, digest}` records. Paths are absolute local
  files, digests are SHA-256 of raw bytes, and roles are `case_approval`, `input`,
  `receipt`, `report` or `context`. At least one report is required.
- `attempts`: every attempt, including failed and interrupted retries, as
  `{id, condition, status, selected, closure, receipt, input, case_approval,
  environment_object_digest, source_revision}`. The three reference fields name
  artifact IDs of their corresponding roles. Status is `completed`, `failed` or
  `interrupted`; only completed attempts can be selected. Closure must be
  explicitly inspected and recorded as `host_observed_closed`. Unknown or still
  running work cannot be admitted. Every supplied receipt must occur exactly
  once in this inventory. Receipt paths and raw digests must be unique: separate
  attempts need distinguishable execution receipts, not aliases of one file. There must be at least two distinct context labels.
- `limitations`: nonempty bounded descriptions of known differences and missing
  evidence. These supplement mandatory controller-enforced limitations.

The host prepares this inventory from existing evidence, not model-generated
adoption instructions. A manifest cannot contain approval flags or executable
commands. Missing references, changed bytes, symlinks, wrong candidate/context
identity, duplicate receipts and omitted supplied failure receipts are refused.

This is an integrity and human-review boundary, not a remote attestation system.
The implementation can verify supplied bytes and their declared relationships;
it cannot authenticate a free-form approval transcript, independently prove a
raw receipt describes a real execution, or discover undisclosed attempts outside
that supplied inventory. Both the reference packet and retained summary mark
approval/execution authenticity and inventory completeness as requiring host
review. The host must verify them against the actual user authorization and
experiment records before asking for the reference-use decision. A checksum or
manifest alone never grants execution or adoption authority.

## Retention and limits

Artifacts are copied as immutable, digest-bound bytes under the new coordinator.
Later changes to original input files do not rewrite this snapshot. Mutating or
removing the retained snapshot stops ordinary resume, decisions and source
claim/completion/activation, including cached operation recovery. Original raw
experiment files, the immutable snapshot, journal, archive and CAS remain
retained on rejection; only the fresh owned candidate/Full/staging is disposable.

A manifest allows at most 256 artifacts and 256 attempts, 16 MiB per input and
32 MiB total raw snapshot bytes. The snapshot file is capped at 64 MiB. These are
local evidence-size bounds, not model usage restrictions. Full hierarchical
usage and complete cost remain unknown; the controller does not fill missing
usage with zero or treat these observations as skill-effect estimates.

The model-free tests use synthetic local Git histories and receipts. They prove
controller binding and lifecycle behavior, not live model quality, remote GitHub
authenticity, real candidate adoption or complete ASK v1 effectiveness.

## Verification contract

Artifact `reference-evidence-lifecycle-verification-v1` selects
`formal_verification_contract` under `ask.verification-proof-policy@1.0.0`.
Triggers are `state_concurrency_persistence_lifecycle_or_cross_module`,
`public_api_schema_or_compatibility` and `multi_session_multi_agent_or_handoff`.
The behavior described above and the existing source-application contract are
its upstream requirements.

- O1, evidence identity and truthfulness: preserve source/environment identity,
  all supplied success/failure receipts and explicit limits; never fabricate
  standard execution or skill effect. Check
  `test-instruction-loop-reference-evidence.mjs` and
  `test-instruction-loop-reference-preparation.mjs`.
- O2, human authority and replay: exact separate reference/adoption packets;
  reject stale, combined, foreign, aliased, changed and unclosed evidence;
  inspect consumed operations without replay. Check those suites plus
  `test-supervised-instruction-loop.mjs` and
  `test-instruction-loop-source-application.mjs`.
- O3, lifecycle preservation: normal source merge before activation; fresh-owned
  rejection cleanup preserves original source/Full/archive/journal; next cycle
  uses merged source only after adoption and carries no approval. Check source
  application/preparation suites and affected operation, retained-authoring,
  native, component, feedback and result-discard regression suites.

Current execution records must bind each claimed obligation to its actual test
command and result. Run repository validation, CI command-coverage tests and
`git diff --check`, then independent review. Missing or failing checks cannot
support completion. Remote CI, real GitHub publication, empirical effectiveness
and actual candidate adoption require separate evidence; synthetic fixtures
cannot discharge those obligations.
