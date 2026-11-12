import test from 'node:test';
import { readContentAddressedJson,putContentAddressedJson } from './content-addressed-store.mjs';
import { publishInstructionComposition } from './instruction-composition.mjs';
import assert from 'node:assert/strict';
import { compiledMembershipFixture } from './test-helpers-instruction-environment-composition.mjs';
import { verifyAssetRegistry } from './asset-registry.mjs';
import { registerAsset } from './asset-registry.mjs';
import { registerInstructionEnvironmentBundle } from './instruction-environment-compiler.mjs';
import { mkdirSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { exactInstructionAsset,instructionBytesDigest } from './instruction-environment.mjs';
import { captureInstructionEnvironment } from './instruction-environment.mjs';
import { prepareInstructionEnvironmentAuthoring, importInstructionEnvironmentAuthoring } from './instruction-environment-authoring.mjs';

for(const track of ['codex','claude'])test(`${track} exact authoring handoff revises, creates and excludes individual Assets without activation`,t=>{
  const f=compiledMembershipFixture(t,track),local=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:f.challenger.snapshot_digest});
  const bundle=local.assets.find(a=>a.record_digest===f.challenger.asset.record_digest);
  const env=captureInstructionEnvironment({...f.options,registrySnapshotDigest:f.challenger.snapshot_digest,selectionObjectDigest:null,
    bindings:[{asset:f.challenger.asset,files:bundle.content.files.map(f=>({source:f.path,target:f.path}))}]});
  const bundleDescriptor=structuredClone(bundle.record);delete bundleDescriptor.object_kind;
  bundleDescriptor.version='1.2.0';bundleDescriptor.derivation.parent=f.challenger.asset;bundleDescriptor.maintenance.rollback.target=f.challenger.asset;
  const added=structuredClone(local.assets.find(a=>a.stable_id===f.rootAsset.stable_id).record);delete added.object_kind;
  added.asset_type='prompt';added.stable_id='ask.prompt.new-local';
  added.type_extension={kind:'prompt_template',adapter:f.options.adapter,entrypoint:'prompts/new-local.md',rendered_runtime_content:false};
  added.derivation={kind:'root',parent:null,delta:null};added.maintenance.rollback.target=null;added.dependencies=[];
  const o={...f.options,registrySnapshotDigest:f.challenger.snapshot_digest,environmentObjectDigest:env.object_digest,
    editableStableIds:[f.rootAsset.stable_id],removableStableIds:[f.options.bindings[0].asset.stable_id],
    additions:[{descriptor:added,files:[{source:'prompts/new-local.md',target:track==='codex'?'.agents/prompts/new-local.md':'.claude/commands/new-local.md'}]}],
    observation:{goal:'Add a concise prompt and improve the applicable verification instruction.'},bundleDescriptor};
  o.compositionObjectDigest=publishInstructionComposition({...f.options,registrySnapshotDigest:f.challenger.snapshot_digest,layers:[
    {id:'common',kind:'common',components:f.options.bindings},{id:'personal',kind:'personal',components:[f.rootComponent]}]}).object_digest;
  const request=prepareInstructionEnvironmentAuthoring(o);
  const reference=request.generation_input.read_only_environment;
  assert.equal(reference.environment_digest,env.object_digest);
  assert.deepEqual(reference.layers.map(l=>l.kind),['common','personal']);
  const fixed=reference.assets.find(a=>a.asset.stable_id===f.options.bindings[0].asset.stable_id);
  assert.equal(fixed.editable,false);assert.deepEqual(fixed.mappings,f.options.bindings[0].files);
  assert.ok(fixed.files.some(f=>typeof f.text==='string'&&f.text.length));
  assert.ok(reference.support.some(f=>f.path==='AGENTS.md'&&f.text.length));
  assert.equal(reference.edit_authority_implied,false);
  const forged=structuredClone(readContentAddressedJson({storeRoot:f.storeRoot,digest:o.compositionObjectDigest}).value);
  forged.layers[0].id='/Users/private';const forgedDigest=putContentAddressedJson({storeRoot:f.storeRoot,artifact:forged}).digest;
  assert.throws(()=>prepareInstructionEnvironmentAuthoring({...o,compositionObjectDigest:forgedDigest}));
  assert.equal(request.models_started,false);assert.equal(request.generation_input.adapter,f.options.adapter);
  assert.equal(JSON.stringify(request.generation_input).includes(f.root),false);
  assert.equal(request.generation_input.editable.length,1);
  const response={request_digest:request.request_object_digest,changes:[
    {operation:'revise',stable_id:f.rootAsset.stable_id,files:[{path:'skills/new-local/SKILL.md',text:'Check the applicable boundary and verify its failure case.\n'}]},
    {operation:'create',stable_id:added.stable_id,files:[{path:'prompts/new-local.md',text:'Verify the selected instruction and report unavailable evidence.\n'}]},
    {operation:'exclude',stable_id:f.options.bindings[0].asset.stable_id}]};
  const input={...o,requestObjectDigest:request.request_object_digest,response};
  const result=importInstructionEnvironmentAuthoring(input);
  assert.equal(result.components.length,2);assert.equal(result.individual_assets.length,2);
  const checked=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:result.snapshot_digest});
  const root=checked.assets.find(a=>a.record_digest===result.individual_assets.find(a=>a.stable_id===added.stable_id).record_digest);
  assert.equal(root.record.derivation.kind,'root');assert.equal(root.state,'candidate');
  const revised=checked.assets.find(a=>a.record_digest===result.individual_assets.find(a=>a.stable_id===f.rootAsset.stable_id).record_digest);
  assert.deepEqual(revised.record.derivation.parent,f.rootAsset);assert.equal(revised.record.safety.status,'not_evaluated');
  assert.equal(result.activation_implied,false);assert.equal(result.validation_required,true);
  assert.equal(local.assets.some(a=>a.stable_id===added.stable_id),false);
  const repeated=importInstructionEnvironmentAuthoring(input);
  assert.equal(repeated.created,false);
  assert.deepEqual({...repeated,created:result.created},result);
  for(const mutate of [r=>{r.request_digest='sha256:'+'0'.repeat(64);},r=>{r.changes[0].files[0].path='../escape.md';},
    r=>{r.changes[1].stable_id='outside-inventory';},r=>{r.changes[2].stable_id='not-removable';},
    r=>{r.changes[0].stable_id=f.options.bindings[0].asset.stable_id;},r=>{r.changes[0].descriptor={safety:{status:'verified'}};}]){
    const bad=structuredClone(response);mutate(bad);assert.throws(()=>importInstructionEnvironmentAuthoring({...input,response:bad}));
  }
});
for(const oversized of [false,true])test('authoring preserves fixed executable helpers and known host risk constraints while resetting evidence '+(oversized?'with oversized metadata':'with bounded references'),t=>{
  const f=compiledMembershipFixture(t,'codex'),local=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:f.challenger.snapshot_digest});
  const original=local.assets.find(a=>a.stable_id===f.rootAsset.stable_id),d=structuredClone(original.record);delete d.object_kind;
  d.stable_id='ask.skill.with-helper';d.safety.classifications=['high_impact'];d.safety.constraint_refs=['public:preserved-boundary','/Users/private/safety-proof'];
  d.permissions_and_effects.permission_refs=['/Users/private/permission-proof'];
  d.permissions_and_effects.effect_refs=['/Users/private/effect-proof'];
  d.permissions_and_effects.requested_permissions=['network',...Array.from({length:100},(_,i)=>'bounded-declaration-'+i+'x'.repeat(200))];d.permissions_and_effects.possible_effects=['send_email'];
  const path='skills/with-helper/SKILL.md',helper='skills/with-helper/scripts/check.mjs',script='export const FIXED_HELPER = true;\n';
  d.type_extension={kind:'skill',entrypoint:path};
  const files=[{path,text:'Use the fixed helper at the applicable boundary.\n'},{path:helper,text:script},
    ...(oversized?Array.from({length:200},(_,i)=>({path:'skills/with-helper/scripts/'+'z'.repeat(160)+'-'+i+'.mjs',text:'// fixed helper inventory\n'})):[])];
  d.content={package_format:'canonical_json_base64_files',files:files.map(f=>({path:f.path,raw_digest:instructionBytesDigest(Buffer.from(f.text)),media_type:f.path.endsWith('.md')?'text/markdown; charset=utf-8':'text/javascript'}))};
  for(const file of files){mkdirSync(dirname(join(f.root,file.path)),{recursive:true});writeFileSync(join(f.root,file.path),file.text);}
  const added=registerAsset({storeRoot:f.storeRoot,sourceRoot:f.root,predecessorSnapshotDigest:f.challenger.snapshot_digest,descriptor:d}),ref=exactInstructionAsset({...d,...added});
  const prior=structuredClone(local.assets.find(a=>a.record_digest===f.challenger.asset.record_digest).record);delete prior.object_kind;
  prior.version='1.2.0';prior.derivation.parent=f.challenger.asset;prior.maintenance.rollback.target=f.challenger.asset;
  const baseline=registerInstructionEnvironmentBundle({...f.options,registrySnapshotDigest:added.snapshot_digest,descriptor:prior,
    components:[...f.options.bindings,f.rootComponent,{asset:ref,files:files.map(f=>({source:f.path,target:'.agents/'+f.path}))}]});
  const inventory=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:baseline.snapshot_digest}),bundle=inventory.assets.find(a=>a.record_digest===baseline.asset.record_digest);
  writeFileSync(join(f.root,'AGENTS.md'),'共通😀'.repeat(10000));
  const env=captureInstructionEnvironment({...f.options,registrySnapshotDigest:baseline.snapshot_digest,selectionObjectDigest:null,
    bindings:[{asset:baseline.asset,files:bundle.content.files.map(f=>({source:f.path,target:f.path}))}]});
  const next=structuredClone(bundle.record);delete next.object_kind;next.version='1.3.0';next.derivation.parent=baseline.asset;next.maintenance.rollback.target=baseline.asset;
  const o={...f.options,registrySnapshotDigest:baseline.snapshot_digest,environmentObjectDigest:env.object_digest,editableStableIds:[ref.stable_id],
    observation:{goal:'Clarify the applicable use of the fixed helper.'},bundleDescriptor:next};
  const request=prepareInstructionEnvironmentAuthoring(o);
  assert.equal(request.generation_input.editable[0].files.length,1);
  const readOnly=request.generation_input.read_only_environment;
  assert.equal(JSON.stringify(readOnly).includes('/Users/private/'),false);
  const declarations=readOnly.assets.find(a=>a.asset.stable_id===ref.stable_id).known_constraints;
  assert.equal(declarations.references.constraint_refs.count,2);
  assert.ok(declarations.requested_permissions.omitted_count>0);assert.equal(readOnly.context_incomplete,true);
  assert.ok(Buffer.byteLength(JSON.stringify(readOnly))<=readOnly.byte_budget_bytes);
  assert.equal(readOnly.text_truncated,true);assert.ok(readOnly.included_text_bytes<=32768);
  const support=readOnly.support.find(f=>f.path==='AGENTS.md');assert.equal(support.text_truncated,true);
  assert.ok(Buffer.byteLength(support.text)<=4096);assert.equal(support.text.includes('�'),false);
  assert.equal(readOnly.metadata_truncated,oversized);
  if(!oversized)assert.ok(support.text.length>0&&readOnly.assets.some(a=>!a.editable&&a.files.some(f=>f.text==='New root Skill.\n')));
  else assert.ok(readOnly.assets.some(a=>a.omitted_file_count>0));
  assert.equal(JSON.stringify(request.generation_input).includes('FIXED_HELPER'),false);
  assert.equal(request.generation_input.editable[0].fixed_file_inventory[0].path,helper);
  const response={request_digest:request.request_object_digest,changes:[{operation:'revise',stable_id:ref.stable_id,files:[{path,text:'Verify applicability, then use the fixed helper.\n'}]}]};
  const result=importInstructionEnvironmentAuthoring({...o,requestObjectDigest:request.request_object_digest,response});
  const updated=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:result.snapshot_digest}).assets.find(a=>a.record_digest===result.individual_assets[0].record_digest);
  assert.equal(Buffer.from(updated.content.files.find(f=>f.path===helper).bytes_base64,'base64').toString(),script);
  assert.deepEqual(updated.record.safety.classifications,['high_impact']);assert.deepEqual(updated.record.safety.constraint_refs,['public:preserved-boundary','/Users/private/safety-proof'].sort());
  assert.deepEqual(updated.record.permissions_and_effects.possible_effects,['send_email']);assert.equal(updated.record.safety.status,'not_evaluated');
  const environmentBundle=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:result.snapshot_digest}).assets.find(a=>a.record_digest===result.asset.record_digest);
  assert.ok(environmentBundle.record.safety.classifications.includes('high_impact'));
  assert.ok(environmentBundle.record.permissions_and_effects.possible_effects.includes('send_email'));
  const bad=structuredClone(response);bad.changes[0].files.push({path:helper,text:'changed executable'});
  assert.throws(()=>importInstructionEnvironmentAuthoring({...o,requestObjectDigest:request.request_object_digest,response:bad}),/Markdown inventory/);
});

test('filesystem authoring revises a Git-origin component without invoking Git or losing parent lineage',t=>{
  const f=compiledMembershipFixture(t,'codex'),local=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:f.challenger.snapshot_digest});
  const bundle=local.assets.find(a=>a.record_digest===f.challenger.asset.record_digest);
  const env=captureInstructionEnvironment({...f.options,registrySnapshotDigest:f.challenger.snapshot_digest,selectionObjectDigest:null,
    bindings:[{asset:f.challenger.asset,files:bundle.content.files.map(f=>({source:f.path,target:f.path}))}]});
  const descriptor=structuredClone(bundle.record);delete descriptor.object_kind;
  descriptor.version='1.2.0';descriptor.source.kind='filesystem_snapshot';descriptor.source.revision='sha256:'+'a'.repeat(64);
  descriptor.derivation.parent=f.challenger.asset;descriptor.maintenance.rollback.target=f.challenger.asset;
  const options={...f.options,registrySnapshotDigest:f.challenger.snapshot_digest,environmentObjectDigest:env.object_digest,
    editableStableIds:[f.rootAsset.stable_id],observation:{goal:'Clarify the applicable instruction.'},bundleDescriptor:descriptor};
  const request=prepareInstructionEnvironmentAuthoring(options);
  const response={request_digest:request.request_object_digest,changes:[{operation:'revise',stable_id:f.rootAsset.stable_id,
    files:[{path:'skills/new-local/SKILL.md',text:'Verify the applicable change before reporting success.\n'}]}]};
  const originalPath=process.env.PATH;process.env.PATH=join(f.root,'no-git');t.after(()=>{process.env.PATH=originalPath;});
  const result=importInstructionEnvironmentAuthoring({...options,requestObjectDigest:request.request_object_digest,response});
  const registry=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:result.snapshot_digest});
  const record=registry.assets.find(a=>a.record_digest===result.individual_assets[0].record_digest).record;
  assert.equal(record.source.kind,'filesystem_snapshot');assert.equal(record.version_scheme,'content_digest');assert.equal(record.version,record.source.revision);
  assert.deepEqual(record.derivation.parent,f.rootAsset);assert.equal(result.activation_implied,false);
});

test('filesystem authoring can return B to C to B while preserving lineage and retry identity',t=>{
  const f=compiledMembershipFixture(t,'codex');
  let current=f.challenger, previous=f.rootAsset;
  const revisions=[];
  const originalPath=process.env.PATH;process.env.PATH=join(f.root,'no-git');t.after(()=>{process.env.PATH=originalPath;});
  for(const text of ['Content B.\n','Content C.\n','Content B.\n']) {
    const local=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:current.snapshot_digest});
    const bundle=local.assets.find(a=>a.record_digest===current.asset.record_digest);
    const env=captureInstructionEnvironment({...f.options,registrySnapshotDigest:current.snapshot_digest,selectionObjectDigest:null,
      bindings:[{asset:current.asset,files:bundle.content.files.map(f=>({source:f.path,target:f.path}))}]});
    const descriptor=structuredClone(bundle.record);delete descriptor.object_kind;
    descriptor.version=`1.${revisions.length+2}.0`;
    descriptor.source.kind='filesystem_snapshot';descriptor.source.revision='sha256:'+'a'.repeat(64);
    descriptor.derivation.parent=current.asset;descriptor.maintenance.rollback.target=current.asset;
    const options={...f.options,registrySnapshotDigest:current.snapshot_digest,environmentObjectDigest:env.object_digest,
      editableStableIds:[f.rootAsset.stable_id],observation:{goal:'Clarify the applicable instruction.'},bundleDescriptor:descriptor};
    const request=prepareInstructionEnvironmentAuthoring(options);
    const input={...options,requestObjectDigest:request.request_object_digest,response:{request_digest:request.request_object_digest,
      changes:[{operation:'revise',stable_id:f.rootAsset.stable_id,files:[{path:'skills/new-local/SKILL.md',text}]}]}};
    const result=importInstructionEnvironmentAuthoring(input);
    const record=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:result.snapshot_digest}).assets.find(a=>a.record_digest===result.individual_assets[0].record_digest).record;
    assert.deepEqual(record.derivation.parent,previous);
    const retry=importInstructionEnvironmentAuthoring(input);
    assert.equal(retry.created,false);assert.deepEqual({...retry,created:result.created},result);
    revisions.push(record.version);previous=result.individual_assets[0];current=result;
  }
  assert.equal(new Set(revisions).size,3);
});
