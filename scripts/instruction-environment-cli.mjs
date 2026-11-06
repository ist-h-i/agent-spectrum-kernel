#!/usr/bin/env node
// Local JSON command transport. Trust arrays are supplied by the existing
// authority owner; merely putting a record in a file does not authenticate it.
import { pathToFileURL } from 'node:url';
import { canonicalDigest, listContentAddressedJson, readJsonFileStrict } from './content-addressed-store.mjs';
import { createEmptyAssetRegistry, registerAsset, exportAssetRegistryReference } from './asset-registry.mjs';
import { captureInstructionEnvironment, verifyInstructionEnvironment, exportInstructionEnvironment } from './instruction-environment.mjs';
import { captureRetainedInstructionLayout, verifyRetainedInstructionLayout } from './retained-instruction-layout.mjs';
import { prepareRetainedInstructionComparison, verifyRetainedInstructionComparison, readRetainedInstructionResults } from './retained-instruction-comparison.mjs';
import { importSkillUsageEvidence } from './skill-usage-evidence.mjs';
import { registerInstructionEnvironmentBundle } from './instruction-environment-compiler.mjs';
import { verifyEnvironmentSavedResults } from './environment-saved-results.mjs';
import { inspectPortfolioRuntimeContract } from './ask-benchmark-execution.mjs';
import { buildEnvironmentEvolutionProjection } from './environment-evolution-binding.mjs';
import { planEnvironmentTargetApply, applyEnvironmentTargetPlan, restoreEnvironmentTarget } from './environment-target.mjs';
import { preparePersonalEvolutionGenerationRequest, importPersonalEvolutionGenerationResult } from './ask-personal-evolution-generation.mjs';
import { inspectPersonalEvolution } from './ask-personal-evolution.mjs';
import { materializeEnvironmentEvaluation, verifyEnvironmentEvaluation, executeEnvironmentEvaluation, inspectEnvironmentEvaluation } from './environment-evaluation.mjs';
import { buildEvolutionExperiment, publishEvolutionExperiment, verifyEvolutionExperiment,
  deriveEvolutionRecommendation, publishEvolutionRecommendation, verifyEvolutionRecommendation,
  deriveEvolutionActionProposal, publishEvolutionActionProposal, verifyEvolutionActionProposal,
  buildEvolutionHumanDecision, publishEvolutionHumanDecision, verifyEvolutionHumanDecision, applyApprovedEvolutionPortfolioAction,
  recordEvolutionNoopReceipt } from './evolution-loop.mjs';

export function runInstructionEnvironmentCommand(command, input) {
  switch (command) {
    case 'retained-prepare': return prepareRetainedInstructionComparison(input);
    case 'retained-verify': { const {plan}=verifyRetainedInstructionComparison(input); return {plan,models_started:false}; }
    case 'retained-results': return readRetainedInstructionResults(input);
    case 'retained-layout-capture': return captureRetainedInstructionLayout(input);
    case 'retained-layout-inspect': {
      const checked=verifyRetainedInstructionLayout(input);
      return {layout:checked.layout,models_started:false,admission_implied:false};
    }
    case 'capture': return captureInstructionEnvironment(input);
    case 'inspect': {
      const { environment, files } = verifyInstructionEnvironment(input);
      return { environment, files: files.map(({ text, ...file }) => file), models_started: false };
    }
    case 'export': return exportInstructionEnvironment(input);
    case 'register-asset': return registerAsset(input);
    case 'registry-create': return createEmptyAssetRegistry(input);
    case 'bundle-register': return registerInstructionEnvironmentBundle(input);
    case 'assets': return exportAssetRegistryReference(input);
    case 'usage-import': return importSkillUsageEvidence(input);
    case 'usage-list': return listContentAddressedJson({ storeRoot: input.storeRoot }).filter(item => item.value?.object_kind === 'skill_usage_evidence'
      && item.value.environment_object_digest === input.environmentObjectDigest && item.value.run_digest === canonicalDigest(input.runId));
    case 'generation-prepare': return preparePersonalEvolutionGenerationRequest(input);
    case 'generation-import': return importPersonalEvolutionGenerationResult(input);
    case 'evaluation-materialize': return materializeEnvironmentEvaluation(input);
    case 'evaluation-verify': return verifyEnvironmentEvaluation(input);
    case 'evaluation-start': return executeEnvironmentEvaluation(input);
    case 'evaluation-status': return inspectEnvironmentEvaluation(input);
    case 'evaluation-results': return verifyEnvironmentSavedResults(input);
    case 'runtime-inspect': return inspectPortfolioRuntimeContract(input);
    case 'experiment': {
      const projection = buildEnvironmentEvolutionProjection({ ...input, roles: input.draft.roles });
      const experiment = buildEvolutionExperiment({ ...input.draft, projection });
      const saved = publishEvolutionExperiment({ storeRoot: input.storeRoot, experiment });
      verifyEvolutionExperiment({ ...input, experimentObjectDigest: saved.object_digest });
      return { ...saved, experiment, models_started: false };
    }
    case 'recommend': {
      const { experiment } = verifyEvolutionExperiment(input);
      const recommendation = deriveEvolutionRecommendation({ experiment, evidence: input.evidence });
      const saved = publishEvolutionRecommendation({ storeRoot: input.storeRoot, recommendation });
      verifyEvolutionRecommendation({ ...input, recommendationObjectDigest: saved.object_digest });
      return { ...saved, recommendation };
    }
    case 'propose': {
      const verified = verifyEvolutionRecommendation(input);
      const proposal = deriveEvolutionActionProposal({ ...verified, lifecyclePlan: input.lifecyclePlan });
      const saved = publishEvolutionActionProposal({ storeRoot: input.storeRoot, proposal });
      verifyEvolutionActionProposal({ ...input, proposalObjectDigest: saved.object_digest });
      return { ...saved, proposal };
    }
    case 'decision': {
      const { proposal } = verifyEvolutionActionProposal(input);
      const decision = buildEvolutionHumanDecision({ proposal, disposition: input.disposition, reasonCodes: input.reasonCodes, authority: input.authority });
      return { ...publishEvolutionHumanDecision({ storeRoot: input.storeRoot, decision }), decision, authority_implied: false };
    }
    case 'portfolio-apply': return applyApprovedEvolutionPortfolioAction(input);
    case 'noop': {
      const closure = verifyEvolutionHumanDecision(input);
      if (closure.decision.disposition !== 'approved') throw new Error('approved no-op decision required');
      return recordEvolutionNoopReceipt({ storeRoot: input.storeRoot, closure,
        baseRegistrySnapshotDigest: closure.proposal.lifecycle_plan.base_registry_snapshot_digest,
        basePortfolioLockDigest: closure.proposal.lifecycle_plan.base_portfolio_lock_digest });
    }
    case 'status': return inspectPersonalEvolution(input);
    case 'apply-plan': {
      const { digest, plan } = planEnvironmentTargetApply(input); return { digest, plan };
    }
    case 'apply': {
      const { handle } = planEnvironmentTargetApply(input);
      return applyEnvironmentTargetPlan(handle, input.confirmedPlanDigest);
    }
    case 'restore': return restoreEnvironmentTarget(input);
    default: throw new Error('Unknown instruction environment command');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/instruction-environment-cli.mjs COMMAND /absolute/input.json');
    const result = runInstructionEnvironmentCommand(process.argv[2], readJsonFileStrict(process.argv[3], 'instruction environment command input'));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`instruction-environment: ${error.message}\n`); process.exitCode = 1;
  }
}
