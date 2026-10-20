// Original private constructor/worker/record/scorer chain. No alternative grader.
// This API is called only after separate start authority and restored originals.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalDigest, stableCanonicalJson } from './content-addressed-store.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { buildPrimaryEvaluationScoringInputs, createPrimaryEvaluationSealedEvaluatorExecution, verifyPrimaryEvaluationProducer } from './ask-primary-evaluation-producer.mjs';
import { withPrimaryHistoricalEvaluatorResources, withPrimaryEvaluatorLogCapture, primaryAdapterSourceDigest, primaryEvaluatorLogFailureReceipts } from './ask-primary-evaluation-scope.mjs';
import { verifyPortfolioScoringInputs, verifyPrivateEvaluatorBundle, readEvaluatorAuthorityAnchorFromFreeze, executeProductionSealedEvaluator,
  adaptPrivateEvaluatorFragmentToEnvelope, computeAdapterResultEnvelopeDigest, computePrivateEvaluationRecordDigest, readStableWorkspaceInventory } from './ask-benchmark-evaluator-boundary.mjs';
import { deriveEffectiveVerificationEvidenceState } from './ask-benchmark-scoring-contract.mjs';
import { scorePrimaryEvaluatorResult } from './ask-primary-engineering-safety.mjs';
import { verifyPublicEvaluatorReference, verifyPrivateEvaluatorResourceAssets } from './ask-benchmark-evaluator-boundary.mjs';
import { resolveEffectiveAdmissionAuthorityFromFiles } from './ask-benchmark-admission-decision.mjs';
import { primaryProcessingSelection, verifyPrimaryScoringVersionResource } from './ask-primary-scoring-version.mjs';
import { PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION } from './ask-benchmark-command-evidence.mjs';
import { isRegisteredPrimaryFixtureId } from './ask-primary-fixture-recipe.mjs';

import { getPrimaryEvaluationProfile, primaryProfileForRequest } from './ask-primary-evaluation-profile.mjs';

const hash=raw=>`sha256:${createHash('sha256').update(raw).digest('hex')}`;
const read=path=>readStableFile(path,'primary private pipeline evidence',33554432).bytes;
const json=path=>JSON.parse(read(path));
const raw=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const rel=(root,path)=>{const value=relative(root,path).split(sep).join('/');assert.ok(value&&!value.startsWith('../')&&!value.startsWith('/')&&!value.includes('\\'));return value;};
const write=(path,value)=>{mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,Buffer.isBuffer(value)?value:raw(value),{flag:'wx',mode:0o600});};

/** Read-only resources, independent of controller terminals and run markers.
 * Static assets/review readiness does not grant start or execution authority. */
export function preflightPrimaryEvaluationGradingResources(block,resource) {
  let publicMetadataVerified=false,originalAssetsVerified=false,admissionReady=false,stage='fixed_binding';
  try{
    assert.ok(isRegisteredPrimaryFixtureId(block.fixture_id));const binding=block.grading.binding;
    assert.deepEqual(Object.keys(binding).sort(),['evaluator_bundle_digest','fixture_id','input_manifest_digest','profile_id','scoring_input_freeze_digest'].sort());
    assert.equal(binding.fixture_id,block.fixture_id);getPrimaryEvaluationProfile(binding.profile_id);
    verifyPrimaryScoringVersionResource(block,resource);
    const root=resource.frozenSourceRoot;assert.equal(realpathSync(root),root);
    const freezeManifestPath=join(root,`benchmarks/fixtures/checkpoint-b2/${block.fixture_id}/scoring-input-freeze-manifest.json`),freeze=json(freezeManifestPath);
    assert.equal(hash(read(freezeManifestPath)),binding.scoring_input_freeze_digest);assert.equal(freeze.fixture_id,block.fixture_id);assert.equal(freeze.fixture_input_digest,binding.input_manifest_digest);
    const paths=Object.fromEntries([['catalogPath','catalog'],['policyManifestPath','policy_manifest'],['scoringPolicyPath','scoring_policy'],['admissionRecordPath','admission_record'],
      ['requirementRecordPath','requirement_record'],['outputContractPath','output_contract'],['referencePath','evaluator_public_reference']].map(([name,key])=>{
        const p=freeze[key].path;assert.ok(p&&!p.startsWith('/')&&!p.split('/').includes('..')&&!p.includes('\\'));return[name,join(root,p)];}));
    stage='public_freeze';const scoring=verifyPortfolioScoringInputs({root,...paths,freezeManifestPath,freezeManifestSourceDigest:binding.scoring_input_freeze_digest});
    stage='historical_source';return withPrimaryHistoricalEvaluatorResources(block,root,()=>{
    const reference=verifyPublicEvaluatorReference({root,referencePath:paths.referencePath});assert.equal(reference.evaluator_bundle_digest,binding.evaluator_bundle_digest);
    stage='public_anchor';readEvaluatorAuthorityAnchorFromFreeze({root,freezeManifestPath,freezeManifestSourceDigest:binding.scoring_input_freeze_digest,referencePath:paths.referencePath});
    publicMetadataVerified=true;
    stage='original_assets';const assets=verifyPrivateEvaluatorResourceAssets({root,referencePath:paths.referencePath,privateRoot:resource.privateRoot,manifestPath:resource.manifestPath});
    assert.equal(assets.manifest.evaluator_bundle_digest,binding.evaluator_bundle_digest);originalAssetsVerified=true;
    stage='admission_review';for(const key of ['admissionDecisionPath','admissionReviewAuthorityPath','admissionReviewAuthoritySourceDigest','admissionReviewArchivePath'])assert.ok(resource[key]);
    const admission=resolveEffectiveAdmissionAuthorityFromFiles({root,frozenAdmissionRecord:scoring.admissionRecord,frozenAdmissionSource:scoring.sources.admissionRecord,
      requirementRecord:scoring.requirementRecord,requirementRecordSource:scoring.sources.requirementRecord,evaluatorReference:scoring.evaluatorReference,
      scoringInputFreezeManifest:scoring.freezeManifest,scoringInputFreezeManifestSource:scoring.freezeManifestSource,
      decisionPath:resource.admissionDecisionPath,reviewAuthorityPath:resource.admissionReviewAuthorityPath,
      reviewAuthoritySourceDigest:resource.admissionReviewAuthoritySourceDigest,reviewArchivePath:resource.admissionReviewArchivePath});
    assert.equal(admission.effective_admission_status,'admitted');admissionReady=true;
    return{status:'ready',blockers:[],public_metadata_verified:true,original_assets_verified:true,admission_ready:true,
      worker_timeout_ms:assets.manifest.execution_budget_ms,runtime_compatibility:'unknown',execution_isolation_authority:false,model_calls:0,grader_process_starts:0};
    });
  }catch{return{status:'blocked',blockers:[`original_grading_resources_${stage}_unverified`],public_metadata_verified:publicMetadataVerified,
    original_assets_verified:originalAssetsVerified,admission_ready:admissionReady,runtime_compatibility:'unknown',execution_isolation_authority:false,model_calls:0,grader_process_starts:0};}
}

function persistEvidence(authorityRoot,normalized,bundle,execution,fragment) {
  const source=join(execution.originalWorkspaceAuthority.path,execution.originalWorkspaceAuthority.repositoryDiffPath),repositoryDiff=read(source);
  const diff=JSON.parse(repositoryDiff),frozen=readStableWorkspaceInventory(execution.frozen.sourcePath),candidate=readStableWorkspaceInventory(execution.candidate.sourcePath);
  assert.equal(diff.frozen_workspace_tree_digest,frozen.digest);assert.equal(diff.candidate_workspace_tree_digest,candidate.digest);
  write(join(authorityRoot,'repository-diff-artifact.json'),repositoryDiff);
  const l=normalized.lineage,checks=fragment.evaluator_rerun?.results??[];
  write(join(authorityRoot,'evaluator-check-artifact.json'),{schema_version:'1.0.0',schema_path:'benchmarks/schemas/evaluator-check-artifact.schema.json',
    program:'adaptive_ask_evaluator_check_artifact',run_instance_id:l.run_instance_id,case_id:l.case_id,attempt:l.attempt,
    normalized_result_id:normalized.normalized_result_id,normalized_result_digest:normalized.normalized_result_digest,checks,
    artifact_digest:canonicalDigest(checks),artifact_bytes:Buffer.byteLength(stableCanonicalJson(checks))||1});
  const invalid=fragment.invalid_input_authority,ref=invalid?.evidence_references?.find(item=>item.kind==='test_result');
  if(ref)write(join(authorityRoot,'evaluation-input-failure-artifact.json'),{schema_version:'1.0.0',schema_path:'benchmarks/schemas/evaluation-input-failure-artifact.schema.json',
    program:'adaptive_ask_evaluation_input_failure_artifact',layer:invalid.layer,category:invalid.category,stage:'private-evaluator',
    run_instance_id:l.run_instance_id,case_id:l.case_id,attempt:l.attempt,normalized_result_id:normalized.normalized_result_id,normalized_result_digest:normalized.normalized_result_digest,
    evaluator_bundle_id:bundle.evaluator_bundle_id,evaluator_bundle_digest:bundle.evaluator_bundle_digest,evaluator_revision:bundle.evaluator_revision,
    source_tree_digest:bundle.evaluator_source_identity.source_tree_digest,dependency_graph_digest:bundle.dependency_graph.graph_digest,
    structured_failure_code:invalid.code,details_digest:ref.digest,details_bytes:ref.bytes,artifact_digest:ref.digest,artifact_bytes:ref.bytes});
}

// Field construction mirrors the public original privateEvaluationRecordFor
// fixture. Inputs here come only from the original constructor and execution.
function privateRecord({root,authorityRoot,privateRoot,normalized,bundle,execution,executed,fragmentPath,draft,adapterDigest}) {
  const n=normalized,l=n.lineage,hidden=bundle.asset_inventory.find(asset=>asset.role==='hidden_tests'),runner=execution.runner;
  const before=executed.before,after=executed.afterSecond,diff=json(join(authorityRoot,'repository-diff-artifact.json'));
  const originalFrozen=readStableWorkspaceInventory(execution.frozen.sourcePath),originalCandidate=readStableWorkspaceInventory(execution.candidate.sourcePath),fragment=read(fragmentPath);
  const artifacts=[['repository_diff','repository-diff-artifact.json'],['test_result','evaluator-check-artifact.json'],['test_result','evaluation-input-failure-artifact.json']].flatMap(([kind,name])=>{
    const path=join(authorityRoot,name);if(!existsSync(path))return[];const a=json(path);return[{kind,path:name,digest:a.artifact_digest,bytes:a.artifact_bytes,inode:lstatSync(path).ino,
      run_instance_id:a.run_instance_id,case_id:a.case_id,attempt:a.attempt,normalized_result_id:a.normalized_result_id??n.normalized_result_id,
      normalized_result_digest:a.normalized_result_digest??n.normalized_result_digest,evaluator_bundle_id:bundle.evaluator_bundle_id,evaluator_bundle_digest:bundle.evaluator_bundle_digest}];});
  const record={schema_version:'1.0.0',schema_path:'benchmarks/schemas/private-evaluation-record.schema.json',program:'adaptive_ask_private_evaluation_record',
    evaluator_bundle_id:bundle.evaluator_bundle_id,evaluator_bundle_digest:bundle.evaluator_bundle_digest,evaluator_revision:bundle.evaluator_revision,evaluator_source_identity:bundle.evaluator_source_identity,
    normalized_result_id:n.normalized_result_id,normalized_result_digest:n.normalized_result_digest,run_instance_id:l.run_instance_id,case_id:l.case_id,attempt:l.attempt,
    candidate_authority:structuredClone(execution.originalWorkspaceAuthority.candidateAuthority),command_evidence_digest:n.command_evidence.manifest_digest,
    effective_verification_state:deriveEffectiveVerificationEvidenceState({normalizedResult:n,evaluatorResult:draft}),
    hidden_evaluator_asset_role:'hidden_tests',hidden_evaluator_path:hidden.path,hidden_evaluator_sha256:hidden.sha256,hidden_evaluator_bytes:hidden.bytes,
    hidden_evaluator_entry_point:'evaluateCandidateSafe',hidden_evaluator_inode:lstatSync(join(privateRoot,hidden.path)).ino,
    evaluator_runner_path:runner.sourcePath,evaluator_runner_sha256:runner.sourceSha256,evaluator_runner_bytes:runner.sourceBytes,evaluator_runner_inode:lstatSync(join(root,runner.sourcePath)).ino,
    evaluator_runner_source_identity:{path:runner.sourcePath,base_git_revision:bundle.evaluator_revision,source_bytes:runner.sourceBytes,source_sha256:runner.sourceSha256,
      base_git_revision_bytes:runner.baseGitRevisionBytes,base_git_revision_sha256:runner.baseGitRevisionSha256},dependency_graph_digest:bundle.dependency_graph.graph_digest,
    sealed_repository_root_relative_path:execution.repository.relativePath,sealed_repository_descriptor_relative_path:execution.repository.descriptorRelativePath,
    sealed_repository_descriptor_sha256:execution.repository.descriptorSha256,sealed_repository_descriptor_bytes:execution.repository.descriptorBytes,
    sealed_repository_source_graph_digest:execution.repository.sourceGraphDigest,sealed_repository_fixture_authority_digest:execution.repository.fixtureAuthorityDigest,
    sealed_repository_evaluator_authority_manifest_path:execution.repository.evaluatorAuthorityManifestPath,sealed_repository_evaluator_authority_manifest_raw_sha256:execution.repository.evaluatorAuthorityManifestRawSha256,
    sealed_repository_evaluator_authority_manifest_digest:execution.repository.evaluatorAuthorityManifestDigest,sealed_repository_portable_digest:before.repository.portable_digest,
    sealed_repository_runtime_digest:before.repository.runtime_digest,sealed_repository_root_identity_before:before.repository.root,
    sealed_repository_root_identity_after_first:executed.afterFirst.repository.root,sealed_repository_root_identity_after_second:after.repository.root,
    frozen_workspace_path:rel(authorityRoot,execution.frozen.sourcePath),candidate_workspace_path:rel(authorityRoot,execution.candidate.sourcePath),evaluation_input_evidence_root_path:rel(authorityRoot,execution.evidence.sourcePath),
    frozen_workspace_original_identity:{portable_digest:originalFrozen.digest,runtime_digest:originalFrozen.runtimeDigest,root:originalFrozen.rootIdentity},
    candidate_workspace_original_identity:{portable_digest:originalCandidate.digest,runtime_digest:originalCandidate.runtimeDigest,root:originalCandidate.rootIdentity},
    evaluator_runner_sealed_execution_path:runner.relativePath,hidden_evaluator_sealed_execution_path:execution.hidden.relativePath,
    frozen_workspace_sealed_execution_path:execution.frozen.relativePath,candidate_workspace_sealed_execution_path:execution.candidate.relativePath,evaluation_input_evidence_sealed_execution_path:execution.evidence.relativePath,
    original_workspace_authority_sealed_execution_path:execution.originalWorkspaceAuthority.relativePath,original_workspace_authority_path:execution.originalWorkspaceAuthority.authorityPath,
    original_workspace_authority_raw_sha256:execution.originalWorkspaceAuthority.authoritySha256,original_workspace_authority_digest:execution.originalWorkspaceAuthority.authorityDigest,original_workspace_authority_bytes:execution.originalWorkspaceAuthority.authorityBytes,
    evaluator_execution_status:'completed',first_run_fragment_sha256:hash(executed.firstBytes),first_run_fragment_bytes:executed.firstBytes.length,
    second_run_fragment_sha256:hash(executed.secondBytes),second_run_fragment_bytes:executed.secondBytes.length,deterministic_rerun:true,
    frozen_workspace_inventory_digest:diff.frozen_workspace_tree_digest,candidate_workspace_inventory_digest:diff.candidate_workspace_tree_digest,
    repository_diff_artifact_digest:diff.artifact_digest,repository_diff_artifact_bytes:diff.artifact_bytes,
    repository_diff_sealed_authority_path:execution.originalWorkspaceAuthority.repositoryDiffPath,repository_diff_sealed_authority_raw_sha256:execution.originalWorkspaceAuthority.repositoryDiffSha256,
    private_fragment_path:rel(authorityRoot,fragmentPath),private_fragment_sha256:hash(fragment),private_fragment_bytes:fragment.length,private_fragment_inode:lstatSync(fragmentPath).ino,
    fragment_schema_digest:hash(read(join(root,'benchmarks/schemas/private-evaluator-fragment.schema.json'))),adapter_source_digest:adapterDigest,
    adapter_result_envelope_digest:computeAdapterResultEnvelopeDigest(draft),evidence_artifacts:artifacts};
  for(const [kind,prefix]of [['runner','evaluator_runner'],['hidden','hidden_evaluator']]){
    const a=before[kind],b=after[kind];Object.assign(record,{[`${prefix}_sealed_sha256`]:a.sha256,[`${prefix}_sealed_bytes`]:a.bytes,[`${prefix}_sealed_dev`]:a.identity.dev,
      [`${prefix}_sealed_inode`]:a.identity.ino,[`${prefix}_sealed_nlink`]:a.identity.nlink,[`${prefix}_sealed_mtime_ms`]:a.identity.mtimeMs,[`${prefix}_sealed_ctime_ms`]:a.identity.ctimeMs,
      [`${prefix}_sealed_execution_identity_before`]:a.identity,[`${prefix}_sealed_execution_identity_after`]:b.identity});}
  for(const [kind,prefix]of [['frozen','frozen_workspace'],['candidate','candidate_workspace'],['evidence','evaluation_input_evidence']]){
    const a=before[kind];Object.assign(record,{[`${prefix}_sealed_inventory_digest`]:a.portable_digest,[`${prefix}_sealed_runtime_digest`]:a.runtime_digest,
      [`${prefix}_sealed_runtime_identity_before`]:a,[`${prefix}_sealed_runtime_identity_after`]:after[kind]});}
  record.evaluation_record_digest=computePrivateEvaluationRecordDigest(record);return record;
}

export function primaryPrivateGradingBudget(executionBudgetMs) {
  assert.ok(Number.isSafeInteger(executionBudgetMs)&&executionBudgetMs>0&&executionBudgetMs<=900000,'original private worker budget invalid');
  return {worker_timeout_ms:executionBudgetMs,condition_reservation_ms:4*executionBudgetMs};
}

// A successfully verified/saved original score may truthfully remain unknown.
// Only the explicitly selected fresh practical version separates that semantic
// status from completed grading execution; legacy behavior is retained.
export function primaryPrivateGradingExecutionStatus(scoringStatus, receipts, { freshVersion = false } = {}) {
  assert.equal(typeof freshVersion, 'boolean');
  assert.ok(['complete', 'not_scoring_ready'].includes(scoringStatus));
  assert.equal(receipts.length, 4, 'all original worker runs must be retained');
  assert.ok(receipts.every(receipt => receipt.process_completed === true && receipt.exit_code === 0), 'original worker completion is unverified');
  return scoringStatus === 'complete' || freshVersion ? 'completed' : 'unknown';
}
export function runPrimaryEvaluationPrivateGrading(producerOptions,runtimeInputs,{signal=null,deadlineAtMs=null,...unknownControls}={}) {
  let requested=false,evidenceKind='unknown',profile=null;
  try {
    assert.equal(Object.keys(unknownControls).length,0,'original worker budget cannot be overridden');
    assert.ok(!signal?.aborted,'primary private grade aborted');
    // Reserve the original API maximum before construction; the verified bundle
    // supplies the unchanged actual timeout for initial and validation runs.
    if(deadlineAtMs!==null)assert.ok(Number.isFinite(deadlineAtMs)&&Date.now()+4*900000<=deadlineAtMs,'primary private grade reservation unavailable');
    const producer=verifyPrimaryEvaluationProducer(producerOptions);evidenceKind=producer.evidence_kind;profile=primaryProfileForRequest(producer.request);
    const processing=primaryProcessingSelection(producer.block);
    assert.equal(producer.commandEvidenceParserRevision,processing?.command_evidence_parser_revision??PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION,'private grading requires the fixed processing selection');
    const input=buildPrimaryEvaluationScoringInputs(producerOptions,runtimeInputs),s=input.scorerOptions,n=input.normalizedResult;
    for(const key of ['frozenSourceRoot','privateRoot','privateEvaluationRoot','manifestPath','publicResultRoot'])assert.ok(runtimeInputs[key],'primary original private runtime inputs required');
    const authorityRoot=runtimeInputs.privateEvaluationRoot,publicRoot=resolve(runtimeInputs.publicResultRoot);
    assert.equal(realpathSync(dirname(publicRoot)),dirname(publicRoot));assert.ok(!existsSync(publicRoot),'primary public grading output already exists');
    for(const path of [producerOptions.recordRoot,runtimeInputs.frozenSourceRoot,runtimeInputs.privateRoot,authorityRoot])assert.ok(publicRoot!==resolve(path)&&!publicRoot.startsWith(`${resolve(path)}/`)&&!resolve(path).startsWith(`${publicRoot}/`),'primary public output overlaps authority');
    const execution=createPrimaryEvaluationSealedEvaluatorExecution(producerOptions,runtimeInputs);
    const logs=join(authorityRoot,'worker-logs');mkdirSync(logs,{mode:0o700});
    const captured=withPrimaryEvaluatorLogCapture(producerOptions,{outputRoot:logs,normalizedResult:n},()=>{
      const scoring=verifyPortfolioScoringInputs({root:s.root,catalogPath:s.catalogPath,policyManifestPath:s.policyManifestPath,scoringPolicyPath:s.scoringPolicyPath,
        admissionRecordPath:s.admissionRecordPath,requirementRecordPath:s.requirementRecordPath,outputContractPath:s.outputContractPath,referencePath:s.referencePath,
        freezeManifestPath:s.scoringInputFreezeManifestPath,freezeManifestSourceDigest:s.scoringInputFreezeManifestSourceDigest});
      const bundle=verifyPrivateEvaluatorBundle(s),anchor=readEvaluatorAuthorityAnchorFromFreeze({root:s.root,freezeManifestPath:s.scoringInputFreezeManifestPath,
        freezeManifestSourceDigest:s.scoringInputFreezeManifestSourceDigest,referencePath:s.referencePath});
      const budget=primaryPrivateGradingBudget(bundle.manifest.execution_budget_ms);
      if(deadlineAtMs!==null)assert.ok(Date.now()+budget.condition_reservation_ms<=deadlineAtMs,'original private grade reservation unavailable');
      assert.ok(!signal?.aborted,'primary private grade aborted');requested=true;
      const executed=executeProductionSealedEvaluator({execution,externalAuthorityAnchor:anchor,repositoryRoot:s.root,timeout:budget.worker_timeout_ms});
      assert.deepEqual(executed.firstBytes,executed.secondBytes);
      const fragmentPath=join(authorityRoot,'authority-chain/private-fragment.json');write(fragmentPath,executed.firstBytes);
      const authority={...scoring,evaluatorReference:bundle.reference,normalizedResult:n,sourceSnapshotDigest:s.sourceSnapshotDigest,bundleManifest:bundle.manifest,
        privateFragmentDigest:hash(executed.firstBytes),privateFragmentBytes:executed.firstBytes.length,fragmentBinding:{normalized_result_id:n.normalized_result_id,normalized_result_digest:n.normalized_result_digest,
          run_instance_id:n.lineage.run_instance_id,case_id:n.lineage.case_id,attempt:n.lineage.attempt},privateEvaluationRecordDigest:'sha256:'+'0'.repeat(64)};
      // Draft cycle placeholder is memory-only and excluded by the original
      // adapter-envelope digest. It is never saved or passed to the scorer.
      const draft=adaptPrivateEvaluatorFragmentToEnvelope({root:s.root,fragment:executed.firstFragment,authority});
      persistEvidence(authorityRoot,n,bundle.manifest,execution,executed.firstFragment);
      const record=privateRecord({root:s.root,authorityRoot,privateRoot:runtimeInputs.privateRoot,normalized:n,bundle:bundle.manifest,execution,executed,
        fragmentPath,draft,adapterDigest:primaryAdapterSourceDigest()});
      const recordPath=join(authorityRoot,'authority-chain/private-evaluation-record.json');write(recordPath,record);
      const envelope=adaptPrivateEvaluatorFragmentToEnvelope({root:s.root,fragment:executed.firstFragment,authority:{...authority,privateEvaluationRecordDigest:record.evaluation_record_digest}});
      mkdirSync(publicRoot,{mode:0o700});const resultPath=join(publicRoot,'evaluator-result.json');write(resultPath,envelope);
      assert.ok(!signal?.aborted,'primary private grade aborted');
      // This invokes the original verifier once; its existing private-record
      // validation performs two more runs. Do not separately verify again.
      return scorePrimaryEvaluatorResult({...s,resultPath,privateEvaluationRecordPath:recordPath,privateFragmentPath:fragmentPath,outputPath:join(publicRoot,'engineering-result.json')},n);
    });
    assert.equal(captured.receipts.length,4,'primary original private worker count changed');assert.ok(captured.receipts.every(receipt=>receipt.process_completed&&receipt.exit_code===0));
    return {status:primaryPrivateGradingExecutionStatus(captured.result.artifact.scoring_status,captured.receipts,{freshVersion:Boolean(producer.request.scoring_version)}),scoring_status:captured.result.artifact.scoring_status,
      scoring_reason:captured.result.artifact.scoring_reason,quality:captured.result.artifact.requirement_score.normalized_requirement_score,
      condition:runtimeInputs.condition,evidence_kind:producer.evidence_kind,formal_aggregate_eligible:false,model_calls:0,grader_process_starts:4,grader_process_completed:true,
      public_artifacts:{evaluator_result:{path:join(publicRoot,'evaluator-result.json'),digest:hash(read(join(publicRoot,'evaluator-result.json')))},
        engineering_result:{path:captured.result.outputPath??join(publicRoot,'engineering-result.json'),digest:hash(read(join(publicRoot,'engineering-result.json')))},
        ...(captured.result.originalArtifact?{original_engineering_result:{path:captured.result.originalArtifact.path,digest:captured.result.originalArtifact.digest}}:{})},worker_receipts:captured.receipts};
  }catch(error){
    // Private stream content and caught Error.message never cross this API.
    // Only module-owned receipt summaries survive partial execution failure.
    const receipts=primaryEvaluatorLogFailureReceipts(error)??[];
    const starts=receipts.length?receipts.filter(receipt=>receipt.spawn_observed).length:requested?null:0;
    const completed=receipts.length?receipts.every(receipt=>receipt.process_completed):requested?null:false;
    return {status:requested?'unknown':'blocked',scoring_status:'not_scoring_ready',quality:null,blockers:['original_private_pipeline_unverified'],
      condition:profile?.conditions.includes(runtimeInputs?.condition)?runtimeInputs.condition:null,evidence_kind:evidenceKind,
      model_calls:0,grader_process_starts:starts,grader_process_completed:completed,worker_receipts:receipts,formal_aggregate_eligible:false};
  }
}
