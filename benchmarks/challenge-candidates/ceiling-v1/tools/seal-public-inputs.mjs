#!/usr/bin/env node
// Maintainer utility; never copied into a measured workspace.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { candidates, inventory, isSubmission, root, version } from './public-workspace.mjs';
import { canonicalDigest } from '../../../../scripts/ask-benchmark-materialize.mjs';

const write = process.argv.slice(2).join(' ') === '--write';
if (process.argv.length > 2 && !write) throw new Error('use --write to update manifests; default checks only');
if (write) mkdirSync(resolve(root, 'input-manifests'), { recursive: true });
for (const candidate of candidates()) {
  for (const name of ['scenario.mjs', 'scenario-protocol.mjs', 'scenario-engine.mjs', 'scenario-worker.mjs', 'scenario-reporter.mjs']) {
    const bytes = readFileSync(resolve(root, 'runtime', name));
    const target = resolve(root, 'workspaces', candidate.id, 'harness', name);
    if (write) writeFileSync(target, bytes);
    else if (!readFileSync(target).equals(bytes)) throw new Error(`stale scenario runtime: ${candidate.id}/${name}`);
  }
  const capabilityBytes = readFileSync(resolve(root, 'runtime/capabilities', candidate.id + '.json'));
  const capabilityTarget = resolve(root, 'workspaces', candidate.id, 'harness/scenario-capabilities.json');
  if (write) writeFileSync(capabilityTarget, capabilityBytes);
  else if (!readFileSync(capabilityTarget).equals(capabilityBytes)) throw new Error(`stale scenario capabilities: ${candidate.id}`);
  const contract = readFileSync(resolve(root, 'runtime/scenario-api.md'));
  const contractTarget = resolve(root, 'workspaces', candidate.id, 'spec/scenario-tests.md');
  if (write) writeFileSync(contractTarget, contract);
  else if (!readFileSync(contractTarget).equals(contract)) throw new Error(`stale scenario contract: ${candidate.id}`);
  const task = readFileSync(resolve(root, candidate.task_path));
  const files = [...inventory(resolve(root, 'workspaces', candidate.id)), {
    path: 'task.md', sha256: createHash('sha256').update(task).digest('hex'), bytes: task.length,
  }].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { version, id: candidate.id, namespace: 'ceiling-v1',
    scope: 'public task.md and standalone workspace; no git history or evaluator',
    runtime: 'v24.21.0', input_digest: canonicalDigest(files),
    protected: files.filter(file => !isSubmission(file.path)).map(file => file.path),
    submission: ['src/**', 'test/added/**', 'RESULT.md'], files };
  const path = resolve(root, 'input-manifests', candidate.id + '.json');
  const bytes = JSON.stringify(manifest, null, 2) + '\n';
  if (write) writeFileSync(path, bytes);
  else if (readFileSync(path, 'utf8') !== bytes) throw new Error(`stale public manifest: ${candidate.id}`);
  console.log(`${write ? 'sealed' : 'verified'} ${candidate.id} ${manifest.input_digest}`);
}
