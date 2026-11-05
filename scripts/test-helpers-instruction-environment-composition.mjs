import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readContentAddressedJson } from './content-addressed-store.mjs';
import { registerAsset } from './asset-registry.mjs';
import { registerInstructionEnvironmentBundle } from './instruction-environment-compiler.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
import { environmentFixture } from './test-helpers-instruction-environment.mjs';
const read = (storeRoot, digest) => readContentAddressedJson({ storeRoot, digest }).value;
export function compiledMembershipFixture(t, track) {
  const f = environmentFixture(t, track), record = read(f.storeRoot, f.options.bindings[0].asset.record_digest);
  const descriptor = structuredClone(record); delete descriptor.object_kind;
  descriptor.stable_id = `ask.environment.${track}`; descriptor.version = '1.0.0'; descriptor.version_scheme = 'semantic';
  descriptor.derivation = { kind: 'root', parent: null, delta: null }; descriptor.maintenance.rollback.target = null;
  const baseline = registerInstructionEnvironmentBundle({ ...f.options, components: f.options.bindings, descriptor });
  const skill = structuredClone(descriptor), path = 'skills/new-local/SKILL.md';
  skill.asset_type = 'skill'; skill.stable_id = 'ask.skill.new-local'; skill.type_extension = { kind: 'skill', entrypoint: path };
  skill.dependencies = []; skill.content = { package_format: 'canonical_json_base64_files', files: [{ path,
    media_type: 'text/markdown; charset=utf-8', raw_digest: instructionBytesDigest(Buffer.from('New root Skill.\n')) }] };
  mkdirSync(dirname(join(f.root, path)), { recursive: true }); writeFileSync(join(f.root, path), 'New root Skill.\n');
  const added = registerAsset({ storeRoot: f.storeRoot, sourceRoot: f.root, predecessorSnapshotDigest: baseline.snapshot_digest, descriptor: skill });
  const rootAsset = { asset_type: skill.asset_type, stable_id: skill.stable_id, version: skill.version,
    content_digest: added.content_digest, record_digest: added.record_digest };
  const rootComponent = { asset: rootAsset, files: [{ source: path, target: `.${track === 'codex' ? 'agents' : 'claude'}/skills/new-local/SKILL.md` }] };
  descriptor.version = '1.1.0'; descriptor.derivation = { kind: 'full_content_revision', parent: baseline.asset,
    delta: { kind: 'replacement', summary: 'Add the independent root Skill to the compiled instruction environment.' } };
  descriptor.maintenance.rollback.target = baseline.asset;
  const challenger = registerInstructionEnvironmentBundle({ ...f.options, registrySnapshotDigest: added.snapshot_digest,
    components: [...f.options.bindings, rootComponent], descriptor });
  return { ...f, baseline, challenger, rootAsset, rootComponent };
}
