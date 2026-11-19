import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const tags = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => value.replace(/[&<>"']/gu, char => tags[char]);
const sha = /^[0-9a-f]{40}$/iu;
const repository = /^[\w.-]+\/[\w.-]+$/u;
const i18n = {
  en: { pr: 'PR change map', catch: 'Code catch-up', scope: 'Scope', base: 'Before', target: 'After', path: 'Current flow', revision: 'Revision',
    code: 'From code', executed: 'Run observed', unknown: 'Not verified', overview: 'Flow overview',
    back: 'Back to overview', gaps: 'What remains unknown', branches: 'Branches', evidence: 'Evidence' },
  ja: { pr: 'PRの変更マップ', catch: 'コードのキャッチアップ', scope: '対象範囲', base: '変更前', target: '変更後', path: '現在の流れ', revision: '対象コミット',
    code: 'コードから確認', executed: '実行を確認', unknown: '未確認', overview: '処理の全体像',
    back: '全体像へ戻る', gaps: '未確認の事項', branches: '分岐', evidence: '根拠' },
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
function evidenceItem(item, context, side) {
  requireValue(item && nonEmpty(item.label), 'evidence.label');
  if (item.run !== undefined) {
    requireValue(nonEmpty(item.run) && item.path === undefined, 'evidence.run');
    return `<li><strong>${escape(item.label)}</strong> <code>${escape(item.run)}</code></li>`;
  }
  requireValue(nonEmpty(item.path) && !/[\\\u0000-\u001f\u007f]/u.test(item.path)
    && item.path.split('/').every(part => part && part !== '.' && part !== '..'), 'evidence.path');
  requireValue(positiveInt(item.startLine)
    && (item.endLine === undefined || (positiveInt(item.endLine) && item.endLine >= item.startLine)), 'evidence.lines');
  const at = item.at ?? side;
  requireValue(at === 'target' || (at === 'base' && context.baseRevision), 'evidence.at');
  const commit = at === 'base' ? context.baseRevision : context.revision;
  const lines = `L${item.startLine}${item.endLine ? `-L${item.endLine}` : ''}`;
  const label = escape(item.label);
  const pointer = `<code>${escape(item.path)}:${lines}</code>`;
  if (!context.githubRepository) {
    return `<li><strong>${label}</strong> ${pointer} · <code>${commit}</code></li>`;
  }
  const path = item.path.split('/').map(encodeURIComponent).join('/');
  return `<li><a href="https://github.com/${context.githubRepository}/blob/${commit}/${escape(path)}#${lines}">${label} · ${pointer}</a> <code>${commit}</code></li>`;
}
function detail(item, context, side, branch = false) {
  requireValue(item && nonEmpty(item.label) && nonEmpty(item.detail), branch ? 'branch label/detail' : 'step label/detail');
  const { strings } = context;
  requireValue(['code', 'executed', 'unknown'].includes(item.status), 'step status');
  const evidence = list(item.evidence ?? [], 'evidence', true);
  if (item.status === 'code') requireValue(evidence.some(ref => ref && nonEmpty(ref.path)), 'code evidence requires a file');
  if (item.status === 'executed') requireValue(evidence.some(ref => ref && nonEmpty(ref.run)), 'executed evidence requires a run');
  if (branch) requireValue(item.branches === undefined, 'nested branch');
  const branches = list(item.branches ?? [], 'branches', true);
  return `<details class="${branch ? 'branch' : 'node'}"><summary><span>${escape(item.label)}</span>
      <span class="badge ${item.status}">${strings[item.status]}</span></summary>
    <div class="detail"><p>${escape(item.detail)}</p>${evidence.length ? `<div class="eyebrow">${strings.evidence}</div>
    <ul class="refs">${evidence.map(ref => evidenceItem(ref, context, side)).join('')}</ul>` : ''}
    ${branches.length ? `<div class="branches"><div class="eyebrow">${strings.branches}</div>${branches.map(b => detail(b, context, side, true)).join('')}</div>` : ''}
    </div></details>`;
}
function flowLane(steps, context, side, title) {
  return `<div class="lane ${side}"><h3>${title}</h3><ol>${list(steps, 'flow steps')
    .map(step => `<li>${detail(step, context, side)}</li>`).join('')}</ol></div>`;
}
export function renderGuide(guide) {
  requireValue(guide && ['catch-up', 'pr'].includes(guide.mode), 'mode');
  const pr = guide.mode === 'pr';
  const language = guide.language ?? 'en';
  requireValue(['en', 'ja'].includes(language), 'language');
  const strings = i18n[language];
  for (const key of ['title', 'purpose', 'scope']) requireValue(nonEmpty(guide[key]), key);
  requireValue(nonEmpty(guide.revision) && sha.test(guide.revision), 'revision');
  requireValue(pr ? nonEmpty(guide.baseRevision) && sha.test(guide.baseRevision) && guide.baseRevision.toLowerCase() !== guide.revision.toLowerCase()
    : guide.baseRevision === undefined, 'baseRevision');
  if (guide.githubRepository !== undefined) requireValue(nonEmpty(guide.githubRepository)
    && repository.test(guide.githubRepository) && guide.githubRepository.split('/').every(p => p !== '.' && p !== '..'), 'githubRepository');
  const context = { strings, revision: guide.revision, baseRevision: guide.baseRevision, githubRepository: guide.githubRepository };
  const flows = list(guide.flows, 'flows');
  const unknowns = list(guide.unknowns ?? [], 'unknowns', true);
  requireValue(unknowns.every(nonEmpty), 'unknown text');
  const map = flows.map((flow, i) => {
    requireValue(flow && nonEmpty(flow.title) && nonEmpty(flow.summary), 'flow title/summary');
    requireValue(pr || flow.beforeSteps === undefined, 'beforeSteps only in PR mode');
    return `<section class="flow" id="flow-${i + 1}"><h2>${escape(flow.title)}</h2>
      <p>${escape(flow.summary)}</p><div class="lanes">
      ${flow.beforeSteps === undefined ? '' : flowLane(flow.beforeSteps, context, 'base', strings.base)}
      ${flowLane(flow.steps, context, 'target', pr ? strings.target : strings.path)}</div>
      <a class="back" href="#overview">↑ ${strings.back}</a></section>`;
  }).join('');
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(guide.title)}</title><style>${STYLE}</style></head><body><main>
<header><div class="eyebrow">${pr ? strings.pr : strings.catch}</div><h1>${escape(guide.title)}</h1>
<p>${escape(guide.purpose)}</p><dl><dt>${strings.scope}</dt><dd>${escape(guide.scope)}</dd>
${pr ? `<dt>${strings.base}</dt><dd><code>${guide.baseRevision}</code></dd>` : ''}
<dt>${pr ? strings.target : strings.revision}</dt><dd><code>${guide.revision}</code></dd></dl></header>
<nav id="overview" aria-labelledby="overview-heading"><h2 id="overview-heading">${strings.overview}</h2>
<ol>${flows.map((flow, i) => `<li><a href="#flow-${i + 1}"><strong>${escape(flow.title)}</strong><span>${escape(flow.summary)}</span></a></li>`).join('')}</ol></nav>
${map}${unknowns.length ? `<aside><h2>${strings.gaps}</h2><ul>${unknowns.map(note => `<li>${escape(note)}</li>`).join('')}</ul></aside>` : ''}
</main></body></html>\n`;
}

const STYLE = `
:root { color-scheme:light; --ink:#152631; --muted:#455d6b; --accent:#075f55; --line:#c4d2dc; --paper:#f3f7f8; font:16px/1.55 system-ui,sans-serif }
* { box-sizing:border-box }
body { margin:0; color:var(--ink); background:var(--paper); overflow-wrap:anywhere }
main { max-width:64rem; margin:auto; padding:clamp(1rem,4vw,3rem) }
header { border-top:.4rem solid var(--accent); padding:1.3rem 0 0 }
h1,h2,h3,p,dl,dd,ol { margin:0 }
h1 { font-size:clamp(1.65rem,5vw,2.75rem); line-height:1.15; margin:.35rem 0 .6rem }
h2 { font-size:1.35rem; margin-bottom:.38rem }
h3 { font-size:1rem; margin-bottom:.55rem }
p+dl { margin-top:.85rem }
dl { display:grid; grid-template-columns:max-content 1fr; gap:.15rem .65rem; font-size:.9rem }
dt { color:var(--muted) }
code { font-family:ui-monospace,monospace; font-size:.86em }
a { color:var(--accent) }
:focus-visible { outline:3px solid #1a60c0; outline-offset:3px }
.eyebrow { font-size:.82rem; font-weight:750; color:var(--accent) }
nav,.flow,aside { margin-top:1.6rem }
nav ol { padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr)); gap:.6rem; list-style:none }
nav a { display:block; height:100%; background:white; border:1px solid var(--line); border-radius:.55rem; padding:.7rem .85rem; text-decoration:none }
nav a strong { text-decoration:underline }
nav a span { display:block; color:var(--ink) }
.flow,aside { padding:clamp(.75rem,3vw,1.35rem); background:white; border:1px solid var(--line); border-radius:.7rem }
aside { border-inline-start:.25rem solid #87501f }
.lanes { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr)); gap:.75rem; margin-top:1rem }
.lane { border:1px solid var(--line); border-radius:.55rem; background:#f6fbfa; padding:.7rem; min-width:0 }
.lane.base { background:#f3f5f9 }
.lane ol { list-style:none; padding:0; counter-reset:step }
.lane ol>li { counter-increment:step }
.lane ol>li:not(:last-child)::after { content:"↓"; display:block; color:var(--muted); padding:.05rem 0 .05rem 1.25rem }
details { background:white; border:1px solid var(--line); border-radius:.45rem }
summary { cursor:pointer; padding:.55rem .65rem }
summary:hover { background:#f0f7f6 }
.node>summary::before { content:counter(step) "."; margin-inline-end:.35rem; font-weight:750; color:var(--accent) }
.badge { display:inline-block; margin-inline-start:.4rem; border-radius:.3rem; font-size:.78rem; color:#244458; background:#e7eff4; padding:0 .32rem; white-space:nowrap }
.badge.executed { color:#175544; background:#dff3e8 }
.badge.unknown { color:#713600; background:#fff0d8 }
.detail { padding:.25rem .65rem .65rem }
.refs { padding-inline-start:1.3rem; margin:.28rem 0 .5rem }
.branches { border-inline-start:.18rem solid #846836; padding-inline-start:.55rem; margin-top:.5rem }
.branches details { margin-top:.3rem }
.back { display:inline-block; margin-top:.75rem }
@media (max-width:29rem) { dl { grid-template-columns:1fr } dd { margin-bottom:.35rem } }
`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [input, output, ...extra] = process.argv.slice(2);
    if (!input || !output || extra.length || !/\.html$/iu.test(output)) throw new Error('Usage: node render-guide.mjs guide.json output.html (new file)');
    const html = renderGuide(JSON.parse(readFileSync(input, 'utf8')));
    writeFileSync(output, html, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
