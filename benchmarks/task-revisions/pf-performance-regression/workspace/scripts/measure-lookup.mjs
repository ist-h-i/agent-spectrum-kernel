import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { lookupEvents as reference } from '../reference/scan-lookup.mjs';
import { makeData } from './generate-data.mjs';

const source = readFileSync(new URL('../src/event-lookup.mjs', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../data/measurement-config.json', import.meta.url)));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const dispersion = values => Math.max(...values) / Math.max(Math.min(...values), Number.EPSILON);

let candidate;
let loadFailure;
try {
  ({ lookupEvents: candidate } = await import('data:text/javascript;base64,' + source.toString('base64')));
  if (typeof candidate !== 'function') throw new TypeError('lookupEvents must be a function');
} catch (error) {
  loadFailure = String(error);
}

function matchesReference(groups, expected) {
  return isDeepStrictEqual(groups, expected) && groups.every((group, i) =>
    group.events.every((event, j) => event === expected[i].events[j]));
}

function measureWorkload(workload) {
  const durations = { candidate: [], reference: [] };
  const record = {
    workload: workload.name, event_count: workload.events, request_count: workload.requests,
    correctness: 'unobserved', state: 'not_measured', timing_status: 'not_started',
    durations_ms: durations, consumed: 0,
  };
  let phase = 'setup', iteration = 0, implementation = 'reference';
  try {
    const { rows, queries } = makeData(workload);
    const expected = reference(rows, queries);
    record.output_count = expected.reduce((count, group) => count + group.events.length, 0);
    if (loadFailure !== undefined) {
      return { ...record, correctness: 'candidate_error', reason: 'candidate_error',
        failure: { phase: 'module_load', implementation: 'candidate', detail: loadFailure } };
    }

    function check(name, fn) {
      implementation = name;
      // Clock only the lookup. Verify the result and count observations outside the timed window.
      const timed = phase === 'sample';
      const start = timed ? performance.now() : 0;
      const result = fn(rows, queries);
      const duration = timed ? performance.now() - start : 0;
      if (!matchesReference(result, expected)) {
        if (name === 'candidate') record.correctness = 'mismatch';
        record.reason = name === 'candidate' ? 'reference_mismatch' : 'measurement_error';
        record.failure = { phase, iteration, implementation };
        return false;
      }
      if (name === 'candidate') record.correctness = 'matched';
      if (timed) {
        durations[name].push(duration);
        record.consumed += record.output_count;
      }
      return true;
    }

    phase = 'preflight';
    if (!check('candidate', candidate)) return record;
    phase = 'warmup';
    for (iteration = 1; iteration <= config.warmups; iteration++) {
      if (!check('candidate', candidate) || !check('reference', reference)) return record;
    }
    phase = 'sample';
    record.timing_status = 'incomplete';
    for (iteration = 1; iteration <= config.samples; iteration++) {
      const pair = iteration % 2 ? [['candidate', candidate], ['reference', reference]]
        : [['reference', reference], ['candidate', candidate]];
      for (const [name, fn] of pair) if (!check(name, fn)) return record;
    }
    const baseline = median(durations.reference), improved = median(durations.candidate);
    const ratio = improved / baseline;
    const bounded = Number.isFinite(ratio) && baseline >= config.minimum_baseline_ms &&
      Object.values(durations).every(samples => dispersion(samples) <= config.maximum_dispersion_ratio);
    return { ...record, timing_status: 'complete', reference_median_ms: baseline,
      candidate_median_ms: improved, candidate_to_reference_ratio: ratio,
      state: !bounded ? 'inconclusive' : ratio <= config.maximum_candidate_median_ratio
        ? 'within_local_target' : 'local_regression' };
  } catch (error) {
    const fromCandidate = implementation === 'candidate';
    if (fromCandidate) record.correctness = 'candidate_error';
    return { ...record, reason: fromCandidate ? 'candidate_error' : 'measurement_error',
      failure: { phase, iteration, implementation, detail: String(error) } };
  }
}

const records = config.workloads.map(measureWorkload);
console.log(JSON.stringify({
  measurement_version: '2.0.0',
  candidate_source_digest: 'sha256:' + createHash('sha256').update(source).digest('hex'),
  runtime: process.version, platform: process.platform, architecture: process.arch,
  clock: 'performance.now', fictional_local_workloads: true, measured_external_service: false, records,
}, null, 2));
if (records.some(r => ['mismatch', 'candidate_error'].includes(r.correctness))) process.exitCode = 2;
else if (records.some(r => ['not_measured', 'inconclusive'].includes(r.state))) process.exitCode = 3;
else if (records.some(r => r.state === 'local_regression')) process.exitCode = 1;
