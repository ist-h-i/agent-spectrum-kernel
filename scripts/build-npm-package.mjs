#!/usr/bin/env node
// Package assembly is a build-time operation. The installed package has no
// lifecycle hooks and never discovers or downloads extra code at execution time.
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUNTIME_ENTRIES = [
  'scripts/ask-package-cli.mjs', 'scripts/ask-package-workspace.mjs',
  'scripts/ask-package-loop-prepare.mjs',
  'scripts/ask-setup.mjs', 'scripts/supervised-instruction-loop-cli.mjs',
  'scripts/instruction-environment-cli.mjs', 'scripts/install-ask-core-bundle.mjs',
  'scripts/install-kernel.mjs', 'scripts/install-codex-adapter.mjs', 'scripts/install-claude-adapter.mjs',
  'scripts/practical-evaluation-cli.mjs',
];
// These operate on a complete developer checkout, not an installed package.
// The Git-backed route resolves them from that checkout when explicitly selected.
const DEVELOPER_ONLY = new Set(['scripts/validate-repo.mjs',
  'scripts/update-adapter-runtime-fixtures.mjs', 'scripts/update-claude-fixed-entry-fixtures.mjs',
  'scripts/update-codex-compact-fixtures.mjs']);
const toPosix = p => p.split(sep).join('/');
const within = (root, path) => { const rel = relative(root, path); return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
const forbidden = p => /^benchmarks\/challenge-candidates\/review-ceiling-v1\/calibration-(?:report\.md|summary\.json)$/u.test(p) || /^(?:dist|\.npm-dist-[^/]+)(?:\/|$)/u.test(p) || p.split('/').some(part => ['.git', 'node_modules', '.env', '.npmrc'].includes(part)) || /^scripts\/(?:test-|test-fixtures\/)/u.test(p) || /^(?:benchmarks\/(?:results|review-archives)\/|\.github\/)/u.test(p);

export function runtimePackageFiles(root = ROOT) {
  root = resolve(root);
  const selected = new Set(), queue = [];
  const add = path => {
    path = toPosix(path);
    if (selected.has(path) || DEVELOPER_ONLY.has(path) || forbidden(path)) return;
    const absolute = resolve(root, path);
    assert.ok(within(root, absolute), `package dependency escapes source: ${path}`);
    if (!existsSync(absolute)) return;
    const stat = lstatSync(absolute);
    assert.ok(!stat.isSymbolicLink(), `package symlink is forbidden: ${path}`);
    if (stat.isDirectory()) { for (const name of readdirSync(absolute).sort()) add(`${path}/${name}`); return; }
    assert.ok(stat.isFile(), `package special file is forbidden: ${path}`);
    selected.add(path); queue.push(path);
  };
  for (const path of ['LICENSE', 'AGENTS.md', 'CUSTOM_INSTRUCTIONS.md', 'manifest.json',
    'skills', 'adapters', 'schemas', 'products', 'docs/ai',
    'benchmarks/fixtures', 'benchmarks/contracts', 'benchmarks/schemas',
    'benchmarks/challenge-candidates',
    'docs/fixtures/asset-registry', 'docs/fixtures/adapter-runtime-profiles.json', 'docs/npm-distribution.md', 'docs/npm-distribution-ja.md', 'docs/npm-loop-spec-example.mjs',
    ...RUNTIME_ENTRIES]) { assert.ok(existsSync(join(root,path)), `required package root missing: ${path}`); add(path); }
  while (queue.length) {
    const path = queue.shift();
    if (!/\.(?:mjs|js|py|json|md)$/u.test(path)) continue;
    const text = readFileSync(join(root,path),'utf8');
    // Covers imports and static process/file pins, including arrays of sibling
    // script names. Dynamic path families are explicit roots above (adapters,
    // skills and schemas); integration tests exercise the assembled archive.
    for (const match of text.matchAll(/['"`]([^'"`\n]+\.(?:mjs|js|py|json|md))['"`]/gu)) {
      const name = match[1];
      if (name.includes('${') || name.includes(':') || isAbsolute(name) || name.includes('\\')) continue;
      for (const absolute of [resolve(root,name), resolve(root,dirname(path),name)]) {
        if (within(root,absolute)) add(toPosix(relative(root,absolute)));
      }
    }
    if (path.endsWith('.md')) for (const match of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/gu)) {
      const name = match[1];
      if (name.includes(':') || isAbsolute(name)) continue;
      const absolute = resolve(root,dirname(path),name);
      if (within(root,absolute) && /\.(?:json|md)$/u.test(name)) add(toPosix(relative(root,absolute)));
    }
  }
  return [...selected].sort();
}

export function buildNpmPackage(root = ROOT) {
  root = resolve(root);
  const files = runtimePackageFiles(root);
  const output = join(root,'dist'), staging = join(root,`.npm-dist-${process.pid}`);
  assert.ok(!existsSync(staging), 'package staging already exists');
  mkdirSync(staging);
  try {
    const entries = [];
    for (const path of files) {
      const source = join(root,path), target = join(staging,path);
      mkdirSync(dirname(target),{recursive:true}); cpSync(source,target,{dereference:false});
      const bytes = readFileSync(target);
      entries.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    const manifest = JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
    const inventory = {schema_version:'1.0.0',package_name:manifest.name,package_version:manifest.version,
      source_manifest_version:JSON.parse(readFileSync(join(root,'manifest.json'),'utf8')).version,
      entries,total_bytes:entries.reduce((n,e)=>n+e.bytes,0)};
    writeFileSync(join(staging,'npm-runtime-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
    // Only the designated generated directory is replaced, never source assets.
    if (existsSync(output)) { assert.ok(lstatSync(output).isDirectory() && !lstatSync(output).isSymbolicLink(),'dist must be a real directory'); rmSync(output,{recursive:true}); }
    renameSync(staging,output);
    return inventory;
  } finally { if(existsSync(staging))rmSync(staging,{recursive:true}); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = buildNpmPackage();
  console.log(JSON.stringify({files:result.entries.length,unpacked_runtime_bytes:result.total_bytes,package_version:result.package_version}));
}
