import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { managedSetupIdentities } from './ask-setup-apply-state.mjs';
import { buildNpmPackage } from './build-npm-package.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=(exe,args,options={})=>spawnSync(exe,args,{encoding:'utf8',maxBuffer:8*1024*1024,...options});
const okay=r=>{assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;};

test('actual npm archive: linked CLI, Gitless persistent workspace and adoption', {timeout:120000},()=>{
  const root=mkdtempSync(join(tmpdir(),'ask-package-test-'));
  try {
    const built=buildNpmPackage(ROOT);
    assert.ok(built.entries.length>0);
    for(const e of built.entries) assert.ok(!/^scripts\/(?:test-|test-fixtures\/)|^\.github\/|^dist\/|^benchmarks\/results\//u.test(e.path),e.path);
    const pack=JSON.parse(okay(run('npm',['pack','--ignore-scripts','--json','--pack-destination',root],{cwd:ROOT,env:{...process.env,npm_config_cache:join(root,'npm-cache')}})))[0];
    const published=pack.files.map(f=>f.path);
    assert.ok(published.includes('bin/ask.mjs'));assert.ok(published.includes('dist/npm-runtime-inventory.json'));
    assert.ok(!published.some(p=>p.includes('/.git/')||p.startsWith('scripts/')||p.startsWith('.github/')));
    const app=join(root,'application');mkdirSync(app);writeFileSync(join(app,'package.json'),' {"name":"ask-local-install-test","private":true} ');
    okay(run('npm',['install','--ignore-scripts','--no-audit','--no-fund',join(root,pack.filename)],{cwd:app,env:{...process.env,npm_config_cache:join(root,'npm-cache')}}));
    const linked=join(app,'node_modules','.bin','ask');
    const version=okay(run(process.execPath,[linked,'--version'],{cwd:app})).trim();assert.equal(version,'0.1.0-dev.0');
    assert.match(okay(run(process.execPath,[linked,'--help'])),/ask init/);
    assert.notEqual(run(process.execPath,[linked,'does-not-exist']).status,0);
    // No git executable is reachable by the application command. Node uses its
    // absolute path, so this also catches subprocess reliance on shell commands.
    const path=join(root,'node-only');mkdirSync(path);symlinkSync(process.execPath,join(path,'node'));
    const env={...process.env,PATH:path};const workspace=join(root,'persistent');
    const created=JSON.parse(okay(run(process.execPath,[linked,'init','--workspace',workspace],{env})));
    assert.equal(created.source_kind,'filesystem_snapshot');assert.match(created.source_revision,/^sha256:[a-f0-9]{64}$/u);
    assert.ok(existsSync(join(workspace,'source','.ask-source-version.json')));
    assert.ok(!existsSync(join(workspace,'source','.git')));
    assert.notEqual(run(process.execPath,[linked,'init','--workspace',workspace],{env}).status,0);
    const target=join(root,'target');mkdirSync(target);writeFileSync(join(target,'README.md'),'# Target\n');
    const plan=join(workspace,'state','setup-plan.json');
    const invoke=args=>run(process.execPath,[linked,'--workspace',workspace,...args],{env});
    const planned=JSON.parse(okay(invoke(['setup','plan','--target',target,'--adapter','codex','--profile','minimal','--output',plan,'--json'])));
    assert.ok(planned);
    const applied=JSON.parse(okay(invoke(['setup','apply','--target',target,'--plan',plan,'--json'])));
    assert.equal(applied.status,'applied');
    assert.equal(managedSetupIdentities(target)[0].source_revision,created.source_revision);
    const challenges=JSON.parse(okay(invoke(['evaluate','challenge-list'])));
    assert.ok(challenges.some(c=>c.id==='rc01-shared-review-platform'));
    assert.ok(existsSync(join(workspace,'source','benchmarks','challenge-candidates','review-ceiling-v1','workspace','task.md')));
    assert.ok(existsSync(join(target,'.agent-spectrum-kernel','codex-install-state.json')));
    const copy=readFileSync(join(workspace,'source','skills','review-router','SKILL.md'));
    rmSync(join(app,'node_modules'),{recursive:true});rmSync(join(root,'npm-cache'),{recursive:true,force:true});
    // The initialized runtime survives removal of the temporary npm installation.
    const durable=join(workspace,'source','scripts','ask-package-cli.mjs');
    assert.equal(okay(run(process.execPath,[durable,'--version'],{env})).trim(),version);
    assert.deepEqual(readFileSync(join(workspace,'source','skills','review-router','SKILL.md')),copy);
    console.log(JSON.stringify({npm_archive_bytes:pack.size,unpacked_bytes:pack.unpackedSize,files:pack.entryCount,runtime_bytes:built.total_bytes}));
  }finally{rmSync(root,{recursive:true,force:true});}
});
