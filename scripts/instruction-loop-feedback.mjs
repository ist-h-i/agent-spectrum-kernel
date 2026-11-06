// Work summaries are explicitly supplied by the host. Never scrape task logs.
import assert from 'node:assert/strict';
import { canonicalDigest } from './content-addressed-store.mjs';
import { validatePersonalEvolutionObservation } from './ask-personal-evolution-observation.mjs';

const destinations = {
  instruction_gap: 'instruction', deterministic_failure: 'check',
  project_fact: 'context', design_decision: 'adr', documentation_gap: 'documentation',
  one_off: 'task_local', accepted_risk: 'accepted_risk', refactor: 'backlog',
};
export function assertPublicInstructionSummary(value) {
  assert.ok(typeof value === 'string' && value.trim() && value.length <= 8192
    && !/(?:\b(?:token|secret|password|credential)[\w-]*\s*[=:]|\/(?:Users|home|private|var\/folders)\/|file:\/\/)/iu.test(value),
  'bounded public instruction summary required');
  return value;
}
export function buildInstructionLoopFeedback({ findings }) {
  assert.ok(Array.isArray(findings) && findings.length > 0 && findings.length <= 64);
  const groups = new Map(), seen = new Set();
  for (const f of findings) {
    assert.deepEqual(Object.keys(f).sort(), ['kind', 'observation', 'severity', 'tags']);
    const o = validatePersonalEvolutionObservation(f.observation);
    assert.ok(!seen.has(o.observation_digest), 'duplicate observation'); seen.add(o.observation_digest);
    assert.ok(Object.hasOwn(destinations, f.kind), 'unknown finding kind');
    assert.ok(Number.isSafeInteger(f.severity) && f.severity >= 1 && f.severity <= 3);
    assert.ok(Array.isArray(f.tags) && f.tags.length <= 32 && new Set(f.tags).size === f.tags.length);
    for (const tag of f.tags) assert.match(tag, /^[a-zA-Z0-9._-]{1,80}$/u);
    const summary = { correction: o.correction, intended_mechanism: o.intended_mechanism,
      applicability: o.applicability, non_applicability: o.non_applicability };
    const key = canonicalDigest({ kind: f.kind, summary });
    const group = groups.get(key) ?? { id: key, kind: f.kind, destination: destinations[f.kind], summary,
      evidence: [], tags: [], severity: 0, occurrences: 0 };
    group.evidence.push({ observation_digest: o.observation_digest, evidence_status: o.evidence_status,
      evidence_digests: o.evidence_refs.map(r => r.digest).sort() });
    group.tags = [...new Set([...group.tags, ...f.tags])].sort();
    group.severity = Math.max(group.severity, f.severity); group.occurrences++;
    groups.set(key, group);
  }
  const candidates = [...groups.values()].sort((a, b) => b.severity - a.severity
    || b.occurrences - a.occurrences || a.id.localeCompare(b.id));
  for (const c of candidates) c.evidence.sort((a, b) => a.observation_digest.localeCompare(b.observation_digest));
  const selected = candidates.find(c => c.destination === 'instruction') ?? null;
  const body = { kind: 'instruction_loop_feedback_v1', candidates, selected_id: selected?.id ?? null,
    goal: selected ? selected.summary.correction : 'No instruction change selected; route the listed work to its narrowest destination.',
    tags: selected?.tags ?? [], raw_logs_included: false, authority_implied: false };
  return { ...body, feedback_digest: canonicalDigest(body) };
}
export function projectInstructionLoopObservation(observation) {
  assert.ok(observation && typeof observation === 'object' && !Array.isArray(observation));
  if (observation.kind === 'instruction_loop_feedback_v1') {
    const { feedback_digest, ...body } = observation;
    assert.deepEqual(Object.keys(body).sort(), ['authority_implied', 'candidates', 'goal', 'kind', 'raw_logs_included', 'selected_id', 'tags']);
    assert.equal(feedback_digest, canonicalDigest(body), 'feedback drift');
    assert.equal(body.raw_logs_included, false); assert.equal(body.authority_implied, false);
    assert.ok(Array.isArray(body.candidates) && body.candidates.length && body.candidates.length <= 64);
    const ids = new Set();
    for (const c of body.candidates) {
      assert.deepEqual(Object.keys(c).sort(), ['destination', 'evidence', 'id', 'kind', 'occurrences', 'severity', 'summary', 'tags']);
      assert.ok(Object.hasOwn(destinations, c.kind)); assert.equal(c.destination, destinations[c.kind]);
      assert.deepEqual(Object.keys(c.summary).sort(), ['applicability', 'correction', 'intended_mechanism', 'non_applicability']);
      for (const k of ['applicability', 'correction', 'intended_mechanism']) assertPublicInstructionSummary(c.summary[k]);
      assert.ok(Array.isArray(c.summary.non_applicability) && c.summary.non_applicability.length > 0 && c.summary.non_applicability.length <= 32);
      c.summary.non_applicability.forEach(assertPublicInstructionSummary);
      assert.equal(c.id, canonicalDigest({ kind: c.kind, summary: c.summary }));
      assert.ok(!ids.has(c.id), 'duplicate feedback group'); ids.add(c.id);
      assert.ok(Number.isSafeInteger(c.severity) && c.severity >= 1 && c.severity <= 3);
      assert.ok(Array.isArray(c.tags) && c.tags.length <= 32 && new Set(c.tags).size === c.tags.length);
      c.tags.forEach(tag => assert.match(tag, /^[a-zA-Z0-9._-]{1,80}$/u));
      assert.ok(Array.isArray(c.evidence) && c.evidence.length > 0 && c.evidence.length <= 64);
      assert.equal(c.occurrences, c.evidence.length);
      const observations = new Set();
      for (const e of c.evidence) {
        assert.deepEqual(Object.keys(e).sort(), ['evidence_digests', 'evidence_status', 'observation_digest']);
        assert.match(e.observation_digest, /^sha256:[a-f0-9]{64}$/u);
        assert.ok(!observations.has(e.observation_digest), 'duplicate grouped observation'); observations.add(e.observation_digest);
        assert.ok(['Verified', 'Supported', 'Hypothesis', 'Unknown', 'Falsified'].includes(e.evidence_status));
        assert.ok(Array.isArray(e.evidence_digests) && e.evidence_digests.length && e.evidence_digests.length <= 32);
        e.evidence_digests.forEach(d => assert.match(d, /^sha256:[a-f0-9]{64}$/u));
      }
    }
    assert.ok(body.selected_id, 'feedback has no instruction candidate; use its routed work items');
    const selected = body.candidates.find(c => c.id === body.selected_id);
    assert.equal(selected?.destination, 'instruction');
    const ordered = [...body.candidates].sort((a, b) => b.severity - a.severity || b.occurrences - a.occurrences || a.id.localeCompare(b.id));
    assert.equal(body.selected_id, ordered.find(c => c.destination === 'instruction').id, 'feedback selection drift');
    assert.equal(body.goal, selected.summary.correction); assert.equal(canonicalDigest(body.tags), canonicalDigest(selected.tags));
    assertPublicInstructionSummary(body.goal);
    for (const v of [selected.summary.correction, selected.summary.intended_mechanism, selected.summary.applicability,
      ...selected.summary.non_applicability]) assertPublicInstructionSummary(v);
    return { goal: body.goal, tags: body.tags, feedback_digest, selected };
  }
  if (observation.kind === 'instruction_loop_continuation_v1') {
    assert.deepEqual(Object.keys(observation).sort(), ['feedback', 'kind', 'previous']);
    const feedback = projectInstructionLoopObservation(observation.feedback);
    const p = observation.previous;
    assert.deepEqual(Object.keys(p).sort(), ['candidate_digest', 'decisions', 'failure_count', 'journal_digest', 'outcome', 'policy_digest', 'report_digest', 'result_summary', 'run_id', 'unknown_quality']);
    for (const k of ['journal_digest', 'policy_digest', 'candidate_digest']) assert.match(p[k], /^sha256:[a-f0-9]{64}$/u);
    assert.ok(p.report_digest === null || /^sha256:[a-f0-9]{64}$/u.test(p.report_digest));
    assert.match(p.run_id, /^[a-zA-Z0-9._-]{1,100}$/u); assert.match(p.outcome, /^[a-z_]{1,80}$/u);
    assert.ok(Number.isSafeInteger(p.failure_count) && p.failure_count >= 0);
    assert.equal(typeof p.unknown_quality, 'boolean');
    assertPublicInstructionSummary(p.result_summary);
    assert.ok(Array.isArray(p.decisions) && p.decisions.length <= 4);
    for (const d of p.decisions) {
      assert.deepEqual(Object.keys(d).sort(), ['digest', 'disposition', 'kind', 'reason_summary']);
      assertPublicInstructionSummary(d.reason_summary);
      assert.match(d.digest, /^sha256:[a-f0-9]{64}$/u);
      assert.ok(['approved', 'rejected'].includes(d.disposition));
      assert.ok(['evaluation_decision', 'result_decision', 'change_decision', 'restore_decision'].includes(d.kind));
    }
    return { ...feedback, previous_cycle: structuredClone(p) };
  }
  if (observation.object_kind === 'personal_evolution_observation') {
    const o = validatePersonalEvolutionObservation(observation);
    return { goal: o.correction, tags: [], selected: { summary: { correction: o.correction,
      intended_mechanism: o.intended_mechanism, applicability: o.applicability, non_applicability: o.non_applicability },
    observation_digest: o.observation_digest, evidence_status: o.evidence_status, evidence_digests: o.evidence_refs.map(r => r.digest) } };
  }
  assert.deepEqual(Object.keys(observation), ['goal'], 'use a reviewed public observation, not arbitrary work data');
  return { goal: assertPublicInstructionSummary(observation.goal), tags: [] };
}
