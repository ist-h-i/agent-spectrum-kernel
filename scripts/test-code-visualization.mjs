import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderGuide } from '../skills/code-visualization/references/render-guide.mjs';
import { buildClaudeProjectionPlan } from './install-claude-adapter.mjs';
import { buildCodexProjectionPlan } from './install-codex-adapter.mjs';
import { runtimePackageFiles } from './build-npm-package.mjs';

const repositoryRoot = mkdtempSync(join(tmpdir(),'ask-guide-source-'));
test.after(() => rmSync(repositoryRoot, {recursive:true, force:true}));
const git = (...args) => {
  const r = spawnSync('git', ['-C',repositoryRoot,'-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
git('init','-q');
mkdirSync(join(repositoryRoot,'src'));
writeFileSync(join(repositoryRoot,'src/b & c.ts'),'one\ntwo\nbase line 3\nfour\nfive\n');
git('add','src');
git('commit','-qm','fixture base');
const baseRevision = git('rev-parse','HEAD');
writeFileSync(join(repositoryRoot,'src/b & c.ts'),'one\ntwo\n<example> \'quoted\' & text\nfour\nfive\n');
symlinkSync('b & c.ts',join(repositoryRoot,'src/link.ts'));
git('add','src');
git('commit','-qm','fixture revision');
const revision = git('rev-parse','HEAD');
const render = guide => renderGuide(guide, {repositoryRoot});
const file = { label: 'Test file', path: 'src/b & c.ts', startLine: 3, endLine: 5 };
const step = { label: 'Validate input', detail: 'Reject or pass through.', status: 'code', evidence: [file] };
const fixture = () => ({
  mode: 'catch-up', title: 'Read the code', purpose: 'Trace the API request.', scope: 'API only', revision,
  githubRepository: 'acme/services', flows: [{ title: 'Request', summary: 'API handles it first.', steps: [step] }],
  unknowns: ['Storage was not inspected.'],
});
const renderer = fileURLToPath(new URL('../skills/code-visualization/references/render-guide.mjs', import.meta.url));

test('catch-up works without a PR and points to exact evidence', () => {
  const guide = fixture();
  const html = render(guide);
  assert.match(html, /Code catch-up/);
  assert.match(html, /href="#flow-1"/);
  assert.match(html, /href="#overview"/);
  assert.match(html, new RegExp(`https://github.com/acme/services/blob/${revision}/src/b%20%26%20c.ts#L3-L5`));
  delete guide.githubRepository;
  const offline = render(guide);
  assert.doesNotMatch(offline, /https:\/\//u);
  assert.match(offline, /src\/b &amp; c.ts:L3-L5/);
  assert.match(offline, /3  &lt;example&gt; &#39;quoted&#39; &amp; text/);
});
test('PR has separate pinned commits and local branching controls', () => {
  const guide = fixture();
  guide.mode = 'pr';
  guide.baseRevision = baseRevision;
  guide.flows[0].change = 'modified';
  guide.flows[0].beforeSteps = [{ ...step, delta:'unchanged' }];
  guide.flows[0].steps = [{ ...step, delta:'changed', branches: [{ label: 'When invalid', detail: 'The rejection run was observed.', status: 'executed',
    evidence: [{ label: 'Run log', run: 'node --test / local log run 3' }] }] }];
  const html = render(guide);
  assert.match(html, new RegExp(`/blob/${baseRevision}/`));
  assert.match(html, new RegExp(`/blob/${revision}/`));
  assert.match(html, /<details class="branch">/);
  assert.match(html, /Run observed/);
  assert.match(html, /delta unchanged.*Unchanged/);
  assert.match(html, /delta changed.*Changed/);
  assert.match(html, /turn.*When invalid/);
  assert.match(html, /node --test \/ local log run 3/u);
  assert.match(html, /What remains unknown/);
});
test('invalid paths, unsupported statuses and missing proof are refused', () => {
  for (const path of ['../outside', '/absolute', 'a//b', 'a/./x', 'a\\b', 'file\u0000name']) {
    const guide = fixture();
    guide.flows[0].steps = [{ ...step, evidence: [{ ...file, path }] }];
    assert.throws(() => render(guide), /evidence.path/);
  }
  for (const [patch, reason] of [[{status:'executed'}, /requires a run/],
    [{evidence:[]}, /requires a file/], [{status:'verified'}, /step status/],
    [{evidence:[{...file,at:'base'}]}, /own side/], [{evidence:[{...file,startLine:0}]}, /evidence.lines/]]) {
    const guide = fixture();
    guide.flows[0].steps = [{ ...step, ...patch }];
    assert.throws(() => render(guide), reason);
  }
  for (const githubRepository of ['x/..', 'x/@host', 'x/y?q=1', 'javascript:5']) {
    assert.throws(() => render({ ...fixture(), githubRepository }), /githubRepository/);
  }
  assert.throws(() => render({ ...fixture(), mode:'pr' }), /baseRevision/);
  assert.throws(() => render({ ...fixture(), mode:'pr', baseRevision:revision }), /baseRevision/);
  assert.throws(() => render({...fixture(), revision:'7'.repeat(40)}),/Git evidence unavailable/);
  for (const [changed, reason] of [
    [{path:'src/unknown.ts'}, /not a tracked regular file/],
    [{path:'src/link.ts'}, /not a tracked regular file/],
    [{endLine:6}, /line range does not exist/],
  ]) {
    const guide=fixture();
    guide.flows[0].steps=[{...step,evidence:[{...file,...changed}]}];
    assert.throws(() => render(guide),reason);
  }
});
test('PR changed, added and removed behaviors cannot silently omit a side', () => {
  const guide = { ...fixture(), mode:'pr', baseRevision };
  const flow=guide.flows[0];
  assert.throws(() => render(guide), /PR flow change/);
  flow.change='modified';
  assert.throws(() => render(guide), /needs both sides/);
  flow.beforeSteps=[{...step,delta:'unchanged',evidence:[{...file,at:'target'}]}];
  assert.throws(() => render(guide), /changed\/unchanged delta/);
  flow.steps=[{...step,delta:'changed'}];
  assert.throws(() => render(guide), /evidence requires a file on its own side/);
  flow.change='added';
  assert.throws(() => render(guide), /target steps only/);
  delete flow.beforeSteps;
  flow.steps=[step];
  assert.match(render(guide),/No equivalent behavior before this change/);
  flow.change='removed';
  flow.beforeSteps=[step];
  delete flow.steps;
  assert.match(render(guide),/This behavior was removed/);
});
test('markup-shaped input is inert and renderer adds no executable script', () => {
  const text = '<tag data-val="value">& words</tag>';
  const html = render({ ...fixture(), title:text, purpose:text, unknowns:[text] });
  assert.ok(html.includes('&lt;tag data-val=&quot;value&quot;&gt;&amp; words&lt;/tag&gt;'));
  assert.doesNotMatch(html, /<tag|<script|<iframe/u);
  assert.match(html, /default-src 'none'/);
});
test('CLI validates before writing and never overwrites an existing output', (t) => {
  const dir = mkdtempSync(join(tmpdir(),'ask-guide-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const input = join(dir,'spec.json'), output=join(dir,'guide.html');
  const run = () => spawnSync(process.execPath,[renderer,input,output,'--repo',repositoryRoot],{encoding:'utf8'});
  writeFileSync(input,'{}');
  assert.equal(run().status,1);
  assert.equal(existsSync(output),false);
  writeFileSync(input,JSON.stringify({...fixture(),language:'ja'}));
  assert.equal(run().status,0);
  const saved = readFileSync(output,'utf8');
  assert.match(saved, /コードのキャッチアップ/);
  assert.equal(run().status,1);
  assert.equal(readFileSync(output,'utf8'),saved);
});
test('both default host projections and npm sources include the renderer and skill', () => {
  for (const build of [buildClaudeProjectionPlan,buildCodexProjectionPlan]) for (const profileName of ['full', 'daily', 'implementation', 'review']) {
    const plan = build({profileName});
    assert.ok((plan.selectedSkills ?? plan.skills).includes('code-visualization'));
    assert.ok(plan.skillFiles.some(file => file.sourcePath.endsWith('code-visualization/references/render-guide.mjs')));
  }
  for (const path of ['SKILL.md','references/guide-input.md','references/render-guide.mjs']) {
    assert.ok(runtimePackageFiles().includes(`skills/code-visualization/${path}`));
  }
});
