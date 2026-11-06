// Paired lease for exact instruction paths. This module owns no adoption or
// rollback decision; callers must first verify the existing Evolution closure.
import assert from 'node:assert/strict';
import { existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalDigest, parseJsonRejectDuplicateKeys, readStableBytes } from './content-addressed-store.mjs';
import { assertSetupWritePaths, SETUP_STATE_PATHS } from './ask-setup-apply-state.mjs';
import { instructionBytesDigest } from './instruction-environment.mjs';
import { buildCodexProjectionPlan } from './install-codex-adapter.mjs';
import { buildClaudeProjectionPlan, normalizeClaudeManagedHooks } from './install-claude-adapter.mjs';
import { extractManagedBlock, hashText, readGitRevision } from './installer-lifecycle.mjs';
export const ENVIRONMENT_OWNER_JOURNAL = '.agent-spectrum-kernel/personal-prompt-target-state.json.operation.json';
const source = resolve(import.meta.dirname, '..');
const digest = bytes => instructionBytesDigest(bytes);
export const ownerStateBytes = state => Buffer.from(JSON.stringify(state, null, 2) + '\n');
const statePath = adapter => `.agent-spectrum-kernel/${adapter === 'codex' ? 'codex' : 'claude'}-install-state.json`;
const allFiles = environment => [...environment.bindings.flatMap(b => b.files).map(f => f.target), ...environment.support.map(f => f.path)];
const skills = environment => [...new Set(allFiles(environment).map(path => path.match(/^\.(?:agents|claude)\/skills\/([^/]+)\/SKILL\.md$/)?.[1]).filter(Boolean))].sort();
function initialOwner(root, adapter, bytes) {
  const state = parseJsonRejectDuplicateKeys(bytes, 'normal environment owner');
  assert.equal(state.schema_version, 3); assert.equal(state.install_status, 'installed');
  assert.equal(state.installer, adapter === 'codex' ? 'agent-spectrum-codex-adapter' : 'agent-spectrum-claude-adapter');
  assert.equal(state.adapter?.name, state.installer); assert.equal(state.selected_profile, 'full', 'ownership transfer currently requires a full normal adapter projection');
  assert.equal(state.source?.git_revision, readGitRevision(source), 'normal owner source must match the reviewed current checkout');
  assert.ok(!state.personal_prompt_delegation && !state.instruction_environment_delegation, 'normal instruction owner already delegated');
  const projection = adapter === 'codex' ? buildCodexProjectionPlan({ profileName: 'full' }) : buildClaudeProjectionPlan({ profileName: 'full' });
  assert.equal(state.projection_plan?.fingerprint, projection.fingerprint, 'normal owner projection drift');
  const selected = adapter === 'codex' ? projection.skills : projection.selectedSkills;
  assert.deepEqual([...state.selected_skills].sort(), [...selected].sort());
  assert.deepEqual([...state.installed_skills].sort(), [...selected].sort());
  const paths = [...Object.keys(state.managed_files), ...Object.keys(state.managed_partial_files ?? {}), ...Object.values(state.managed_blocks ?? {}).map(b => b.path)];
  assertSetupWritePaths(root, paths);
  return state;
}
function checkInitialBytes(root, original, transferred) {
  for (const [path, record] of Object.entries(original.managed_files)) {
    if (transferred?.has(path)) continue;
    assert.equal(digest(readStableBytes(join(root, path), 'normal owner file')), `sha256:${record.sha256}`, 'normal owned file drift');
  }
  for (const [path, record] of Object.entries(original.managed_partial_files ?? {})) {
    assert.equal(record.kind, 'claude_settings', 'unsupported normal partial ownership kind');
    const settings = parseJsonRejectDuplicateKeys(readStableBytes(join(root, path), 'normal partial owner file'), 'normal partial owner settings');
    assert.equal(hashText(JSON.stringify(normalizeClaudeManagedHooks(settings.hooks ?? {}))), record.sha256, 'normal partial owned hook subset drift');
  }
  for (const block of Object.values(original.managed_blocks ?? {})) {
    assert.equal(hashText(extractManagedBlock(readStableBytes(join(root, block.path), 'normal owner block').toString('utf8')).content), block.sha256, 'normal owned block drift');
  }
}
export function delegatedEnvironmentOwner(original, lease, environment) {
  const transferred = new Set(lease.paths);
  return { ...original, managed_files: Object.fromEntries(Object.entries(original.managed_files).filter(([p]) => !transferred.has(p))),
    selected_skills: skills(environment), installed_skills: skills(environment),
    instruction_environment_delegation: { schema: 'ask.instruction-environment-owner@1', lease_id: lease.lease_id,
      owner_state_digest: lease.owner_state_digest, state_path: '.agent-spectrum-kernel/personal-prompt-target-state.json', paths: lease.paths } };
}
export function planEnvironmentOwnerLease({ root, adapter, paths, ownerStateDigest, receiptObjectDigest, environments, parentEnvironment }) {
  const ownerPath = statePath(adapter); assertSetupWritePaths(root, [...SETUP_STATE_PATHS]);
  const bytes = readStableBytes(join(root, ownerPath), 'normal owner state', 32 * 1024 * 1024);
  assert.equal(digest(bytes), ownerStateDigest, 'independent exact normal owner state pin required');
  const original = initialOwner(root, adapter, bytes); checkInitialBytes(root, original);
  const parentPaths = new Set(allFiles(parentEnvironment).filter(p => /^\.(?:agents|claude)\/(?:skills|prompts|commands)\//.test(p)));
  const ownedInstructions = Object.keys(original.managed_files).filter(p => /^\.(?:agents|claude)\/(?:skills|prompts|commands)\//.test(p));
  // All active instruction files participate; changing a hidden retained skill
  // or leaving an old capability behind cannot be called a complete environment.
  assert.deepEqual([...parentPaths].sort(), ownedInstructions.sort(), 'baseline must cover the complete normal instruction owner');
  assert.deepEqual(skills(parentEnvironment), [...original.selected_skills].sort(), 'parent selected capability inventory mismatch');
  const others = SETUP_STATE_PATHS.filter(p => p !== ownerPath && existsSync(join(root, p))).map(path => ({ path,
    raw_digest: digest(readStableBytes(join(root, path), 'other normal owner state', 32 * 1024 * 1024)) }));
  const base = { schema: 'ask.instruction-environment-lease@1', adapter, owner_path: ownerPath, owner_state_digest: ownerStateDigest,
    original_owner_state_base64: bytes.toString('base64'), paths: [...paths].sort(), other_owner_states: others,
    protected_partial_files: Object.keys(original.managed_partial_files ?? {}).sort().map(path => ({ path,
      raw_digest: digest(readStableBytes(join(root, path), 'protected partial owner bytes')) })),
    receipt_object_digest: receiptObjectDigest, environments };
  return { ...base, lease_id: canonicalDigest(base) };
}
export function verifyEnvironmentOwnerLease({ root, lease, ownerStateDigest, environment }) {
  const { lease_id, ...base } = lease; assert.equal(lease_id, canonicalDigest(base), 'environment owner lease identity drift');
  assert.equal(lease.schema, 'ask.instruction-environment-lease@1'); assert.equal(lease.owner_path, statePath(lease.adapter));
  assert.equal(lease.owner_state_digest, ownerStateDigest, 'independent original owner pin required on every leased mutation');
  const bytes = Buffer.from(lease.original_owner_state_base64, 'base64'); assert.equal(bytes.toString('base64'), lease.original_owner_state_base64);
  assert.equal(digest(bytes), ownerStateDigest, 'original owner snapshot drift');
  const original = initialOwner(root, lease.adapter, bytes);
  const delegated = ownerStateBytes(delegatedEnvironmentOwner(original, lease, environment));
  assert.ok(readStableBytes(join(root, lease.owner_path), 'delegated normal owner state', 32 * 1024 * 1024).equals(delegated), 'delegated normal owner state drift');
  checkInitialBytes(root, original, new Set(lease.paths));
  assert.deepEqual(lease.protected_partial_files.map(f => f.path), Object.keys(original.managed_partial_files ?? {}).sort());
  for (const file of lease.protected_partial_files) assert.equal(digest(readStableBytes(join(root, file.path), 'protected partial owner bytes')), file.raw_digest, 'partial owner settings changed during lease');
  const allowed = new Set([lease.owner_path, ...lease.other_owner_states.map(o => o.path)]);
  for (const path of SETUP_STATE_PATHS) assert.ok(!existsSync(join(root, path)) || allowed.has(path), 'new competing normal owner');
  for (const item of lease.other_owner_states) assert.equal(digest(readStableBytes(join(root, item.path), 'protected normal owner state', 32 * 1024 * 1024)), item.raw_digest, 'protected owner state drift');
  return { original, originalBytes: bytes, delegatedBytes: delegated };
}
export function verifyReturnedEnvironmentOwner({ root, lease, ownerStateDigest }) {
  const bytes = Buffer.from(lease.original_owner_state_base64, 'base64'); assert.equal(digest(bytes), ownerStateDigest);
  assert.ok(readStableBytes(join(root, lease.owner_path), 'returned normal owner state', 32 * 1024 * 1024).equals(bytes), 'returned owner state drift');
  checkInitialBytes(root, initialOwner(root, lease.adapter, bytes));
}
