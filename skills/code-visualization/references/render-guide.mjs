import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileScene } from './scene-model.mjs';

const surface = readFileSync(new URL('./visual-surface.css', import.meta.url),'utf8');
const player = readFileSync(new URL('./visual-player.js', import.meta.url),'utf8');
const playerHash = createHash('sha256').update(player).digest('base64');
const encode = value => JSON.stringify(value).replace(/[<>&]/gu, char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));

const tags = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => value.replace(/[&<>"']/gu, char => tags[char]);
const sha = /^[0-9a-f]{40}$/iu;
const repository = /^[\w.-]+\/[\w.-]+$/u;
const i18n = {
  en: { pr: 'PR change map', catch: 'Code catch-up', scope: 'Scope', base: 'Before', target: 'After', path: 'Current flow', revision: 'Revision',
    code: 'From code', executed: 'Run observed', unknown: 'Not verified', overview: 'Flow overview',
    back: 'Back to overview', gaps: 'What remains unknown', branches: 'Branches', evidence: 'Evidence', excerpt: 'Source excerpt',
    noBefore: 'No equivalent behavior before this change.', noAfter: 'This behavior was removed.',
    case: 'Choose an input', scene: 'Flow', play: '▶ Play', pause: 'Ⅱ Pause', step: 'Step →', reset: '↶ Reset', position: 'Replay position',
    close: 'Close', hint: 'Select an object to see its role and the source excerpt.', baseShort: 'B', targetShort: 'A',
    halt: 'Stopped', inferred: 'Reconstructed from source code', notRun: 'Not a live trace or a speed measurement.', empty: 'No output returned',
    js: 'Open the file in a browser with JavaScript enabled to use the local view.' ,
    changed: 'Changed', unchanged: 'Unchanged', compare: 'Compare and inspect', inspect: 'Inspect this flow', metadata: 'Scope and commits' },
  ja: { pr: 'PRの変更マップ', catch: 'コードのキャッチアップ', scope: '対象範囲', base: '変更前', target: '変更後', path: '現在の流れ', revision: '対象コミット',
    code: 'コードから確認', executed: '実行を確認', unknown: '未確認', overview: '処理の全体像',
    back: '全体像へ戻る', gaps: '未確認の事項', branches: '分岐', evidence: '根拠', excerpt: 'ソース抜粋',
    noBefore: '変更前に対応する挙動はありません。', noAfter: 'この挙動は削除されました。',
    case: '入力を選ぶ', scene: '処理を選ぶ', play: '▶ 再生', pause: 'Ⅱ 停止', step: '一歩 →', reset: '↶ 初め', position: '再生位置',
    close: '閉じる', hint: '図のオブジェクトを選ぶと、役割とソースの抜粋を開けます。', baseShort: '旧', targetShort: '新',
    halt: '停止', inferred: 'コードから再構成', notRun: '実行ログや処理速度を表すものではありません。', empty: '結果は返りません',
    js: 'JavaScriptが有効なブラウザーで開くと、ローカルで図を操作できます。',
    changed: '変更あり', unchanged: '変更なし', compare: '前後を比較し、根拠を見る', inspect: '処理の詳細と根拠を見る', metadata: '対象範囲とコミット' },
};

function requireValue(condition, field) {
  if (!condition) throw new Error(`Invalid guide input: ${field}`);
}
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const positiveInt = value => Number.isSafeInteger(value) && value > 0;
const list = (value, label, allowEmpty = false) => {
  requireValue(Array.isArray(value) && (allowEmpty || value.length > 0), label);
  return value;
};
// Git receives one validated object expression, never shell input or an agent-supplied snippet.
function gitEvidence(repositoryRoot) {
  const type = commit => readGit(['cat-file', '-t', commit]).toString('utf8').trim();
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' };
  const cache = new Map();
  let root = repositoryRoot;
  function readGit(args) {
    const result = spawnSync('git', ['--no-pager', '-C', root, ...args], {
      env, maxBuffer: 1024 * 1024, timeout: 5000,
    });
    requireValue(result.status === 0 && !result.error, 'Git evidence unavailable or larger than 1 MiB');
    return result.stdout;
  }
  root = readGit(['rev-parse', '--show-toplevel']).toString('utf8').replace(/\r?\n$/u, '');
  return {
    commit(commit) { requireValue(type(commit) === 'commit', 'revision does not denote a Git commit'); },
    blob(commit, path) {
      // The tree entry must be a tracked regular file; don't render symlinks, refs to other repos, or working-tree files.
      const spec = commit + ':' + path;
      if (!cache.has(spec)) {
        const entry = readGit(['--literal-pathspecs', 'ls-tree', '-z', commit, '--', path]).toString('utf8');
        requireValue(/^100(?:644|755) blob [a-f0-9]{40}\t/u.test(entry) && entry.endsWith('\t' + path + '\0'), 'evidence path not a tracked regular file at the revision');
        const content = new TextDecoder('utf-8', { fatal: true }).decode(readGit(['cat-file', 'blob', spec]));
        requireValue(!content.includes('\u0000'), 'evidence is not a text file');
        const lines = content.split(/\r?\n/u);
        if (lines.at(-1) === '') lines.pop();
        cache.set(spec, lines);
      }
      return cache.get(spec);
    },
  };
}

function evidenceItem(item, context, side) {
  requireValue(item && nonEmpty(item.label), 'evidence.label');
  if (item.run !== undefined) {
    requireValue(nonEmpty(item.run) && item.path === undefined, 'evidence.run');
    return `<li><strong>${escape(item.label)}</strong> <code>${escape(item.run)}</code></li>`;
  }
  requireValue(nonEmpty(item.path) && !/[\\\u0000-\u001f\u007f]/u.test(item.path)
    && item.path.split('/').every(part => part && part !== '.' && part !== '..'), 'evidence.path');
  const endLine = item.endLine ?? item.startLine;
  requireValue(positiveInt(item.startLine) && positiveInt(endLine)
    && endLine >= item.startLine && endLine - item.startLine < 50, 'evidence.lines (at most 50 lines)');
  const at = item.at ?? side;
  requireValue(at === 'target' || (at === 'base' && context.baseRevision), 'evidence.at');
  const commit = at === 'base' ? context.baseRevision : context.revision;
  const source = context.source.blob(commit, item.path);
  requireValue(endLine <= source.length, 'evidence line range does not exist at the revision');
  const lines = `L${item.startLine}${item.endLine !== undefined ? `-L${endLine}` : ''}`;
  const label = escape(item.label);
  const pointer = `<code>${escape(item.path)}:${lines}</code>`;
  const snippet = source.slice(item.startLine - 1, endLine)
    .map((line, offset) => `${item.startLine + offset}  ${line}`).join('\n');
  requireValue(Buffer.byteLength(snippet) <= 12 * 1024, 'evidence excerpt exceeds 12 KiB');
  const excerpt = `<details class="excerpt"><summary>${context.strings.excerpt}</summary><pre><code>${escape(snippet)}</code></pre></details>`;
  if (!context.githubRepository) {
    return `<li><strong>${label}</strong> ${pointer} · <code>${commit}</code>${excerpt}</li>`;
  }
  const path = item.path.split('/').map(encodeURIComponent).join('/');
  return `<li><a href="https://github.com/${context.githubRepository}/blob/${commit}/${escape(path)}#${lines}">${label} · ${pointer}</a> <code>${commit}</code>${excerpt}</li>`;
}
function detail(item, context, side, branch = false, nested = false) {
  requireValue(item && nonEmpty(item.label) && nonEmpty(item.detail), branch ? 'branch label/detail' : 'step label/detail');
  const { strings } = context;
  requireValue(['code', 'executed', 'unknown'].includes(item.status), 'step status');
  const evidence = list(item.evidence ?? [], 'evidence', true);
  if (item.status === 'code') requireValue(evidence.some(ref => ref && nonEmpty(ref.path) && (ref.at ?? side) === side), 'code evidence requires a file on its own side');
  if (item.status === 'executed') requireValue(evidence.some(ref => ref && nonEmpty(ref.run)), 'executed evidence requires a run');
  if (branch) requireValue(item.branches === undefined, 'nested branch');
  const branches = list(item.branches ?? [], 'branches', true);
  return `<details class="${branch ? 'branch' : 'node'}"${nested ? '' : ' open'}><summary><span>${escape(item.label)}</span>
      <span class="badge ${item.status}">${strings[item.status]}</span></summary>
    <div class="detail"><p>${escape(item.detail)}</p>${evidence.length ? `<div class="eyebrow">${strings.evidence}</div>
    <ul class="refs">${evidence.map(ref => evidenceItem(ref, context, side)).join('')}</ul>` : ''}
    ${branches.length ? `<div class="branches"><div class="eyebrow">${strings.branches}</div>${branches.map(b => detail(b, context, side, true, true)).join('')}</div>` : ''}
    </div></details>`;
}
function flowSides(flow, pr) {
  if (pr) {
    requireValue(['modified', 'added', 'removed'].includes(flow.change), 'PR flow change (modified, added or removed)');
    if (flow.change === 'added') requireValue(flow.beforeSteps === undefined && Array.isArray(flow.steps), 'added flow needs target steps only');
    if (flow.change === 'removed') requireValue(Array.isArray(flow.beforeSteps) && flow.steps === undefined, 'removed flow needs base steps only');
    if (flow.change === 'modified') {
      requireValue(Array.isArray(flow.beforeSteps) && Array.isArray(flow.steps), 'modified flow needs both sides');
      const steps = [...flow.beforeSteps, ...flow.steps];
      requireValue(steps.every(step => step && ['changed', 'unchanged'].includes(step.delta)), 'modified flow steps need changed/unchanged delta');
      requireValue(steps.some(step => step.delta === 'changed'), 'modified flow needs a changed step');
    } else {
      requireValue((flow.steps ?? flow.beforeSteps).every(step => step && step.delta === undefined), 'added or removed flow steps are all changed');
    }
  } else requireValue(flow.beforeSteps === undefined && flow.change === undefined && Array.isArray(flow.steps), 'PR flow fields in catch-up');
  return { base:flow.beforeSteps,target:flow.steps };
}

function compileFlow(flow, index, pr, context) {
  requireValue(flow && nonEmpty(flow.title) && nonEmpty(flow.summary), 'flow title/summary');
  const sides=flowSides(flow,pr);
  const templateId=(side,step,branch)=>`evidence-${index}-${side}-${step}${branch===undefined?'':'-branch-'+branch}`;
  const templates=[];
  for(const side of ['base','target']) {
    if(!sides[side])continue;
    list(sides[side], 'flow steps').forEach((item,step)=>{
      templates.push(`<template id="${templateId(side,step)}">${detail(item,context,side)}</template>`);
      (item.branches??[]).forEach((branch,n)=>{
        templates.push(`<template id="${templateId(side,step,n)}">${detail(branch,context,side,true)}</template>`);
      });
    });
  }
  const strings=context.strings;
  return {
    scene: { title:flow.title,summary:flow.summary,
      absent:flow.change==='added'?strings.noBefore:flow.change==='removed'?strings.noAfter:'',
      ...compileScene(flow.visual,sides,templateId) },
    templates,
  };
}

function legend(strings,pr){
  const line = (cls, mark, value) => `<span><i class="symbol ${cls}" aria-hidden="true">${mark}</i>${value}</span>`;
  return (pr?line('','',strings.target)+line('base','',strings.base)+line('delta','●',strings.changed):line('','',strings.path))
    +line('stop','×',strings.halt)+line('unknown','?',strings.unknown);
}

export function renderGuide(guide, { repositoryRoot = process.cwd() } = {}) {
  requireValue(guide && ['catch-up', 'pr'].includes(guide.mode), 'mode');
  const pr=guide.mode==='pr',language=guide.language??'en';
  requireValue(['en','ja'].includes(language),'language');
  const strings=i18n[language];
  for (const key of ['title','purpose','scope']) requireValue(nonEmpty(guide[key]),key);
  requireValue(nonEmpty(guide.revision) && sha.test(guide.revision),'revision');
  requireValue(pr ? nonEmpty(guide.baseRevision) && sha.test(guide.baseRevision) && guide.baseRevision.toLowerCase()!==guide.revision.toLowerCase()
    : guide.baseRevision===undefined,'baseRevision');
  if(guide.githubRepository!==undefined)requireValue(nonEmpty(guide.githubRepository) && repository.test(guide.githubRepository)
    && guide.githubRepository.split('/').every(p=>p!=='.' && p!=='..'),'githubRepository');
  const source=gitEvidence(repositoryRoot);
  source.commit(guide.revision);
  if(pr)source.commit(guide.baseRevision);
  const context={strings,revision:guide.revision,baseRevision:guide.baseRevision,githubRepository:guide.githubRepository,source};
  const flows=list(guide.flows,'flows');
  const unknowns=list(guide.unknowns??[],'unknowns',true);
  requireValue(unknowns.every(nonEmpty),'unknown text');
  const compiled=flows.map((flow,index)=>compileFlow(flow,index,pr,context));
  const scenes=compiled.map(item=>item.scene);
  const data=encode({scenes,labels:strings,pr});
  const choices=scenes.length>1
    ? `<label class="scene-pick">${strings.scene}<select id="visual-scene">${scenes.map((scene,i)=>`<option value="${i}">${escape(scene.title)}</option>`).join('')}</select></label>` : '';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${playerHash}'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escape(guide.title)}</title><style>${surface}</style></head><body><main class="shell">
<header class="top"><div><div class="signature">ASK · ${pr?strings.pr:strings.catch}</div>
<h1>${escape(guide.title)}</h1><p>${escape(guide.purpose)}</p>
<details class="metadata"><summary>${strings.metadata}</summary><dl><dt>${strings.scope}</dt><dd>${escape(guide.scope)}</dd>
${pr?`<dt>${strings.base}</dt><dd><code>${guide.baseRevision}</code></dd>`:''}
<dt>${pr?strings.target:strings.revision}</dt><dd><code>${guide.revision}</code></dd></dl></details></div>${choices}</header>
<div class="workspace">
<section class="board" aria-label="${strings.overview}"><header><div class="case-wrap"><span class="eyebrow">${strings.case}</span>
<div class="cases" id="visual-cases" role="group" aria-label="${strings.case}"></div></div></header>
<div id="visual-stage"><svg id="visual-map" role="group" aria-labelledby="visual-title" xmlns="http://www.w3.org/2000/svg"></svg></div>
<div class="legend">${legend(strings,pr)}</div><p class="absent" id="visual-absent" hidden></p>
<footer><div class="transport" role="group" aria-label="${strings.position}">
<button type="button" id="visual-play" aria-pressed="false">${strings.play}</button>
<button type="button" id="visual-step">${strings.step}</button><button type="button" id="visual-reset">${strings.reset}</button></div>
<div class="progress" id="visual-progress" aria-label="${strings.position}"></div></footer></section>
<aside class="detail" id="visual-detail" aria-labelledby="detail-title"><header><h2 id="detail-title" tabindex="-1">${strings.evidence}</h2>
<button id="detail-close" type="button" hidden>${strings.close}</button></header>
<div class="detail-content"><p id="detail-default">${strings.hint}</p><div id="visual-evidence"></div></div></aside></div>
<div class="statusbar"><strong>${strings.inferred}</strong> · ${strings.notRun}</div>
<details class="metadata"><summary>${strings.overview}</summary><p id="visual-subtitle">${escape(scenes[0].summary)}</p></details>
${unknowns.length?`<details class="unknowns"><summary>${strings.gaps}</summary><ul>${unknowns.map(note=>`<li>${escape(note)}</li>`).join('')}</ul></details>`:''}
<div id="visual-live" class="sr-only" role="status" aria-live="polite"></div>
<noscript>${strings.js}</noscript>
${compiled.flatMap(item=>item.templates).join('')}
<script id="visual-data" type="application/json">${data}</script>
<script>${player}</script></main></body></html>\n`;
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try {
    const [input, output, flag, repo, ...extra] = process.argv.slice(2);
    if (!input || !output || extra.length || !/\.html$/iu.test(output) || (flag !== undefined && (flag !== '--repo' || !repo))) {
      throw new Error('Usage: node render-guide.mjs guide.json output.html [--repo <checkout>] (new file)');
    }
    const html=renderGuide(JSON.parse(readFileSync(input,'utf8')),{repositoryRoot:repo});
    writeFileSync(output,html,{flag:'wx',mode:0o600});
  } catch(error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
