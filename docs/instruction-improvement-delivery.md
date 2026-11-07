# Supervised improvement delivery evidence

Artifact `instruction-improvement-continuity-delivery@2`. Upstream contracts:
[`instruction-improvement-continuity-spec@2`](instruction-improvement-continuity.md)
and [`practical-evaluation-recovery-spec@1`](practical-evaluation-recovery.md).
This report describes implementation and verification scope. It does not grant
case approval, owner adoption, export permission or merge authority. Actual final
command outcomes and the exact source revision accompany the delivery handoff.

The independent-review follow-up adds [bounded environment and case-result
context](instruction-improvement-learning-context.md) to the actual authoring
input and shared next-cycle observation. Its separate verification contract and
source-bound outcomes supplement the earlier mechanical-cycle evidence.

## Requested outcomes

| Outcome | Connected behavior | Evidence boundary |
| --- | --- | --- |
| 1. Work feedback to candidates (#176) | Validated public work observations are grouped/ranked by destination and enter generation and case selection. | The host AI supplies the public observation; this is not an automatic raw-work-log collector. Broader Golden Rule maturity research and measured business improvement remain outside the proof. |
| 2. Two human judgments | Component and Full practical profiles use the existing case and change gates. Recovery assessment belongs to the AI. Inner Eval verifies the actual parent case approval. | Component tests execute actual local stages and synthetic approvals. Full source-backed integration separately mocks generation/registration. No real model or owner approval is claimed. |
| 3. Whole environment, individual assets | Component generation automatically composes layers/imports, invokes bounded authoring for Skill/Prompt create/revise/exclude and captures the complete declared environment. Known restrictions and executable helpers remain fixed. | Tests use a synthetic authoring provider and actual Registry/compiler/worker stages. A Codex model port exists but no real generation-quality result is claimed. |
| 4. Lifecycle | The exact candidate reaches target planning, change approval, existing file lifecycle/optional owner lease, Registry switching and owned cleanup. Restore has a fresh change-type judgment. Rejection retires only owned candidates and removes verified private copies. | Temporary owners only. Shared Assets, CAS and audit history are preserved. No generic CAS garbage collector or arbitrary destructive deletion is added. |
| 5. Resume/deduplication | Durable reservations protect dispatch. Positive owned completion evidence can reconstruct lost final generation/owner responses; pure preparation and immutable Registry steps can finish without repeating model/owner writes. Practical Eval retains its per-attempt recovery. | Pending owner markers/locks, missing positive evidence, replaced directories and local edits remain uncertain. Inspection does not clear them or overwrite user work. |
| 6. Continuing cycles | A bounded operation automatically prepares/starts fresh cycles, carries actual results/reasons/resources and keeps fresh case/change approvals. Current owner anchors are separate from latest rejected/restoration-declined results. No-op ends without fabricated trials. | Model-free two/three-cycle and restoration-refusal checks. No unattended indefinite scheduler, repeated live model operation or measured business benefit is claimed. |
| 7. Selected local export/import (#180) | v1 Markdown and v1.1 selected UTF-8 helper packages use preview/approval, checksums, dependency closure, quarantine, duplicate/conflict plans and new local candidates. | Import is inert, strips foreign authority/evaluation and does not preserve executable mode. Binaries/archives and undisclosed dependencies are not supported; scans do not establish legal permission or source authenticity. No transport or automatic sharing. |
| 8. Layer composition and receiving adoption | Exact common/specialist/application/personal locks feed automatic generation. A confirmed receiving import plan has explicit local mappings, then whole-environment Eval and the receiving change gate before adoption. | Actual helper-package-to-local-Eval-to-temporary-owner integration. Conflicts need explicit selection/adaptation; layer order never grants override authority. |

The first implementation exposed APIs that were not all connected to the normal
loop. Revision 2 adds the component candidate/application adapter, bounded
operation and owned completion inspection. The scoped Full/native source-backed
Skill revision path remains available; it is not relabeled as a general
create/exclude or authenticated Claude implementation.

## Practical Eval and application boundaries

The existing `skill-effectiveness-evaluation` skill and pragmatic reporter support
an opt-in practical lane. Frozen primary single-shot/no-resume contracts and
saved results stay unchanged. User-owned public tasks/checks/graders can replace
a fixed private grading dependency. The AI may use, reference, exclude, retry one
trial or fairly rerun all conditions within the approved budget and only after
positive process/provider closure. Valid poor quality alone does not trigger an
automatic retry. All original/replacement attempts, reasons, contexts, selection,
missing measurements and comparison limits remain in the ledger. Unknown cost
and usage stay null; generation, assessment and grading overhead are not silently
counted as free or as trial savings.

Component application is an explicit supervised normal-application path. It
verifies the actual journal's case/report/change binding and exact target plan;
it does not fabricate formal Evolution application/admission receipts. Preview
handles cannot apply. Logical activation/restoration is prepared before physical
writes. Restoration preserves recorded original Registry states, including an
initially captured candidate that had never been formally current.

Target completion receipts bind plan, inode, resulting state and exact bytes and
removals. Optional normal-owner leases also preserve original owner and protected
settings. Chained overlays return to the immediately preceding configuration;
a declined restore keeps the adopted baseline, and a later restore request needs
a distinct packet. A lost final response can use those receipts without another
owner write. Unknown partial effects retain the existing recovery boundary.

## Verification and review

The affected regression commands are:

```sh
node --experimental-test-module-mocks --test scripts/test-instruction-loop-feedback.mjs scripts/test-instruction-asset-package.mjs scripts/test-instruction-composition.mjs scripts/test-instruction-environment-authoring.mjs scripts/test-practical-evaluation-runner.mjs scripts/test-instruction-loop-practical-runtime.mjs scripts/test-supervised-instruction-loop.mjs scripts/test-instruction-loop-native-bindings.mjs scripts/test-instruction-loop-native-host.mjs scripts/test-ask-pragmatic-evaluation-report.mjs scripts/test-ci-full-run.mjs
node --test scripts/test-instruction-loop-component-runtime.mjs scripts/test-instruction-loop-component-recovery.mjs scripts/test-instruction-loop-receiving.mjs scripts/test-instruction-loop-operation.mjs scripts/test-instruction-loop-operation-resume.mjs scripts/test-instruction-loop-normal-chain.mjs scripts/test-instruction-loop-operator-cli.mjs
node --test scripts/test-instruction-environment.mjs scripts/test-instruction-environment-compiler.mjs scripts/test-environment-evolution.mjs scripts/test-environment-target.mjs scripts/test-environment-materialization.mjs scripts/test-environment-runtime-contract.mjs scripts/test-claude-native-runtime.mjs scripts/test-skill-assets.mjs scripts/test-skill-reference-canonical.mjs scripts/test-codex-skill-reference-preflight.mjs
node --experimental-test-module-mocks --test scripts/test-environment-evaluation.mjs scripts/test-environment-saved-results.mjs scripts/test-retained-instruction-bridge.mjs scripts/test-instruction-loop-generation-worker.mjs scripts/test-instruction-loop-reference-report.mjs scripts/test-instruction-loop-source-binding.mjs
node --test scripts/test-asset-registry.mjs scripts/test-portfolio-manager.mjs scripts/test-evolution-loop.mjs scripts/test-evolution-loop-integration.mjs
node --test scripts/test-environment-membership-adoption.mjs scripts/test-environment-owner-transfer.mjs
python3 -B scripts/test-instruction-loop-native-prepare.py
node scripts/validate-repo.mjs
```

Independent read-only review used a separate agent, code inspection and separate
executions of selected suites. Findings addressed preview-handle authority,
approved-plan substitution, prior owner snapshot/lease binding, original Registry
state restoration, substituted prepared runtimes, changed predecessor journals,
active-baseline continuity after rejection and restoration refusal, and positive
completion inspection. Later evidence does not erase earlier failed runs. Final
checks and unresolved findings, if any, are reported in the actual handoff;
selected-suite review alone is not proof of all user requirements or readiness.

## Operator and release boundary

Consumers can ask their host AI to prepare/evaluate an improvement, combine
layers, or package/import explicitly selected assets. `configure` creates the
pinned runtime configuration; `operate` advances an explicitly bounded operation;
`operation-status` is read-only. No ASK fork/source-branch workflow or separate
universal Eval skill is required. Initial trusted Registry/runtime, canonical
local paths, task inputs, authority inventories and destinations still need host
or administrator setup. This is not a standalone graphical operator interface.
The complete configured ASK runtime is required; copying a Skill alone does not
install the command runtime.

The instruction environment is the complete declared projection, not the entire
machine's ambient/global state. Local process-group/declared provider receipts do
not establish hostile-process isolation or inferred remote termination. Known
restrictions remain visible and foreign evidence never grants local execution or
adoption permission.

Claude-format authoring handoff/import, composition, local target operations and
existing restricted runtime contracts are supported. Subprocess authoring and
automatic-assessor model ports here are Codex ports. Authenticated Claude-app
dispatch is not implemented; real-model one/repeated cycles remain acceptance
work for the owner-provided environment. See the explicit missing ports and
execution order in [the readiness audit](instruction-improvement-readiness.md).
Real owner application/restore and measured business
value were not tested. No original 36-trial source/process/authentication/conditions
were changed, no new live cases were approved, and those implementation tests
performed no merge. PR454 was subsequently merged as `24da9de3`; this audit's
configuration-only follow-up is a separate change.
Publication and remote CI status must be taken from the actual delivery result.

Implementation Contract:
- Artifact ID: `instruction-improvement-continuity-implementation@2`.
- Upstream refs: the two specifications above; Issues #176 and #180.
- Actual change boundary: connected component generation/receiving application,
  bounded operation, v1.1 text helpers and completion inspection, retaining the
  first-stage feedback/practical Eval/Full integration and existing authority
  boundaries. Skill guidance, common CI and generated fixtures are updated.
- Verification attempted: affected executable suites, repository validation and
  independent review; exact completed outcomes accompany the source-bound handoff.
- Evidence references: this report, commands above and delivery logs/commit IDs.
- Selected Formal Verification Contract refs:
  `instruction-improvement-continuity-verification@2` and
  `practical-evaluation-recovery-verification@1` in the upstream documents.
- Handoff state: local implementation for review; publication, merge and live
  acceptance are separately authorized and reported.
