# K-principles v2 evaluation entry

Spec `SPEC-KERNEL-PRINCIPLES-V2-ADOPTION-1` revision 1 references the user's
explicit selection of `kernel_principles_v2` for this evaluation and
`SPEC-KERNEL-PRINCIPLES-V2-CANDIDATE-1` revision 1 in
`kernel-principles-candidate-v2.md`. This selection adopts a separate evaluation
entry; it does not adopt a product or claim that specialized Skills or formal
protocols are supplied or ran. The candidate and v1 remain separate and unchanged.

## Observable delta and APIs

`renderKernelPrinciplesV2(source)` reuses the sealed candidate extraction and
changes only evaluation identity glue. It returns `{ body, generation }` with
ID `kernel_principles_v2`, no proposed/unadopted identity, the same extracted
principles, exclusions and `dependencies: []`. Exact body and generation
comparison remains the caller's responsibility before using a persisted entry.
The renderer still rejects any drift in the complete canonical source.

`kernelPrinciplesV2FixtureDescriptor(fixtureId, taskBytes, metadataBytes)` is a
closed public-source lookup for the nine primary fixtures below. Unknown IDs
return `null`. A known ID requires the exact raw task and metadata digests;
drift throws rather than changing the classification. The metadata's declared
class and risk boundary are checked and recorded alongside the selected native
principles class in an evidence ref. Lookup reads no files or private results.

`principlesV2Capability(descriptor)` accepts the candidate's closed descriptor:
`task_class`, `requirement_scan: { status, evidence_refs }`, and
`required_procedures`. It checks complete/unknown scans and explicit
formal/specialized procedure records. Incomplete assessment, risk-gated scope,
or any required unavailable procedure yields `capability_missing`. Unknown
fields/classes/kinds, empty evidence, duplicate procedures and a class that
contradicts known public-fixture refs throw. A caller can supply an explicit
assessment for other ordinary work, but there is no automatic prose classifier
or automatic complete scan for an unknown task. Primary-runner integration must
require a recognized public-fixture lookup, not manufacture a complete scan.

Availability concerns structural principles entry only. It provides no approval,
permission change, model compliance, quality, causal proof, specialized procedure
or formal protocol. Discovery of an additional required procedure must update
the descriptor before dependent work. A supplied schema or test command remains
an obligation; its presence alone does not establish an unavailable ASK protocol.

## Public fixture interpretation

All lookup scans cover the exact public task and metadata. Required procedures
are initially `[]` because those task bytes require bounded ordinary work and
supplied output/check contracts, not execution of an unavailable formal or
specialized Skill. Additional project instructions can require a new assessment.

| Fixture | Declared class → native class | Preserved task and risk boundary |
| --- | --- | --- |
| mp-frontend-state-review | pr_review → review | Review state diff/contracts/tests; only review.json; risk none |
| mp-accessibility-interaction-review | pr_review → review | Review keyboard/markup/interactions/tests; only review.json; risk none |
| mp-performance-investigation | investigation → investigation | Assess competing explanations using supplied evidence and exact excerpts; bounded non-production next check; risk none |
| mp-ci-evidence-gap | review_verification → review | Assess workflow/CI/tests/repository guidance, retaining supplied check obligations; only review.json; risk none |
| mp-iac-rollback-design | design_gate → design | Produce and locally validate a plan; no infrastructure commands/apply/approval/state edits; approval_required |
| mp-data-migration-handoff | handoff_resume → handoff | Produce and locally validate truthful continuation, verification IDs and rollback limits; no migration/reconciliation; rollback_required |
| mn-focused-regression-test | verification_only → implementation | Edit existing focused tests, preserve production behavior and run repository check; risk none |
| mn-build-option-update | configuration → implementation | Local build configuration edit preserving debug/release behavior; focused checks; risk none |
| mn-doc-config-correction | documentation → trivial | Correct one documentation example to checked-in defaults; repository verification; risk none |

The declared class is preserved in evidence instead of relabeling source
metadata. Infrastructure and migration subjects do not authorize their execution.
The lookup does not reinterpret or relax risk and approval boundaries.

## Development verification contract

Implementation `IMP-KERNEL-PRINCIPLES-V2-ADOPTION-1` revision 1 references this
Spec and the delegated entry-only boundary. Owned changes are this document,
`scripts/kernel-principles-v2.mjs`, and `scripts/test-kernel-principles-v2.mjs`.
Integration belongs to the parent. Existing candidate/v1 modules, public assets,
catalogs, fixtures, old runs and private/development threads are outside scope.

Formal Verification Contract `FVC-KERNEL-PRINCIPLES-V2-ADOPTION-1` revision 1
selects `formal_verification_contract` under
`ask.verification-proof-policy@1.0.0`: the observed trigger is
`multi_session_multi_agent_or_handoff`. This development contract is not part
of the evaluation entry.

- O1: deterministic distinct identity; exact preserved rule body/map/exclusions;
  dependency-free entry; unchanged candidate and v1 bytes/behavior.
- O2: closed explicit descriptor, complete scan, missing formal/specialized
  procedures, unsupported risk scope and refusal of global capability repair.
- O3: all nine public byte seals and authentic mappings; unknown lookup returns
  null; drift, incomplete known-fixture refs and task-class spoofing are rejected.

The focused command is `node --test scripts/test-kernel-principles-v2.mjs
scripts/test-kernel-principles-candidate-v2.mjs scripts/test-kernel-principles.mjs`.
No model, CLI, start/resume, private evaluator, worker or ownership diagnostic is
part of verification. Successful checks support these structural obligations;
model quality and measured effectiveness remain unverified. Rollback removes
only these three new files after the parent removes any new integration refs.

Verified execution evidence on the delegated checkout (Node v24.19.0):

- E1: the v2 focused test initially exited 1 with `ERR_MODULE_NOT_FOUND` before
  the new renderer module existed, establishing the missing entry boundary.
- E2: the focused three-suite command above exited 0 after implementation and
  the task-signal record validation change: tests 29, pass 29, fail 0,
  cancelled/skipped/todo 0. It covers O1–O3, including all nine public seals,
  fixture mapping-record tampering, explicit procedure gaps and unknown scans.
- E3: source checks retain v1 module SHA-256
  `e63b711af8e4431ec48318a4932f8a50a13b896949141a2f2ce7b11cbcaed741`,
  candidate module SHA-256
  `389c9478a2141b08f380859bb3fd3d1147b7ab1041771f1ed0457d9ae345650d`,
  and candidate-test module SHA-256
  `255e4e489fdc2ef4d6f13f03fb7416da03b84c5ff99d6280c1ef04102b83a504`.
- E4: after aligning `mn-build-option-update` with the existing native
  `configuration → implementation` mapping, `node --test
  scripts/test-kernel-principles-v2.mjs` exited 0: tests 14, pass 14, fail 0.
  The generated entry body digest remains
  `sha256:82712609506fea5dfc61228c4f3dc4b764b2c772307f3ae192ce52ca15dc15a6`.

Implementation completion references E1–E4 and
`FVC-KERNEL-PRINCIPLES-V2-ADOPTION-1`. No entry-only blocker remains. Parent
integration and its independent review still need to verify the caller's exact
source/body/generation comparison and recognized-primary-only lookup. No
commit, push, model execution or measured effectiveness claim was made.
