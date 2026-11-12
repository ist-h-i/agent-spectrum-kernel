import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { canonicalDigest } from './content-addressed-store.mjs';
import { createEmptyAssetRegistry, verifyAssetRegistry, registerAsset } from './asset-registry.mjs';
import { compiledMembershipFixture } from './test-helpers-instruction-environment-composition.mjs';
import { instructionBytesDigest, exactInstructionAsset } from './instruction-environment.mjs';
import { previewInstructionAssetPackage, exportInstructionAssetPackage, receiveInstructionAssetPackage,
  planInstructionAssetImport, applyInstructionAssetImport, inspectInstructionPortability } from './instruction-asset-package.mjs';

const metadata = { title: 'Boundary verification', rationale: 'Prevent repeated omissions.', applicability: 'Changes at an instruction boundary.',
  non_applicability: 'One-off correction.', exceptions: 'No known exceptions.', verification: 'Representative positive and negative tasks.',
  refresh_condition: 'Recheck when the underlying contract changes.', validation_summary: 'Synthetic validation only.', evidence_status: 'Supported' };
function fixture(t) {
  const f = compiledMembershipFixture(t, 'codex');
  // A synthetic independently owned root, without the real fixture's external
  // safety references. Those references must not silently become exportable.
  const old=verifyAssetRegistry({storeRoot:f.storeRoot,snapshotDigest:f.challenger.snapshot_digest}).assets.find(a=>a.stable_id===f.rootAsset.stable_id);
  const descriptor=structuredClone(old.record);delete descriptor.object_kind;descriptor.stable_id='ask.skill.portable-demo';
  descriptor.safety={status:'not_evaluated',classifications:[],constraint_refs:[]};
  descriptor.permissions_and_effects={status:'not_evaluated',requested_permissions:[],possible_effects:[],permission_refs:[],effect_refs:[]};
  descriptor.content={package_format:'canonical_json_base64_files',files:old.content.files.map(({path,raw_digest,media_type})=>({path,raw_digest,media_type}))};
  const portable=registerAsset({storeRoot:f.storeRoot,sourceRoot:f.root,predecessorSnapshotDigest:f.challenger.snapshot_digest,descriptor});
  f.rootAsset=exactInstructionAsset({...descriptor,...portable});
  const source = { ...f.options, registrySnapshotDigest: portable.snapshot_digest, selectedAssets: [f.rootAsset],
    portability: { [f.rootAsset.stable_id]: metadata }, intendedScope: 'receiver' };
  const storeRoot = join(f.root, 'receiving-store');
  const empty = createEmptyAssetRegistry({ storeRoot, registryId: 'receiver', repositoryId: 'receiver-repository', scopeId: 'receiver' });
  const receive = { storeRoot, registrySnapshotDigest: empty.snapshot_digest, quarantineRoot: join(f.root, 'quarantine'),
    adapter: 'codex', intendedScope: 'receiver', availableCapabilities: [], availableRuntimeProfiles: ['codex-compact-v1'] };
  const outputPath = join(f.root, 'package.json');
  const preview = previewInstructionAssetPackage(source);
  const exportPackage = extra => exportInstructionAssetPackage({ ...source, outputPath,
    approval: { preview_digest: preview.preview_digest, evidence_digest: canonicalDigest('synthetic export approval'), intended_scope: 'receiver' }, ...extra });
  const quarantine = () => { exportPackage(); receiveInstructionAssetPackage({ packagePath: outputPath, quarantineRoot: receive.quarantineRoot }); };
  return { f, source, receive, outputPath, preview, exportPackage, quarantine };
}
test('explicit preview/export is deterministic, local and includes only selected content and reviewed summaries', t => {
  const x = fixture(t); assert.equal(existsSync(x.outputPath), false);
  assert.deepEqual(previewInstructionAssetPackage(x.source), x.preview);
  x.exportPackage(); const content = readFileSync(x.outputPath, 'utf8');
  assert.equal(content.includes('New root Skill.'), true); assert.equal(content.includes('source_scope_digest'), true);
  assert.equal(content.includes('github.com'), false); assert.equal(content.includes('trusted_authority'), false);
  assert.equal(content.includes('evolution_human_decision'), false);
  x.exportPackage(); assert.equal(readFileSync(x.outputPath, 'utf8'), content);
});
test('scope, exact preview approval, selection and prohibited content must be resolved before writes', t => {
  const x = fixture(t);
  assert.throws(() => previewInstructionAssetPackage({ ...x.source, selectedAssets: [] }), /explicit/);
  assert.throws(() => previewInstructionAssetPackage({ ...x.source, selectedAssets: [x.f.rootAsset, x.f.rootAsset] }), /one explicitly/);
  assert.throws(() => x.exportPackage({ approval: { preview_digest: canonicalDigest('wrong'), evidence_digest: canonicalDigest('approval'), intended_scope: 'receiver' } }), /stale/);
  assert.equal(existsSync(x.outputPath), false);
  for (const value of ['password=abc', 'https://private.example/path', '/Users/person/work', 'owner@example.test', '```js\nprivate code\n```'])
    assert.ok(inspectInstructionPortability(value).length);
  assert.throws(() => previewInstructionAssetPackage({ ...x.source, portability: { [x.f.rootAsset.stable_id]: { ...metadata, rationale: 'secret=abc' } } }), /prohibited/);
});
test('quarantine and exact local plan register unevaluated receiver-scoped candidates; baseline snapshot restores', t => {
  const x = fixture(t); x.quarantine();
  assert.equal(verifyAssetRegistry({ storeRoot: x.receive.storeRoot, snapshotDigest: x.receive.registrySnapshotDigest }).assets.length, 0);
  const options = { ...x.receive, resolutions: { [x.f.rootAsset.stable_id]: { action: 'accept' } } };
  const plan = planInstructionAssetImport(options); assert.equal(plan.ready, true);
  assert.equal(plan.plan.preview[0].files[0].text, 'New root Skill.\n');
  const result = applyInstructionAssetImport({ ...options, confirmedPlanDigest: plan.plan_digest });
  const local = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: result.snapshot_digest });
  assert.equal(local.assets[0].state, 'candidate'); assert.equal(local.assets[0].scope_id, 'receiver');
  assert.equal(local.assets[0].record.safety.status, 'not_evaluated');
  assert.equal(local.assets[0].record.source.repository_id, 'receiver-repository');
  assert.equal(local.assets[0].record.maintenance.rollback.target, null);
  assert.equal(result.activation_implied, false); assert.equal(result.validation_required, true);
  assert.equal(result.rollback_snapshot_digest, options.registrySnapshotDigest);
  assert.equal(verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: result.rollback_snapshot_digest }).assets.length, 0);
  assert.deepEqual(applyInstructionAssetImport({ ...options, confirmedPlanDigest: plan.plan_digest }), result);
  assert.throws(() => applyInstructionAssetImport({ ...options, registrySnapshotDigest: result.snapshot_digest, confirmedPlanDigest: plan.plan_digest }), /plan changed/);
});
test('local duplicate/conflict remains quarantined until an explicit new local identity is chosen', t => {
  const x = fixture(t); x.quarantine();
  let o = { ...x.receive, resolutions: { [x.f.rootAsset.stable_id]: { action: 'accept' } } };
  const first = planInstructionAssetImport(o), saved = applyInstructionAssetImport({ ...o, confirmedPlanDigest: first.plan_digest });
  o = { ...o, registrySnapshotDigest: saved.snapshot_digest };
  const conflict = planInstructionAssetImport(o); assert.equal(conflict.ready, false);
  assert.ok(conflict.plan.rows[0].duplicate); assert.deepEqual(conflict.plan.rows[0].blockers, ['local_identity_conflict']);
  assert.throws(() => applyInstructionAssetImport({ ...o, confirmedPlanDigest: conflict.plan_digest }), /unresolved/);
  const adapted = { ...o, resolutions: { [x.f.rootAsset.stable_id]: { action: 'adapt', stable_id: 'receiver.skill.adapted' } } };
  const plan = planInstructionAssetImport(adapted); assert.equal(plan.ready, true);
  const result = applyInstructionAssetImport({ ...adapted, confirmedPlanDigest: plan.plan_digest });
  assert.equal(verifyAssetRegistry({ storeRoot: adapted.storeRoot, snapshotDigest: result.snapshot_digest }).assets.length, 2);
});
test('quarantine/reject do not register; incompatible scope/capabilities/adapters refuse', t => {
  const x = fixture(t); x.quarantine();
  for (const action of ['quarantine', 'reject']) {
    const o = { ...x.receive, resolutions: { [x.f.rootAsset.stable_id]: { action } } }, plan = planInstructionAssetImport(o);
    assert.equal(plan.ready, false); assert.throws(() => applyInstructionAssetImport({ ...o, confirmedPlanDigest: plan.plan_digest }), /unresolved/);
  }
  assert.throws(() => planInstructionAssetImport({ ...x.receive, intendedScope: 'elsewhere' }), /scope/);
  assert.throws(() => planInstructionAssetImport({ ...x.receive, adapter: 'unknown' }));
  const accepted = { ...x.receive, resolutions: { [x.f.rootAsset.stable_id]: { action: 'accept' } } };
  assert.ok(planInstructionAssetImport({ ...accepted, adapter: 'claude_code' }).plan.rows[0].blockers.includes('adapter_applicability_mismatch'));
  assert.ok(planInstructionAssetImport({ ...accepted, availableRuntimeProfiles: [] }).plan.rows[0].blockers.includes('missing_runtime_profile'));
});
test('tampering, checksum-correct traversal, unknown fields and symlink destinations never enter quarantine', t => {
  const x = fixture(t); x.exportPackage();
  const original = JSON.parse(readFileSync(x.outputPath));
  for (const mutate of [p => { p.payload.assets[0].files[0].text = 'changed'; },
    p => { p.payload.assets[0].files[0].path = '../escape.md'; }, p => { p.payload.extra = 'unknown'; }]) {
    const p = structuredClone(original); mutate(p); writeFileSync(x.outputPath, JSON.stringify(p));
    assert.throws(() => receiveInstructionAssetPackage({ packagePath: x.outputPath, quarantineRoot: x.receive.quarantineRoot }));
    assert.equal(existsSync(x.receive.quarantineRoot), false);
  }
  writeFileSync(x.outputPath, JSON.stringify(original));
  const target = join(x.f.root, 'real'); mkdirSync(target); const link = join(x.f.root, 'link'); symlinkSync(target, link);
  assert.throws(() => receiveInstructionAssetPackage({ packagePath: x.outputPath, quarantineRoot: join(link, 'quarantine') }), /symlink/i);
});
test('all dependencies must be explicitly exported and accepted, then rebind to local candidate identities', t => {
  const x = fixture(t), local = verifyAssetRegistry({ storeRoot: x.f.storeRoot, snapshotDigest: x.source.registrySnapshotDigest });
  const d = structuredClone(local.assets.find(a => a.stable_id === x.f.rootAsset.stable_id).record); delete d.object_kind;
  const path = 'prompts/helper.md', text = 'Use the boundary verification instruction.\n';
  d.asset_type = 'prompt'; d.stable_id = 'ask.prompt.helper'; d.version = '1.0.0';
  d.type_extension = { kind: 'prompt_template', adapter: 'codex', entrypoint: path, rendered_runtime_content: false };
  d.dependencies = [x.f.rootAsset]; d.content = { package_format: 'canonical_json_base64_files', files: [{ path, media_type: 'text/markdown; charset=utf-8', raw_digest: instructionBytesDigest(Buffer.from(text)) }] };
  mkdirSync(dirname(join(x.f.root, path)), { recursive: true }); writeFileSync(join(x.f.root, path), text);
  const saved = registerAsset({ storeRoot: x.f.storeRoot, sourceRoot: x.f.root, predecessorSnapshotDigest: x.source.registrySnapshotDigest, descriptor: d });
  const ref = exactInstructionAsset({ ...d, ...saved });
  const source = { ...x.source, registrySnapshotDigest: saved.snapshot_digest, selectedAssets: [ref], portability: { ...x.source.portability, [ref.stable_id]: metadata } };
  assert.throws(() => previewInstructionAssetPackage(source), /missing selected dependency/);
  source.selectedAssets.push(x.f.rootAsset); const preview = previewInstructionAssetPackage(source);
  exportInstructionAssetPackage({ ...source, outputPath: x.outputPath, approval: { preview_digest: preview.preview_digest, evidence_digest: canonicalDigest('synthetic'), intended_scope: 'receiver' } });
  receiveInstructionAssetPackage({ packagePath: x.outputPath, quarantineRoot: x.receive.quarantineRoot });
  const o = { ...x.receive, resolutions: { [ref.stable_id]: { action: 'accept' } } };
  assert.equal(planInstructionAssetImport(o).ready, false);
  o.resolutions[x.f.rootAsset.stable_id] = { action: 'adapt', stable_id: 'receiver.skill.boundary' };
  const plan = planInstructionAssetImport(o), result = applyInstructionAssetImport({ ...o, confirmedPlanDigest: plan.plan_digest });
  const imported = verifyAssetRegistry({ storeRoot: o.storeRoot, snapshotDigest: result.snapshot_digest }).assets;
  assert.equal(imported.find(a => a.asset_type === 'prompt').record.dependencies[0].stable_id, 'receiver.skill.boundary');
  assert.ok(imported.every(a => a.state === 'candidate'));
});
test('portable candidates retain declared risk/effects and unresolved safety references block export',t=>{
  const x=fixture(t),original=verifyAssetRegistry({storeRoot:x.f.storeRoot,snapshotDigest:x.source.registrySnapshotDigest}).assets.find(a=>a.stable_id===x.f.rootAsset.stable_id);
  const d=structuredClone(original.record);delete d.object_kind;d.stable_id='ask.skill.risk-declared';
  d.safety.classifications=['high_impact'];d.permissions_and_effects.requested_permissions=['network'];d.permissions_and_effects.possible_effects=['send_email'];
  d.content={package_format:'canonical_json_base64_files',files:original.content.files.map(({path,raw_digest,media_type})=>({path,raw_digest,media_type}))};
  const saved=registerAsset({storeRoot:x.f.storeRoot,sourceRoot:x.f.root,predecessorSnapshotDigest:x.source.registrySnapshotDigest,descriptor:d}),ref=exactInstructionAsset({...d,...saved});
  const source={...x.source,registrySnapshotDigest:saved.snapshot_digest,selectedAssets:[ref],portability:{[ref.stable_id]:metadata}};
  const preview=previewInstructionAssetPackage(source);assert.deepEqual(preview.payload.assets[0].restrictions.classifications,['high_impact']);
  exportInstructionAssetPackage({...source,outputPath:x.outputPath,approval:{preview_digest:preview.preview_digest,evidence_digest:canonicalDigest('synthetic'),intended_scope:'receiver'}});
  receiveInstructionAssetPackage({packagePath:x.outputPath,quarantineRoot:x.receive.quarantineRoot});
  const o={...x.receive,resolutions:{[ref.stable_id]:{action:'accept'}}},plan=planInstructionAssetImport(o),result=applyInstructionAssetImport({...o,confirmedPlanDigest:plan.plan_digest});
  const imported=verifyAssetRegistry({storeRoot:o.storeRoot,snapshotDigest:result.snapshot_digest}).assets[0];
  assert.deepEqual(imported.record.safety.classifications,['high_impact']);assert.equal(imported.record.safety.status,'not_evaluated');
  assert.deepEqual(imported.record.permissions_and_effects.possible_effects,['send_email']);
  d.stable_id='ask.skill.constrained';d.safety.constraint_refs=['public:unpackaged-constraint'];
  const constrained=registerAsset({storeRoot:x.f.storeRoot,sourceRoot:x.f.root,predecessorSnapshotDigest:saved.snapshot_digest,descriptor:d}),cref=exactInstructionAsset({...d,...constrained});
  assert.throws(()=>previewInstructionAssetPackage({...source,registrySnapshotDigest:constrained.snapshot_digest,selectedAssets:[cref],portability:{[cref.stable_id]:metadata}}),/unresolved safety/);
});
test('v1.1 transfers exact text helpers inertly and rejects unsafe helper content and types',t=>{
  const x=fixture(t),old=verifyAssetRegistry({storeRoot:x.f.storeRoot,snapshotDigest:x.source.registrySnapshotDigest}).assets.find(a=>a.stable_id===x.f.rootAsset.stable_id);
  const d=structuredClone(old.record);delete d.object_kind;d.stable_id='ask.skill.helper-package';
  const entry=d.type_extension.entrypoint,helper=dirname(entry)+'/scripts/check.mjs',text='export const value = 42;\n';
  mkdirSync(dirname(join(x.f.root,helper)),{recursive:true});writeFileSync(join(x.f.root,helper),text);
  d.content={package_format:'canonical_json_base64_files',files:[...old.content.files.map(({path,raw_digest,media_type})=>({path,raw_digest,media_type})),{path:helper,raw_digest:instructionBytesDigest(Buffer.from(text)),media_type:'text/javascript'}]};
  const saved=registerAsset({storeRoot:x.f.storeRoot,sourceRoot:x.f.root,predecessorSnapshotDigest:x.source.registrySnapshotDigest,descriptor:d}),ref=exactInstructionAsset({...d,...saved});
  const source={...x.source,registrySnapshotDigest:saved.snapshot_digest,selectedAssets:[ref],portability:{[ref.stable_id]:metadata}};
  const preview=previewInstructionAssetPackage(source);assert.equal(preview.payload.contract_version,'1.1.0');
  exportInstructionAssetPackage({...source,outputPath:x.outputPath,approval:{preview_digest:preview.preview_digest,evidence_digest:canonicalDigest('synthetic'),intended_scope:'receiver'}});
  receiveInstructionAssetPackage({packagePath:x.outputPath,quarantineRoot:x.receive.quarantineRoot});
  const o={...x.receive,resolutions:{[ref.stable_id]:{action:'accept'}}},plan=planInstructionAssetImport(o);
  assert.equal(plan.plan.helper_execution_implied,false);assert.equal(plan.plan.helper_files.length,1);
  const result=applyInstructionAssetImport({...o,confirmedPlanDigest:plan.plan_digest});
  const asset=verifyAssetRegistry({storeRoot:o.storeRoot,snapshotDigest:result.snapshot_digest}).assets[0];
  const copied=asset.content.files.find(f=>f.path===helper);assert.equal(Buffer.from(copied.bytes_base64,'base64').toString(),text);assert.equal(copied.media_type,'text/javascript');
  const original=JSON.parse(readFileSync(x.outputPath));
  for(const mutate of [p=>{p.payload.assets[0].files.find(f=>f.path===helper).path=dirname(entry)+'/scripts/check.exe';},
    p=>{const f=p.payload.assets[0].files.find(f=>f.path===helper);f.text='const password="private";';f.raw_digest=instructionBytesDigest(Buffer.from(f.text));},
    p=>{const f=p.payload.assets[0].files.find(f=>f.path===helper);f.path=dirname(entry)+'/resources/settings.json';f.media_type='application/json';f.text='{"api_key":"private-value"}';f.raw_digest=instructionBytesDigest(Buffer.from(f.text));},
    p=>{p.payload.assets[0].files.find(f=>f.path===helper).path='.claude/settings.json';}]){
    const p=structuredClone(original);mutate(p);p.approval.preview_digest=canonicalDigest(p.payload);p.package_digest=canonicalDigest({payload:p.payload,approval:p.approval});
    const path=join(x.f.root,'unsafe.json');writeFileSync(path,JSON.stringify(p));assert.throws(()=>receiveInstructionAssetPackage({packagePath:path,quarantineRoot:join(x.f.root,'unsafe-quarantine')}));
  }
  const projected=structuredClone(original);projected.payload.assets[0].entrypoint='.agents/'+projected.payload.assets[0].entrypoint;
  for(const file of projected.payload.assets[0].files)file.path='.agents/'+file.path;
  projected.approval.preview_digest=canonicalDigest(projected.payload);projected.package_digest=canonicalDigest({payload:projected.payload,approval:projected.approval});
  const projectedPath=join(x.f.root,'projected.json');writeFileSync(projectedPath,JSON.stringify(projected));
  assert.equal(receiveInstructionAssetPackage({packagePath:projectedPath,quarantineRoot:join(x.f.root,'projected-quarantine')}).status,'quarantined');
});

test('file-backed import works without Git and preserves untrusted candidate semantics', t => {
  const x = fixture(t); x.quarantine();
  const options = { ...x.receive, sourceKind: 'filesystem_snapshot', resolutions: { [x.f.rootAsset.stable_id]: { action: 'accept' } } };
  const plan = planInstructionAssetImport(options);
  const previousPath = process.env.PATH;
  let result;
  try {
    process.env.PATH = '';
    result = applyInstructionAssetImport({ ...options, confirmedPlanDigest: plan.plan_digest });
  } finally { process.env.PATH = previousPath; }
  const local = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: result.snapshot_digest });
  const asset = local.assets[0];
  assert.equal(asset.record.source.kind, 'filesystem_snapshot');
  assert.match(asset.record.source.revision, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(asset.state, 'candidate');
  assert.equal(asset.record.evaluation_history.status, 'not_evaluated');
  assert.equal(result.activation_implied, false);
  assert.equal(result.validation_required, true);
  assert.deepEqual(applyInstructionAssetImport({ ...options, confirmedPlanDigest: plan.plan_digest }), result);
});

test('file source identity is bound to its kind and content-addressed version', t => {
  const x = fixture(t);
  const asset = verifyAssetRegistry({ storeRoot: x.f.storeRoot, snapshotDigest: x.source.registrySnapshotDigest }).assets.find(a => a.stable_id === x.f.rootAsset.stable_id);
  const descriptor = structuredClone(asset.record); delete descriptor.object_kind;
  descriptor.stable_id = 'ask.skill.filesystem-demo';
  descriptor.source = { kind: 'filesystem_snapshot', repository_id: asset.record.source.repository_id, revision: 'sha256:' + 'a'.repeat(64) };
  descriptor.version_scheme = 'content_digest'; descriptor.version = descriptor.source.revision;
  descriptor.content = { package_format: 'canonical_json_base64_files', files: asset.content.files.map(({ path, raw_digest, media_type }) => ({ path, raw_digest, media_type })) };
  const args = { storeRoot: x.f.storeRoot, sourceRoot: x.f.root, predecessorSnapshotDigest: x.source.registrySnapshotDigest, descriptor };
  const result = registerAsset(args);
  assert.equal(verifyAssetRegistry({ storeRoot: x.f.storeRoot, snapshotDigest: result.snapshot_digest }).assets.find(a => a.stable_id === descriptor.stable_id).version, descriptor.source.revision);
  assert.throws(() => registerAsset({ ...args, descriptor: { ...descriptor, version: 'sha256:' + 'b'.repeat(64) } }), /exact filesystem/);
  assert.throws(() => registerAsset({ ...args, descriptor: { ...descriptor, source: { ...descriptor.source, revision: 'a'.repeat(40) } } }), /exact filesystem/);
  assert.throws(() => registerAsset({ ...args, descriptor: { ...descriptor, version_scheme: 'semantic', source: { ...descriptor.source, revision: 'a'.repeat(40) } } }), /schema/);
  assert.throws(() => registerAsset({ ...args, descriptor: { ...descriptor, version_scheme: 'git_revision', version: 'git:' + 'a'.repeat(40) } }), /Git source/);
});
test('filesystem import approval cannot be reused to change the source backend', t => {
  const x = fixture(t); x.quarantine();
  const options = { ...x.receive, sourceKind: 'filesystem_snapshot', resolutions: { [x.f.rootAsset.stable_id]: { action: 'accept' } } };
  const plan = planInstructionAssetImport(options);
  assert.throws(() => applyInstructionAssetImport({ ...options, sourceKind: 'git_repository', confirmedPlanDigest: plan.plan_digest }), /plan changed/);
  assert.throws(() => planInstructionAssetImport({ ...options, sourceKind: 'remote' }), /source kind/);
});
