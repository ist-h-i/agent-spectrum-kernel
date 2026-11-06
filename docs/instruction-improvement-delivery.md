# Supervised improvement delivery evidence

Artifact `instruction-improvement-continuity-delivery@1`. Upstream contracts:
[`instruction-improvement-continuity-spec@1`](instruction-improvement-continuity.md)
and [`practical-evaluation-recovery-spec@1`](practical-evaluation-recovery.md).
This report describes implementation and verification scope; it does not grant
case approval, owner adoption, export permission, or merge authority.

## Requested outcomes

| Outcome | Delivered behavior | Evidence and remaining acceptance |
| --- | --- | --- |
| 1. Work feedback to candidates (#176) | Validated public work observations are grouped/ranked by destination; instruction findings feed native generation and case-selection tags. Other findings retain their narrower destination. | Feedback and native-binding tests. Broader Golden Rule maturity research and measured business improvement remain unproven. |
| 2. Two human judgments | The supervised practical profile reuses generation/Registry/owner stages and the existing case and application gates. Inner Eval verifies the actual parent case approval; recovery assessments belong to the AI. | Supervised and practical integration tests. Integration mocks generation/registration, and uses synthetic approvals; no real model or owner approval is claimed. |
| 3. Environment Eval, individual assets | Whole compiled environments are compared; host-owned requests support Skill/Prompt create/revise/exclude. The agent supplies Markdown, while executable helpers and known restrictions remain fixed. | Authoring/compiler/composition tests and existing environment suites. Claude authoring preparation/import is available; native Full generation/install stays Codex-specific. |
| 4. Lifecycle | Existing approval, refusal, versioning, restore and owned cleanup paths are reused. Exclusion does not delete shared assets. Imported assets are new unevaluated local candidates. | Existing Evolution, Registry, Portfolio and artificial owner-adoption/transfer regressions. Real owner restore and sustained operation remain unverified. |
| 5. Resume and deduplication | Digest-chained durable reservations and immutable command evidence protect dispatch. An interrupted practical evaluation inspects its consumed jobs; other consumed lifecycle stages do not replay. | Supervisor/runtime and practical failure, late evidence, stale choice, unknown closure and repeated-resume tests. Unknown remote activity prevents further trial launches. |
| 6. Next cycle | Completed journals prepare fresh runtime/profile/policy pins, baseline and observations, carrying decisions, result uncertainty and resource evidence without carrying approval. | Native binding, continuation and practical integration tests. No repeated live model cycle was run. |
| 7. Selected local export/import (#180) | Explicit preview/approval, bounded content checks, dependency closure, quarantine, duplicate/conflict planning and exact local candidate import. Foreign authority/evaluation is reset. | Package tests, including TOCTOU and risk-declaration checks. Markdown Skill/Prompt packages only; transport, legal permission, source authenticity and arbitrary executable packaging are outside this implementation. |
| 8. Configuration composition | Common, specialist, application and personal layers pin exact local assets; explicit exclusions and conflicts are reviewed before compiler/Registry/Portfolio admission. | Composition/authoring and existing receiving-side adoption tests. No cross-environment automatic sharing or conflict resolution. |

## Practical Eval

The existing `skill-effectiveness-evaluation` skill and pragmatic reporter now
support an opt-in practical lane. The original primary single-shot/no-resume
contracts remain unchanged, including already-running evaluations. User-owned
public tasks, checks and graders can be configured without fixed private grading
assets. The configured full ASK runtime is required; copying a skill alone does
not install the command runtime.

The runner retains original attempts and all later attempts, execution/provider
closure, contexts, missing dimensions, decisions, retry reasons, selection and
comparison limits. The AI may use, reference, exclude, retry one trial or rerun
all conditions of a case for fairness. Retries are bounded and require positive
closure evidence. A valid quality failure is an observation, not an automatic
retry trigger. Unknown measurements remain null; assessment/grading overhead is
reported separately. No attractive-score selection basis is accepted.

The local worker executes actual model-free subprocess checks in fresh
workspaces. It checks declared instruction bytes/modes before and after tasks,
discovers bounded local instruction additions, distinguishes quality failure from
execution failure and retains task completion when a grader/harness fails.
Provider receipts bind request, command and task/grade invocation and require
fresh destinations. Pinned criteria copied into the workspace are rechecked
before grading. Declared pins and local owned process groups are the guarantee
boundary; ambient context, hostile-process isolation and remote provider
termination are not inferred.

## Verification evidence

The final source checks are recorded in the Draft PR's validation section.
Reproduction commands for the affected areas:

```sh
node --experimental-test-module-mocks --test scripts/test-instruction-loop-feedback.mjs scripts/test-instruction-asset-package.mjs scripts/test-instruction-composition.mjs scripts/test-instruction-environment-authoring.mjs scripts/test-practical-evaluation-runner.mjs scripts/test-instruction-loop-practical-runtime.mjs scripts/test-supervised-instruction-loop.mjs scripts/test-instruction-loop-native-bindings.mjs scripts/test-instruction-loop-command-runtime.mjs scripts/test-instruction-loop-native-host.mjs scripts/test-ask-pragmatic-evaluation-report.mjs scripts/test-ci-full-run.mjs
node --test scripts/test-instruction-environment.mjs scripts/test-instruction-environment-compiler.mjs scripts/test-environment-evolution.mjs scripts/test-environment-target.mjs scripts/test-environment-materialization.mjs scripts/test-environment-runtime-contract.mjs scripts/test-claude-native-runtime.mjs scripts/test-skill-assets.mjs scripts/test-skill-reference-canonical.mjs scripts/test-codex-skill-reference-preflight.mjs
node --test scripts/test-asset-registry.mjs scripts/test-portfolio-manager.mjs scripts/test-evolution-loop.mjs scripts/test-evolution-loop-integration.mjs
node --test scripts/test-environment-membership-adoption.mjs scripts/test-environment-owner-transfer.mjs
node scripts/validate-repo.mjs
git diff --check
```

Independent read-only review found no unresolved blocker. Its last execution of
the practical/integration/CI-contract/reporter suites passed 32/32 tests, including
the pinned-grader regression. Architecture/domain gates passed; output and
adversarial gates passed with scope comments. Final source-bound repository
validation and remote CI are separately reported, not inferred from that review.

## Operator and release boundary

Consumers ask their host agent to prepare/evaluate an improvement, compose a
configuration, or package/import explicitly selected assets. They do not need an
ASK fork or source branch workflow. An administrator must initially configure the
trusted local Registry, runtime, user-owned test inputs and destinations. The
operator commands and exact input contracts are in the two upstream documents;
this change does not add a separate graphical operator interface.

No new live Eval cases were approved, no real owner configuration was changed,
no original 36-trial work area/process/authentication was modified, and no merge
was performed. Real-model one-cycle execution, real-owner restore, repeated live
cycles and measured business value still need owner-approved acceptance. The
authenticated Claude-app check is explicitly deferred until the owner supplies
that environment.

Implementation Contract:
- Artifact ID: `instruction-improvement-continuity-implementation@1`.
- Upstream refs: the two specifications above; Issues #176 and #180.
- Actual change boundary: opt-in feedback/asset lifecycle/practical Eval runtime,
  existing supervised integration, skill guidance, common CI and generated
  adapter fixtures. No new dependencies, production deployment or primary score
  changes.
- Verification attempted: affected tests, repository validation and independent
  review, with exact completed outcomes in the PR.
- Evidence references: this report, executable suites above and PR validation.
- Selected Formal Verification Contract ref:
  `instruction-improvement-continuity-verification@1` and
  `practical-evaluation-recovery-verification@1` in the upstream documents.
- Handoff state: Draft PR for review; merge and live acceptance remain separate.
