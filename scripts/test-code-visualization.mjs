import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderGuide } from '../skills/code-visualization/references/render-guide.mjs';
import { buildClaudeProjectionPlan } from './install-claude-adapter.mjs';
import { buildCodexProjectionPlan } from './install-codex-adapter.mjs';
import { runtimePackageFiles } from './build-npm-package.mjs';

const revision = '1'.repeat(40);
const baseRevision = '2'.repeat(40);
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
  const html = renderGuide(guide);
  assert.match(html, /Code catch-up/);
  assert.match(html, /href="#flow-1"/);
  assert.match(html, /href="#overview"/);
  assert.match(html, new RegExp(`https://github.com/acme/services/blob/${revision}/src/b%20%26%20c.ts#L3-L5`));
  delete guide.githubRepository;
  const offline = renderGuide(guide);
  assert.doesNotMatch(offline, /https:\/\//u);
  assert.match(offline, /src\/b &amp; c.ts:L3-L5/);
});
test('PR has separate pinned commits and local branching controls', () => {
  const guide = fixture();
  guide.mode = 'pr';
  guide.baseRevision = baseRevision;
  guide.flows[0].beforeSteps = [step];
  guide.flows[0].steps = [{ ...step, branches: [{ label: 'When invalid', detail: 'The rejection run was observed.', status: 'executed',
    evidence: [{ label: 'Run log', run: 'node --test / local log run 3' }] }] }];
  const html = renderGuide(guide);
  assert.match(html, new RegExp(`/blob/${baseRevision}/`));
  assert.match(html, new RegExp(`/blob/${revision}/`));
  assert.match(html, /<details class="branch">/);
  assert.match(html, /Run observed/);
  assert.match(html, /node --test \/ local log run 3/u);
  assert.match(html, /What remains unknown/);
});
test('invalid paths, unsupported statuses and missing proof are refused', () => {
  for (const path of ['../outside', '/absolute', 'a//b', 'a/./x', 'a\\b', 'file\u0000name']) {
    const guide = fixture();
    guide.flows[0].steps = [{ ...step, evidence: [{ ...file, path }] }];
    assert.throws(() => renderGuide(guide), /evidence.path/);
  }
  for (const [patch, reason] of [[{status:'executed'}, /requires a run/],
    [{evidence:[]}, /requires a file/], [{status:'verified'}, /step status/],
    [{evidence:[{...file,at:'base'}]}, /evidence.at/], [{evidence:[{...file,startLine:0}]}, /evidence.lines/]]) {
    const guide = fixture();
    guide.flows[0].steps = [{ ...step, ...patch }];
    assert.throws(() => renderGuide(guide), reason);
  }
  for (const githubRepository of ['x/..', 'x/@host', 'x/y?q=1', 'javascript:5']) {
    assert.throws(() => renderGuide({ ...fixture(), githubRepository }), /githubRepository/);
  }
  assert.throws(() => renderGuide({ ...fixture(), mode:'pr' }), /baseRevision/);
  assert.throws(() => renderGuide({ ...fixture(), mode:'pr', baseRevision:revision }), /baseRevision/);
});
test('markup-shaped input is inert and renderer adds no executable script', () => {
  const text = '<tag data-val="value">& words</tag>';
  const html = renderGuide({ ...fixture(), title:text, purpose:text, unknowns:[text] });
  assert.ok(html.includes('&lt;tag data-val=&quot;value&quot;&gt;&amp; words&lt;/tag&gt;'));
  assert.doesNotMatch(html, /<tag|<script|<iframe/u);
  assert.match(html, /default-src 'none'/);
});
test('CLI validates before writing and never overwrites an existing output', (t) => {
  const dir = mkdtempSync(join(tmpdir(),'ask-guide-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const input = join(dir,'spec.json'), output=join(dir,'guide.html');
  const run = () => spawnSync(process.execPath,[renderer,input,output],{encoding:'utf8'});
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
