import assert from "node:assert/strict";

import { canonicalDigest } from "./content-addressed-store.mjs";

import {
  buildEvolutionApplicationReceipt,
  buildEvolutionCandidate,
  buildEvolutionExperiment,
  buildEvolutionHumanDecision,
  computePromptV2ExactProjectionDigests,
  deriveEvolutionActionProposal,
  deriveEvolutionRecommendation,
  validateEvolutionCandidate,
  validateEvolutionExperiment,
  validateEvolutionRecommendation,
} from "./evolution-loop.mjs";

const D = Object.freeze(Object.fromEntries(
  "0123456789abcdef".split("").map((key, index) => [key, `sha256:${index.toString(16).repeat(64)}`]),
));

function assetRef({ version, recordDigest, contentDigest }) {
  return {
    asset_type: "prompt_template",
    stable_id: "ask.prompt-template.codex.skill-verify",
    version,
    record_digest: recordDigest,
    content_digest: contentDigest,
  };
}

const parentAsset = assetRef({
  version: "git:1111111111111111111111111111111111111111",
  recordDigest: D[1],
  contentDigest: D[2],
});
const candidateAsset = assetRef({
  version: "git:2222222222222222222222222222222222222222",
  recordDigest: D[3],
  contentDigest: D[4],
});
const parentPortfolio = {
  portfolio_id: "ask.portfolio.reference",
  revision: "baseline-v1",
  manifest_digest: D[5],
  asset_set_digest: D[6],
  lock_digest: D[7],
};

function candidateDraft() {
  return {
    schema_version: "1.0.0",
    object_kind: "evolution_candidate",
    candidate_id: "prompt-v2-candidate",
    parent_asset: structuredClone(parentAsset),
    parent_portfolio: structuredClone(parentPortfolio),
    candidate_asset: structuredClone(candidateAsset),
    registry: {
      registry_id: "ask-local-assets",
      repository_id: "github.com/ist-h-i/agent-spectrum-kernel",
      scope_id: "agent-spectrum-kernel",
      snapshot_revision: 5,
      snapshot_digest: D[8],
    },
    delta: {
      kind: "full_content_revision",
      summary: "one bounded prompt instruction revision",
      delta_digest: D[9],
    },
    generation: {
      source: "human_authored_revision",
      actor: {
        kind: "human_author",
        actor_id: "candidate-authority",
        authority_evidence_digest: D.a,
      },
    },
    hypothesis: {
      intended_mechanism: "reduce ambiguous verification instructions",
      applicability: "local implementation tasks in the bounded canary",
    },
    factors: {
      design: "one_factor",
      changed: [{ factor_id: "prompt_instruction_content", identity_digest: D.b }],
      frozen: [
        { factor_id: "model", identity_digest: D.c },
        { factor_id: "fixture_set", identity_digest: D.d },
      ],
    },
    evaluation_scope: {
      fixture_ids: ["mn-build-option-update"],
      task_classes: ["implementation"],
      exclusions: [],
    },
    assurance_lane: "challenger",
    expected_upside: ["clearer verification boundary"],
    risks: ["extra prompt overhead"],
    retirement_condition: "verified safety regression",
    rollback: {
      condition: "candidate causes a verified regression",
      parent_asset: structuredClone(parentAsset),
      parent_portfolio: structuredClone(parentPortfolio),
    },
    prohibited_effects: ["production_mutation", "external_notification"],
    authorities: {
      experiment: {
        kind: "external_evolution_experiment_authority",
        authority_id: "experiment-authority",
        authority_revision: 1,
        authority_evidence_digest: D.e,
      },
      decision: {
        kind: "external_evolution_human_decision_authority",
        authority_id: "decision-authority",
        authority_revision: 1,
        authority_evidence_digest: D.f,
      },
    },
  };
}

function experimentDraft(candidate) {
  const role = (name, selectionDigest, selectionObjectDigest, lockDigest, manifestDigest, assetSetDigest, asset) => ({
    role: name,
    portfolio: {
      portfolio_id: "ask.portfolio.reference",
      revision: `${name}-v1`,
      manifest_digest: manifestDigest,
      asset_set_digest: assetSetDigest,
      lock_digest: lockDigest,
    },
    registry_snapshot_digest: candidate.registry.snapshot_digest,
    selection_object_digest: selectionObjectDigest,
    selection_digest: selectionDigest,
    selected_asset: structuredClone(asset),
  });
  return {
    schema_version: "1.0.0",
    object_kind: "evolution_experiment",
    experiment_id: "prompt-v2-canary-1",
    phase: "pre_result",
    results_accessed: false,
    candidate_digest: candidate.candidate_digest,
    candidate_object_digest: D[0],
    roles: {
      baseline: role("baseline", D[1], D[2], D[7], D[5], D[6], candidate.parent_asset),
      challenger: role("challenger", D[3], D[4], D[8], D[9], D.a, candidate.candidate_asset),
    },
    projection: {
      mode: "fixed_b1_exact",
      baseline_condition: "kernel_only",
      challenger_condition: "adaptive_ask",
      mapping_digest: D.b,
      projection_evidence_digest: D.c,
    },
    protocol: {
      source_revision: "2222222222222222222222222222222222222222",
      tree_digest: D.d,
      model: "gpt-5.6-sol",
      cli: { name: "codex", version: "1.0.0", identity_digest: D.e },
      adapter: { name: "codex", version: "1.0.0", identity_digest: D.f },
      fixture_ids: ["mn-build-option-update"],
      task_classes: ["implementation"],
      exclusions: structuredClone(candidate.evaluation_scope.exclusions),
      candidate_evaluation_scope_digest: canonicalDigest(candidate.evaluation_scope),
      repetitions: 3,
      evaluator: {
        stable_id: "ask.evaluator-reference.mn-build-option-update",
        version: "git:2222222222222222222222222222222222222222",
        record_digest: D[0],
        content_digest: D[1],
      },
      evaluator_contract_digest: D[2],
      scoring_policy_digest: D[3],
      thresholds_digest: D[4],
      weights_digest: D[5],
      stop_conditions_digest: D[6],
      privacy_boundary_digest: D[7],
    },
    causal_design: {
      mode: "one_factor",
      candidate_factors_digest: canonicalDigest(candidate.factors),
      changed_factor_ids: ["prompt_instruction_content"],
      ablation_evidence_digests: [],
    },
    recommendation_policy: {
      rules: [{
        rule_id: "bounded-canary-expand",
        match: {
          quality: ["improved"],
          safety: ["retained"],
          cost: ["retained"],
          variance: ["retained"],
          mechanism: ["observed"],
          external_outcome: ["unknown"],
        },
        recommendation: "expand",
        decision_scope: "portfolio_canary_only",
      }],
      no_match: "insufficient_evidence",
    },
    action_mapping: [
      { recommendation: "expand", actions: ["adopt_candidate"] },
      { recommendation: "retain", actions: ["retain_current"] },
      { recommendation: "simplify", actions: ["revise_candidate"] },
      { recommendation: "stop", actions: ["reject_candidate"] },
      { recommendation: "insufficient_evidence", actions: ["insufficient_evidence"] },
    ],
    prompt_outcome_mapping: [
      { prompt_outcome: "adopt_prompt_v2", action: "adopt_candidate" },
      { prompt_outcome: "insufficient_evidence", action: "insufficient_evidence" },
      { prompt_outcome: "retain_current", action: "retain_current" },
      { prompt_outcome: "revise_and_repeat", action: "revise_candidate" },
    ],
    authority: structuredClone(candidate.authorities.experiment),
  };
}

function evaluationEvidence(experimentValue = experiment) {
  const dimension = (status, conclusion, sourceKind, artifactDigest, causalCreditApplied = false) => ({
    status,
    conclusion,
    source_kind: sourceKind,
    artifact_id: `${sourceKind}-sample`,
    artifact_digest: artifactDigest,
    causal_credit_applied: causalCreditApplied,
    factor_ids: causalCreditApplied ? ["prompt_instruction_content"] : [],
  });
  return {
    authority: {
      kind: "external_evolution_evaluation_authority",
      authority_id: "evaluation-authority",
      authority_revision: 1,
      authority_evidence_digest: D[8],
      experiment_digest: experimentValue.experiment_digest,
      verification_mode: "full_verifier",
      artifact_inventory_digest: D[9],
    },
    dimensions: {
      quality: dimension("complete", "improved", "portfolio_aggregate_result", D.a, true),
      safety: dimension("complete", "retained", "paired_comparison_report", D.b),
      cost: dimension("complete", "retained", "paired_comparison_report", D.c),
      variance: dimension("complete", "retained", "repetition_report", D.d),
      mechanism: dimension("complete", "observed", "mechanism_scorecard", D.e),
      external_outcome: dimension("insufficient_evidence", "unknown", "external_outcome_report", D.f),
    },
    causal_attribution: {
      status: "supported",
      factor_ids: ["prompt_instruction_content"],
      evidence_digests: [D.a],
    },
    reason_codes: ["bounded_canary_evidence_complete"],
  };
}

let closures = 0;
function closes(label, fn) {
  fn();
  closures += 1;
  process.stdout.write(`PASS ${label}\n`);
}

const candidate = buildEvolutionCandidate(candidateDraft());
closes("candidate identity is deterministic and validates", () => {
  assert.deepEqual(buildEvolutionCandidate(candidateDraft()), candidate);
  assert.equal(validateEvolutionCandidate(candidate), candidate);
  assert.match(candidate.candidate_digest, /^sha256:[a-f0-9]{64}$/u);
});

closes("candidate rejects unknown fields and parent transplant", () => {
  assert.throws(() => validateEvolutionCandidate({ ...candidate, observed_score: 1 }), /closed schema|unknown|additional/iu);
  const transplanted = candidateDraft();
  transplanted.parent_asset.stable_id = "ask.prompt-template.transplanted";
  assert.throws(() => buildEvolutionCandidate(transplanted), /parent transplant|stable.*identity/iu);
});

closes("candidate generation, experiment, and decision authorities stay separate", () => {
  const collapsed = candidateDraft();
  collapsed.authorities.experiment.authority_id = collapsed.generation.actor.actor_id;
  assert.throws(() => buildEvolutionCandidate(collapsed), /authorities must be distinct/iu);
});

const experiment = buildEvolutionExperiment(experimentDraft(candidate));
closes("experiment is deterministic, pre-result, and role-bound", () => {
  assert.deepEqual(buildEvolutionExperiment(experimentDraft(candidate)), experiment);
  assert.equal(validateEvolutionExperiment(experiment), experiment);
  assert.equal(experiment.results_accessed, false);
});

closes("experiment rejects post-result leakage and frozen-policy replacement", () => {
  assert.throws(() => validateEvolutionExperiment({ ...experiment, observed_result: D.a }), /closed schema|outcome leakage|unknown/iu);
  const replaced = structuredClone(experiment);
  replaced.protocol.thresholds_digest = D.f;
  assert.throws(() => validateEvolutionExperiment(replaced), /digest mismatch|experiment.*digest/iu);
});

closes("experiment rejects baseline/challenger reversal and Prompt mapping drift", () => {
  const reversed = experimentDraft(candidate);
  reversed.roles.baseline.role = "challenger";
  reversed.roles.challenger.role = "baseline";
  assert.throws(() => buildEvolutionExperiment(reversed), /role reversal/iu);

  const promptDrift = experimentDraft(candidate);
  promptDrift.prompt_outcome_mapping.find(({ prompt_outcome: value }) => value === "adopt_prompt_v2").action = "retain_current";
  assert.throws(() => buildEvolutionExperiment(promptDrift), /Prompt v2 outcome mapping drift/iu);
});

const promptV2CandidateDraft = candidateDraft();
for (const reference of [
  promptV2CandidateDraft.parent_asset,
  promptV2CandidateDraft.candidate_asset,
  promptV2CandidateDraft.rollback.parent_asset,
]) {
  reference.asset_type = "prompt";
  reference.stable_id = "ask.prompt-bundle.codex.fixed-entry";
}
const promptV2Candidate = buildEvolutionCandidate(promptV2CandidateDraft);
function promptV2ExperimentDraft() {
  const draft = experimentDraft(promptV2Candidate);
  draft.projection.mode = "prompt_v2_exact";
  draft.projection.baseline_condition = "full_ask";
  draft.projection.challenger_condition = "full_ask";
  Object.assign(draft.projection, computePromptV2ExactProjectionDigests(draft.roles));
  return draft;
}

const promptV2Draft = promptV2ExperimentDraft();
const expectedPromptV2MappingDigest = canonicalDigest({
  schema_version: "1.0.0",
  projection_mode: "prompt_v2_exact",
  prompt_roles: {
    current_prompt: {
      experiment_role: "baseline",
      raw_scoring_condition: "full_ask",
    },
    prompt_v2: {
      experiment_role: "challenger",
      raw_scoring_condition: "full_ask",
    },
  },
});
const expectedPromptV2ProjectionDigest = canonicalDigest({
  schema_version: "1.0.0",
  projection_mode: "prompt_v2_exact",
  mapping_digest: expectedPromptV2MappingDigest,
  roles: {
    baseline: {
      prompt_role: "current_prompt",
      raw_scoring_condition: "full_ask",
      portfolio: structuredClone(promptV2Draft.roles.baseline.portfolio),
      registry_snapshot_digest: promptV2Draft.roles.baseline.registry_snapshot_digest,
      selection_object_digest: promptV2Draft.roles.baseline.selection_object_digest,
      selection_digest: promptV2Draft.roles.baseline.selection_digest,
      selected_asset: structuredClone(promptV2Draft.roles.baseline.selected_asset),
    },
    challenger: {
      prompt_role: "prompt_v2",
      raw_scoring_condition: "full_ask",
      portfolio: structuredClone(promptV2Draft.roles.challenger.portfolio),
      registry_snapshot_digest: promptV2Draft.roles.challenger.registry_snapshot_digest,
      selection_object_digest: promptV2Draft.roles.challenger.selection_object_digest,
      selection_digest: promptV2Draft.roles.challenger.selection_digest,
      selected_asset: structuredClone(promptV2Draft.roles.challenger.selected_asset),
    },
  },
});
const promptV2Experiment = buildEvolutionExperiment(promptV2Draft);
closes("prompt_v2_exact maps both distinct Prompt roles to full_ask with exact projection identity", () => {
  assert.equal(promptV2Experiment.projection.baseline_condition, "full_ask");
  assert.equal(promptV2Experiment.projection.challenger_condition, "full_ask");
  assert.equal(promptV2Experiment.projection.mapping_digest, expectedPromptV2MappingDigest);
  assert.equal(promptV2Experiment.projection.projection_evidence_digest, expectedPromptV2ProjectionDigest);
  assert.notDeepEqual(promptV2Experiment.roles.baseline.selected_asset, promptV2Experiment.roles.challenger.selected_asset);
  assert.notEqual(promptV2Experiment.roles.baseline.selection_digest, promptV2Experiment.roles.challenger.selection_digest);
});

closes("prompt_v2_exact rejects product-condition aliases and mapping or projection drift", () => {
  for (const mutate of [
    (draft) => { draft.projection.baseline_condition = "kernel_only"; },
    (draft) => { draft.projection.challenger_condition = "adaptive_ask"; },
    (draft) => { draft.projection.mapping_digest = D[0]; },
    (draft) => { draft.projection.projection_evidence_digest = D[1]; },
  ]) {
    const drifted = promptV2ExperimentDraft();
    mutate(drifted);
    assert.throws(
      () => buildEvolutionExperiment(drifted),
      /prompt_v2_exact|full_ask|mapping.*digest|projection.*digest/iu,
    );
  }
});

closes("prompt_v2_exact preserves distinct exact Asset and selection identities", () => {
  const sameAsset = promptV2ExperimentDraft();
  sameAsset.roles.challenger.selected_asset = structuredClone(sameAsset.roles.baseline.selected_asset);
  Object.assign(sameAsset.projection, computePromptV2ExactProjectionDigests(sameAsset.roles));
  assert.throws(() => buildEvolutionExperiment(sameAsset), /distinct.*Asset|Asset.*distinct/iu);

  const sameSelection = promptV2ExperimentDraft();
  sameSelection.roles.challenger.selection_digest = sameSelection.roles.baseline.selection_digest;
  Object.assign(sameSelection.projection, computePromptV2ExactProjectionDigests(sameSelection.roles));
  assert.throws(() => buildEvolutionExperiment(sameSelection), /distinct.*selection|selection.*distinct/iu);

  const templateProxy = promptV2ExperimentDraft();
  templateProxy.roles.baseline.selected_asset.asset_type = "prompt_template";
  templateProxy.roles.challenger.selected_asset.asset_type = "prompt_template";
  Object.assign(templateProxy.projection, computePromptV2ExactProjectionDigests(templateProxy.roles));
  assert.throws(() => buildEvolutionExperiment(templateProxy), /Prompt Asset|rendered Prompt|asset_type/iu);
});

closes("experiment rejects missing-evidence action remapping", () => {
  const remapped = experimentDraft(candidate);
  remapped.action_mapping.find(({ recommendation: value }) => value === "insufficient_evidence").actions = ["retain_current"];
  assert.throws(
    () => buildEvolutionExperiment(remapped),
    /insufficient.*evidence.*action|missing evidence.*retention/iu,
  );
});

const recommendation = deriveEvolutionRecommendation({
  experiment,
  evidence: evaluationEvidence(),
});
closes("recommendation preserves typed dimensions and carries no mutation authority", () => {
  assert.equal(recommendation.recommendation, "expand");
  assert.equal(recommendation.decision_scope, "portfolio_canary_only");
  assert.equal(recommendation.authority_implied, false);
  assert.equal(validateEvolutionRecommendation(recommendation), recommendation);
  assert.equal(recommendation.dimensions.external_outcome.status, "insufficient_evidence");
});

closes("recommendation rejects evaluation evidence bound to another experiment", () => {
  const transplanted = evaluationEvidence();
  transplanted.authority.experiment_digest = canonicalDigest({ different_experiment: true });
  assert.throws(
    () => deriveEvolutionRecommendation({ experiment, evidence: transplanted }),
    /evaluation.*experiment|experiment.*binding/iu,
  );
});

closes("recommendation rejects missing-as-zero and unsupported causal credit", () => {
  const zeroed = evaluationEvidence();
  zeroed.dimensions.external_outcome = {
    ...zeroed.dimensions.external_outcome,
    status: "unknown",
    conclusion: "retained",
  };
  assert.throws(() => deriveEvolutionRecommendation({ experiment, evidence: zeroed }), /unknown.*retained|zero|neutral/iu);

  const multiFactor = structuredClone(experiment);
  multiFactor.causal_design.mode = "factorial_or_ablation_required";
  multiFactor.causal_design.changed_factor_ids = ["prompt_instruction_content", "router_policy"];
  multiFactor.experiment_digest = "sha256:".padEnd(71, "0");
  const rebuilt = buildEvolutionExperiment(multiFactor);
  assert.throws(() => deriveEvolutionRecommendation({ experiment: rebuilt, evidence: evaluationEvidence(rebuilt) }), /multi-factor|ablation|causal/iu);
});

closes("recommendation rejects mechanism-as-quality and safety offset", () => {
  const mechanismQuality = evaluationEvidence();
  mechanismQuality.dimensions.quality.source_kind = "mechanism_scorecard";
  assert.throws(() => deriveEvolutionRecommendation({ experiment, evidence: mechanismQuality }), /mechanism.*quality|quality.*mechanism/iu);

  const unsafe = evaluationEvidence();
  unsafe.dimensions.safety.conclusion = "unsafe";
  const unsafeExperiment = experimentDraft(candidate);
  unsafeExperiment.recommendation_policy.rules[0].match.safety = ["unsafe"];
  const rebuilt = buildEvolutionExperiment(unsafeExperiment);
  unsafe.authority.experiment_digest = rebuilt.experiment_digest;
  assert.throws(() => deriveEvolutionRecommendation({ experiment: rebuilt, evidence: unsafe }), /safety regression cannot be offset/iu);
});

closes("recommendation rejects all-incomplete affirmative outcomes", () => {
  const allUnknownDraft = experimentDraft(candidate);
  for (const name of Object.keys(allUnknownDraft.recommendation_policy.rules[0].match)) {
    allUnknownDraft.recommendation_policy.rules[0].match[name] = ["unknown"];
  }
  const allUnknownExperiment = buildEvolutionExperiment(allUnknownDraft);
  const allUnknown = evaluationEvidence(allUnknownExperiment);
  for (const dimension of Object.values(allUnknown.dimensions)) {
    dimension.status = "unknown";
    dimension.conclusion = "unknown";
    dimension.causal_credit_applied = false;
    dimension.factor_ids = [];
  }
  allUnknown.causal_attribution = { status: "not_claimed", factor_ids: [], evidence_digests: [] };
  assert.throws(
    () => deriveEvolutionRecommendation({ experiment: allUnknownExperiment, evidence: allUnknown }),
    /incomplete.*evidence|unknown.*expand|affirmative.*recommendation/iu,
  );
});

closes("recommendation rejects unsupported causal credit and cross-dimension sources", () => {
  const unsupported = evaluationEvidence();
  unsupported.causal_attribution = { status: "unsupported", factor_ids: [], evidence_digests: [] };
  assert.throws(
    () => deriveEvolutionRecommendation({ experiment, evidence: unsupported }),
    /unsupported.*causal|causal credit.*supported/iu,
  );

  const externalMechanismDraft = experimentDraft(candidate);
  externalMechanismDraft.recommendation_policy.rules[0].match.external_outcome = ["improved"];
  const externalMechanismExperiment = buildEvolutionExperiment(externalMechanismDraft);
  const externalMechanism = evaluationEvidence(externalMechanismExperiment);
  externalMechanism.dimensions.external_outcome = {
    ...externalMechanism.dimensions.external_outcome,
    status: "complete",
    conclusion: "improved",
    source_kind: "mechanism_scorecard",
  };
  assert.throws(
    () => deriveEvolutionRecommendation({ experiment: externalMechanismExperiment, evidence: externalMechanism }),
    /external.*outcome.*source|mechanism.*external/iu,
  );

  const untrustedExternalOutcome = evaluationEvidence(externalMechanismExperiment);
  untrustedExternalOutcome.dimensions.external_outcome = {
    ...untrustedExternalOutcome.dimensions.external_outcome,
    status: "complete",
    conclusion: "improved",
  };
  assert.throws(
    () => deriveEvolutionRecommendation({ experiment: externalMechanismExperiment, evidence: untrustedExternalOutcome }),
    /external outcome.*authority|external-outcome authority.*unavailable/iu,
  );
});

closes("causal credit requires complete quality evidence", () => {
  const incompleteQualityDraft = experimentDraft(candidate);
  incompleteQualityDraft.recommendation_policy.rules[0].match.quality = ["unknown"];
  const incompleteQualityExperiment = buildEvolutionExperiment(incompleteQualityDraft);
  const incompleteQuality = evaluationEvidence(incompleteQualityExperiment);
  incompleteQuality.dimensions.quality.status = "insufficient_evidence";
  incompleteQuality.dimensions.quality.conclusion = "unknown";
  assert.throws(
    () => deriveEvolutionRecommendation({ experiment: incompleteQualityExperiment, evidence: incompleteQuality }),
    /causal credit.*complete quality|incomplete quality.*causal/iu,
  );
});

function lifecyclePlan() {
  return {
    base_registry_snapshot_digest: candidate.registry.snapshot_digest,
    base_portfolio_lock_digest: experiment.roles.baseline.portfolio.lock_digest,
    base_current_manifest: {
      portfolio_id: parentPortfolio.portfolio_id,
      revision: parentPortfolio.revision,
      manifest_digest: parentPortfolio.manifest_digest,
      asset_set_digest: parentPortfolio.asset_set_digest,
    },
    target_manifest: {
      portfolio_id: parentPortfolio.portfolio_id,
      revision: "candidate-canary-v1",
      manifest_digest: D.e,
      asset_set_digest: D.f,
    },
    portfolio_transitions: [
      {
        manifest: {
          portfolio_id: parentPortfolio.portfolio_id,
          revision: parentPortfolio.revision,
          manifest_digest: parentPortfolio.manifest_digest,
          asset_set_digest: parentPortfolio.asset_set_digest,
        },
        from_state: "current",
        to_state: "superseded",
      },
      {
        manifest: {
          portfolio_id: parentPortfolio.portfolio_id,
          revision: "candidate-canary-v1",
          manifest_digest: D.e,
          asset_set_digest: D.f,
        },
        from_state: null,
        to_state: "current",
      },
    ],
    asset_transitions: [],
    rollback_anchor: {
      portfolio_id: parentPortfolio.portfolio_id,
      revision: parentPortfolio.revision,
      manifest_digest: parentPortfolio.manifest_digest,
      asset_set_digest: parentPortfolio.asset_set_digest,
    },
    reason_codes: ["bounded_canary_adoption"],
  };
}

const proposal = deriveEvolutionActionProposal({ candidate, experiment, recommendation, lifecyclePlan: lifecyclePlan() });
closes("action proposal is deterministic and separate from recommendation", () => {
  assert.equal(proposal.action, "adopt_candidate");
  assert.equal(proposal.recommendation, "expand");
  assert.equal(proposal.authority_implied, false);
  assert.notEqual(proposal.proposal_digest, recommendation.recommendation_digest);
});

closes("ambiguous recommendation mapping fails closed", () => {
  const ambiguous = structuredClone(experiment);
  ambiguous.action_mapping.find((entry) => entry.recommendation === "expand").actions.push("retain_current");
  ambiguous.experiment_digest = "sha256:".padEnd(71, "0");
  const rebuilt = buildEvolutionExperiment(ambiguous);
  const reboundRecommendation = deriveEvolutionRecommendation({ experiment: rebuilt, evidence: evaluationEvidence(rebuilt) });
  assert.throws(() => deriveEvolutionActionProposal({ candidate, experiment: rebuilt, recommendation: reboundRecommendation, lifecyclePlan: lifecyclePlan() }), /ambiguous.*mapping|exactly one action/iu);
});

closes("bounded Portfolio-only adoption rejects unapplied Asset transitions", () => {
  const expandedPlan = lifecyclePlan();
  expandedPlan.asset_transitions.push({
    asset: structuredClone(candidateAsset),
    from_state: "candidate",
    to_state: "admitted",
  });
  assert.throws(
    () => deriveEvolutionActionProposal({ candidate, experiment, recommendation, lifecyclePlan: expandedPlan }),
    /Portfolio-only|Asset transitions|unapplied/iu,
  );
});

closes("rejection and retirement proposals preserve exact subjects and reasons", () => {
  const stopExperimentDraft = (action, decisionScope) => {
    const draft = experimentDraft(candidate);
    draft.recommendation_policy.rules[0].match.quality = ["retained"];
    draft.recommendation_policy.rules[0].match.safety = ["unsafe"];
    draft.recommendation_policy.rules[0].recommendation = "stop";
    draft.recommendation_policy.rules[0].decision_scope = decisionScope;
    draft.action_mapping.find((entry) => entry.recommendation === "stop").actions = [action];
    return buildEvolutionExperiment(draft);
  };
  const stopEvidence = (boundExperiment) => {
    const evidence = evaluationEvidence(boundExperiment);
    evidence.dimensions.quality.conclusion = "retained";
    evidence.dimensions.safety.conclusion = "unsafe";
    evidence.reason_codes = ["verified_harm_requires_lifecycle_decision"];
    return evidence;
  };

  const rejectionExperiment = stopExperimentDraft("reject_candidate", "candidate_rejection");
  const rejectionRecommendation = deriveEvolutionRecommendation({
    experiment: rejectionExperiment,
    evidence: stopEvidence(rejectionExperiment),
  });
  const rejectionPlan = lifecyclePlan();
  rejectionPlan.target_manifest = structuredClone(rejectionPlan.base_current_manifest);
  rejectionPlan.portfolio_transitions = [];
  rejectionPlan.asset_transitions = [{
    asset: structuredClone(candidateAsset),
    from_state: "candidate",
    to_state: "retired",
  }];
  rejectionPlan.reason_codes = ["candidate_rejected_with_history_retained"];
  const rejectionProposal = deriveEvolutionActionProposal({
    candidate,
    experiment: rejectionExperiment,
    recommendation: rejectionRecommendation,
    lifecyclePlan: rejectionPlan,
  });
  const rejectionDecision = buildEvolutionHumanDecision({
    proposal: rejectionProposal,
    disposition: "approved",
    reasonCodes: ["human_confirmed_candidate_rejection"],
    authority: structuredClone(candidate.authorities.decision),
  });
  assert.equal(rejectionProposal.action, "reject_candidate");
  assert.equal(rejectionProposal.lifecycle_plan.asset_transitions[0].asset.record_digest, candidateAsset.record_digest);
  assert.deepEqual(rejectionDecision.reason_codes, ["human_confirmed_candidate_rejection"]);

  const retirementExperiment = stopExperimentDraft("retire_current", "current_retirement");
  const retirementRecommendation = deriveEvolutionRecommendation({
    experiment: retirementExperiment,
    evidence: stopEvidence(retirementExperiment),
  });
  const retirementPlan = lifecyclePlan();
  retirementPlan.asset_transitions = [{
    asset: structuredClone(parentAsset),
    from_state: "current",
    to_state: "retired",
  }];
  retirementPlan.reason_codes = ["current_retirement_with_rollback_retained"];
  const retirementProposal = deriveEvolutionActionProposal({
    candidate,
    experiment: retirementExperiment,
    recommendation: retirementRecommendation,
    lifecyclePlan: retirementPlan,
  });
  assert.equal(retirementProposal.action, "retire_current");
  assert.equal(retirementProposal.lifecycle_plan.rollback_anchor.manifest_digest, parentPortfolio.manifest_digest);
  assert.equal(retirementProposal.lifecycle_plan.asset_transitions[0].asset.record_digest, parentAsset.record_digest);
});

const decision = buildEvolutionHumanDecision({
  proposal,
  disposition: "approved",
  reasonCodes: ["human_approved_bounded_canary"],
  authority: structuredClone(candidate.authorities.decision),
});
closes("human decision binds the exact proposal without becoming lifecycle authority", () => {
  assert.equal(decision.proposal_digest, proposal.proposal_digest);
  assert.equal(decision.action, proposal.action);
  assert.equal(decision.authority_implied, false);
});

closes("human decision requires the proposal's exact reserved authority", () => {
  for (const mutate of [
    (authority) => { authority.authority_revision += 1; },
    (authority) => { authority.authority_evidence_digest = D[0]; },
  ]) {
    const drifted = structuredClone(candidate.authorities.decision);
    mutate(drifted);
    assert.throws(
      () => buildEvolutionHumanDecision({
        proposal,
        disposition: "approved",
        reasonCodes: ["wrong_reserved_authority"],
        authority: drifted,
      }),
      /exact required authority|authority differs/iu,
    );
  }
});

closes("application receipt preserves exact history and rollback", () => {
  const receipt = buildEvolutionApplicationReceipt({
    schema_version: "1.0.0",
    object_kind: "evolution_application_receipt",
    predecessor_receipt_digest: null,
    candidate_digest: candidate.candidate_digest,
    experiment_digest: experiment.experiment_digest,
    recommendation_digest: recommendation.recommendation_digest,
    proposal_digest: proposal.proposal_digest,
    decision_digest: decision.decision_digest,
    action: proposal.action,
    state: "completed",
    base_heads: {
      registry_snapshot_digest: candidate.registry.snapshot_digest,
      portfolio_lock_digest: proposal.lifecycle_plan.base_portfolio_lock_digest,
    },
    result_heads: {
      registry_snapshot_digest: candidate.registry.snapshot_digest,
      portfolio_lock_digest: D[1],
    },
    steps: [{
      step_id: "portfolio_activation",
      operation: "apply_portfolio_transition",
      input_digest: proposal.lifecycle_plan.base_portfolio_lock_digest,
      authority_context_digest: D[2],
      output_digest: D[1],
      status: "completed",
    }],
    rollback_anchor: structuredClone(proposal.lifecycle_plan.rollback_anchor),
    stop: null,
    next_step: null,
    history_preserved: true,
    authority_implied: false,
  });
  assert.equal(receipt.rollback_anchor.manifest_digest, parentPortfolio.manifest_digest);
  assert.equal(receipt.history_preserved, true);
});

closes("completed receipt rejects forged history and unfinished steps", () => {
  const draft = {
    schema_version: "1.0.0",
    object_kind: "evolution_application_receipt",
    predecessor_receipt_digest: null,
    candidate_digest: candidate.candidate_digest,
    experiment_digest: experiment.experiment_digest,
    recommendation_digest: recommendation.recommendation_digest,
    proposal_digest: proposal.proposal_digest,
    decision_digest: decision.decision_digest,
    action: proposal.action,
    state: "completed",
    base_heads: { registry_snapshot_digest: candidate.registry.snapshot_digest, portfolio_lock_digest: proposal.lifecycle_plan.base_portfolio_lock_digest },
    result_heads: { registry_snapshot_digest: candidate.registry.snapshot_digest, portfolio_lock_digest: D[1] },
    steps: [{ step_id: "portfolio_activation", operation: "apply_portfolio_transition", input_digest: proposal.lifecycle_plan.base_portfolio_lock_digest, authority_context_digest: D[2], output_digest: D[1], status: "pending" }],
    rollback_anchor: structuredClone(proposal.lifecycle_plan.rollback_anchor),
    stop: null,
    next_step: null,
    history_preserved: true,
    authority_implied: false,
  };
  assert.throws(() => buildEvolutionApplicationReceipt(draft), /completed.*incomplete step/iu);
  draft.steps[0].status = "completed";
  draft.history_preserved = false;
  assert.throws(() => buildEvolutionApplicationReceipt(draft), /closed schema|preserve history/iu);
});

process.stdout.write(`Evolution loop contract tests passed: ${closures} closures\n`);
