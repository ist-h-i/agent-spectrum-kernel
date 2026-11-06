// Exact, local instruction projections. Registry and Portfolio retain authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { assertNoSymlinkPathSegments, canonicalDigest, putContentAddressedJson, readContentAddressedJson, readStableBytes } from './content-addressed-store.mjs';
import { verifyAssetRegistry } from './asset-registry.mjs';
import { verifyPortfolioSelection } from './portfolio-manager.mjs';
import { instructionPath, instructionTargetPath as targetPath } from './instruction-projection-paths.mjs';
import { inspectCompiledInstructionComponents } from './instruction-environment-compiler.mjs';
import { retainedInstructionPath, verifyRetainedInstructionLayout, verifyRetainedEnvironmentClosure } from './retained-instruction-layout.mjs';
export { instructionPath };

export const exactInstructionAsset = a => Object.fromEntries(['asset_type', 'stable_id', 'version', 'record_digest', 'content_digest'].map(k => [k, a[k]]));
export const instructionBytesDigest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
export function matchesInstructionCliVersion(adapter, version, pin) {
  if (!['codex', 'claude'].includes(adapter) || typeof version !== 'string' || typeof pin !== 'string') return false;
  if (version === pin || version.endsWith(' ' + pin)) return true;
  // Match known Claude branding without rewriting the recorded runtime identity.
  const claude = adapter === 'claude' && /^(\d+\.\d+\.\d+) \(Claude Code\)$/.exec(version);
  return Boolean(claude && claude[1] === pin);
}
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
function runtime(value) {
  assert.deepEqual(Object.keys(value).sort(), ['ambient_config', 'cli_version', 'model']);
  for (const k of ['cli_version', 'model']) assert.ok(typeof value[k] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(value[k]), 'bounded runtime identity required');
  assert.equal(value.ambient_config, 'Unknown', 'ambient configuration is not captured by this local projection');
}
function body(options, support) {
  assert.ok(['codex', 'claude_code'].includes(options.adapter), 'unsupported adapter');
  assert.ok(typeof options.environmentId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.environmentId), 'bounded environment ID required');
  runtime(options.runtime);
  if (options.retainedLayoutObjectDigest) {
    assert.equal(options.adapter, 'codex', 'retained reference layout is Codex only');
    verifyRetainedInstructionLayout({storeRoot:options.storeRoot,layoutObjectDigest:options.retainedLayoutObjectDigest});
  }
  const registry = verifyAssetRegistry({ storeRoot: options.storeRoot, snapshotDigest: options.registrySnapshotDigest,
    trustedAuthorityContexts: options.trustedAssetAuthorityContexts ?? [] });
  assert.ok(Array.isArray(options.bindings) && options.bindings.length <= 256, 'bounded Asset bindings required');
  const bindings = structuredClone(options.bindings).sort((a, b) => order(a.asset.stable_id, b.asset.stable_id));
  const bound = new Set(), targets = new Set();
  const files = [], components = [];
  for (const binding of bindings) {
    assert.deepEqual(Object.keys(binding).sort(), ['asset', 'files']);
    const asset = registry.assets.find(a => same(exactInstructionAsset(a), binding.asset));
    assert.ok(asset && ['skill', 'prompt'].includes(asset.asset_type), 'unregistered instruction Asset');
    assert.ok(!bound.has(asset.stable_id), 'duplicate Asset stable ID'); bound.add(asset.stable_id);
    const adapter = asset.record.type_extension.adapter;
    assert.ok(!adapter || ['shared', options.adapter].includes(adapter), 'Asset adapter mismatch');
    assert.ok(Array.isArray(binding.files), 'Asset file mapping required');
    binding.files.sort((a, b) => order(a.source, b.source));
    assert.deepEqual(binding.files.map(f => f.source), asset.content.files.map(f => f.path).sort(order), 'complete Asset content mapping required');
    components.push(...inspectCompiledInstructionComponents(options, asset, binding.files));
    for (const mapping of binding.files) {
      assert.deepEqual(Object.keys(mapping).sort(), ['source', 'target']);
      targetPath(options.adapter, mapping.target);
      const file = asset.content.files.find(f => f.path === mapping.source);
      files.push({ path: mapping.target, raw_digest: file.raw_digest, bytes_base64: file.bytes_base64 });
    }
  }
  // Registry verification retains the exact dependency closure. Dependency
  // presence is not activation: only the complete Portfolio-selected set is
  // projected (a candidate may depend on its historical parent bundle).
  for (const item of support) {
    assert.deepEqual(Object.keys(item).sort(), ['object_digest', 'path', 'raw_digest']);
    if (options.retainedLayoutObjectDigest) retainedInstructionPath(item.path);
    else targetPath(options.adapter, item.path, true);
    const blob = read(options.storeRoot, item.object_digest);
    assert.deepEqual(Object.keys(blob).sort(), ['bytes_base64', 'object_kind']);
    assert.equal(blob.object_kind, 'instruction_environment_file');
    files.push({ path: item.path, raw_digest: item.raw_digest, bytes_base64: blob.bytes_base64 });
  }
  files.sort((a, b) => order(a.path, b.path));
  assert.ok(files.length > 0 && files.length <= 2048, 'bounded nonempty environment required');
  for (const file of files) {
    assert.ok(!targets.has(file.path.toLowerCase()), 'colliding environment paths'); targets.add(file.path.toLowerCase());
    const bytes = Buffer.from(file.bytes_base64, 'base64');
    assert.equal(bytes.toString('base64'), file.bytes_base64, 'canonical base64 required');
    assert.equal(instructionBytesDigest(bytes), file.raw_digest, 'environment content digest mismatch');
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  assert.ok(!files.some(a => files.some(b => b.path.startsWith(a.path + '/'))), 'file/directory path collision');
  if (options.retainedLayoutObjectDigest) verifyRetainedEnvironmentClosure({storeRoot:options.storeRoot,
    layoutObjectDigest:options.retainedLayoutObjectDigest},files);
  if (options.selectionObjectDigest !== null) {
    const selection = verifyPortfolioSelection({ ...options, selectionObjectDigest: options.selectionObjectDigest }).selection;
    assert.equal(selection.decision, 'selected', 'environment requires an eligible exact selection');
    assert.equal(selection.registry.snapshot_digest, options.registrySnapshotDigest, 'selection Registry mismatch');
    const context = read(options.storeRoot, selection.context_object_digest);
    assert.equal(context.adapter, options.adapter, 'selection adapter mismatch');
    assert.equal(context.model, options.runtime.model, 'selection model mismatch');
    assert.ok(same(selection.selected_assets.filter(a => ['skill', 'prompt'].includes(a.asset.asset_type)).map(a => a.asset).sort((a, b) => order(a.stable_id, b.stable_id)), bindings.map(b => b.asset)), 'environment must map the complete selected instruction Asset set');
  }
  return { environment: { schema_version: '1.0.0', object_kind: 'instruction_environment', environment_id: options.environmentId,
    adapter: options.adapter, runtime: structuredClone(options.runtime), registry_snapshot_digest: options.registrySnapshotDigest,
    selection_object_digest: options.selectionObjectDigest, bindings, support: [...support].sort((a, b) => order(a.path, b.path)),
    projection_digest: canonicalDigest(files.map(({ path, raw_digest }) => ({ path, raw_digest }))),
    ...(components.length ? { components } : {}),
    ...(options.retainedLayoutObjectDigest ? {retained_layout_object_digest:options.retainedLayoutObjectDigest} : {}),
    runtime_use_implied: false, effectiveness_implied: false },
    files: files.map(f => ({ path: f.path, raw_digest: f.raw_digest, text: Buffer.from(f.bytes_base64, 'base64').toString('utf8') })) };
}
export function captureInstructionEnvironment(options) {
  assert.ok(Array.isArray(options.supportPaths) && options.supportPaths.length <= 2048 && new Set(options.supportPaths).size === options.supportPaths.length, 'bounded unique support paths required');
  const support = options.supportPaths.map(path => {
    if (options.retainedLayoutObjectDigest) retainedInstructionPath(path);
    else targetPath(options.adapter, path, true);
    const bytes = readStableBytes(resolve(options.sourceRoot, path), 'environment support file');
    const blob = putContentAddressedJson({ storeRoot: options.storeRoot,
      artifact: { object_kind: 'instruction_environment_file', bytes_base64: bytes.toString('base64') } });
    return { path, object_digest: blob.digest, raw_digest: instructionBytesDigest(bytes) };
  });
  const { environment } = body(options, support);
  return { object_digest: putContentAddressedJson({ storeRoot: options.storeRoot, artifact: environment }).digest, environment };
}
export function verifyInstructionEnvironment(options) {
  const saved = read(options.storeRoot, options.environmentObjectDigest);
  const result = body({ ...options, environmentId: saved.environment_id, adapter: saved.adapter, runtime: saved.runtime,
    registrySnapshotDigest: saved.registry_snapshot_digest, selectionObjectDigest: saved.selection_object_digest, bindings: saved.bindings,
    retainedLayoutObjectDigest:saved.retained_layout_object_digest }, saved.support);
  assert.ok(same(result.environment, saved), 'saved environment shape or bytes drifted');
  return result;
}
export function exportInstructionEnvironment(options) {
  const checked = verifyInstructionEnvironment(options), root = resolve(options.outputRoot);
  assertNoSymlinkPathSegments(root, 'environment export', { allowMissingLeaf: true });
  assert.ok(!existsSync(root), 'environment export requires a fresh directory');
  // Verify every input before creating the destination. A partial export stays
  // visible on I/O failure; it is never silently overwritten or retried.
  mkdirSync(root);
  for (const file of checked.files) {
    const path = resolve(root, file.path); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.text, { flag: 'wx', mode: 0o600 });
  }
  return { status: 'exported', environment_object_digest: options.environmentObjectDigest, file_count: checked.files.length, installation_implied: false };
}
