// Authoring tool. The runtime reads checked-in inventories and never reseals input.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { primaryRevisionTaskText } from './evaluation-task-inputs.mjs';

const source = resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--write'), 'use --write to replace the checked-in seals');
const write = args.length === 1;
const catalog = JSON.parse(readFileSync(join(source, 'benchmarks/portfolio-catalog.json')));
for (const { fixture_id: id } of catalog.fixtures.filter(row => row.fixture_role === 'primary')) {
  const inherited = join(source, 'benchmarks/fixtures/checkpoint-b2', id);
  const revision = join(source, 'benchmarks/task-revisions', id);
  const base = JSON.parse(readFileSync(join(inherited, 'input-manifest.json'))).fixtures[id];
  const rubricBytes = readFileSync(join(revision, 'rubric.json'));
  const rubric = JSON.parse(rubricBytes);
  const files = new Map();
  for (const row of base.files) {
    const bytes = readFileSync(join(inherited, row.path));
    assert.equal(hash(bytes), row.sha256, `inherited input drift: ${id}/${row.path}`);
    if (row.path !== 'task.md') files.set(row.path, { ...row, source: 'inherited' });
  }
  const task = Buffer.from(primaryRevisionTaskText(readFileSync(join(revision, 'task.md'), 'utf8'), rubric.criteria));
  files.set('task.md', { path: 'task.md', bytes: task.length, sha256: hash(task), source: 'revision' });
  function addWorkspace(directory) {
    for (const entry of readdirSync(join(revision, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) addWorkspace(path);
      else {
        assert.ok(entry.isFile(), `unsupported revision input: ${path}`);
        const bytes = readFileSync(join(revision, path));
        files.set(path, { path, bytes: bytes.length, sha256: hash(bytes), source: 'revision' });
      }
    }
  }
  if (existsSync(join(revision, 'workspace'))) addWorkspace('workspace');
  const { allowed_candidate_paths: allowed } = JSON.parse(readFileSync(join(inherited, 'evidence-map.json'))).scope_boundary_authority;
  const manifest = { id, version: 'task-revision-1', rubric_sha256: hash(rubricBytes),
    editable: [...new Set([...allowed, ...(rubric.additional_editable_paths ?? [])])].sort(),
    files: [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
  const path = join(revision, 'input-manifest.json');
  const bytes = JSON.stringify(manifest, null, 2) + '\n';
  if (write) writeFileSync(path, bytes);
  else assert.equal(readFileSync(path, 'utf8'), bytes, `stale revision manifest: ${id}`);
}
console.log(write ? 'Wrote current primary revision inventories.' : 'Verified current primary revision inventories.');
