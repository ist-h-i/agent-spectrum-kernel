import {PRIMARY_RUNTIME_V10_REVISION} from './ask-primary-runtime-v10.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { verifyPrimaryEvaluationProducer } from './ask-primary-evaluation-producer.mjs';
import { primaryScoringRoot, primaryProcessingDescriptor, readPrimaryScoringVersion,
  PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH, isPrimaryScoringFixtureId, primaryProcessingAuthorityPaths } from './ask-primary-scoring-version.mjs';
import { PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_EVALUATION_CONDITIONS, getPrimaryEvaluationProfile, primaryProfileForRequest } from './ask-primary-evaluation-profile.mjs';
import { PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION } from './ask-benchmark-command-evidence.mjs';

const state = new AsyncLocalStorage(), resourceGraphState = new AsyncLocalStorage(), logFailures = new WeakMap(), executionFailures = new WeakMap(), ROOT = fileURLToPath(new URL('../', import.meta.url));
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
export function withPrimarySchemaBuild(callback, { profileId = PRIMARY_EVALUATION_PROFILE_ID, commandEvidenceParserRevision } = {}) {
  const profile = getPrimaryEvaluationProfile(profileId), current = active();
  commandEvidenceParserRevision ??= current?.commandEvidenceParserRevision ?? PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION;
  if (![PRIMARY_SAVED_COMMAND_EVIDENCE_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION, PRIMARY_RUNTIME_V10_REVISION].includes(commandEvidenceParserRevision)) throw new Error('primary_unknown_command_evidence_revision');
  if (current?.verified && current.profile.id !== profile.id) throw new Error('primary_schema_build_profile_mix_refused');
  if (current?.verified && current.commandEvidenceParserRevision !== commandEvidenceParserRevision) throw new Error('primary_schema_build_processing_mix_refused');
  return run({ building: true, grading: false, profile, commandEvidenceParserRevision }, callback, Boolean(current?.verified));
}
const activeProfile = () => active()?.profile;
export const activePrimaryProducer = () => Boolean(active()?.verified);
// Only authority-owned roots from the verified producer; callers cannot supply
// a shorter boundary list to place private observations in model/public inputs.
export function primaryRuntimeObservationSourceRoots() {
  const current = active(); if (!current?.verified) return [];
  const verified = verifyPrimaryEvaluationProducer(current.options);
  return [current.options.recordRoot, verified.block.root, verified.block.public_input_root,
    verified.block.input_manifest.path, ...(verified.originalSourceRepository === null ? [] : [verified.originalSourceRepository])];
}
const rawDigest=raw=>`sha256:${createHash('sha256').update(raw).digest('hex')}`;
const historicalEntries = Object.freeze(['scripts/ask-benchmark-evaluator-boundary.mjs','scripts/ask-benchmark-materialize.mjs',
  'scripts/ask-benchmark-normalized-results.mjs','scripts/ask-benchmark-private-evaluator-runner.mjs','scripts/ask-benchmark-scoring-contract.mjs']);
// Consume the checked finite descriptor only after the existing version /
// producer / scope import cycle has initialized.
const processingSchemas = processing => Object.keys(processing.source_file_digests).filter(path => path.endsWith('.schema.json'));
// The v8 schema generator is build-time authority, never a private runtime import.
const processingSourceAuthorities = processing => primaryProcessingAuthorityPaths(processing.command_evidence_parser_revision);
const sourceGit = (root, ...args) => execFileSync('git', ['-C', root, 'rev-parse', ...args],
  { encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sourceCommonDirectory = root => realpathSync(sourceGit(root, '--path-format=absolute', '--git-common-dir'));
function sourceBuildRoot(root, context) {
  try {
    if (lstatSync(root).isSymbolicLink()) throw new Error('symlink');
    // Writers use the OS temporary path, which may have a canonical ancestor
    // alias (/var on macOS). The final root itself must be an ordinary directory.
    const selected = realpathSync(root);
    if (selected === context.root) return selected;
    // Existing transactional writers stage in a linked worktree. Only their
    // selected commit in the same Git common directory can join this scope.
    const gitFile = join(selected, '.git'), gitDirectory = realpathSync(sourceGit(selected, '--absolute-git-dir'));
    if (lstatSync(gitFile).isFile() && dirname(gitDirectory) === join(context.commonDirectory, 'worktrees')
      && sourceCommonDirectory(selected) === context.commonDirectory && sourceGit(selected, 'HEAD') === context.baseRevision) {
      const backlink = readStableFile(join(gitDirectory, 'gitdir'), 'source construction staging backlink', 8192).bytes.toString('utf8').replace(/\n$/u, '');
      if (realpathSync(backlink) === gitFile) return selected;
    }
  } catch { /* Preserve the closed construction-root error below. */ }
  throw new Error('primary_source_build_root_changed');
}
/** Explicit source construction only, before a new private version is admitted.
 * No producer/schema/worker authority is supplied; async writers retain only
 * this graph choice until their returned work settles. Detached work loses it. */
export function withPrimaryProcessingSourceBuild({ root, baseRevision, commandEvidenceParserRevision = PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, ...unknown }, callback) {
  if (Object.keys(unknown).length || typeof callback !== 'function') throw new Error('primary_source_build_arguments_invalid');
  if (resourceGraphState.getStore()?.active || active()) throw new Error('primary_source_build_nested_scope_refused');
  if (resolve(root) !== root || realpathSync(root) !== root) throw new Error('primary_source_build_root_invalid');
  if (!/^[a-f0-9]{40}$/u.test(baseRevision)) throw new Error('primary_source_build_revision_invalid');
  const processing = primaryProcessingDescriptor({ root, commandEvidenceParserRevision });
  if (JSON.stringify(processing) !== JSON.stringify(primaryProcessingDescriptor({ commandEvidenceParserRevision }))) throw new Error('primary_source_build_processing_source_changed');
  const context = { active: true, sourceBuild: true, root, baseRevision, processing, commonDirectory: sourceCommonDirectory(root) };
  return resourceGraphState.run(context, () => {
    try {
      const result = callback();
      if (result?.then) return Promise.resolve(result).finally(() => { context.active = false; });
      context.active = false; return result;
    } catch (error) { context.active = false; throw error; }
  });
}
function pinnedHistoricalGraph(root,fixtureId,binding,scoringVersion = null) {
  const version = scoringVersion ? readPrimaryScoringVersion(scoringVersion, fixtureId) : null;
  const fixedRoot = version?.root ?? primaryScoringRoot({ fixture_id: fixtureId, grading: { scoring_version: null } });
  if (scoringVersion && root !== fixedRoot) throw new Error('primary_resource_graph_scoring_version_root_changed');
  const evaluationVersion = version?.processing?.command_evidence_parser_revision === PRIMARY_RUNTIME_V10_REVISION ? 'ask_primary_scoring_version_v10' : version?.processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION ? 'ask_primary_scoring_version_v9' : version?.processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION ? 'ask_primary_scoring_version_v8' : version?.processing?.command_evidence_parser_revision === PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION ? 'ask_primary_scoring_version_v7' : null;
  if(!isPrimaryScoringFixtureId(fixtureId,{evaluationVersion})||binding.fixture_id!==fixtureId||!['primary_single_shot_v1','primary_principles_v2_single_shot_v1'].includes(binding.profile_id))throw new Error('primary_resource_graph_binding_invalid');
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
  const entries = version?.processing ? [...historicalEntries, PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH].sort() : [...historicalEntries];
  if(JSON.stringify(graph.entry_paths)!==JSON.stringify(entries)||identity.base_git_revision!==reference.evaluator_revision)throw new Error('primary_resource_graph_entries_changed');
  if (version?.processing) {
    if (!graph.edge_inventory.some(edge => edge.kind === 'private_entry_import' && edge.to === PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH)) throw new Error('primary_processing_graph_helper_edge_missing');
    for (const path of Object.keys(version.processing.source_file_digests)) if (!graph.node_inventory.some(node => node.path === path
      && (!processingSchemas(version.processing).includes(path) || node.file_type === 'authority_data'))) throw new Error('primary_processing_graph_source_missing');
  }
  return{root,baseRevision:identity.base_git_revision,entryPaths:[...graph.entry_paths],authorityPaths:graph.node_inventory.filter(node=>node.file_type==='authority_data').map(node=>node.path),
    privateEntryPaths:graph.edge_inventory.filter(edge=>edge.kind==='private_entry_import').map(edge=>edge.to)};
}
/** Source-only scope; never enables schema, producer, evaluator or start authority. */
export function withPrimaryHistoricalEvaluatorResources(block,root,callback) {
  if(resourceGraphState.getStore()?.active||active())throw new Error('primary_resource_graph_nested_scope_refused');
  const context={active:true,block:structuredClone(block),root};pinnedHistoricalGraph(root,block.fixture_id,block.grading.binding,block.grading.scoring_version);
  return resourceGraphState.run(context,()=>{try{const result=callback();if(result?.then)throw new Error('primary_resource_graph_async_scope_forbidden');return result;}finally{context.active=false;}});
}
export function primaryEvaluatorDependencyGraphParameters({root,baseRevision,defaultParameters,defaults}) {
  const producer=active(),resource=resourceGraphState.getStore();
  if(!producer?.verified&&!resource?.active)return null;
  if(!defaultParameters)throw new Error('primary_explicit_graph_parameters_refused');
  if (resource?.active && resource.sourceBuild) {
    root = sourceBuildRoot(root, resource);
    if (baseRevision !== resource.baseRevision) throw new Error('primary_source_build_revision_changed');
    if (JSON.stringify(primaryProcessingDescriptor({ root, commandEvidenceParserRevision: resource.processing.command_evidence_parser_revision })) !== JSON.stringify(resource.processing)) throw new Error('primary_source_build_processing_source_changed');
    if (!defaults || JSON.stringify([...defaults.entryPaths].sort()) !== JSON.stringify(historicalEntries)) throw new Error('primary_source_build_default_entries_changed');
    return { root, baseRevision, entryPaths: [...defaults.entryPaths, PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH].sort(),
      authorityPaths: [...new Set([...defaults.authorityPaths, ...processingSourceAuthorities(resource.processing)])].sort(),
      privateEntryPaths: [...new Set([...defaults.privateEntryPaths, PRIMARY_REVIEW_RECOGNITION_SOURCE_PATH])].sort() };
  }
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
  for (const name of PRIMARY_PROFILE_SCHEMAS) if (path.endsWith(`/benchmarks/schemas/${name}.schema.json`)) {
    const selected = active().commandEvidenceParserRevision;
    const version = selected === PRIMARY_RUNTIME_V10_REVISION && ['portfolio-command-evidence', 'normalized-portfolio-result', 'evaluator-result-envelope', 'portfolio-engineering-result'].includes(name) ? '-saved-v10' : selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION && ['portfolio-command-evidence', 'normalized-portfolio-result', 'evaluator-result-envelope', 'portfolio-engineering-result'].includes(name) ? '-saved-v9' : selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V8_PARSER_REVISION && ['portfolio-command-evidence', 'normalized-portfolio-result', 'evaluator-result-envelope', 'portfolio-engineering-result'].includes(name) ? '-saved-v8' : selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V7_PARSER_REVISION && ['portfolio-command-evidence', 'evaluator-result-envelope'].includes(name) ? '-saved-v7' : name === 'portfolio-command-evidence'
      ? selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V6_PARSER_REVISION ? '-saved-v6' : selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION ? '-saved-v5' : selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION ? '-saved-v4' : selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION ? '-saved-v3'
        : selected === PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION ? '-saved-v2' : '' : '';
    return join(ROOT, `benchmarks/schemas/${activeProfile().schema_prefix}${version}-${name}.schema.json`);
  }
  return path;
}
export function primaryGradingConditions(legacy) {
  if (!active()) return legacy;
  if (legacy.join(',') !== 'plain,kernel_only,adaptive_ask,full_ask') throw new Error('primary_core_condition_mix_refused');
  return activeProfile().conditions;
}
export function withPrimaryEvaluationProducer(options, callback, { grading = false } = {}) {
  if (resourceGraphState.getStore()?.active && resourceGraphState.getStore().sourceBuild) throw new Error('primary_source_build_no_producer_authority');
  const verified = verifyPrimaryEvaluationProducer(options);
  return run({ options: Object.freeze({ ...options }), verified, grading, profile: primaryProfileForRequest(verified.request), commandEvidenceParserRevision: verified.commandEvidenceParserRevision }, callback);
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
export function primaryEvaluatorExecutionFailureReceipts(error){return executionFailures.has(error)?structuredClone(executionFailures.get(error)):null;}
// This object owns lifetime/diagnostics only. It never qualifies the probe,
// supplies producer authority or changes a frozen evaluator's worker budget.
export function primaryEvaluatorExecutionControl(){const current=active();return current?.asyncLogCapture?current.executionControl:null;}
const PROBE_LIMIT_MS=300000,CLEANUP_ALLOWANCE_MS=4000,PROCESS_BUFFER_LIMIT=10*1024*1024;
const executionError=code=>new Error(code);
function createPerformanceExecution(options,dependencies,isCurrent=()=>true,logs=null){
  const {workerTimeoutMs,deadlineAtMs=null,signal,outputRoot,...unknown}=options;
  const {now=Date.now,monotonicNow=()=>performance.now(),executeSession,loadSession,signalProcess=process.kill,platform=process.platform,setTimer=setTimeout,clearTimer=clearTimeout,...extra}=dependencies;
  if(Object.keys(unknown).length||Object.keys(extra).length||!Number.isSafeInteger(workerTimeoutMs)||workerTimeoutMs<1||workerTimeoutMs>900000
    ||typeof now!=='function'||typeof monotonicNow!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function'||(executeSession!==undefined&&typeof executeSession!=='function')||(loadSession!==undefined&&typeof loadSession!=='function')||typeof signalProcess!=='function'
    ||(signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function')))
    throw executionError('primary_condition_arguments_invalid');
  const reservation=4*(PROBE_LIMIT_MS+workerTimeoutMs+2*CLEANUP_ALLOWANCE_MS),started=now(),monoStart=monotonicNow();
  if(!Number.isFinite(started)||!Number.isFinite(monoStart)||(deadlineAtMs!==null&&(!Number.isFinite(deadlineAtMs)||deadlineAtMs-started<reservation)))throw executionError('primary_condition_reservation_unavailable');
  if(signal?.aborted)throw executionError('primary_condition_cancelled');
  if(outputRoot!==undefined){const stat=lstatSync(outputRoot);if(realpathSync(outputRoot)!==outputRoot||!stat.isDirectory()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid())throw executionError('primary_condition_log_root_invalid');}
  const receipts=logs?.lifecycleReceipts??[],owner={open:true,failed:null,inflight:null,controller:null,probe:0,worker:0,probePending:false,sequence:0,lastMono:monoStart,closing:null};
  const remaining=()=>{const wall=now(),mono=monotonicNow();if(!Number.isFinite(wall)||!Number.isFinite(mono)||mono<owner.lastMono){owner.failed??='primary_condition_clock_invalid';owner.controller?.abort();throw executionError(owner.failed);}owner.lastMono=mono;return Math.min(reservation-(mono-monoStart),(deadlineAtMs??started+reservation)-wall);};
  const latch=code=>{owner.failed??=code;owner.controller?.abort();};
  const reject=code=>{latch(code);throw executionError(code);};
  const assertReady=()=>{
    if(!owner.open||!isCurrent())throw executionError('primary_condition_expired');
    if(owner.failed)throw executionError(owner.failed);
    if(owner.inflight)reject('primary_condition_concurrent_process');
    if(signal?.aborted)reject('primary_condition_cancelled');
    if(remaining()<=CLEANUP_ALLOWANCE_MS)reject('primary_condition_deadline');
  };
  const abort=()=>latch('primary_condition_cancelled');signal?.addEventListener('abort',abort,{once:true});
  // The condition budget also expires between process calls, independently of
  // the caller returning to assertReady. Per-child timers still reserve cleanup.
  const budgetTimer=setTimer(()=>latch('primary_condition_deadline'),Math.max(1,Math.ceil(remaining()-CLEANUP_ALLOWANCE_MS)));budgetTimer?.unref?.();
  const lineage=logs?{condition:logs.normalizedResult.lineage.condition,run_instance_id:logs.normalizedResult.lineage.run_instance_id,
    normalized_result_id:logs.normalizedResult.normalized_result_id,normalized_result_digest:logs.normalizedResult.normalized_result_digest}:{};
  const persist=(receipt,stdout,stderr)=>{
    receipts.push(receipt);
    try{
      if(outputRoot!==undefined){
        if(stdout!==undefined)for(const [ref,bytes]of [[receipt.stdout,stdout],[receipt.stderr,stderr]])writeFileSync(join(outputRoot,ref.path),bytes,{flag:'wx',mode:0o600});
        writeFileSync(join(outputRoot,receipt.receipt_path),JSON.stringify({...receipt,log_capture_status:'complete'})+'\n',{flag:'wx',mode:0o600});
      }
      receipt.log_capture_status='complete';
    }catch{reject('primary_condition_capture_failed');}
  };
  const starts=stage=>{const rows=receipts.filter(row=>row.kind==='ask_primary_condition_process_v1'&&row.stage===stage),attempts=stage==='probe'?owner.probe:owner.worker;
    return rows.length<attempts||rows.some(row=>row.spawn_observed===null)?null:rows.filter(row=>row.spawn_observed===true).length;};
  const summary=()=>({status:owner.open?(owner.failed?'failed':'active'):'closed',failure_code:owner.failed,
    condition_reservation_ms:reservation,probe_attempts:owner.probe,worker_attempts:owner.worker,
    probe_starts:starts('probe'),worker_starts:starts('worker'),lifecycle_receipts:structuredClone(receipts)});
  const control=Object.freeze({assertReady,summary,
    async executeProcess(stage,request){
      assertReady();
      if(!['probe','worker'].includes(stage)||owner.worker>=4||(stage==='probe'&&owner.probePending))reject('primary_condition_stage_invalid');
      if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).sort().join(',')!=='args,cwd,env,executable,input,max_buffer_bytes,timeout_ms')reject('primary_condition_request_invalid');
      const {executable,args,input,cwd,env,timeout_ms,max_buffer_bytes}=request,cap=stage==='probe'?PROBE_LIMIT_MS:workerTimeoutMs;
      if(typeof executable!=='string'||!executable||executable.includes('\0')||!Array.isArray(args)||args.some(v=>typeof v!=='string'||v.includes('\0'))
        ||!Buffer.isBuffer(input)||typeof cwd!=='string'||!cwd||cwd.includes('\0')||!env||typeof env!=='object'||Array.isArray(env)||Object.values(env).some(v=>typeof v!=='string'||v.includes('\0'))
        ||!Number.isSafeInteger(timeout_ms)||timeout_ms<1||timeout_ms>cap||!Number.isSafeInteger(max_buffer_bytes)||max_buffer_bytes<1||max_buffer_bytes>PROCESS_BUFFER_LIMIT)reject('primary_condition_request_invalid');
      const timeout=Math.min(timeout_ms,Math.floor(remaining()-CLEANUP_ALLOWANCE_MS));if(timeout<1)reject('primary_condition_deadline');
      const inputBytes=Buffer.from(input),argv=[...args],environment={...env};
      if(stage==='probe'){owner.probe++;owner.probePending=true;}else{owner.worker++;owner.probePending=false;}
      const sequence=++owner.sequence,stem=`lifecycle-${String(sequence).padStart(4,'0')}.${stage}`,controller=new AbortController();owner.controller=controller;
      const intent=Buffer.from(JSON.stringify({kind:'ask_primary_condition_process_intent_v1',...lineage,stage,sequence,timeout_ms:timeout,max_buffer_bytes})+'\n');
      const intentReference={path:`${stem}.intent.json`,bytes:intent.length,digest:rawDigest(intent)};
      try{if(outputRoot!==undefined)writeFileSync(join(outputRoot,intentReference.path),intent,{flag:'wx',mode:0o600});}catch{reject('primary_condition_capture_failed');}
      const buffers={stdout:[],stderr:[]},sizes={stdout:0,stderr:0};let overflow=false,observedPid=null,transportFailure=false,groupSignalFailed=false,observerFailure=false;
      const task=(async()=>{
        let result,dispatchRefusal=null,dispatched=false,dispatchTimeout=null;
        try{
          const runSession=loadSession?await loadSession():executeSession??(await import('./codex-exec-runner.mjs')).executeCodexSession;
          // Loading an implementation can yield. The owned scope/deadline may
          // have expired meanwhile; never dispatch with the earlier timeout.
          if(!owner.open||!isCurrent()){latch('primary_condition_expired');dispatchRefusal='SCOPE_EXPIRED';}
          else if(owner.failed||signal?.aborted||controller.signal.aborted){dispatchRefusal=owner.failed==='primary_condition_deadline'?'ETIMEDOUT':'ABORT_ERR';latch(owner.failed??'primary_condition_cancelled');}
          else{dispatchTimeout=Math.min(timeout_ms,Math.floor(remaining()-CLEANUP_ALLOWANCE_MS));if(dispatchTimeout<1){latch('primary_condition_deadline');dispatchRefusal='ETIMEDOUT';}}
          if(dispatchRefusal)result={spawnObserved:false,error:{code:dispatchRefusal}};
          else{
          dispatched=true;
          result=await runSession({executable,argv,cwd,env:environment,input:inputBytes,timeoutMs:dispatchTimeout,signal:controller.signal,retainOutput:false,terminationScope:'process_group',
            onSpawn:({pid})=>{observedPid=Number.isInteger(pid)&&pid>0?pid:null;},onOutput:({stream,chunk})=>{
              if(!['stdout','stderr'].includes(stream)||!Buffer.isBuffer(chunk)){observerFailure=true;throw executionError('primary_condition_output_invalid');}
              const accepted=chunk.subarray(0,Math.max(0,max_buffer_bytes-sizes[stream]));if(accepted.length){buffers[stream].push(Buffer.from(accepted));sizes[stream]+=accepted.length;}
              if(accepted.length!==chunk.length){overflow=true;throw Object.assign(executionError('primary_condition_output_limit'),{code:'ENOBUFS'});}
            }},undefined,{signalProcess:(pid,value)=>{try{return signalProcess(pid,value);}catch(error){if(error?.code!=='ESRCH')groupSignalFailed=true;throw error;}},platform});
          }
        }catch{transportFailure=true;result={};}
        if(!result||typeof result!=='object'||Array.isArray(result)){transportFailure=true;result={};}
        const pid=Number.isInteger(result?.pid)&&result.pid>0?result.pid:observedPid;
        const spawned=result?.spawnObserved===true||observedPid!==null?true:transportFailure&&dispatched?null:false;
        let groupGone=false;if(platform!=='win32'&&pid!==null)try{signalProcess(-pid,0);}catch(error){if(error?.code==='ESRCH')groupGone=true;else groupSignalFailed=true;}
        const status=Number.isInteger(result?.exitCode)&&result.exitCode>=0&&result.exitCode<=255?result.exitCode:null;
        const exitSignal=['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGHUP','SIGSEGV','SIGBUS','SIGPIPE','SIGILL','SIGTRAP','SIGFPE','SIGQUIT','SIGUSR1','SIGUSR2','SIGXCPU','SIGXFSZ','SIGALRM'].includes(result?.signal)?result.signal:null;
        const confirmed=spawned===true&&(status!==null||exitSignal!==null)&&groupGone&&!groupSignalFailed&&!result.cleanupError;
        const cancelled=signal?.aborted===true||result?.interrupted===true||controller.signal.aborted;
        const errorCodes=['ABORT_ERR','ETIMEDOUT','ENOBUFS','EPIPE','ENOENT','EACCES','EPERM','EIO','ENOMEM','EAGAIN','EMFILE','ENFILE','ENOSPC','ENOTDIR','EISDIR','EINVAL','ESRCH'];
        const code=dispatchRefusal??(overflow||result?.outputLimited?'ENOBUFS':observerFailure?'OUTPUT_INVALID':transportFailure?'TRANSPORT_ERROR':result.cleanupError||groupSignalFailed?'CLEANUP_UNCONFIRMED':result?.timedOut?'ETIMEDOUT':errorCodes.includes(result.error?.code)?result.error.code:result.error?'PROCESS_ERROR':!confirmed?'TERMINATION_UNCONFIRMED':cancelled?'ABORT_ERR':null);
        const stdout=Buffer.concat(buffers.stdout),stderr=Buffer.concat(buffers.stderr),reference=(name,bytes)=>({path:`${stem}.${name}.log`,bytes:bytes.length,digest:rawDigest(bytes)});
        const receipt={kind:'ask_primary_condition_process_v1',...lineage,stage,sequence,round:owner.worker+(stage==='probe'?1:0),
          dispatch_status:dispatched?'dispatched':'not_dispatched',timeout_ms:dispatchTimeout,
          spawn_observed:spawned,process_completed:spawned===true&&(status!==null||exitSignal!==null),exit_code:status,signal:exitSignal,error_code:code,
          termination_confirmed:confirmed,cancelled,timed_out:result?.timedOut===true,intent_reference:intentReference,stdout:reference('stdout',stdout),stderr:reference('stderr',stderr),receipt_path:`${stem}.receipt.json`,log_capture_status:'incomplete'};
        persist(receipt,stdout,stderr);
        if(code||status!==0||cancelled||result?.timedOut||result?.outputLimited)latch('primary_condition_process_failed');
        return {stdout,stderr,status,signal:exitSignal,error_code:code,termination_confirmed:confirmed,cancelled,spawn_observed:spawned,...(pid===null?{}:{pid})};
      })();
      owner.inflight=task;try{return await task;}finally{owner.inflight=null;owner.controller=null;}
    },
    recordProbeLifecycle(value){
      if(!owner.open||!isCurrent())throw executionError('primary_condition_expired');
      if(!value||Object.keys(value).sort().join(',')!=='cancelled,cleanup_status,scratch_path,spawn_observed,termination_confirmed'
        ||!['not_created','removed','retained_termination_unconfirmed','retained_cleanup_failed'].includes(value.cleanup_status)
        ||[value.spawn_observed,value.termination_confirmed,value.cancelled].some(v=>v!==null&&typeof v!=='boolean')
        ||(['not_created','removed'].includes(value.cleanup_status)?value.scratch_path!==null:typeof value.scratch_path!=='string'||!value.scratch_path.startsWith('/')||value.scratch_path.includes('\0')))
        reject('primary_condition_probe_lifecycle_invalid');
      const sequence=++owner.sequence,stem=`lifecycle-${String(sequence).padStart(4,'0')}.probe-cleanup`,raw=Buffer.from(JSON.stringify(value)+'\n');
      const reference={path:`${stem}.json`,bytes:raw.length,digest:rawDigest(raw)};
      const receipt={kind:'ask_primary_probe_lifecycle_v1',...lineage,cleanup_status:value.cleanup_status,spawn_observed:value.spawn_observed,
        termination_confirmed:value.termination_confirmed,cancelled:value.cancelled,scratch_retained:value.scratch_path!==null,
        private_lifecycle_reference:reference,receipt_path:`${stem}.receipt.json`,log_capture_status:'incomplete'};
      // Only the owner-private sidecar contains the retained scratch location.
      // Returned/failure/summary receipts contain finite fields and relative pins.
      try{if(outputRoot!==undefined)writeFileSync(join(outputRoot,reference.path),raw,{flag:'wx',mode:0o600});}catch{receipts.push(receipt);reject('primary_condition_capture_failed');}
      persist(receipt);
      if(value.cleanup_status.startsWith('retained_')||(value.spawn_observed===true&&value.termination_confirmed===false)||value.cancelled===true)latch('primary_condition_probe_cleanup_failed');
    },
    close(callbackFailure){
      if(owner.closing)return owner.closing;
      if(callbackFailure!==undefined&&callbackFailure!=='primary_condition_callback_failed')throw executionError('primary_condition_close_invalid');
      if(logs&&isCurrent())latch('primary_condition_closed_before_callback');
      if(callbackFailure)latch(callbackFailure);
      owner.open=false;clearTimer(budgetTimer);signal?.removeEventListener('abort',abort);
      const pending=owner.inflight;if(pending)latch('primary_condition_unawaited_process');
      owner.closing=(async()=>{
        if(pending)try{await pending;}catch{/* Retain incomplete process capture and finalize its finite condition cause. */}
        const record={kind:'ask_primary_condition_lifetime_v1',...lineage,status:owner.failed?'failed':'completed',failure_code:owner.failed,
          condition_reservation_ms:reservation,probe_attempts:owner.probe,worker_attempts:owner.worker,
          probe_starts:starts('probe'),worker_starts:starts('worker'),unawaited_process:Boolean(pending),callback_failed:Boolean(callbackFailure),log_capture_status:'complete'};
        const bytes=Buffer.from(JSON.stringify(record)+'\n'),reference={path:'condition-lifetime.json',bytes:bytes.length,digest:rawDigest(bytes)};
        const receipt={...record,private_lifetime_reference:reference,log_capture_status:'incomplete'};receipts.push(receipt);
        try{if(outputRoot!==undefined)writeFileSync(join(outputRoot,reference.path),bytes,{flag:'wx',mode:0o600});receipt.log_capture_status='complete';}
        catch{
          latch('primary_condition_capture_failed');receipt.status='failed';receipt.failure_code=owner.failed;receipt.capture_failure_code='primary_condition_capture_failed';
          receipt.expected_lifetime_reference=reference;delete receipt.private_lifetime_reference;
          throw executionError('primary_condition_capture_failed');
        }
        return summary();
      })();
      // A caller may close while owned work is still settling. Suppress no
      // error at the API, but keep an ignored close from becoming unhandled.
      owner.closing.catch(()=>{});return owner.closing;
    }
  });return control;
}
/** Explicit artificial transport/lifetime harness. It creates no producer,
 * schema, grading, probe qualification or native execution authority. */
export function createPrimaryPerformanceExecutionForTest(options,dependencies={}){return createPerformanceExecution(options,dependencies);}
export async function withPrimaryEvaluatorLogCaptureAsync(options,{outputRoot,normalizedResult,signal,deadlineAtMs=null,workerTimeoutMs,...unknown},callback){
  if(Object.keys(unknown).length||typeof callback!=='function'||active()||resourceGraphState.getStore()?.active)throw executionError('primary_condition_scope_invalid');
  const verified=verifyPrimaryEvaluationProducer(options),stat=lstatSync(outputRoot);
  if(realpathSync(outputRoot)!==outputRoot||!stat.isDirectory()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid())throw executionError('primary_private_log_root_invalid');
  for(const root of [ROOT.replace(/\/$/u,''),options.recordRoot])if(outputRoot===root||outputRoot.startsWith(`${root}/`)||root.startsWith(`${outputRoot}/`))throw executionError('primary_private_log_root_overlaps_source');
  const l=normalizedResult.lineage,c=verified.inspection.cases.find(item=>item.entry.case_id===l.case_id),a=c?.attempts.find(item=>item.attempt===l.attempt);
  if(!a||c.entry.condition!==l.condition||verified.inspection.identity.run_instance_id!==l.run_instance_id||a.evidence.request_digest!==l.request_digest||a.evidence.result_digest!==l.raw_result_digest||a.evidence.commit_digest!==l.terminal_commit_digest)throw executionError('primary_private_log_binding_invalid');
  const current={active:true,asyncLogCapture:true,options:Object.freeze({...options}),verified,grading:true,profile:primaryProfileForRequest(verified.request),commandEvidenceParserRevision:verified.commandEvidenceParserRevision,
    logs:{outputRoot,normalizedResult,receipts:[],lifecycleReceipts:[]}};
  current.executionControl=createPerformanceExecution({outputRoot,signal,deadlineAtMs,workerTimeoutMs},{},()=>active()===current,current.logs);
  return state.run(current,async()=>{
    let value,failure,didFail=false;
    const ownedError=error=>error!==null&&(typeof error==='object'||typeof error==='function')?error:executionError('primary_condition_callback_failed');
    try{value=await callback(verified);}catch(error){didFail=true;failure=ownedError(error);}
    current.active=false;
    let final;
    try{final=await current.executionControl.close(didFail?'primary_condition_callback_failed':undefined);}
    catch(error){if(!didFail){didFail=true;failure=ownedError(error);}}
    // The callback owns its final synchronous publication commitpoint. Do not
    // reinterpret a late cancellation after it returns as missing publication.
    if(!didFail&&final?.failure_code&&final.failure_code!=='primary_condition_cancelled'){didFail=true;failure=executionError(final.failure_code);}
    if(didFail){logFailures.set(failure,structuredClone(current.logs.receipts));executionFailures.set(failure,structuredClone(current.logs.lifecycleReceipts));throw failure;}
    return {result:value,receipts:structuredClone(current.logs.receipts),lifecycle_receipts:structuredClone(current.logs.lifecycleReceipts)};
  });
}
export const primaryEvaluatorProbeCaptureAvailable=()=>Boolean(active()?.logs);
// The existing per-condition log scope owns the file and next worker receipt.
// Save/re-read before the controller may forward a derived candidate state.
export function capturePrimaryEvaluatorProbeAudit(audit) {
  const logs=active()?.logs;if(!logs)return null;
  if(logs.pendingProbeAudit)throw new Error('primary_private_probe_capture_pending');
  const prefix=String(logs.receipts.length+1).padStart(4,'0'),bytes=Buffer.from(JSON.stringify(audit)+'\n');
  if(bytes.length>3*1024*1024)throw new Error('primary_private_probe_audit_too_large');
  const reference={path:`${prefix}.performance-probe.json`,bytes:bytes.length,digest:rawDigest(bytes)};
  writeFileSync(join(logs.outputRoot,reference.path),bytes,{flag:'wx',mode:0o600});
  const saved=readStableFile(join(logs.outputRoot,reference.path),'primary private probe audit',3*1024*1024).bytes;
  if(!saved.equals(bytes))throw new Error('primary_private_probe_saved_bytes_changed');
  logs.pendingProbeAudit=reference;return JSON.parse(saved);
}
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
  let probeBindingInvalid=false;
  if(current.logs.pendingProbeAudit){
    const reference=current.logs.pendingProbeAudit;
    try{
      const bytes=readStableFile(join(current.logs.outputRoot,reference.path),'primary private probe receipt',3*1024*1024).bytes;
      if(reference.path!==`${prefix}.performance-probe.json`||bytes.length!==reference.bytes||hash(bytes)!==reference.digest)throw new Error('primary_private_probe_binding_invalid');
      receipt.performance_probe=reference;
    }catch{
      probeBindingInvalid=true;receipt.invalid_performance_probe_binding={status:'invalid',code:'primary_private_probe_binding_invalid',expected_reference:{...reference}};
    }
    delete current.logs.pendingProbeAudit;
  }
  current.logs.receipts.push(receipt);
  for(const [name,raw]of [[receipt.stdout.path,stdout],[receipt.stderr.path,stderr]])writeFileSync(join(current.logs.outputRoot,name),raw,{flag:'wx',mode:0o600});
  writeFileSync(join(current.logs.outputRoot,`${prefix}.receipt.json`),Buffer.from(JSON.stringify({...receipt,log_capture_status:'complete'})+'\n'),{flag:'wx',mode:0o600});
  receipt.log_capture_status='complete';
  if(probeBindingInvalid)throw new Error('primary_private_probe_binding_invalid');
  if(!completed)throw new Error('primary_private_child_completion_unknown');
}
