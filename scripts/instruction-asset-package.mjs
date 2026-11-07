// Local handoff only. A checksum establishes integrity, never export permission
// or receiver admission. Imported claims/authority/history are not replayed.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { canonicalDigest, readJsonFileStrict, writeCanonicalJsonNoReplace, assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { verifyAssetRegistry, registerAsset } from './asset-registry.mjs';
import { exactInstructionAsset, instructionBytesDigest } from './instruction-environment.mjs';
import { instructionPath } from './instruction-projection-paths.mjs';
import { validateJsonSchema } from './execution-envelope.mjs';
import { commitInstructionSource } from './instruction-source-version.mjs';

const digest = /^sha256:[a-f0-9]{64}$/u;
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'unknown or missing package fields');
const metadataKeys = ['title', 'rationale', 'applicability', 'non_applicability', 'exceptions', 'verification', 'refresh_condition', 'validation_summary', 'evidence_status'];
const registry = o => verifyAssetRegistry({ storeRoot: o.storeRoot, snapshotDigest: o.registrySnapshotDigest,
  trustedAuthorityContexts: o.trustedAssetAuthorityContexts ?? [] });

export function inspectInstructionPortability(text, {allowCode=false}={}) {
  // A conservative aid, not a detector for every customer identifier. The host
  // reviews the entire preview and remains responsible for lawful portability.
  const checks = {
    secret: /(?:\b(?:token|secret|password|credential|api[_-]?key)[\w-]*["']?\s*[=:]|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-|ghp_)[A-Za-z0-9]{16,})/iu,
    identifier: /(?:https?:\/\/|file:\/\/|\/(?:Users|home|private|var|tmp)\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:customer|client|ticket)[-_ :#]+[A-Za-z0-9]+)/iu,
    raw_material: /(?:```|<\|(?:user|assistant|system)\|>|\bBearer\s+[A-Za-z0-9._-]+)/u,
  };
  return Object.entries(checks).filter(([code, pattern]) => (code!=='raw_material'||!allowCode?pattern:/<\|(?:user|assistant|system)\|>|\bBearer\s+[A-Za-z0-9._-]+/u).test(text)).map(([code]) => code);
}
function publicText(value, max = 8192, allowCode=false) {
  assert.ok(typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= max && !value.includes('\0'), 'bounded public package text required');
  assert.deepEqual(inspectInstructionPortability(value,{allowCode}), [], 'potentially prohibited content; redact before preview');
}
const helperTypes={'.js':'text/javascript','.mjs':'text/javascript','.cjs':'text/javascript','.py':'text/x-python','.sh':'text/x-shellscript','.bash':'text/x-shellscript','.ts':'text/typescript','.json':'application/json','.yaml':'text/yaml','.yml':'text/yaml','.toml':'text/plain','.txt':'text/plain','.sql':'text/plain'};
function portableFile(path,entrypoint){
  instructionPath(path);const parts=path.split('/'),namespace=/^\.(?:agents|claude)\/(?:skills|prompts|commands)\//u;
  assert.ok(!parts.some((p,i)=>p.startsWith('.')&&!(i===0&&namespace.test(path)&&entrypoint.startsWith(parts[0]+'/'))),'hidden helper/configuration paths are not portable');
  if(path.endsWith('.md'))return 'text/markdown; charset=utf-8';
  const prefix=dirname(entrypoint);assert.ok(prefix!=='.'&&path.startsWith(prefix+'/'),'helper must belong to its instruction directory');
  const type=helperTypes[extname(path)];assert.ok(type,'unsupported helper type; binaries and archives are not portable');return type;
}
function validatePayload(p) {
  keys(p, ['kind', 'contract_version', 'source_scope_digest', 'intended_scope', 'assets']);
  assert.equal(p.kind, 'offline_instruction_asset_package'); assert.ok(['1.0.0','1.1.0'].includes(p.contract_version));
  assert.match(p.source_scope_digest, digest); assert.match(p.intended_scope, id);
  assert.ok(Array.isArray(p.assets) && p.assets.length && p.assets.length <= 64);
  const identities = new Set(), references = new Set(); let size = 0;
  for (const a of p.assets) {
    keys(a, ['source_ref_digest', 'stable_id', 'version', 'asset_type', 'adapter', 'adapter_constraints', 'runtime_profiles', 'restrictions', 'entrypoint', 'dependencies', 'required_capabilities', 'metadata', 'files']);
    assert.match(a.source_ref_digest, digest); assert.match(a.stable_id, id); assert.match(a.version, id);
    assert.ok(!identities.has(a.stable_id), 'one explicitly selected version per Asset required'); identities.add(a.stable_id);
    assert.ok(!references.has(a.source_ref_digest), 'duplicate source reference'); references.add(a.source_ref_digest);
    assert.ok(['skill', 'prompt'].includes(a.asset_type)); assert.ok(['shared', 'codex', 'claude_code'].includes(a.adapter));
    keys(a.adapter_constraints, ['status', 'included', 'excluded']);
    assert.ok(['unknown', 'unrestricted', 'bounded'].includes(a.adapter_constraints.status));
    for (const k of ['included', 'excluded']) {
      assert.ok(Array.isArray(a.adapter_constraints[k]) && a.adapter_constraints[k].length <= 32 && new Set(a.adapter_constraints[k]).size === a.adapter_constraints[k].length);
      a.adapter_constraints[k].forEach(v => assert.match(v, id));
    }
    assert.ok(a.adapter_constraints.status !== 'unknown' || !a.adapter_constraints.included.length && !a.adapter_constraints.excluded.length);
    assert.ok(Array.isArray(a.runtime_profiles) && a.runtime_profiles.length <= 32 && new Set(a.runtime_profiles).size === a.runtime_profiles.length);
    a.runtime_profiles.forEach(v => assert.match(v, id));
    keys(a.restrictions,['requested_permissions','possible_effects','classifications']);
    for(const values of Object.values(a.restrictions)){
      assert.ok(Array.isArray(values)&&values.length<=256&&new Set(values).size===values.length);
      values.forEach(v=>publicText(v,256));
    }
    instructionPath(a.entrypoint); keys(a.metadata, metadataKeys);
    for (const k of metadataKeys.filter(k => k !== 'evidence_status')) publicText(a.metadata[k]);
    assert.ok(['Verified', 'Supported', 'Hypothesis', 'Unknown', 'Falsified'].includes(a.metadata.evidence_status));
    assert.ok(Array.isArray(a.dependencies) && a.dependencies.length <= 64 && new Set(a.dependencies).size === a.dependencies.length);
    a.dependencies.forEach(d => assert.match(d, digest));
    assert.ok(Array.isArray(a.required_capabilities) && a.required_capabilities.length <= 32 && new Set(a.required_capabilities).size === a.required_capabilities.length);
    a.required_capabilities.forEach(c => assert.match(c, id));
    assert.ok(Array.isArray(a.files) && a.files.length && a.files.length <= 256);
    const paths = new Set();
    for (const f of a.files) {
      keys(f, p.contract_version==='1.0.0'?['path', 'text', 'raw_digest']:['path','text','raw_digest','media_type']); instructionPath(f.path);
      if(p.contract_version==='1.0.0')assert.ok(/\.md$/u.test(f.path), 'v1 packages contain instruction Markdown only');
      else assert.equal(f.media_type,portableFile(f.path,a.entrypoint),'helper media type mismatch');
      assert.ok(!paths.has(f.path.toLowerCase()), 'package path collision'); paths.add(f.path.toLowerCase());
      publicText(f.text, 128 * 1024,p.contract_version==='1.1.0'); size += Buffer.byteLength(f.text);
      assert.equal(instructionBytesDigest(Buffer.from(f.text)), f.raw_digest, 'package file checksum drift');
    }
    assert.ok(a.files.some(f => f.path === a.entrypoint), 'missing entrypoint');
    assert.ok(!a.files.some(f => a.files.some(g => g.path.startsWith(f.path + '/'))), 'file/directory collision');
  }
  assert.ok(size <= 2 * 1024 * 1024, 'bounded package required');
  for (const a of p.assets) for (const dependency of a.dependencies)
    assert.ok(references.has(dependency) && dependency !== a.source_ref_digest, 'missing selected dependency or self reference');
  // Reject cycles before any quarantine/Registry allocation.
  const pending = [...p.assets], done = new Set();
  while (pending.length) {
    const index = pending.findIndex(a => a.dependencies.every(d => done.has(d)));
    assert.ok(index !== -1, 'dependency cycle'); done.add(pending.splice(index, 1)[0].source_ref_digest);
  }
  return p;
}
export function previewInstructionAssetPackage(options) {
  const local = registry(options);
  assert.ok(Array.isArray(options.selectedAssets) && options.selectedAssets.length, 'explicit Asset selection required');
  assert.ok(options.portability && typeof options.portability === 'object');
  const version=options.contractVersion??(options.selectedAssets.some(ref=>local.assets.find(a=>same(exactInstructionAsset(a),ref))?.content.files.some(f=>!f.path.endsWith('.md')))?'1.1.0':'1.0.0');
  const assets = options.selectedAssets.map(ref => {
    const a = local.assets.find(a => same(exactInstructionAsset(a), ref)); assert.ok(a, 'selected Asset is not registered');
    assert.ok(['skill', 'prompt'].includes(a.asset_type));
    assert.ok(['skill', 'prompt_template'].includes(a.record.type_extension.kind), 'export individual components of rendered bundles');
    assert.equal(a.record.maintenance.stale_status === 'stale', false, 'stale Asset needs local review');
    assert.equal(a.record.safety.constraint_refs.length,0,'unresolved safety constraint references require a portable public representation');
    const metadata = structuredClone(options.portability[a.stable_id]);
    return { source_ref_digest: canonicalDigest(ref), stable_id: a.stable_id, version: a.version,
      asset_type: a.asset_type, adapter: a.record.type_extension.adapter ?? 'shared', entrypoint: a.record.type_extension.entrypoint,
      adapter_constraints: structuredClone(a.record.applicability.adapters), runtime_profiles: [...a.record.compatibility.runtime_profiles].sort(),
      restrictions:{requested_permissions:[...a.record.permissions_and_effects.requested_permissions].sort(),possible_effects:[...a.record.permissions_and_effects.possible_effects].sort(),classifications:[...a.record.safety.classifications].sort()},
      dependencies: a.record.dependencies.map(d => canonicalDigest(d)).sort(),
      required_capabilities: [...a.record.applicability.required_capabilities].sort(), metadata,
      files: a.content.files.map(f => ({ path: f.path, text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(f.bytes_base64, 'base64')), raw_digest: f.raw_digest,
        ...(version==='1.1.0'?{media_type:portableFile(f.path,a.record.type_extension.entrypoint)}:{}) })) };
  }).sort((a, b) => a.stable_id.localeCompare(b.stable_id));
  const payload = validatePayload({ kind: 'offline_instruction_asset_package', contract_version: version,
    source_scope_digest: canonicalDigest({ repository: local.repository_id, scope: local.scope_id }), intended_scope: options.intendedScope, assets });
  return { payload, preview_digest: canonicalDigest(payload), export_permission_implied: false, network_operations: 0 };
}
export function exportInstructionAssetPackage(options) {
  const preview = previewInstructionAssetPackage(options), approval = options.approval;
  keys(approval, ['preview_digest', 'evidence_digest', 'intended_scope']);
  assert.equal(approval.preview_digest, preview.preview_digest, 'export approval is stale');
  assert.equal(approval.intended_scope, preview.payload.intended_scope); assert.match(approval.evidence_digest, digest);
  const body = { payload: preview.payload, approval: structuredClone(approval) };
  const artifact = { ...body, package_digest: canonicalDigest(body) };
  writeCanonicalJsonNoReplace({ outputPath: resolve(options.outputPath), artifact, label: 'offline instruction package', maximumBytes: 4 * 1024 * 1024 });
  return { package_digest: artifact.package_digest, output_path: resolve(options.outputPath), transferred: false };
}
function readPackage(path) {
  const p = readJsonFileStrict(path, 'offline instruction package', 4 * 1024 * 1024);
  assert.deepEqual(validateJsonSchema(p, { schemaPath: join(import.meta.dirname, '../schemas/instruction-asset-package.schema.json') }), [], 'invalid offline package schema');
  keys(p, ['payload', 'approval', 'package_digest']); validatePayload(p.payload);
  keys(p.approval, ['preview_digest', 'evidence_digest', 'intended_scope']);
  assert.equal(p.approval.preview_digest, canonicalDigest(p.payload)); assert.match(p.approval.evidence_digest, digest);
  assert.equal(p.approval.intended_scope, p.payload.intended_scope);
  assert.equal(p.package_digest, canonicalDigest({ payload: p.payload, approval: p.approval }), 'package checksum drift');
  return p;
}
export function receiveInstructionAssetPackage(options) {
  const p = readPackage(options.packagePath), root = resolve(options.quarantineRoot);
  assertNoSymlinkPathSegments(root, 'fresh package quarantine', { allowMissingLeaf: true });
  assert.ok(!existsSync(root), 'fresh quarantine required'); mkdirSync(root, { mode: 0o700 });
  writeCanonicalJsonNoReplace({ outputPath: join(root, 'package.json'), artifact: p, label: 'quarantined instruction package', maximumBytes: 4 * 1024 * 1024 });
  return { status: 'quarantined', package_digest: p.package_digest, activation_implied: false };
}
export function planInstructionAssetImport(options) {
  const p = readPackage(join(resolve(options.quarantineRoot), 'package.json')), local = registry(options);
  assert.equal(options.intendedScope, local.scope_id, 'receiver scope must be its local Registry scope');
  assert.equal(p.payload.intended_scope, options.intendedScope, 'package intended for a different scope');
  assert.ok(['codex', 'claude_code'].includes(options.adapter));
  assert.ok(Array.isArray(options.availableCapabilities));
  const decisions = options.resolutions ?? {};
  assert.ok(Object.keys(decisions).every(k => p.payload.assets.some(a => a.stable_id === k)), 'resolution for unknown Asset');
  const rows = p.payload.assets.map(a => {
    const existing = local.assets.filter(b => b.stable_id === a.stable_id);
    const duplicate = existing.find(b => b.asset_type === a.asset_type && same(
      b.content.files.map(f => ({ path: f.path, raw_digest: f.raw_digest })), a.files.map(({ path, raw_digest }) => ({ path, raw_digest }))));
    const resolution = decisions[a.stable_id] ?? { action: 'quarantine' };
    assert.ok(['accept', 'adapt', 'reject', 'quarantine'].includes(resolution.action));
    keys(resolution, resolution.action === 'adapt' ? ['action', 'stable_id'] : ['action']);
    const targetId = resolution.action === 'adapt' ? resolution.stable_id : a.stable_id;
    assert.match(targetId, id);
    const blockers = [];
    if (!['shared', options.adapter].includes(a.adapter)) blockers.push('adapter_mismatch');
    const normalized = values => values.map(v => v === 'claude-code' ? 'claude_code' : v);
    const constraints = a.adapter_constraints;
    if (normalized(constraints.excluded).includes(options.adapter)
      || constraints.status === 'bounded' && constraints.included.length && !normalized(constraints.included).includes(options.adapter)) blockers.push('adapter_applicability_mismatch');
    if (a.runtime_profiles.some(v => !(options.availableRuntimeProfiles ?? []).includes(v))) blockers.push('missing_runtime_profile');
    if (a.required_capabilities.some(c => !options.availableCapabilities.includes(c))) blockers.push('missing_capability');
    if (['accept', 'adapt'].includes(resolution.action) && local.assets.some(b => b.stable_id === targetId)) blockers.push('local_identity_conflict');
    return { source_ref_digest: a.source_ref_digest, source_id: a.stable_id, target_id: targetId, action: resolution.action,
      duplicate: duplicate ? exactInstructionAsset(duplicate) : null,
      existing: existing.map(exactInstructionAsset), blockers,
      compatibility_warnings: constraints.status === 'unknown' ? ['adapter_applicability_unknown'] : [] };
  });
  const accepted = rows.filter(r => ['accept', 'adapt'].includes(r.action));
  assert.equal(new Set(accepted.map(r => r.target_id)).size, accepted.length, 'two imported Assets use the same local ID');
  for (const row of accepted) {
    const a = p.payload.assets.find(a => a.source_ref_digest === row.source_ref_digest);
    if (a.dependencies.some(d => !accepted.some(r => r.source_ref_digest === d))) row.blockers.push('dependency_not_accepted');
  }
  const plan = { kind: 'instruction_asset_import_plan_v1', package_digest: p.package_digest,
    registry_snapshot_digest: options.registrySnapshotDigest, scope_id: local.scope_id, adapter: options.adapter,
    available_capabilities: [...options.availableCapabilities].sort(), rows,
    available_runtime_profiles: [...(options.availableRuntimeProfiles ?? [])].sort(),
    // Human-readable full before/after preview; never silently merge content.
    preview: p.payload.assets.map(a => ({ stable_id: a.stable_id, metadata: a.metadata, files: a.files })),
    ...(p.payload.contract_version==='1.1.0'?{helper_files:p.payload.assets.flatMap(a=>a.files.filter(f=>!f.path.endsWith('.md')).map(f=>({stable_id:a.stable_id,path:f.path,raw_digest:f.raw_digest,media_type:f.media_type}))),helper_execution_implied:false}:{}),
    activation_implied: false, rollback_snapshot_digest: options.registrySnapshotDigest };
  return { plan, plan_digest: canonicalDigest(plan), ready: accepted.length > 0 && accepted.every(r => !r.blockers.length) };
}
function localDescriptor(a, row, version, local, dependencies, packageDigest, revision) {
  const unknown = () => ({ status: 'unknown', included: [], excluded: [] });
  return { schema_version: '1.0.0', asset_type: a.asset_type, stable_id: row.target_id, version, version_scheme: 'semantic',
    source: { kind: 'git_repository', repository_id: local.repository_id, revision },
    provenance: { origin: 'repository_file', license: { status: 'unknown', spdx_id: null, evidence_ref: null },
      owner: { status: 'unknown', owner_id: null, evidence_ref: null } },
    derivation: { kind: 'root', parent: null, delta: null }, dependencies,
    type_extension: a.asset_type === 'skill' ? { kind: 'skill', entrypoint: a.entrypoint }
      : { kind: 'prompt_template', adapter: a.adapter, entrypoint: a.entrypoint, rendered_runtime_content: false },
    content: { package_format: 'canonical_json_base64_files', files: a.files.map(({ path, raw_digest,media_type }) => ({ path, raw_digest, media_type: media_type??'text/markdown; charset=utf-8' })) },
    compatibility: { asset_contract_versions: ['1.0.0'], runtime_profiles: a.runtime_profiles },
    applicability: { models: unknown(), adapters: a.adapter === 'shared' ? structuredClone(a.adapter_constraints)
      : { status: 'bounded', included: [a.adapter], excluded: a.adapter_constraints.excluded }, stacks: unknown(), domains: unknown(), projects: unknown(), task_classes: unknown(),
      included_scopes: [local.scope_id], excluded_scopes: ['automatic_portfolio_activation'], required_capabilities: a.required_capabilities,
      notes: ['Imported candidate; validate locally. Package ' + packageDigest + '; source reference ' + a.source_ref_digest] },
    permissions_and_effects: { status: 'not_evaluated', requested_permissions: a.restrictions.requested_permissions, possible_effects: a.restrictions.possible_effects, permission_refs: [], effect_refs: [] },
    safety: { status: 'not_evaluated', classifications: a.restrictions.classifications, constraint_refs: [] },
    mechanism_and_evidence: { status: 'not_evaluated', mechanism_refs: [], evidence_refs: [] },
    evaluation_history: { status: 'not_evaluated', evidence_refs: [], cost: null },
    maintenance: { stale_status: 'not_assessed', refresh_conditions: [a.metadata.refresh_condition], regression_refs: [], retirement: null,
      rollback: { status: 'requires_explicit_authority', target: null, authority_ref: null } } };
}
export function applyInstructionAssetImport(options) {
  const checked = planInstructionAssetImport(options);
  assert.equal(options.confirmedPlanDigest, checked.plan_digest, 'import plan changed');
  assert.equal(checked.ready, true, 'import plan has unresolved conflicts or no accepted candidates');
  const p = readPackage(join(resolve(options.quarantineRoot), 'package.json')), local = registry(options);
  assert.equal(p.package_digest, checked.plan.package_digest, 'package changed after import planning');
  const rows = checked.plan.rows.filter(r => ['accept', 'adapt'].includes(r.action));
  const done = new Map(); let snapshot = options.registrySnapshotDigest;
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-import-candidates-')));
  try {
    while (rows.length) {
      const index = rows.findIndex(r => p.payload.assets.find(a => a.source_ref_digest === r.source_ref_digest).dependencies.every(d => done.has(d)));
      assert.ok(index !== -1, 'unresolved import dependency'); const row = rows.splice(index, 1)[0];
      const a = p.payload.assets.find(a => a.source_ref_digest === row.source_ref_digest);
      const source = join(root, String(done.size)); mkdirSync(source);
      for (const f of a.files) { const path = join(source, f.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, f.text, { flag: 'wx', mode: 0o600 }); }
      const revision = commitInstructionSource(source);
      const descriptor = localDescriptor(a, row, 'import:' + p.package_digest.slice(7, 31), local, a.dependencies.map(d => done.get(d)), p.package_digest, revision);
      const result = registerAsset({ storeRoot: options.storeRoot, sourceRoot: source, predecessorSnapshotDigest: snapshot,
        descriptor, trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
      snapshot = result.snapshot_digest; done.set(a.source_ref_digest, exactInstructionAsset({ ...descriptor, ...result }));
    }
    return { status: 'candidates_registered', snapshot_digest: snapshot, candidates: [...done.values()],
      rollback_snapshot_digest: options.registrySnapshotDigest, package_digest: p.package_digest, plan_digest: checked.plan_digest,
      activation_implied: false, validation_required: true };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
