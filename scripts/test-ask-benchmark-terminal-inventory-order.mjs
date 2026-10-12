// Synthetic metadata/copy checks only: no evaluator worker or model is launched.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDigest } from './ask-benchmark-materialize.mjs';
import { buildTerminalWorkspaceAuthority, captureTerminalWorkspaceInventory, deriveTerminalCandidateInventory,
  terminalWorkspaceInventoryDigest } from './ask-benchmark-terminal-workspace.mjs';
import { executeProductionSealedEvaluator, materializeTerminalCandidateAuthorityWorkspace, terminalCandidateInventoryFromAuthority } from './ask-benchmark-evaluator-boundary.mjs';
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
function syntheticAuthority(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ask-terminal-order-unit-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseRoot = join(root, 'base'), terminalRoot = join(root, 'terminal'); mkdirSync(baseRoot);
  const put = (where, path, value = `synthetic:${path}\n`) => {
    mkdirSync(dirname(join(where, path)), { recursive: true }); writeFileSync(join(where, path), value);
  };
  const managed = ['AGENTS.md', 'managed/skills/control/SKILL.md', 'managed/skills/verify/SKILL.md'];
  for (const path of ['task.md', 'workspace/src/base.mjs', 'workspace/test/base.test.mjs', 'BENCHMARK_TASK.md', ...managed]) put(baseRoot, path);
  const baseSnapshot = captureTerminalWorkspaceInventory(baseRoot);
  cpSync(baseRoot, terminalRoot, { recursive: true });
  const added = ['workspace/-notes.md', 'workspace/Zebra.mjs', 'workspace/_settings.mjs', 'workspace/apple.mjs',
    'workspace/Ω-data.md', 'workspace/日本語.md', 'workspace/𐀀.mjs', 'workspace/.mjs'];
  for (const path of added) put(terminalRoot, path);
  put(terminalRoot, 'workspace/src/base.mjs', 'export const value = 1;\n');
  const identity = { run_instance_id: '00000000-0000-4000-8000-000000000001', case_id: `case-${'a'.repeat(16)}-${'b'.repeat(16)}`,
    attempt: '0001', adapter: 'codex', condition: 'full_ask', fixture_id: 'synthetic-order-test',
    fixture_input_digest: canonicalDigest('synthetic input'), materialization_manifest_digest: canonicalDigest('synthetic materialization') };
  const { authority } = buildTerminalWorkspaceAuthority({ root: repositoryRoot, baseSnapshot, terminalWorkspaceRoot: terminalRoot,
    identity, managedAssetPaths: managed });
  const captured = captureTerminalWorkspaceInventory(terminalRoot);
  const candidate = deriveTerminalCandidateInventory(captured.inventory, managed, baseSnapshot.inventory);
  return { root, terminalRoot, authority, captured, candidate, added };
}
test('producer and consumer share canonical case, punctuation and Unicode terminal order', t => {
  const f = syntheticAuthority(t);
  assert.equal(f.captured.inventory.length, 22);
  const canonicalPaths = f.captured.inventory.map(entry => entry.path);
  const localePaths = [...canonicalPaths].sort((left, right) => left.localeCompare(right));
  assert.notDeepEqual(localePaths, canonicalPaths, 'the synthetic input must reproduce the ordering discrepancy');
  assert.deepEqual(canonicalPaths.filter(path => f.added.includes(path)), f.added);
  console.log(JSON.stringify({ terminal_entries: f.captured.inventory.length,
    reordered_entries: canonicalPaths.filter((path, index) => path !== localePaths[index]).length,
    canonical_digest: terminalWorkspaceInventoryDigest(f.captured.inventory),
    locale_digest: terminalWorkspaceInventoryDigest([...f.captured.inventory].sort((left, right) => left.path.localeCompare(right.path))) }));
  assert.deepEqual(terminalCandidateInventoryFromAuthority(f.authority), f.candidate);
  assert.equal(terminalWorkspaceInventoryDigest(f.candidate), f.authority.terminal_candidate_tree_digest);

});
test('Full-style managed assets are excluded while task candidate bytes remain exact', t => {
  const f = syntheticAuthority(t), candidate = terminalCandidateInventoryFromAuthority(f.authority);
  assert.ok(candidate.every(entry => entry.path !== 'BENCHMARK_TASK.md' && !f.authority.managed_asset_paths.includes(entry.path)));
  assert.ok(candidate.every(entry => !entry.path.startsWith('managed')));
  assert.deepEqual(candidate, f.candidate);
});
test('mixed-case and Unicode candidate metadata crosses the sealed portable protocol without weakening identity', t => {
  const f = syntheticAuthority(t), reconstruction = join(f.root, 'reconstructed');
  cpSync(join(f.terminalRoot, 'workspace'), reconstruction, { recursive: true });
  // Reconstructed files have sealed modes; original authority modes must restore.
  for (const entry of f.candidate.filter(entry => entry.file_type === 'regular_file' && entry.path.startsWith('workspace/')))
    chmodSync(join(reconstruction, entry.path.slice('workspace/'.length)), 0o444);
  const materialized = materializeTerminalCandidateAuthorityWorkspace({ evaluationRoot: f.root,
    terminal: { authority: f.authority, reconstructedWorkspace: reconstruction } });
  const expected = f.candidate.filter(entry => entry.path.startsWith('workspace/')).map(entry => ({
    path: entry.path.slice('workspace/'.length), file_type: entry.file_type === 'regular_file' ? 'file' : 'directory',
    mode: Number.parseInt(entry.mode, 8), bytes: entry.bytes, sha256: entry.sha256 === null ? null : `sha256:${entry.sha256}`,
  })).sort((left, right) => left.path.localeCompare(right.path));
  assert.deepEqual(materialized.portableEntries, expected);
  assert.equal(materialized.digest, canonicalDigest(expected));
});
test('true inventory or candidate digest changes still reject', t => {
  const f = syntheticAuthority(t);
  for (const change of [authority => { authority.base_inventory[0].sha256 = 'f'.repeat(64); },
    authority => { authority.base_inventory.pop(); }, authority => { authority.terminal_candidate_tree_digest = canonicalDigest('wrong'); }]) {
    const changed = structuredClone(f.authority); change(changed);
    assert.throws(() => terminalCandidateInventoryFromAuthority(changed), /inventory closure|original metadata closure/);
  }
});
test('changed reconstruction content or inventory still rejects before becoming candidate authority', t => {
  const f = syntheticAuthority(t);
  for (const change of ['content', 'inventory']) {
    const reconstruction = join(f.root, `changed-reconstruction-${change}`);
    cpSync(join(f.terminalRoot, 'workspace'), reconstruction, { recursive: true });
    writeFileSync(join(reconstruction, change === 'content' ? 'src/base.mjs' : 'undeclared.mjs'), 'different bytes\n');
    assert.throws(() => materializeTerminalCandidateAuthorityWorkspace({ evaluationRoot: f.root,
      terminal: { authority: f.authority, reconstructedWorkspace: reconstruction } }), /metadata authority workspace is inconsistent/);
    assert.equal(readFileSync(join(reconstruction, change === 'content' ? 'src/base.mjs' : 'undeclared.mjs'), 'utf8'), 'different bytes\n');
  }
});

test('copied symlink is rejected before changing external target bytes or mode', t => {
  const f = syntheticAuthority(t), reconstruction = join(f.root, 'symlink-reconstruction');
  cpSync(join(f.terminalRoot, 'workspace'), reconstruction, { recursive: true });
  const target = join(f.root, 'external-target.mjs'), bytes = Buffer.from('export const value = 1;\n');
  writeFileSync(target, bytes, { mode: 0o600 });
  const before = lstatSync(target).mode & 0o777;
  rmSync(join(reconstruction, 'src/base.mjs')); symlinkSync(target, join(reconstruction, 'src/base.mjs'));
  assert.throws(() => materializeTerminalCandidateAuthorityWorkspace({ evaluationRoot: f.root,
    terminal: { authority: f.authority, reconstructedWorkspace: reconstruction } }), /prohibited filesystem entry|symlink/);
  assert.deepEqual(readFileSync(target), bytes);
  assert.equal(lstatSync(target).mode & 0o777, before);
});
test('copy boundary refuses symlink evaluation or reconstructed workspace roots', t => {
  const f = syntheticAuthority(t), evaluationAlias = join(f.root, 'evaluation-alias'), reconstructionAlias = join(f.root, 'reconstruction-alias'), ancestorAlias = join(f.root, 'terminal-alias');
  symlinkSync(f.root, evaluationAlias); symlinkSync(join(f.terminalRoot, 'workspace'), reconstructionAlias); symlinkSync(f.terminalRoot, ancestorAlias);
  for (const [evaluationRoot, reconstructedWorkspace] of [[evaluationAlias, join(f.terminalRoot, 'workspace')], [f.root, reconstructionAlias],
    [join(evaluationAlias, 'terminal'), join(f.terminalRoot, 'workspace')], [f.root, join(ancestorAlias, 'workspace')]])
    assert.throws(() => materializeTerminalCandidateAuthorityWorkspace({ evaluationRoot,
      terminal: { authority: f.authority, reconstructedWorkspace } }), /symlink/);
});
test('metadata copy result cannot grant production execution authority', t => {
  const f = syntheticAuthority(t);
  const materialized = materializeTerminalCandidateAuthorityWorkspace({ evaluationRoot: f.root,
    terminal: { authority: f.authority, reconstructedWorkspace: join(f.terminalRoot, 'workspace') } });
  // The first provenance gate rejects this metadata record before any worker.
  assert.throws(() => executeProductionSealedEvaluator({ execution: materialized }), /requires a module-owned verified terminal candidate authority/);
});
