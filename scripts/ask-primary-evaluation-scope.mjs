import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { verifyPrimaryEvaluationProducer } from './ask-primary-evaluation-producer.mjs';
import { primaryScoringRoot } from './ask-primary-scoring-version.mjs';
import { PRIMARY_FIXTURE_IDS } from './ask-primary-fixture-recipe.mjs';
import { PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_EVALUATION_CONDITIONS, getPrimaryEvaluationProfile, primaryProfileForRequest } from './ask-primary-evaluation-profile.mjs';

const state = new AsyncLocalStorage(), resourceGraphState = new AsyncLocalStorage(), logFailures = new WeakMap(), ROOT = fileURLToPath(new URL('../', import.meta.url));
export const PRIMARY_PROFILE_CONDITIONS = PRIMARY_EVALUATION_CONDITIONS;
export const PRIMARY_PROFILE_SCHEMAS = Object.freeze(['normalized-portfolio-result', 'normalized-portfolio-run',
  'evaluator-result-envelope', 'portfolio-engineering-result', 'original-workspace-authority',
  'portfolio-terminal-workspace-authority', 'repository-diff-artifact', 'portfolio-command-evidence']);
const active = () => { const value = state.getStore(); return value?.active ? value : null; };
function run(value, callback, allowSchemaRecheck = false) {
  if (active() && !allowSchemaRecheck) throw new Error('primary_nested_scope_refused');
  value.active = true;
  return state.run(value, () => { try { const result = callback(value.verified); if (result?.then) throw new Error('primary_async_scope_forbidden'); return result; } finally { value.active = false; } });
}
// Builder scope selects schemas only. It supplies neither an execution inspection
// nor permission to verify/score private results.
export function withPrimarySchemaBuild(callback, { profileId = PRIMARY_EVALUATION_PROFILE_ID } = {}) {
  const profile = getPrimaryEvaluationProfile(profileId), current = active();
  if (current?.verified && current.profile.id !== profile.id) throw new Error('primary_schema_build_profile_mix_refused');
  return run({ building: true, grading: false, profile }, callback, Boolean(current?.verified));
}
const activeProfile = () => active()?.profile;
export const activePrimaryProducer = () => Boolean(active()?.verified);
const rawDigest=raw=>`sha256:${createHash('sha256').update(raw).digest('hex')}`;
function pinnedHistoricalGraph(root,fixtureId,binding,scoringVersion = null) {
  const fixedRoot = primaryScoringRoot({ fixture_id: fixtureId, grading: { scoring_version: scoringVersion } });
  if (scoringVersion && root !== fixedRoot) throw new Error('primary_resource_graph_scoring_version_root_changed');
  if(!PRIMARY_FIXTURE_IDS.includes(fixtureId)||binding.fixture_id!==fixtureId||!['primary_single_shot_v1','primary_principles_v2_single_shot_v1'].includes(binding.profile_id))throw new Error('primary_resource_graph_binding_invalid');
  if(resolve(root)!==root||realpathSync(root)!==root)throw new Error('primary_resource_graph_root_invalid');
  const base=`benchmarks/fixtures/checkpoint-b2/${fixtureId}/`,read=path=>readStableFile(path,'primary historical public graph pin',33554432).bytes;
  const currentFreeze=read(join(fixedRoot,base,'scoring-input-freeze-manifest.json')),freeze=JSON.parse(currentFreeze);
  if(rawDigest(currentFreeze)!==binding.scoring_input_freeze_digest||freeze.fixture_input_digest!==binding.input_manifest_digest
    ||!read(join(root,base,'scoring-input-freeze-manifest.json')).equals(currentFreeze))throw new Error('primary_resource_graph_freeze_changed');
  if(freeze.evaluator_public_reference.path!==`${base}evaluator-reference.json`)throw new Error('primary_resource_graph_reference_path_invalid');
  const currentReference=read(join(fixedRoot,freeze.evaluator_public_reference.path)),reference=JSON.parse(currentReference);
  if(rawDigest(currentReference)!==freeze.evaluator_public_reference.raw_byte_digest||!read(join(root,freeze.evaluator_public_reference.path)).equals(currentReference)
    ||reference.fixture_id!==fixtureId||reference.evaluator_bundle_digest!==binding.evaluator_bundle_digest)throw new Error('primary_resource_graph_reference_changed');
  const identity=reference.evaluator_source_identity,graph=identity.dependency_graph;
  const entries=['scripts/ask-benchmark-evaluator-boundary.mjs','scripts/ask-benchmark-materialize.mjs','scripts/ask-benchmark-normalized-results.mjs','scripts/ask-benchmark-private-evaluator-runner.mjs','scripts/ask-benchmark-scoring-contract.mjs'];
  if(JSON.stringify(graph.entry_paths)!==JSON.stringify(entries)||identity.base_git_revision!==reference.evaluator_revision)throw new Error('primary_resource_graph_entries_changed');
  return{root,baseRevision:identity.base_git_revision,entryPaths:[...graph.entry_paths],authorityPaths:graph.node_inventory.filter(node=>node.file_type==='authority_data').map(node=>node.path),
    privateEntryPaths:graph.edge_inventory.filter(edge=>edge.kind==='private_entry_import').map(edge=>edge.to)};
}
/** Source-only scope; never enables schema, producer, evaluator or start authority. */
export function withPrimaryHistoricalEvaluatorResources(block,root,callback) {
  if(resourceGraphState.getStore()?.active||active())throw new Error('primary_resource_graph_nested_scope_refused');
  const context={active:true,block:structuredClone(block),root};pinnedHistoricalGraph(root,block.fixture_id,block.grading.binding,block.grading.scoring_version);
  return resourceGraphState.run(context,()=>{try{const result=callback();if(result?.then)throw new Error('primary_resource_graph_async_scope_forbidden');return result;}finally{context.active=false;}});
}
export function primaryEvaluatorDependencyGraphParameters({root,baseRevision,defaultParameters}) {
  const producer=active(),resource=resourceGraphState.getStore();
  if(!producer?.verified&&!resource?.active)return null;
  if(!defaultParameters)throw new Error('primary_explicit_graph_parameters_refused');
  let selected;
  if(producer?.verified){const verified=verifyPrimaryEvaluationProducer(producer.options);selected=pinnedHistoricalGraph(root,verified.request.fixture_id,verified.request.binding,verified.request.scoring_version);}
  else{if(root!==resource.root)throw new Error('primary_resource_graph_root_changed');selected=pinnedHistoricalGraph(root,resource.block.fixture_id,resource.block.grading.binding,resource.block.grading.scoring_version);}
  if(selected.baseRevision!==baseRevision)throw new Error('primary_resource_graph_revision_changed');
  return selected;
}
export function primaryGradingSchemaPath(path) {
  if (!active()) return path;
  if (/\/core-[^/]+\.schema\.json$/u.test(path)) throw new Error('primary_core_profile_mix_refused');
  const prefix = activeProfile().schema_prefix;
  for (const name of PRIMARY_PROFILE_SCHEMAS) {
    for (const other of ['primary', 'primary-k2']) if (other !== prefix && path.endsWith(`/benchmarks/schemas/${other}-${name}.schema.json`)) throw new Error('primary_schema_profile_mix_refused');
  }
  for (const name of PRIMARY_PROFILE_SCHEMAS) if (path.endsWith(`/benchmarks/schemas/${name}.schema.json`)) return join(ROOT, `benchmarks/schemas/${activeProfile().schema_prefix}-${name}.schema.json`);
  return path;
}
export function primaryGradingConditions(legacy) {
  if (!active()) return legacy;
  if (legacy.join(',') !== 'plain,kernel_only,adaptive_ask,full_ask') throw new Error('primary_core_condition_mix_refused');
  return activeProfile().conditions;
}
export function withPrimaryEvaluationProducer(options, callback, { grading = false } = {}) {
  const verified = verifyPrimaryEvaluationProducer(options);
  return run({ options: Object.freeze({ ...options }), verified, grading, profile: primaryProfileForRequest(verified.request) }, callback);
}
export function primaryProducerInspection(options) {
  const current = active(); if (!current?.verified) return null;
  const verified = verifyPrimaryEvaluationProducer(current.options);
  for (const key of ['planPath', 'materializedPath', 'selectionState', 'runDir', 'config']) {
    if (options[key] !== verified.executionOptions[key]) throw new Error('primary_execution_path_changed');
  }
  if (options.root !== verified.executionOptions.root) {
    // Public pins only. Original private source/Git/graph verification remains
    // mandatory in the unchanged evaluator boundary, not supplied by this scope.
    for (const ref of [verified.request.public_grading_references.scoring_input_freeze, verified.request.public_grading_references.evaluator_reference]) {
      if (readStableFile(join(options.root, ref.path), 'primary frozen public pin', 33554432).rawByteDigest !== ref.raw_digest) throw new Error('primary_frozen_public_pin_changed');
    }
  }
  return verified.inspection;
}
export function withPrimaryEvaluatorAuthority(options, callback) {
  const current = active();
  if (current && !current.grading) throw new Error('primary_producer_scope_cannot_authorize_scoring');
  if (!options.primaryEvaluationProducer) return callback();
  if (options.coreCaptureProducer || options.coreGradingAuthority || options.coreControllerGradingContext) throw new Error('primary_core_authority_mix_refused');
  if (current) return callback();
  return withPrimaryEvaluationProducer(options.primaryEvaluationProducer, callback, { grading: true });
}
export function assertPrimaryEvaluatorVerified(verified) {
  const current = active(); if (!current) return verified;
  if (!current.verified || !current.grading) throw new Error('primary_producer_scope_cannot_authorize_scoring');
  const inspection = primaryProducerInspection(current.verified.executionOptions), lineage = verified.normalized.lineage;
  const item = inspection.cases.find(value => value.entry.case_id === lineage.case_id), attempt = item?.attempts.find(value => value.attempt === lineage.attempt);
  if (!attempt || item.entry.condition !== lineage.condition || item.entry.fixture_id !== lineage.fixture_id
    || `sha256:${item.entry.input_manifest_sha256}` !== lineage.fixture_input_digest
    || inspection.identity.run_instance_id !== lineage.run_instance_id
    || attempt.evidence.result_digest !== lineage.raw_result_digest
    || attempt.evidence.request_digest !== lineage.request_digest
    || attempt.evidence.commit_digest !== lineage.terminal_commit_digest) throw new Error('primary_verified_lineage_changed');
  return verified;
}
function primaryFinalAttempt(normalized) {
  const current=active();if(!current?.verified)return null;
  const inspection=primaryProducerInspection(current.verified.executionOptions),l=normalized?.lineage;
  const c=inspection.cases.find(item=>item.entry.case_id===l?.case_id),a=c?.attempts.find(item=>item.attempt===l?.attempt);
  if(!a||inspection.identity.run_instance_id!==l.run_instance_id||c.entry.condition!==l.condition||c.entry.fixture_id!==l.fixture_id
    ||a.evidence.request_digest!==l.request_digest||a.evidence.result_digest!==l.raw_result_digest||a.evidence.commit_digest!==l.terminal_commit_digest
    ||a.evidence.final_output_digest!==l.final_output_digest||a.evidence.final_output_bytes!==l.final_output_bytes
    ||a.result.final_output?.format!=='primary_plain_utf8_response_v1')throw new Error('primary_final_response_lineage_changed');
  return a;
}
export function primaryFinalResponseRelativePath(normalized) {
  const attempt=primaryFinalAttempt(normalized);if(!attempt)return null;
  return `cases/${normalized.lineage.case_id}/attempts/${normalized.lineage.attempt}/primary-response.txt`;
}
export function validatePrimaryRawFinalResponse(normalized, raw) {
  const attempt=primaryFinalAttempt(normalized);if(!attempt)return false;
  if(!Buffer.isBuffer(raw)||raw.length!==normalized.lineage.final_output_bytes
    ||`sha256:${createHash('sha256').update(raw).digest('hex')}`!==normalized.lineage.final_output_digest)throw new Error('primary_final_response_bytes_changed');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
  if(!text.trim()||!Buffer.from(text,'utf8').equals(raw))throw new Error('primary_final_response_utf8_invalid');
  return true;
}
export function primaryAdapterSourceDigest() {
  const current=active();if(!current?.verified)return null;
  return verifyPrimaryEvaluationProducer(current.options).source_digests['scripts/ask-benchmark-evaluator-boundary.mjs'];
}
export function withPrimaryEvaluatorLogCapture(options,{outputRoot,normalizedResult},callback) {
  return withPrimaryEvaluationProducer(options,verified=>{
    const current=active(),stat=lstatSync(outputRoot);
    if(realpathSync(outputRoot)!==outputRoot||!stat.isDirectory()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid())throw new Error('primary_private_log_root_invalid');
    for(const root of [ROOT.replace(/\/$/u,''),options.recordRoot])if(outputRoot===root||outputRoot.startsWith(`${root}/`)||root.startsWith(`${outputRoot}/`))throw new Error('primary_private_log_root_overlaps_source');
    const l=normalizedResult.lineage,c=verified.inspection.cases.find(item=>item.entry.case_id===l.case_id),a=c?.attempts.find(item=>item.attempt===l.attempt);
    if(!a||c.entry.condition!==l.condition||verified.inspection.identity.run_instance_id!==l.run_instance_id||a.evidence.request_digest!==l.request_digest||a.evidence.result_digest!==l.raw_result_digest||a.evidence.commit_digest!==l.terminal_commit_digest)throw new Error('primary_private_log_binding_invalid');
    current.logs={outputRoot,normalizedResult,receipts:[]};
    try{
      const result=callback(verified);if(result?.then)throw new Error('primary_async_scope_forbidden');return {result,receipts:structuredClone(current.logs.receipts)};
    }catch(error){if(error&&typeof error==='object')logFailures.set(error,structuredClone(current.logs.receipts));throw error;}
  },{grading:true});
}
export function primaryEvaluatorLogFailureReceipts(error){return logFailures.has(error)?structuredClone(logFailures.get(error)):null;}
// Invoked by the original authority-owned child boundary, not a caller callback.
// These diagnostic receipts do not create evaluator/admission authority.
export function capturePrimaryEvaluatorChildStreams(child,payload) {
  const current=active();if(!current?.logs)return;
  const expected=current.logs.normalizedResult,actual=JSON.parse(Buffer.from(payload.normalized_result.source_base64,'base64').toString('utf8'));
  if(actual.normalized_result_id!==expected.normalized_result_id||actual.normalized_result_digest!==expected.normalized_result_digest||actual.lineage.condition!==expected.lineage.condition||actual.lineage.run_instance_id!==expected.lineage.run_instance_id)throw new Error('primary_private_child_binding_invalid');
  const prefix=String(current.logs.receipts.length+1).padStart(4,'0'),hash=raw=>`sha256:${createHash('sha256').update(raw).digest('hex')}`;
  const stdout=Buffer.from(child.stdout??''),stderr=Buffer.from(child.stderr??''),s=child.status??null,signal=child.signal??null;
  const spawned=Number.isInteger(child.pid)&&child.pid>0,completed=spawned&&(Number.isInteger(s)||typeof signal==='string');
  const receipt={kind:'ask_primary_private_worker_stdio_v1',evidence_kind:current.verified.evidence_kind,condition:expected.lineage.condition,
    run_instance_id:expected.lineage.run_instance_id,normalized_result_id:expected.normalized_result_id,normalized_result_digest:expected.normalized_result_digest,
    stdout:{path:`${prefix}.stdout.log`,bytes:stdout.length,digest:hash(stdout)},stderr:{path:`${prefix}.stderr.log`,bytes:stderr.length,digest:hash(stderr)},
    spawn_observed:spawned,process_completed:completed,exit_code:s,signal,error_code:child.error?(/^[A-Z0-9_]{1,40}$/u.test(child.error.code??'')?child.error.code:'unknown'):null,log_capture_status:'incomplete'};
  current.logs.receipts.push(receipt);
  for(const [name,raw]of [[receipt.stdout.path,stdout],[receipt.stderr.path,stderr]])writeFileSync(join(current.logs.outputRoot,name),raw,{flag:'wx',mode:0o600});
  writeFileSync(join(current.logs.outputRoot,`${prefix}.receipt.json`),Buffer.from(JSON.stringify({...receipt,log_capture_status:'complete'})+'\n'),{flag:'wx',mode:0o600});
  receipt.log_capture_status='complete';
  if(!completed)throw new Error('primary_private_child_completion_unknown');
}
