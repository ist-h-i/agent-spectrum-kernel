// Authoring tool. Execution consumes the exact checked-in manifests.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listEvaluationTasks, readEvaluationTaskRegistrations } from './evaluation-task-catalog.mjs';
import { evaluationDigest, evaluationSource, listEvaluationTree, primaryRevisionTaskText, readEvaluationInventory } from './evaluation-task-inputs.mjs';

const args = process.argv.slice(2);
const write = args[0] === '--write';
const assetsRoot = args[0] === '--assets-root' ? args[1] : undefined;
assert.ok(args.length === 0 || (write && args.length === 1) || (assetsRoot && args.length === 2),
  'use --write to reseal, or --assets-root <directory> to verify the protected input alongside public inputs');

function modePaths(root, input, mode) {
  if (input.kind === 'primary') return [mode.task_path, ...listEvaluationTree(root, 'workspace')].sort();
  if (input.kind === 'staged') return listEvaluationTree(root);
  const otherPrompts = new Set(Object.values(input.modes).map(row => row.prompt_path).filter(path => path !== mode.prompt_path));
  return [...listEvaluationTree(root, 'public/common'), ...listEvaluationTree(root, mode.working_directory)]
    .filter(path => !otherPrompts.has(path)).sort();
}

for (const { id, input } of readEvaluationTaskRegistrations().tasks) {
  if (input.kind === 'private') continue;
  const root = join(evaluationSource, input.root);
  const rubricBytes = input.kind === 'primary' ? readFileSync(join(root, 'rubric.json')) : null;
  const rubric = rubricBytes && JSON.parse(rubricBytes);
  const modes = Object.fromEntries(Object.entries(input.modes).map(([key, mode]) => [
    key, { ...mode, files: modePaths(root, input, mode).map(path => {
      let bytes = readFileSync(join(root, path));
      if (rubric && path === mode.task_path) bytes = Buffer.from(primaryRevisionTaskText(bytes.toString('utf8'), rubric.criteria));
      return { path, bytes: bytes.length, sha256: evaluationDigest(bytes).slice(7) };
    }) },
  ]));
  const manifest = {
    kind: 'evaluation_input_manifest_v2', id, version: input.version, modes,
    ...(rubric ? { rubric_digest: evaluationDigest(rubricBytes),
      editable: [...new Set([...input.editable, ...(rubric.additional_editable_paths ?? [])])].sort() } : {}),
  };
  const target = join(evaluationSource, 'benchmarks/task-revisions', id, 'input-manifest.json');
  const bytes = JSON.stringify(manifest, null, 2) + '\n';
  if (write) writeFileSync(target, bytes);
  else assert.equal(readFileSync(target, 'utf8'), bytes, `stale evaluation input manifest: ${id}`);
}

if (assetsRoot) {
  for (const task of listEvaluationTasks().filter(task => task.input.kind === 'private')) {
    for (const deliveryMode of task.input.delivery_modes) readEvaluationInventory(task, { assetsRoot, deliveryMode });
  }
}
console.log(write ? 'Wrote current evaluation inventories.' : 'Verified current evaluation inventories.');
