import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const reference = (side='target', step=0, branch) => ({side,step,...(branch===undefined ? {} : {branch})});
const object = (id, stage, refs, shape='artifact', extra={}) => ({id,stage,refs,shape,label:id,...extra});
const basic = (side='target') => ({nodes:[object('request',0,[reference(side)],'request')],
  cases:[{label:'Ordinary request',[side]:['request']}]});
const fixture = () => ({
  mode: 'catch-up', title: 'Read the code', purpose: 'Trace the API request.', scope: 'API only', revision,
  githubRepository: 'acme/services', flows: [{ title: 'Request', summary: 'API handles it first.', steps: [step], visual:basic() }],
  unknowns: ['Storage was not inspected.'],
});
const renderer = fileURLToPath(new URL('../skills/code-visualization/references/render-guide.mjs', import.meta.url));
const payload = html => JSON.parse(html.match(/<script id="visual-data" type="application\/json">(.+)<\/script>/u)[1]);

test('catch-up works without a PR and points to exact evidence', () => {
  const guide = fixture();
  const html = render(guide);
  assert.match(html, /Code catch-up/);
  assert.match(html, /<svg id="visual-map"/);
  assert.equal(payload(html).scenes[0].cases[0].target[0],'request');
  assert.match(html, new RegExp(`https://github.com/acme/services/blob/${revision}/src/b%20%26%20c.ts#L3-L5`));
  delete guide.githubRepository;
  const offline = render(guide);
  assert.doesNotMatch(offline, /https:\/\//u);
  assert.match(offline, /src\/b &amp; c.ts:L3-L5/);
  assert.match(offline, /3  &lt;example&gt; &#39;quoted&#39; &amp; text/);
});
test('a source directory inside the checkout uses repository-relative locators', () => {
  const fromSubdirectory = renderGuide(fixture(), { repositoryRoot:join(repositoryRoot,'src') });
  assert.equal(fromSubdirectory,render(fixture()));
});
test('PR has separate pinned commits and local branching controls', () => {
  const guide = fixture();
  guide.mode = 'pr';
  guide.baseRevision = baseRevision;
  guide.flows[0].change = 'modified';
  guide.flows[0].beforeSteps = [{ ...step, delta:'unchanged' }];
  guide.flows[0].steps = [{ ...step, delta:'changed', branches: [{ label: 'When invalid', detail: 'The rejection run was observed.', status: 'executed',
    evidence: [{ label: 'Run log', run: 'node --test / local log run 3' }] }] }];
  guide.flows[0].visual = {
    nodes:[object('request',0,[reference('base'),reference()],'request'),
      object('reject',1,[reference('target',0,0)],'stop')],
    cases:[{label:'When invalid',base:['request'],target:['request','reject']}],
  };
  const html = render(guide);
  assert.match(html, new RegExp(`/blob/${baseRevision}/`));
  assert.match(html, new RegExp(`/blob/${revision}/`));
  assert.match(html, /<details class="branch" open>/);
  assert.match(html, /Run observed/);
  assert.deepEqual(payload(html).scenes[0].nodes[0].refs.map(ref=>ref.delta),['unchanged','changed']);
  assert.equal(payload(html).scenes[0].nodes[1].shape,'stop');
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
  flow.visual=basic('base');
  assert.match(render(guide),/This behavior was removed/);
});
test('markup-shaped input stays inert and only the exact embedded player can execute', () => {
  const text = '<tag data-val="value">& words</tag>';
  const guide=fixture();
  const label='</script><img src=x onerror=a()>';
  guide.flows[0].visual.nodes[0].label=label;
  const html = render({ ...guide, title:text, purpose:text, unknowns:[text] });
  assert.ok(html.includes('&lt;tag data-val=&quot;value&quot;&gt;&amp; words&lt;/tag&gt;'));
  assert.doesNotMatch(html, /<tag|<iframe|<img /u);
  assert.equal(payload(html).scenes[0].nodes[0].label,label);
  const script = html.match(/<script>([\s\S]+)<\/script>/u)[1];
  const digest=createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes("script-src 'sha256-"+digest+"'"));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
});
test('scene inputs reject structural lies and wrong bindings before writing a page', () => {
  const flow=()=>fixture();
  for (const [mutate,expected] of [
    [g=>delete g.flows[0].visual,/nodes and cases/],
    [g=>g.flows[0].visual.nodes[0].refs[0].step=5,/unresolved step/],
    [g=>g.flows[0].visual.nodes[0].shape='svg',/label\/shape/],
    [g=>g.flows[0].visual.cases[0].target=['not-there'],/needs target evidence binding/],
    [g=>g.flows[0].visual.cases[0].overrides={request:{state:'empty'}},/empty object cannot receive/],
    [g=>g.flows[0].visual.nodes.push(object('another',0,[reference()])),/overlap/],
    [g=>g.flows[0].visual.cases[0].base=['request'],/absent base path/],
    [g=>g.flows[0].visual.nodes[0].d='<svg>',/object fields/],
  ]) {
    const guide=flow();mutate(guide);
    assert.throws(()=>render(guide),expected);
  }
  const guide={...flow(),mode:'pr',baseRevision};
  const data=guide.flows[0];
  data.change='modified';
  data.beforeSteps=[{...step,delta:'unchanged'}];data.steps=[{...step,delta:'changed'}];
  data.visual={nodes:[object('before',0,[reference('base')]),object('after',1,[reference()])],
    cases:[{label:'Different input',base:['before'],target:['after']}]};
  assert.throws(()=>render(guide),/same input object/);
});

test('another domain can model one unchanged identity, an excluded item, a zero result, and an absent result', () => {
  const guide=fixture(), flow=guide.flows[0];
  flow.title='Plan a library hold';
  flow.steps=[
    {...step,label:'Search card'},
    {...step,label:'Gateway response'},
    {...step,label:'Build hold count'},
    {...step,label:'Gateway not configured'},
    {label:'Live availability',detail:'The deployment or remote result was not observed.',status:'unknown'},
  ];
  const ID={id:'hold',label:'H-544'};
  flow.visual={nodes:[
    object('card',0,[reference()],'request'),
    object('gateway',1,[reference('target',1)],'service',{items:[ID,{id:'other',label:'H-555',excluded:true}]}),
    object('count',2,[reference('target',2)],'result',{items:[ID]}),
    object('not-configured',1,[reference('target',3)],'stop',{track:-1}),
    object('unverified',2,[reference('target',4)],'stop',{track:1}),
  ],cases:[
    {label:'Available',target:['card','gateway','count']},
    {label:'Zero matches',target:['card','gateway','count'],overrides:{count:{caption:'0 matches',items:[]}}},
    {label:'Not configured',target:['card','not-configured'],overrides:{count:{state:'empty',caption:'No result returned'}}},
    {label:'Actual deployment unknown',target:['card','gateway','unverified'],overrides:{gateway:{items:[]},count:{state:'empty',caption:'No observed result'}}},
  ]};
  const c=payload(render(guide)).scenes[0];
  assert.equal(c.nodes[0].items.length,0);
  assert.equal(c.nodes[1].items[0].id,c.nodes[2].items[0].id);
  assert.equal(c.nodes[1].items[1].excluded,true);
  assert.equal(c.cases[1].overrides[0].caption,'0 matches');
  assert.deepEqual(c.cases[1].overrides[0].items,[]);
  assert.equal(c.cases[2].overrides[0].state,'empty');
  assert.equal(c.nodes[3].refs[0].status,'code');
  assert.equal(c.nodes[4].refs[0].status,'unknown');
  flow.visual.nodes[2].items[0]={id:'hold',label:'H-777'};
  assert.throws(()=>render(guide),/changes its label/);
});
test('CLI validates before writing and never overwrites an existing output', (t) => {
  const dir = mkdtempSync(join(tmpdir(),'ask-guide-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const input = join(dir,'spec.json'), output=join(dir,'guide.html');
  const alias=join(dir,'render-alias.mjs');symlinkSync(renderer,alias);
  const run = () => spawnSync(process.execPath,[alias,input,output,'--repo',repositoryRoot],{encoding:'utf8'});
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
    for(const member of ['render-guide.mjs','scene-model.mjs','visual-player.js','visual-surface.css']) {
      assert.ok(plan.skillFiles.some(file => file.sourcePath.endsWith('code-visualization/references/'+member)));
    }
  }
  for (const path of ['SKILL.md','references/guide-input.md','references/render-guide.mjs','references/scene-model.mjs','references/visual-player.js','references/visual-surface.css','references/examples/pr497.json']) {
    assert.ok(runtimePackageFiles().includes(`skills/code-visualization/${path}`));
  }
});
