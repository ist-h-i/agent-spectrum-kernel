// Opt-in exact snapshot of an already prepared normal Codex Full installation.
// No installer ownership, execution, admission, source-authenticity or efficacy grant.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, putContentAddressedJson, readContentAddressedJson, readStableBytes,
  assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { instructionPath, instructionTargetPath } from './instruction-projection-paths.mjs';
export const RETAINED_LAYOUT = 'retained_codex_full_reference_v1';
export function retainedInstructionPath(path) {
  instructionPath(path);
  const ordinary = (() => { try { instructionTargetPath('codex', path, true); return true; } catch { return false; } })();
  assert.ok(ordinary || path === 'CUSTOM_INSTRUCTIONS.md'
    || /^skills\/[a-z0-9-]+\/(?:SKILL\.md|references\/.+)$/.test(path)
    || /^\.agent-spectrum-kernel\/(?:codex-install-state|install-state)\.json$/.test(path),
  'unsupported retained instruction path');
  return path;
}
function inventory(root) {
  assertNoSymlinkPathSegments(root, 'retained snapshot root');
  const files = [];
  function walk(relative = '') {
    for (const name of readdirSync(join(root, relative)).sort()) {
      const path = relative ? relative + '/' + name : name;
      const stat = lstatSync(join(root, path));
      assert.ok(!stat.isSymbolicLink(), 'retained snapshot symlink');
      if (stat.isDirectory()) walk(path);
      else { assert.ok(stat.isFile(), 'retained snapshot requires regular files'); retainedInstructionPath(path); files.push(path); }
      assert.ok(files.length <= 2048, 'retained snapshot file bound');
    }
  }
  walk(); return files;
}
export function captureRetainedInstructionLayout({ storeRoot, sourceRoot, expectedFiles, expectedInventoryDigest }) {
  assert.equal(canonicalDigest(expectedFiles), expectedInventoryDigest, 'reviewed retained inventory pin required');
  assert.ok(Array.isArray(expectedFiles) && expectedFiles.length > 0 && expectedFiles.length <= 2048);
  const paths = expectedFiles.map(f => f.path);
  assert.equal(new Set(paths).size, paths.length, 'duplicate retained paths');
  assert.deepEqual(paths, [...paths].sort(), 'retained inventory must be sorted');
  assert.deepEqual(inventory(resolve(sourceRoot)), [...paths].sort(), 'undeclared or missing retained instructions');
  // Check all sources before publishing a layout. Individual CAS blobs stay bounded.
  const entries = expectedFiles.map(f => {
    assert.deepEqual(Object.keys(f).sort(), ['bytes','mode','path','sha256']);
    retainedInstructionPath(f.path);
    assert.equal(lstatSync(resolve(sourceRoot, f.path)).mode & 0o777, f.mode, 'retained mode drift');
    const bytes = readStableBytes(resolve(sourceRoot, f.path), 'retained instruction', 700000);
    assert.equal(bytes.length, f.bytes, 'retained byte size drift');
    return { ...f, bytes };
  });
  // Raw SHA is checked by the existing content evidence primitive below.
  for (const f of entries) assert.equal(instructionRawDigest(f.bytes), f.sha256, 'retained source hash drift');
  const files = entries.map(f => ({ path: f.path, bytes: f.bytes.length, mode: f.mode, raw_digest: f.sha256,
    object_digest: putContentAddressedJson({ storeRoot, artifact: { object_kind: 'retained_instruction_file',
      bytes_base64: f.bytes.toString('base64') } }).digest }));
  const layout = { object_kind: RETAINED_LAYOUT, adapter: 'codex', expected_inventory_digest: expectedInventoryDigest,
    files: files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    runtime_use_implied: false, admission_implied: false };
  return { object_digest: putContentAddressedJson({ storeRoot, artifact: layout }).digest, layout };
}
const instructionRawDigest = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
export function verifyRetainedInstructionLayout({ storeRoot, layoutObjectDigest }) {
  const layout = readContentAddressedJson({ storeRoot, digest: layoutObjectDigest }).value;
  assert.equal(layout.object_kind, RETAINED_LAYOUT); assert.equal(layout.adapter, 'codex');
  assert.equal(layout.runtime_use_implied, false); assert.equal(layout.admission_implied, false);
  assert.ok(layout.files.length > 0 && layout.files.length <= 2048);
  const seen = new Set(), files = layout.files.map(f => {
    retainedInstructionPath(f.path);
    assert.ok(!seen.has(f.path.toLowerCase()), 'duplicate retained file'); seen.add(f.path.toLowerCase());
    const blob = readContentAddressedJson({ storeRoot, digest: f.object_digest }).value;
    assert.deepEqual(Object.keys(blob).sort(), ['bytes_base64','object_kind']);
    assert.equal(blob.object_kind, 'retained_instruction_file');
    const bytes = Buffer.from(blob.bytes_base64, 'base64');
    assert.equal(bytes.toString('base64'), blob.bytes_base64); assert.equal(bytes.length, f.bytes);
    assert.equal(instructionRawDigest(bytes), f.raw_digest, 'saved retained byte drift');
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ...f, text: bytes.toString('utf8') };
  });
  assert.equal(canonicalDigest(layout.files.map(f => ({path:f.path,bytes:f.bytes,mode:f.mode,sha256:f.raw_digest}))),
    layout.expected_inventory_digest, 'retained original inventory drift');
  return { layout, files };
}
export function verifyRetainedEnvironmentClosure(options, environmentFiles) {
  const checked = verifyRetainedInstructionLayout(options);
  assert.deepEqual(environmentFiles.map(f => ({path:f.path,raw_digest:f.raw_digest})).sort((a,b)=>a.path.localeCompare(b.path)),
    checked.files.map(f => ({path:f.path,raw_digest:f.raw_digest})).sort((a,b)=>a.path.localeCompare(b.path)),
    'environment omitted or changed retained instructions');
  const byPath = new Map(checked.files.map(f => [f.path, f.text]));
  const state = JSON.parse(byPath.get('.agent-spectrum-kernel/codex-install-state.json'));
  assert.equal(state.selected_profile, 'full'); assert.ok(Array.isArray(state.selected_skills));
  assert.equal(new Set(state.selected_skills).size,state.selected_skills.length,'duplicate selected Skills');
  for (const skill of state.selected_skills) {
    assert.match(skill,/^[a-z0-9-]+$/);
    const canonical = byPath.get('skills/' + skill + '/SKILL.md');
    assert.equal(typeof canonical, 'string', 'selected canonical Skill missing');
    assert.equal(byPath.get('.agents/skills/' + skill + '/SKILL.md'), canonical, 'Skill mirrors differ');
  }
  for (const [path,text] of byPath) if (path.startsWith('skills/'))
    assert.equal(byPath.get('.agents/'+path),text,'retained reference mirrors differ');
  const discovered=[...byPath.keys()].filter(p=>/^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(p)).map(p=>p.split('/')[2]).sort();
  assert.deepEqual(discovered,[...state.selected_skills].sort(),'retained discovery selection differs');
  return checked;
}
