import {
  deriveAcceptanceRegistryDigest,
  deriveWorkPackagePlanContentDigest,
  deriveWorkPackagePlanId,
  evaluateEpicAdmission,
  sealEpicAdmissionPolicy,
  sealWorkPackagePlan,
  sealWorkPackagePlanValidationContext,
} from "../epic-admission-work-package-plan.mjs";
import { readJsonFileStrict } from "../content-addressed-store.mjs";
import { resolve } from "node:path";

const FIXTURE_ROOT = resolve(import.meta.dirname, "../..");
const PREVIOUS_CONTEXT_PATH = resolve(FIXTURE_ROOT, "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json");
const PREVIOUS_PLAN_PATH = resolve(FIXTURE_ROOT, "docs/fixtures/issue-275-slice-1-work-package-plan-r2.json");

export const ISSUE_275_REPOSITORY = Object.freeze({
  repository_id: "ist-h-i/agent-spectrum-kernel",
  base_commit: "05dfa851a57b21c628b8b5d83e83115327aff3ed",
  base_tree: "96d6b214dbed50be006fbf2ae11f6514a35be09f",
  branch: "feat/issue-275-epic-admission-work-package-plan",
});

export const ISSUE_275_GOAL_ID = "github:ist-h-i/agent-spectrum-kernel#275";
export const ISSUE_275_SPEC_ID = "SPEC-275-SLICE-1";
export const ISSUE_275_SPEC_REVISION = 1;
export const ISSUE_275_ACCEPTANCE_IDS = Object.freeze([
  "AC-275-S1-01-ORDINARY",
  "AC-275-S1-02-EPIC",
  "AC-275-S1-03-OWNERSHIP",
  "AC-275-S1-04-TOPOLOGY",
  "AC-275-S1-05-FAIL-CLOSED",
  "AC-275-S1-06-OVERRIDE",
  "AC-275-S1-07-LIFECYCLE",
  "AC-275-S1-08-DOGFOOD",
  "AC-275-S1-09-EVIDENCE-BOUNDARY",
]);

function signal(value, evidence_status = "verified", evidence_ref = ISSUE_275_GOAL_ID) {
  return { value, evidence_status, evidence_ref };
}

function acceptanceRegistryDigest(itemIds, artifactId = ISSUE_275_SPEC_ID) {
  return deriveAcceptanceRegistryDigest(itemIds.map((item_id) => ({ artifact_id: artifactId, item_id, observed_revision: 1 })));
}

export function buildEpicAdmissionPolicy() {
  return sealEpicAdmissionPolicy({
    policy_revision: 1,
    policy_key: "ASK-EPIC-ADMISSION-POLICY",
    rules: {
      configured_epic_goal_ids: [ISSUE_275_GOAL_ID],
      multi_boundary_threshold: {
        acceptance_condition_count: 4,
        scope_boundary_count: 2,
      },
      human_decision_scope_states: ["unknown", "unresolved", "contradictory"],
      accepted_authority_evidence_statuses: ["supported", "verified"],
      ai_estimates_may_decide: false,
      required_gates_non_overridable: true,
    },
    override_rules: [
      {
        rule_id: "OVERRIDE-PLAN-REQUIREMENT",
        from_decision: "work_package_plan_required",
        to_decision: "ordinary_execution_allowed",
        authority_grants: [],
        non_overridable_reason_codes: [
          "ADMISSION_SIGNAL_INSUFFICIENT",
          "CONFIGURED_EPIC_SIGNAL_CONTRADICTION",
          "SCOPE_CONTRADICTORY",
          "SCOPE_UNKNOWN",
          "SCOPE_UNRESOLVED",
        ],
        may_weaken_required_gates: false,
      },
    ],
  });
}

export function buildEpicAdmissionSubject(overrides = {}) {
  return {
    repository_id: ISSUE_275_REPOSITORY.repository_id,
    goal_id: ISSUE_275_GOAL_ID,
    task_id: "ISSUE-275-SLICE-1",
    base_commit: ISSUE_275_REPOSITORY.base_commit,
    base_tree: ISSUE_275_REPOSITORY.base_tree,
    branch: ISSUE_275_REPOSITORY.branch,
    ...overrides,
  };
}

export function buildObservedSignals(kind = "epic") {
  if (kind === "small") {
    return {
      configured_epic: signal(false, "verified", "fixture:small-task"),
      acceptance_condition_count: signal(1, "verified", "fixture:small-task"),
      acceptance_registry_digest: signal(acceptanceRegistryDigest(["AC-SMALL-1"], "SPEC-SMALL"), "verified", "fixture:small-task"),
      scope_boundary_count: signal(1, "verified", "fixture:small-task"),
      ordered_dependency: signal(false, "verified", "fixture:small-task"),
      independent_publication_units: signal(false, "verified", "fixture:small-task"),
      scope_resolution: signal("resolved", "verified", "fixture:small-task"),
      ai_estimated_complexity: signal("large", "hypothesis", "agent-estimate:ignored"),
    };
  }
  if (kind === "unresolved") {
    return {
      configured_epic: signal(true),
      acceptance_condition_count: signal(9),
      acceptance_registry_digest: signal(acceptanceRegistryDigest(ISSUE_275_ACCEPTANCE_IDS)),
      scope_boundary_count: signal(9),
      ordered_dependency: signal(true),
      independent_publication_units: signal(false),
      scope_resolution: signal("contradictory"),
      ai_estimated_complexity: signal("large", "hypothesis", "agent-estimate:bootstrap"),
    };
  }
  return {
    configured_epic: signal(true),
    acceptance_condition_count: signal(9),
    acceptance_registry_digest: signal(acceptanceRegistryDigest(ISSUE_275_ACCEPTANCE_IDS)),
    scope_boundary_count: signal(9),
    ordered_dependency: signal(true),
    independent_publication_units: signal(false),
    scope_resolution: signal("resolved"),
    ai_estimated_complexity: signal("large", "hypothesis", "agent-estimate:bootstrap"),
  };
}

export function buildEpicAdmissionDecision({ policy = buildEpicAdmissionPolicy(), kind = "epic", override_request = null } = {}) {
  const subject = kind === "small"
    ? buildEpicAdmissionSubject({ goal_id: "github:ist-h-i/agent-spectrum-kernel#small-fixture", task_id: "SMALL-FIXTURE" })
    : buildEpicAdmissionSubject();
  return evaluateEpicAdmission({
    policy,
    subject,
    observed_signals: buildObservedSignals(kind),
    override_request,
    decision_revision: 1,
  });
}

const upstreamRefs = Object.freeze([
  { artifact_id: "ROADMAP-170", observed_revision: 1 },
  { artifact_id: ISSUE_275_SPEC_ID, observed_revision: ISSUE_275_SPEC_REVISION },
]);

const forbiddenScope = Object.freeze([
  { kind: "repository_path", value: "benchmarks", match: "subtree" },
  { kind: "repository_path", value: "docs/verification-evidence-contract.md", match: "exact" },
  { kind: "repository_path", value: "scripts/content-addressed-store.mjs", match: "exact" },
]);

const FULL_GATES = Object.freeze([
  ["GATE-EXACT-HEAD-CI", "Confirm required GitHub Actions succeeded for the exact independently reviewed candidate HEAD."],
  ["GATE-FRESH-CLONE", "Run all locally reproducible candidate checks in a fresh detached clone."],
  ["GATE-FULL-LOCAL", "Run every locally reproducible command from the current pull-request workflow."],
  ["GATE-INDEPENDENT-REVIEW", "Obtain a fresh exact-head independent decision with zero Blocker and Major findings."],
  ["GATE-INTEGRATION", "Validate the candidate merged with current origin/main in a disposable integration worktree."],
  ["GATE-MERGE-REFRESH", "Refresh PR head, base, mergeability, CI, review and Issue state immediately before merge."],
]);

const REVISION_REASON = "Independent adversarial and test-gap review found that r2 left approval outcome ownership and lifecycle Work Package projection ambiguous; r3 preserves r2 and binds trusted approval evidence plus the lifecycle projection surface.";

function expectedArtifact(artifact_id, path, classification = "manual") {
  return { artifact_id, path, classification };
}

function workPackage({
  package_id,
  planId,
  planRevision,
  dependsOn,
  allowedPaths,
  tasks,
  dependencies,
  artifacts,
  evidenceIds,
  stackBase,
  stopConditions,
}) {
  return {
    package_id,
    artifact_id: `WORK-PACKAGE-275-S1-${package_id}`,
    artifact_type: "work_package",
    revision: planRevision,
    plan_binding: { plan_id: planId, plan_revision: planRevision },
    target_binding: { ...ISSUE_275_REPOSITORY },
    upstream_refs: upstreamRefs.map((reference) => ({ ...reference })),
    depends_on_package_ids: dependsOn,
    allowed_scope: allowedPaths.map((value) => ({ kind: "repository_path", value, match: "exact" })),
    forbidden_scope: forbiddenScope.map((entry) => ({ ...entry })),
    ordered_tasks: tasks.map((description, index) => ({ task_id: `${package_id}-T${index + 1}`, description })),
    dependencies,
    expected_artifacts: artifacts,
    expected_evidence_ids: evidenceIds,
    stop_conditions: stopConditions.map(([code, condition]) => ({ code, condition })),
    stack_base: stackBase,
  };
}

export function buildIssue275PlanBundle() {
  const policy = buildEpicAdmissionPolicy();
  const decision = buildEpicAdmissionDecision({ policy });
  const previousContext = readJsonFileStrict(PREVIOUS_CONTEXT_PATH, "Issue #275 accepted Work Package Plan context r1");
  const previousPlan = readJsonFileStrict(PREVIOUS_PLAN_PATH, "Issue #275 accepted Work Package Plan r1");
  const planRevision = previousPlan.plan_revision + 1;
  const contextRevision = previousContext.context_revision + 1;
  const planId = deriveWorkPackagePlanId({
    goal_id: ISSUE_275_GOAL_ID,
    repository: ISSUE_275_REPOSITORY,
    upstream_refs: upstreamRefs,
  });
  const contextDraft = {
    context_revision: contextRevision,
    supersedes_context_ref: {
      context_id: previousContext.context_id,
      context_revision: previousContext.context_revision,
      context_digest: previousContext.context_digest,
    },
    supersedes_plan_ref: {
      plan_id: previousPlan.plan_id,
      plan_revision: previousPlan.plan_revision,
      plan_digest: previousPlan.plan_digest,
    },
    revision_reason: REVISION_REASON,
    context_key: "ISSUE-275-SLICE-1-CURRENT-AUTHORITY",
    goal_id: ISSUE_275_GOAL_ID,
    repository: { ...ISSUE_275_REPOSITORY },
    current_policy_ref: {
      policy_id: policy.policy_id,
      policy_revision: policy.policy_revision,
      policy_digest: policy.policy_digest,
    },
    current_admission_decision_ref: {
      decision_id: decision.decision_id,
      decision_revision: decision.decision_revision,
      decision_digest: decision.decision_digest,
    },
    current_plan_ref: {
      plan_id: planId,
      plan_revision: planRevision,
      lifecycle_state: "accepted",
      plan_content_digest: `sha256:${"0".repeat(64)}`,
    },
    upstream_artifacts: [
      {
        artifact_id: "ROADMAP-170",
        artifact_type: "compact",
        revision: 1,
        source_ref: "github:ist-h-i/agent-spectrum-kernel#170@2026-08-24",
        item_ids: [],
      },
      {
        artifact_id: ISSUE_275_SPEC_ID,
        artifact_type: "spec",
        revision: ISSUE_275_SPEC_REVISION,
        source_ref: "github:ist-h-i/agent-spectrum-kernel#275@2026-08-24-slice-1",
        item_ids: [...ISSUE_275_ACCEPTANCE_IDS],
      },
    ],
    required_full_checkpoint_ids: [
      "CHECKPOINT-EXACT-HEAD-CI",
      "CHECKPOINT-FRESH-CLONE",
      "CHECKPOINT-FULL-LOCAL",
      "CHECKPOINT-INDEPENDENT-REVIEW",
      "CHECKPOINT-INTEGRATION",
      "CHECKPOINT-MERGE-REFRESH",
    ],
    non_overridable_gates: FULL_GATES.map(([verification_id, purpose]) => ({
      verification_id,
      procedure: purpose,
      purpose,
    })),
    known_blockers: [],
    required_human_decisions: [],
    required_human_approvals: [],
  };
  let context = sealWorkPackagePlanValidationContext(contextDraft);

  const packages = [
    workPackage({
      package_id: "WP3",
      planId,
      planRevision,
      dependsOn: [],
      allowedPaths: [
        "docs/fixtures/epic-admission-policy.json",
        "docs/fixtures/issue-275-slice-1-epic-admission-decision.json",
        "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json",
        "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r1.json",
        "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json",
        "docs/fixtures/issue-275-slice-1-work-package-plan.json",
        "docs/fixtures/issue-275-slice-1-work-package-plan-r1.json",
        "docs/fixtures/issue-275-slice-1-work-package-plan-r2.json",
        "schemas/epic-admission-decision.schema.json",
        "schemas/epic-admission-policy.schema.json",
        "schemas/work-package-plan-validation-context.schema.json",
        "schemas/work-package-plan.schema.json",
        "scripts/epic-admission-work-package-plan.mjs",
      ],
      tasks: [
        "Preserve the already-created bootstrap contract and validator artifacts without claiming retroactive validation.",
        "Materialize the current authority context and the remaining WP3-WP6 topology.",
        "Validate the accepted plan and its rejection of contradictory branch/publication topology.",
      ],
      dependencies: ["Issue #275 Slice 1 bootstrap contracts and provisional Work Package topology"],
      artifacts: [
        expectedArtifact("ART-275-ADMISSION-DECISION-SCHEMA", "schemas/epic-admission-decision.schema.json"),
        expectedArtifact("ART-275-ADMISSION-POLICY", "docs/fixtures/epic-admission-policy.json"),
        expectedArtifact("ART-275-ADMISSION-POLICY-SCHEMA", "schemas/epic-admission-policy.schema.json"),
        expectedArtifact("ART-275-CANONICAL-CONTEXT", "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context.json"),
        expectedArtifact("ART-275-CANONICAL-CONTEXT-R1", "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r1.json"),
        expectedArtifact("ART-275-CANONICAL-CONTEXT-R2", "docs/fixtures/issue-275-slice-1-work-package-plan-validation-context-r2.json"),
        expectedArtifact("ART-275-CANONICAL-DECISION", "docs/fixtures/issue-275-slice-1-epic-admission-decision.json"),
        expectedArtifact("ART-275-CANONICAL-PLAN", "docs/fixtures/issue-275-slice-1-work-package-plan.json"),
        expectedArtifact("ART-275-CANONICAL-PLAN-R1", "docs/fixtures/issue-275-slice-1-work-package-plan-r1.json"),
        expectedArtifact("ART-275-CANONICAL-PLAN-R2", "docs/fixtures/issue-275-slice-1-work-package-plan-r2.json"),
        expectedArtifact("ART-275-CONTEXT-SCHEMA", "schemas/work-package-plan-validation-context.schema.json"),
        expectedArtifact("ART-275-PLAN-SCHEMA", "schemas/work-package-plan.schema.json"),
        expectedArtifact("ART-275-SEMANTIC-VALIDATOR", "scripts/epic-admission-work-package-plan.mjs"),
      ],
      evidenceIds: ["FOCUSED-CANONICAL-PLAN"],
      stackBase: { kind: "repository_base", package_id: null },
      stopConditions: [
        ["CANNOT-PROVE-PLAN-TOPOLOGY", "The validator cannot accept this remaining topology or reject contradictory topology."],
        ["SHARED-CAS-CHANGE-REQUIRED", "The generic CAS contract or layout would need to change."],
      ],
    }),
    workPackage({
      package_id: "WP4",
      planId,
      planRevision,
      dependsOn: ["WP3"],
      allowedPaths: [
        "docs/fixtures/epic-admission-work-package-plan-cases.json",
        "scripts/test-epic-admission-work-package-plan.mjs",
        "scripts/test-fixtures/epic-admission-work-package-plan-fixture.mjs",
      ],
      tasks: [
        "Add the required positive and negative fixture catalog.",
        "Exercise Schema parity, deterministic identities, fail-closed semantics, tamper and transplant cases.",
        "Address bounded adversarial and test-gap review findings inside Slice 1.",
      ],
      dependencies: ["Accepted WP3 contract and validator baseline"],
      artifacts: [
        expectedArtifact("ART-275-CASE-CATALOG", "docs/fixtures/epic-admission-work-package-plan-cases.json"),
        expectedArtifact("ART-275-FOCUSED-TEST", "scripts/test-epic-admission-work-package-plan.mjs"),
        expectedArtifact("ART-275-TEST-FIXTURE-BUILDER", "scripts/test-fixtures/epic-admission-work-package-plan-fixture.mjs"),
      ],
      evidenceIds: ["FOCUSED-CONTRACT-TESTS"],
      stackBase: { kind: "package", package_id: "WP3" },
      stopConditions: [
        ["VALIDATION-UNSTABLE", "Repeated identical inputs produce different artifacts or issue ordering."],
        ["SLICE-1-SCOPE-EXPANSION", "A required fixture needs checkpoint, runtime telemetry, benchmark, or #274 authority changes."],
      ],
    }),
    workPackage({
      package_id: "WP5",
      planId,
      planRevision,
      dependsOn: ["WP4"],
      allowedPaths: [
        ".github/ask-automation/validation-plan.json",
        ".github/workflows/validate.yml",
        "CHANGELOG.md",
        "README.md",
        "docs/adr/0002-epic-admission-work-package-plan-authority.md",
        "docs/ask-autonomous-development.md",
        "docs/epic-admission-work-package-plan-contract.md",
        "docs/fixtures/lifecycle-artifact-chains.json",
        "docs/lifecycle-artifact-contract.md",
        "manifest.json",
        "scripts/test-ask-autonomous-development.mjs",
        "scripts/test-validate-repo.mjs",
        "scripts/validate-repo.mjs",
        "skills/work-package-compiler/SKILL.md",
      ],
      tasks: [
        "Register schemas, fixtures, validator, focused CI command and immutable validation plan command.",
        "Document lifecycle, authority, non-equivalence, and Slice 1 boundaries.",
        "Record the cross-cutting current-context decision in ADR-0002.",
      ],
      dependencies: ["Focused contract suite for accepted WP4 semantics"],
      artifacts: [
        expectedArtifact("ART-275-ADR", "docs/adr/0002-epic-admission-work-package-plan-authority.md"),
        expectedArtifact("ART-275-AUTOMATION-DOC", "docs/ask-autonomous-development.md"),
        expectedArtifact("ART-275-AUTOMATION-PLAN", ".github/ask-automation/validation-plan.json"),
        expectedArtifact("ART-275-CHANGELOG", "CHANGELOG.md"),
        expectedArtifact("ART-275-CI", ".github/workflows/validate.yml"),
        expectedArtifact("ART-275-CONTRACT", "docs/epic-admission-work-package-plan-contract.md"),
        expectedArtifact("ART-275-LIFECYCLE-FIXTURE", "docs/fixtures/lifecycle-artifact-chains.json"),
        expectedArtifact("ART-275-LIFECYCLE-ARTIFACT", "docs/lifecycle-artifact-contract.md"),
        expectedArtifact("ART-275-MANIFEST", "manifest.json"),
        expectedArtifact("ART-275-README", "README.md"),
        expectedArtifact("ART-275-AUTOMATION-PLAN-TEST", "scripts/test-ask-autonomous-development.mjs"),
        expectedArtifact("ART-275-REPO-TEST", "scripts/test-validate-repo.mjs"),
        expectedArtifact("ART-275-REPO-VALIDATOR", "scripts/validate-repo.mjs"),
        expectedArtifact("ART-275-WORK-PACKAGE-SKILL", "skills/work-package-compiler/SKILL.md"),
      ],
      evidenceIds: ["FOCUSED-REPOSITORY-INTEGRATION"],
      stackBase: { kind: "package", package_id: "WP4" },
      stopConditions: [
        ["UNEXPECTED-GENERATED-SCOPE", "A generator changes a path outside the four known generated artifacts."],
        ["NEW-CANONICAL-SKILL-REQUIRED", "Integration cannot proceed without a new canonical Skill."],
      ],
    }),
    workPackage({
      package_id: "WP6",
      planId,
      planRevision,
      dependsOn: ["WP5"],
      allowedPaths: [
        "docs/fixtures/adapter-runtime-bundle.json",
        "docs/fixtures/adapter-runtime-evidence.json",
        "docs/fixtures/adapter-runtime-profiles.json",
        "docs/validation-report.md",
      ],
      tasks: [
        "Refresh only the expected generated artifacts and prove deterministic second-run stability.",
        "Run focused, full, fresh-clone and merge-integration verification.",
        "Freeze the candidate for independent exact-head review and complete the gated PR lifecycle.",
      ],
      dependencies: ["Repository integration and documentation from WP5"],
      artifacts: [
        expectedArtifact("ART-275-GENERATED-BUNDLE", "docs/fixtures/adapter-runtime-bundle.json", "generated"),
        expectedArtifact("ART-275-GENERATED-EVIDENCE", "docs/fixtures/adapter-runtime-evidence.json", "generated"),
        expectedArtifact("ART-275-GENERATED-PROFILES", "docs/fixtures/adapter-runtime-profiles.json", "generated"),
        expectedArtifact("ART-275-VALIDATION-REPORT", "docs/validation-report.md", "generated"),
      ],
      evidenceIds: [
        "FOCUSED-GENERATED-PARITY",
        "GATE-EXACT-HEAD-CI",
        "GATE-FRESH-CLONE",
        "GATE-FULL-LOCAL",
        "GATE-INDEPENDENT-REVIEW",
        "GATE-INTEGRATION",
        "GATE-MERGE-REFRESH",
      ],
      stackBase: { kind: "package", package_id: "WP5" },
      stopConditions: [
        ["INDEPENDENT-REVIEW-BLOCKED", "Blocker or Major findings cannot be corrected inside Slice 1."],
        ["CI-FAILED", "Exact-head required CI cannot be made green inside Slice 1."],
        ["BASE-CHANGED-REVIEW-INVALIDATED", "Current main changes the effective reviewed integration and re-review cannot be completed."],
      ],
    }),
  ];

  const acceptanceOwner = new Map([
    ["AC-275-S1-01-ORDINARY", "WP4"],
    ["AC-275-S1-02-EPIC", "WP4"],
    ["AC-275-S1-03-OWNERSHIP", "WP3"],
    ["AC-275-S1-04-TOPOLOGY", "WP3"],
    ["AC-275-S1-05-FAIL-CLOSED", "WP4"],
    ["AC-275-S1-06-OVERRIDE", "WP4"],
    ["AC-275-S1-07-LIFECYCLE", "WP5"],
    ["AC-275-S1-08-DOGFOOD", "WP3"],
    ["AC-275-S1-09-EVIDENCE-BOUNDARY", "WP5"],
  ]);
  const acceptanceOwnership = ISSUE_275_ACCEPTANCE_IDS.map((item_id) => ({
    acceptance_ref: { artifact_id: ISSUE_275_SPEC_ID, item_id, observed_revision: ISSUE_275_SPEC_REVISION },
    mode: "exclusive",
    owner_package_ids: [acceptanceOwner.get(item_id)],
    shared_reason: null,
  }));
  const integrationOrder = packages.map((workPackageRecord) => workPackageRecord.package_id);
  const artifactIds = [...new Set(packages.flatMap((workPackageRecord) => workPackageRecord.expected_artifacts.map((artifact) => artifact.artifact_id)))].sort();
  const planDraft = {
    plan_revision: planRevision,
    supersedes_plan_ref: {
      plan_id: previousPlan.plan_id,
      plan_revision: previousPlan.plan_revision,
      plan_digest: previousPlan.plan_digest,
    },
    revision_reason: REVISION_REASON,
    goal_id: ISSUE_275_GOAL_ID,
    lifecycle_state: "accepted",
    repository: { ...ISSUE_275_REPOSITORY },
    validation_context_ref: {
      context_id: context.context_id,
      context_revision: context.context_revision,
      context_digest: context.context_digest,
    },
    admission_decision_ref: {
      decision_id: decision.decision_id,
      decision_revision: decision.decision_revision,
      decision_digest: decision.decision_digest,
    },
    upstream_refs: upstreamRefs.map((reference) => ({ ...reference })),
    packages,
    acceptance_ownership: acceptanceOwnership,
    topology: {
      execution_model: "stacked_work_packages",
      branch_model: "single_branch",
      integration_order: integrationOrder,
      publication_units: [
        {
          unit_id: "PUB-275-S1-ONE-PR",
          kind: "pull_request",
          branch: ISSUE_275_REPOSITORY.branch,
          base_commit: ISSUE_275_REPOSITORY.base_commit,
          package_ids: integrationOrder,
          artifact_ids: artifactIds,
        },
      ],
      review_units: [
        {
          unit_id: "REVIEW-275-S1-EXACT-HEAD",
          publication_unit_id: "PUB-275-S1-ONE-PR",
          review_state: "planned",
          required_review_kind: "independent_exact_head",
          package_ids: integrationOrder,
          artifact_ids: artifactIds,
        },
      ],
    },
    verification: {
      steps: [
        { verification_id: "FOCUSED-CANONICAL-PLAN", kind: "focused", procedure: "node scripts/epic-admission-work-package-plan.mjs --check", purpose: "Validate the canonical policy, decision, context, plan and case inventory." },
        { verification_id: "FOCUSED-CONTRACT-TESTS", kind: "focused", procedure: "node scripts/test-epic-admission-work-package-plan.mjs", purpose: "Exercise positive and exact negative contract oracles." },
        { verification_id: "FOCUSED-GENERATED-PARITY", kind: "focused", procedure: "Run artifact updaters twice and require byte-identical generated output.", purpose: "Prove deterministic generated artifacts." },
        { verification_id: "FOCUSED-REPOSITORY-INTEGRATION", kind: "focused", procedure: "node scripts/test-validate-repo.mjs && node scripts/validate-repo.mjs", purpose: "Prove repository registration and report integration." },
        ...FULL_GATES.map(([verification_id, purpose]) => ({ verification_id, kind: "full", procedure: purpose, purpose })),
      ],
      focused_cadence: [
        { after_package_id: "WP3", verification_ids: ["FOCUSED-CANONICAL-PLAN"] },
        { after_package_id: "WP4", verification_ids: ["FOCUSED-CONTRACT-TESTS"] },
        { after_package_id: "WP5", verification_ids: ["FOCUSED-REPOSITORY-INTEGRATION"] },
        { after_package_id: "WP6", verification_ids: ["FOCUSED-GENERATED-PARITY"] },
      ],
      full_gate_checkpoints: FULL_GATES.map(([verificationId]) => ({
        checkpoint_id: verificationId.replace("GATE-", "CHECKPOINT-"),
        after_package_ids: integrationOrder,
        verification_ids: [verificationId],
        required_for_merge: true,
      })),
    },
    unresolved_decisions: [],
    human_approvals: [],
    blockers: [],
  };
  let plan = sealWorkPackagePlan(planDraft);
  const planContentDigest = deriveWorkPackagePlanContentDigest(plan);
  context = sealWorkPackagePlanValidationContext({
    ...contextDraft,
    current_plan_ref: {
      ...contextDraft.current_plan_ref,
      plan_content_digest: planContentDigest,
    },
  });
  plan = sealWorkPackagePlan({
    ...planDraft,
    validation_context_ref: {
      context_id: context.context_id,
      context_revision: context.context_revision,
      context_digest: context.context_digest,
    },
  });
  if (deriveWorkPackagePlanContentDigest(plan) !== planContentDigest) {
    throw new Error("Issue #275 plan content digest changed while closing the context binding");
  }
  return { policy, decision, context, plan, previousContext, previousPlan };
}
