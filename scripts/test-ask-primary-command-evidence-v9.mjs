import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import * as evidence from './ask-benchmark-command-evidence.mjs';
import {withPrimarySchemaBuild} from './ask-primary-evaluation-scope.mjs';
import {primaryProcessingDescriptor,primaryProcessingAuthorityPaths} from './ask-primary-scoring-version.mjs';
import {syntheticPrimarySource} from './test-helpers-primary-evaluation-producer.mjs';
import {artificialAuxiliaryEnvelope} from './test-helpers-primary-auxiliary-shell-v6.mjs';
import {producePrimaryEvaluationArtifacts,verifyPrimaryEvaluationProducer,buildPrimaryEvaluationScoringInputs} from './ask-primary-evaluation-producer.mjs';
import {syntheticV9ScoringVersion} from './test-helpers-primary-evaluation-v9.mjs';
import {readPrimaryScoringVersion,validatePrimaryScoringVersionFixtureInventory,verifyPrimaryScoringSemantics} from './ask-primary-scoring-version.mjs';
import {comparisonHash} from './ask-user-comparison-prepare.mjs';
import {deriveEvaluatorDependencyGraph} from './ask-benchmark-evaluator-boundary.mjs';
import {withPrimaryProcessingSourceBuild} from './ask-primary-evaluation-scope.mjs';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),revision='1.12.0-primary-saved',base=join(root,'benchmarks/fixtures/checkpoint-b2/mn-build-option-update');
const contract=JSON.parse(readFileSync(join(base,'verification-command-contract.json'))),input=readFileSync(join(base,'input-manifest.json'));
const digest='sha256:'+'b'.repeat(64),armRoot='/synthetic/v9/arms/plain',path='workspace/build.config.json';
const identity={run_instance_id:'56789012-3456-4345-8345-345678901abc',case_id:'case-7777777777777777-8888888888888888',attempt:'0001',adapter:'codex',condition:'plain',fixture_id:contract.fixture_id,repetition:1,fixture_input_digest:contract.fixture_input_digest,verification_command_contract_digest:contract.contract_digest,runtime_identity_digest:digest,effective_command_digest:digest};
const encode=events=>Buffer.from(events.map(x=>JSON.stringify(x)).join('\n')+'\n');
const discovery="/bin/zsh -lc \"pwd && rg --files -g '!workspace/private/**' -g '!node_modules'\"";
function events(raw=discovery){const es=artificialAuxiliaryEnvelope({contract,armRoot});for(const e of es)if(e.item?.id==='artificial-v6-pwd')e.item.command=raw;return es;}
function build(es,extra={}){return evidence.buildCodexCommandEvidence({identity,stream:encode(es),contract,parserRevision:revision,candidateWorkspaceRoot:armRoot,candidateChangePaths:[path],candidateChanges:[{path,kind:'update'}],auxiliaryReadInputManifest:input,...extra});}
function project(value,selected=revision){return withPrimarySchemaBuild(()=>evidence.projectVerifiedCommandEvidence({manifest:evidence.validateCommandEvidenceManifest(value,{root,contract}),contract}),{commandEvidenceParserRevision:selected});}
test('C9-SELECT explicit revision only; previous V8 still refuses compounds',()=>{
 assert.equal(evidence.PRIMARY_SAVED_COMMAND_EVIDENCE_V9_PARSER_REVISION,revision);
 const v=build(events());assert.equal(v.capture.parser_revision,revision);assert.equal(v.capture.unsafe_action_contract_revision,'primary-unsafe-actions-v1');
 const p=project(v);assert.deepEqual(p.succeeded_command_ids,contract.commands.map(c=>c.command_id));
 assert.ok(v.commands.slice(0,3).every(c=>c.match_state==='unmatched'&&c.matched_command_id===null&&c.literal_word_encoding===null&&c.runtime_shell_executable===null));
 assert.throws(()=>build(events(),{parserRevision:'1.11.0-primary-saved'}),e=>e.code==='unsafe_command');
 assert.throws(()=>project(v,'1.11.0-primary-saved'),/Schema/u);
});
for(const raw of ["/bin/bash -lc \"pwd; cat task.md\"", "/bin/zsh -lc \"rg --files --glob '!workspace/{private,cache}/*'\""])test('C9-AUTHORITY general finite reads stay unmatched '+raw,()=>{
 const v=build(events(raw));assert.equal(project(v).unmatched_command_count,3);
});
for(const raw of ["/bin/zsh -lc 'pwd; unknown-tool'","/bin/zsh -lc 'pwd && touch workspace/x'","/bin/zsh -lc 'cat .agents/skills/x/SKILL.md'","/bin/zsh -lc 'rg --files --hidden'",
 "/bin/zsh -lc \"rg --files -g '.*' -- workspace\"", "/bin/bash -lc \"rg --files -g '**'\"",
 "/bin/zsh -lc \"pwd; rg --files -g '!node_modules' -g 'workspace/**'\"",
 "/bin/bash -lc \"rg --files -g '\\\\!hidden' -- workspace\""])test('C9-UNKNOWN late unknown discards earlier declared success '+raw,()=>{
 const es=events();const pair=structuredClone(es.filter(e=>e.item?.id==='artificial-v6-pwd'));for(const e of pair){e.item.id='unknown-late';e.item.command=raw;}es.splice(-1,0,...pair);
 let error;try{build(es);}catch(e){error=e;}assert.ok(error);
 const v=evidence.buildUnavailableCommandEvidence({identity,support:'supported',probe:'capture_invalid',reason:evidence.commandEvidenceFailureReason(error,{parserRevision:revision}),stream:encode(es),parserRevision:revision,failureDiagnostic:evidence.commandEvidenceFailureDiagnostic(error,{parserRevision:revision}),retainedUnsafeActions:evidence.commandEvidenceRetainedUnsafeActions(error,{parserRevision:revision})});
 const p=project(v);assert.equal(p.evidence_level,'unavailable');assert.deepEqual(p.succeeded_command_ids,[]);assert.equal(p.unavailable_command_ids.length,2);
});
test('C9-AUTHORITY fixed manifest digest and available read paths remain mandatory',()=>{
 for(const auxiliaryReadInputManifest of [null,Buffer.from('{}\n')])assert.throws(()=>build(events(),{auxiliaryReadInputManifest}),e=>e.code==='auxiliary_read_context_unavailable');
 assert.throws(()=>build(events("/bin/zsh -lc 'cat workspace/missing'")),e=>e.code==='auxiliary_read_path_unavailable');
});
test('C9-AUTHORITY closed source pins include runtime helper and new schemas',()=>{
 const p=primaryProcessingDescriptor({commandEvidenceParserRevision:revision});
 assert.ok(p.source_file_digests['scripts/ask-primary-discovery-grammar-v9.mjs']);
 assert.equal(Object.keys(p.source_file_digests).filter(x=>x.includes('saved-v9-')).length,8);
 const authority=primaryProcessingAuthorityPaths(revision);assert.ok(!authority.includes('scripts/ask-primary-discovery-grammar-v9.mjs'));assert.ok(authority.includes('scripts/generate-ask-primary-grading-schemas.mjs'));
});
test('C9-SELECT exact selector kind/revision/source closure and semantics',t=>{
 const f=syntheticV9ScoringVersion(t),id='mp-data-migration-handoff';
 const selected=readPrimaryScoringVersion(f.selector,id);assert.equal(selected.processing.command_evidence_parser_revision,revision);
 const original=readFileSync(f.selector.path),value=JSON.parse(original);
 for(const mutate of [v=>{v.kind='ask_primary_scoring_version_v8';},v=>{v.processing.command_evidence_parser_revision='1.11.0-primary-saved';},v=>{delete v.processing.source_file_digests['scripts/ask-primary-discovery-grammar-v9.mjs'];},v=>{v.processing.source_file_digests['scripts/ask-primary-discovery-grammar-v9.mjs']=digest;}]){
  const v=structuredClone(value);mutate(v);chmodSync(f.selector.path,0o600);writeFileSync(f.selector.path,JSON.stringify(v,null,2)+'\n');chmodSync(f.selector.path,0o400);
  assert.throws(()=>readPrimaryScoringVersion({path:f.selector.path,digest:comparisonHash(readFileSync(f.selector.path))},id));
 }
 const v={...value,fixture_set:'catalog24'};assert.throws(()=>validatePrimaryScoringVersionFixtureInventory(v),/inventory|complete|fixture/u);
});
test('C9-AUTHORITY inherits the exact unsafe-action task authorization basis',t=>{
 const id='hi-authorization-exception',f=syntheticV9ScoringVersion(t,{fixtureIds:[id]});
 verifyPrimaryScoringSemantics(id,f.runtime,{evaluationVersion:'ask_primary_scoring_version_v9'});
 const path=join(f.runtime,'benchmarks/fixtures/checkpoint-b2',id,'task.md');chmodSync(path,0o600);writeFileSync(path,readFileSync(path)+'\nchanged task\n');chmodSync(path,0o400);
 assert.throws(()=>verifyPrimaryScoringSemantics(id,f.runtime,{evaluationVersion:'ask_primary_scoring_version_v9'}),/unsafe action task authorization basis changed/u);
});
test('C9-AUTHORITY actual source graph keeps helper a module and closed authority data types',()=>{
 const baseRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const processing=primaryProcessingDescriptor({commandEvidenceParserRevision:revision});
 const graph=withPrimaryProcessingSourceBuild({root,baseRevision,commandEvidenceParserRevision:revision},()=>deriveEvaluatorDependencyGraph({root,baseRevision}));
 const authorities=new Set(primaryProcessingAuthorityPaths(revision));
 for(const [path,hash]of Object.entries(processing.source_file_digests)){
  const node=graph.node_inventory.find(n=>n.path===path);assert.ok(node,path);assert.equal(node.sha256,hash);assert.equal(node.file_type,authorities.has(path)?'authority_data':'module');
 }
 assert.ok(graph.edge_inventory.some(e=>e.to==='scripts/ask-primary-discovery-grammar-v9.mjs'&&e.kind!=='authority_read'&&e.kind!=='runtime_private_import'));
});
for(const kernelCondition of ['kernel_principles_v1','kernel_principles_v2'])test('C9-PARITY/LINEAGE synthetic producer applies the same revision to all three conditions '+kernelCondition,async t=>{
 const source=syntheticPrimarySource(t,{kernelCondition,command:'missing',mutate:true,nativeEvents:({armRoot,contract})=>{const es=artificialAuxiliaryEnvelope({armRoot,contract});for(const e of es)if(e.item?.id==='artificial-v6-pwd')e.item.command=discovery;return es;}});
 const produced=await producePrimaryEvaluationArtifacts(source.block,join(source.root,'v9-derived'),{commandEvidenceParserRevision:revision});
 const options={recordRoot:produced.output_root,externalDigest:produced.external_digest};
 const verified=verifyPrimaryEvaluationProducer(options);assert.equal(verified.commandEvidenceParserRevision,revision);
 const producerPath=join(produced.output_root,'producer.json'),manifest=JSON.parse(readFileSync(producerPath));assert.equal(manifest.kind,'ask_primary_evaluation_producer_v9');
 assert.equal(Object.keys(manifest.source_digests).filter(p=>p.includes('saved-v9-')).length,8);
 for(const condition of ['plain',kernelCondition,'full_ask']){
  const normalized=buildPrimaryEvaluationScoringInputs(options,{condition}).normalizedResult;
  assert.deepEqual(normalized.command_evidence.succeeded_command_ids,contract.commands.map(c=>c.command_id));
  assert.equal(normalized.command_evidence.unsafe_action_capture_state,'observed_finite_scope');
 }
 assert.equal(produced.model_calls,0);assert.equal(produced.grader_process_starts,0);
 await assert.rejects(()=>producePrimaryEvaluationArtifacts(source.block,join(source.root,'override'),{commandEvidenceParserRevision:revision,publicFiles:['task.md']}),/override refused/u);
 delete manifest.source_digests['benchmarks/schemas/primary-saved-v9-portfolio-command-evidence.schema.json'];
 writeFileSync(producerPath,JSON.stringify(manifest,null,2)+'\n');
 assert.throws(()=>verifyPrimaryEvaluationProducer({recordRoot:produced.output_root,externalDigest:comparisonHash(readFileSync(producerPath))}),/producer sources changed/u);
});
