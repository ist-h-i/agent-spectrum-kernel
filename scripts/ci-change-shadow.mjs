import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// This is an observation, never an execution selector. Keep job identities explicit.
export const FULL_TEST_JOBS = Object.freeze(['independent-local-clone', 'common', 'repository-tests', 'personal-cli', 'fake (ubuntu-24.04)', 'fake (macos-15)', 'context-rollover', 'verification-completion']);
const DOCS = new Set(['docs/usage-ja.md', 'docs/prompt-recipes-ja.md']);
const SHA = /^[a-f0-9]{40}$/;
const validPath = path => typeof path === 'string' && path.length > 0 && !/[\x00-\x1f\x7f\\]/.test(path) && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..');

export function parseNameStatus(text) {
  if (typeof text !== 'string' || !text.endsWith('\0')) throw new Error('incomplete diff');
  const fields = text.slice(0, -1).split('\0'), changes = [], seen = new Set();
  while (fields.length) {
    const status = fields.shift();
    if (!/^(?:[AMDTUXB]|[RC](?:100|[1-9]?\d))$/.test(status)) throw new Error('invalid status');
    const first = fields.shift(), rename = /^[RC]/.test(status), path = rename ? fields.shift() : first;
    if (!validPath(first) || !validPath(path) || seen.has(path)) throw new Error('invalid or duplicate path');
    seen.add(path);
    changes.push({ status, path, ...(rename ? { previous_path: first } : {}) });
  }
  return changes;
}

function scope(path) {
  if (DOCS.has(path)) return ['docs', 'docs'];
  if (path.startsWith('.github/')) return ['ci', 'ci'];
  if (/^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|\.npmrc)$/.test(path)) return ['dependencies', 'dependencies'];
  if (/^(?:AGENTS\.md|schemas\/|catalog\/|adapters\/|docs\/fixtures\/)/.test(path)) return ['shared', 'shared'];
  if (/^skills\/[^/]+\//.test(path)) return ['skill', path.split('/').slice(0, 2).join('/')];
  if (/^scripts\/[^/]+\.mjs$/.test(path)) return ['core', path];
  return ['unknown', path];
}

export function classifyChanges(evidence) {
  const result = { schema_version: 1, actual_mode: 'full', selection_enabled: false, runtime: { node: process.version, platform: process.platform }, category: 'unknown', proposal: 'full', proposed_test_jobs: [...FULL_TEST_JOBS], comparison: 'not_evaluated', reasons: [], evidence };
  if (!evidence || evidence.complete !== true || ![evidence.base, evidence.head, evidence.merge_base].every(value => typeof value === 'string' && SHA.test(value)) || !Array.isArray(evidence.changes) || !evidence.changes.length) {
    result.reasons.push('incomplete_evidence'); return result;
  }
  if (evidence.base !== evidence.merge_base) { result.reasons.push('base_delta'); return result; }
  if (evidence.changes.some(change => !change || !validPath(change.path) || !['M', 'A'].includes(change.status))) {
    result.reasons.push('unsafe_change_or_path'); return result;
  }
  const scopes = evidence.changes.map(change => scope(change.path));
  const categories = new Set(scopes.map(([category]) => category));
  result.category = categories.size === 1 ? scopes[0][0] : 'mixed';
  if (new Set(scopes.map(([, owner]) => owner)).size !== 1) { result.reasons.push('multiple_scopes'); return result; }
  if (result.category === 'docs' && evidence.changes.every(change => change.status === 'M')) {
    result.proposal = 'docs'; result.proposed_test_jobs = ['independent-local-clone', 'common']; result.reasons.push('closed_modified_docs_allowlist');
  } else result.reasons.push('full_until_dependency_coverage_proven');
  return result;
}

export function observeChanges({ event, cwd = process.cwd() }) {
  const base = event?.pull_request?.base?.sha, head = event?.pull_request?.head?.sha;
  const evidence = { base: base ?? null, head: head ?? null, merge_base: null, complete: false, changes: [] };
  try {
    if (![base, head].every(value => typeof value === 'string' && SHA.test(value))) throw new Error('no exact PR base/head');
    const git = args => {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
      if (r.error || r.signal || r.status !== 0 || r.stdout.includes('\ufffd')) throw new Error('Git evidence unavailable or invalid');
      return r.stdout;
    };
    evidence.checkout_head = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    evidence.checkout_tree = git(['rev-parse', '--verify', 'HEAD^{tree}']).trim();
    if (![evidence.checkout_head, evidence.checkout_tree].every(value => SHA.test(value))) throw new Error('invalid checkout identity');
    evidence.merge_base = git(['merge-base', '--all', base, head]).trim();
    if (!SHA.test(evidence.merge_base)) throw new Error('ambiguous merge base');
    const diff = git(['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '--find-renames', evidence.merge_base, head, '--']);
    evidence.changes = diff ? parseNameStatus(diff) : [];
    evidence.complete = true;
  } catch (error) { evidence.error = error.message; }
  return evidence;
}

export function main() {
  let evidence;
  try { evidence = observeChanges({ event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) }); }
  catch { evidence = { complete: false, error: 'event unavailable or malformed' }; }
  const report = classifyChanges(evidence);
  // JSON is authoritative; summary is escaped so filenames cannot forge Markdown.
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## CI shadow (actual execution: full)\n\n<pre>' + json.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '</pre>\n'); }
    catch { console.error('Shadow summary unavailable; JSON retained in job log; actual execution remains full.'); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
