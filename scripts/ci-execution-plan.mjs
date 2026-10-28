import { appendFileSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyChanges, observeChanges } from './ci-change-shadow.mjs';

export const WORKERS = Object.freeze(['independent-local-clone', 'docs-checks', 'common', 'repository-tests', 'personal-cli']);
const digest = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const policy = digest(readFileSync(new URL('./ci-execution-plan.mjs', import.meta.url), 'utf8'));
const same = (actual, expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Evidence differs from current expected contract'); };
const diagnostic = "${{ failure() && steps.repository_consistency.outcome == 'failure' }}";

// Intentionally restricted to the checked-in workflow's syntax. Unsupported execution
// syntax fails closed instead of silently disappearing from the descriptor registry.
export function parseRegistry(text) {
  if (/^(?:defaults|env):/m.test(text)) throw new Error('Unsupported global execution context');
  const jobs = {}; let job, step; const seen = new Map();
  function finish() {
    if (!step) return;
    if (step.uses) {
      if (!['actions/checkout@v5', 'actions/setup-node@v5'].includes(step.uses) || step.if || step.env || step.run) throw new Error('Unsupported action execution');
      jobs[job].setup.push(digest(step.raw));
      return;
    }
    if (!step.run) throw new Error('Missing step execution');
    if (!step.id || seen.get(job).has(step.id)) throw new Error('Missing or duplicate execution id');
    seen.get(job).add(step.id);
    if (step.id === 'ci_receipt') {
      if (step.run !== 'node scripts/ci-execution-plan.mjs receipt' || step.if) throw new Error('Invalid receipt producer');
      return;
    }
    if (step.env) throw new Error('Unsupported required step environment');
    if (step.if) {
      if (job !== 'docs-checks' || step.if !== diagnostic || !step.run.includes('node scripts/validate-repo.mjs --write-report')) throw new Error('Conditional required execution');
      return;
    }
    const descriptor = { id: step.id, run: step.run, cwd: step.cwd ?? '.' };
    jobs[job].steps.push({ ...descriptor, digest: digest(descriptor) });
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], header = line.match(/^  ([\w-]+):$/);
    if (header) { finish(); step = null; job = WORKERS.includes(header[1]) ? header[1] : null; if (job) { if (jobs[job]) throw new Error('Duplicate job'); jobs[job] = { steps: [], setup: [] }; seen.set(job, new Set()); } continue; }
    if (!job) continue;
    if (/^      - /.test(line)) {
      finish(); step = { raw: line + '\n' };
      const action = line.match(/^      - uses: (.+)$/); if (action) step.uses = action[1];
      if (!/^      - (?:name|uses): /.test(line)) throw new Error('Unsupported step header');
    }
    if (/^    (?:defaults|env|if):/.test(line) || /^        (?:shell|continue-on-error):/.test(line)) throw new Error('Unsupported execution context');
    if (/^        run:/.test(line) && !/^        run: (?:\|$|[^>|\s])/.test(line)) throw new Error('Unsupported run syntax');
    if (!step) continue;
    if (!/^      - /.test(line)) step.raw += line + '\n';
    if (/^        env:/.test(line)) step.env = true;
    const field = line.match(/^        (id|if|uses|working-directory|run): (.*)$/);
    if (!field) continue;
    const [, key, value] = field;
    if (key === 'run' && value === '|') { const body = []; while (i + 1 < lines.length && (/^          /.test(lines[i + 1]) || lines[i + 1] === '')) body.push(lines[++i].replace(/^          /, '')); step.run = body.join('\n').trimEnd(); }
    else {
      if (key === 'run' && !/^node [^\r\n]+$/.test(value)) throw new Error('Unsupported single-line run');
      if (key === 'working-directory' && !/^[a-zA-Z0-9_./-]+$/.test(value)) throw new Error('Unsupported cwd');
      step[key === 'working-directory' ? 'cwd' : key] = value;
    }
  }
  finish();
  if (WORKERS.some(id => !seen.get(id)?.has('ci_receipt'))) throw new Error('Missing receipt producer');
  if (Object.keys(jobs).length !== WORKERS.length || WORKERS.some(id => !jobs[id]?.steps.length)) throw new Error('Incomplete worker registry');
  return { jobs, digest: digest(jobs) };
}

function identityValid(identity) {
  if (!identity || typeof identity.worktree_clean !== 'boolean' || !/^[a-f0-9]{40}$/.test(identity.checkout_head) || !/^[a-f0-9]{40}$/.test(identity.checkout_tree) || !Array.isArray(identity.parents) || identity.parents.some(p => !/^[a-f0-9]{40}$/.test(p)) || ['run_id', 'run_attempt', 'node', 'platform'].some(k => typeof identity[k] !== 'string' || !identity[k])) throw new Error('Invalid execution identity');
}
export function createShadowPlan(context, registry) {
  identityValid(context.identity);
  const o = context.observation, classification = classifyChanges(o);
  const bound = context.identity.worktree_clean === true && o?.checkout_head === context.identity.checkout_head && o?.checkout_tree === context.identity.checkout_tree && JSON.stringify(context.identity.parents) === JSON.stringify([o?.base, o?.head]);
  const files = context.doc_files;
  const ordinary = Array.isArray(files) && files.length === o?.changes?.length && o.changes.every(change => files.filter(f => f.path === change.path && f.base_mode === '100644' && f.head_mode === '100644' && f.checkout_matches === true).length === 1);
  const proposal = classification.proposal === 'docs' && bound && ordinary ? 'docs-v1' : 'full';
  const plan = { schema_version: 1, mode: 'shadow', selection_enabled: false, policy_digest: policy, registry_digest: registry.digest, binding: context.identity, proposal, required_jobs: [...WORKERS], proposed_jobs: proposal === 'docs-v1' ? ['independent-local-clone', 'docs-checks'] : [...WORKERS] };
  return { ...plan, plan_digest: digest(plan) };
}
function expectedReceipt(jobId, identity, registry) {
  identityValid(identity);
  if (identity.worktree_clean !== true) throw new Error('Execution checkout has tracked modifications');
  if (!registry.jobs[jobId]) throw new Error('Unknown worker');
  return { schema_version: 1, job_id: jobId, binding: identity, policy_digest: policy, registry_digest: registry.digest, completed: registry.jobs[jobId].steps.map(({ id, digest }) => ({ id, digest })) };
}
export function createReceipt(jobId, steps, identity, registry) {
  const receipt = expectedReceipt(jobId, identity, registry);
  if (receipt.completed.some(({ id }) => steps?.[id]?.outcome !== 'success' || steps?.[id]?.conclusion !== 'success')) throw new Error('Required step did not complete successfully');
  return receipt;
}
export function requireSuccessfulJobs(needs, ids) {
  if (!needs || Object.keys(needs).length !== ids.length || ids.some(id => needs[id]?.result !== 'success')) throw new Error('Required jobs must all succeed');
}
function verify({ needs, context, registry }, hypothetical) {
  const ids = ['plan', ...WORKERS];
  if (!hypothetical) requireSuccessfulJobs(needs, ids);
  if (!needs || Object.keys(needs).length !== ids.length || ids.some(id => !needs[id])) throw new Error('Missing or unexpected dependency');
  if (needs.plan.result !== 'success') throw new Error('Plan failed');
  const plan = createShadowPlan(context, registry);
  same(JSON.parse(needs.plan.outputs?.plan), plan);
  for (const id of WORKERS) {
    if (hypothetical && !plan.proposed_jobs.includes(id)) { if (needs[id].result !== 'skipped') throw new Error('Not an explicit planned skip'); continue; }
    if (needs[id].result !== 'success') throw new Error('Required worker failed: ' + id);
    same(JSON.parse(needs[id].outputs?.receipt), expectedReceipt(id, context.identity, registry));
  }
  return plan;
}
export const verifyShadowGate = input => verify(input, false);
// Observation derived from the actual strict full gate, never a skip permit.
export function compareShadowExecution(input) {
  const plan = verifyShadowGate(input);
  return {
    schema_version: 1, scope: 'validate-workers', comparison: plan.proposal === 'docs-v1' ? 'docs-shadow-full-pass' : 'full-only',
    binding: plan.binding, policy_digest: plan.policy_digest,
    registry_digest: plan.registry_digest, plan_digest: plan.plan_digest,
    proposal: plan.proposal, full_jobs: [...plan.required_jobs],
    proposed_omissions: plan.required_jobs.filter(id => !plan.proposed_jobs.includes(id)),
    selection_enabled: false, selection_ready: false,
    unproven: ['consumer_closure', 'historical_regression_retention', 'sufficient_hosted_observations'],
  };
}

// Fixture-only simulation. There is deliberately no CLI entry point for this function.
export const verifyHypotheticalGate = input => verify(input, true);

export function captureContext({ cwd = process.cwd(), event = {}, env = process.env } = {}) {
  const git = args => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 }); if (r.error || r.signal || r.status !== 0) throw new Error('Git identity unavailable'); return r.stdout.trim(); };
  const identity = { checkout_head: git(['rev-parse', 'HEAD^{commit}']), checkout_tree: git(['rev-parse', 'HEAD^{tree}']), parents: git(['show', '-s', '--format=%P', 'HEAD']).split(' ').filter(Boolean), run_id: env.GITHUB_RUN_ID || 'local', run_attempt: env.GITHUB_RUN_ATTEMPT || '1', node: process.version, platform: process.platform, worktree_clean: git(['status', '--porcelain', '--untracked-files=no']) === '' };
  identityValid(identity);
  const observation = observeChanges({ cwd, event }), doc_files = [];
  if (classifyChanges(observation).proposal === 'docs') {
    try {
      for (const { path } of observation.changes) {
        const entry = ref => git(['ls-tree', ref, '--', path]).match(/^(\d+) blob ([a-f0-9]{40})\t/);
        const base = entry(observation.base), head = entry(observation.head), checkout = entry('HEAD');
        doc_files.push({ path, base_mode: base?.[1] ?? null, head_mode: head?.[1] ?? null, checkout_matches: identity.worktree_clean && !!head && checkout?.[2] === head[2] && lstatSync(cwd + '/' + path).isFile() && git(['hash-object', '--', path]) === head[2] });
      }
    } catch { doc_files.length = 0; }
  }
  return { observation, identity, doc_files };
}
function main() {
  if (process.argv.length !== 3 || !['plan', 'receipt', 'gate'].includes(process.argv[2])) throw new Error('Expected plan, receipt or gate (shadow only)');
  let event = {}; try { event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); } catch { /* Full fallback. */ }
  const registry = parseRegistry(readFileSync('.github/workflows/validate.yml', 'utf8')), context = captureContext({ event });
  const action = process.argv[2];
  const value = action === 'plan' ? createShadowPlan(context, registry) : action === 'receipt' ? createReceipt(process.env.CI_RECEIPT_JOB, JSON.parse(process.env.CI_STEP_RESULTS), context.identity, registry) : verifyShadowGate({ needs: JSON.parse(process.env.CI_NEEDS), context, registry });
  console.log(JSON.stringify(value));
  if (action === 'gate' && process.env.GITHUB_STEP_SUMMARY) {
    const comparison = compareShadowExecution({ needs: JSON.parse(process.env.CI_NEEDS), context, registry });
    const escaped = JSON.stringify(comparison, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n## Shadow/full comparison (observation only)\n\n<pre>' + escaped + '</pre>\n');
  }
  if (action !== 'gate' && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${action}=${JSON.stringify(value)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
