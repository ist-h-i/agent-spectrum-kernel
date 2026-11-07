// Work summaries are explicitly supplied by the host. Never scrape task logs.
import assert from 'node:assert/strict';
import { canonicalDigest } from './content-addressed-store.mjs';
import {fixedPointReferenceSummary,validateFixedPointReferenceSummary} from './instruction-loop-fixed-scoring.mjs';
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
// A bounded learning projection, not another grader or aggregation authority.
// The report digest retains the full evidence; answers/logs/reason payloads never
// travel into the next generation prompt. Older continuations remain readable.
const evaluationMetrics=['duration_ms','input_tokens','output_tokens'];
const numberOrNull=v=>Number.isFinite(v)&&v>=0?v:null;
const outcome=v=>['pass','fail','unknown'].includes(v)?v:'unknown';
function caseComparison(conditions){
  const baseline=conditions.find(c=>c.condition==='baseline'),candidate=conditions.find(c=>['candidate','challenger'].includes(c.condition));
  const comparable=baseline&&candidate&&baseline.outcome!=='not_selected'&&candidate.outcome!=='not_selected';
  return {outcome_changed:comparable?baseline.outcome!==candidate.outcome:null,
    duration_delta_ms:comparable&&baseline.metrics.duration_ms!==null&&candidate.metrics.duration_ms!==null?candidate.metrics.duration_ms-baseline.metrics.duration_ms:null};
}
export function summarizeInstructionLoopEvaluation(report){
  if(!report||!['practical_evaluation_run_report_v1','supervised_instruction_reference_report_v1'].includes(report.kind))return null;
  const practical=report.kind==='practical_evaluation_run_report_v1',groups=new Map();
  for(const a of practical?report.all_attempts:report.rows){
    const row=practical?a.row:{case_id:a.fixture_id,repetition:a.repetition,condition:a.role},key=JSON.stringify([row.case_id,row.repetition]);
    let group=groups.get(key);if(!group){group={case_id:row.case_id,repetition:row.repetition,conditions:[]};groups.set(key,group);}
    let c=group.conditions.find(c=>c.condition===row.condition);
    if(!c){c={condition:row.condition,outcome:'not_selected',attempt_count:0,excluded_count:0,execution_failures:0,
      selected_result_digest:null,metrics:Object.fromEntries(evaluationMetrics.map(k=>[k,null])),reference_points:null};group.conditions.push(c);}
    c.attempt_count++;const selected=practical?a.included_in_comparison:true;
    if(!selected)c.excluded_count++;
    if(practical?a.observation.execution_state!=='completed':a.state!=='completed')c.execution_failures++;
    if(selected){
      assert.equal(c.selected_result_digest,null,'multiple selected attempts for one case/condition');
      c.outcome=practical?outcome(a.observation.outcome):a.state!=='completed'?'unknown':a.unmet_points>0||a.mandatory_final_validation===false?'fail':a.unknown_points>0||a.mandatory_final_validation!==true?'unknown':a.confirmed_points===a.maximum_points?'pass':'unknown';
      c.selected_result_digest=practical?(a.effective_result_digest??a.result_digest):canonicalDigest(a);
      c.metrics=Object.fromEntries(evaluationMetrics.map(k=>[k,numberOrNull(practical?a.observation.metrics[k]:k==='duration_ms'?(a.cli_seconds==null?null:a.cli_seconds*1000):a[k==='input_tokens'?'root_input_tokens':'root_output_tokens'])]));
      if(!practical&&a.fixed_reference)c.fixed_reference=fixedPointReferenceSummary(a.fixed_reference);
      if(practical&&a.quality_observation?.fixed_reference)try{c.fixed_reference=validateFixedPointReferenceSummary(structuredClone(a.quality_observation.fixed_reference));}catch{c.outcome='unknown';}
      if(!practical)c.reference_points=Object.fromEntries(['confirmed','unknown','unmet','maximum'].map(k=>[k,numberOrNull(a[k+'_points'])]));
    }
  }
  const cases=[...groups.values()];
  for(const c of cases){c.conditions.sort((a,b)=>a.condition.localeCompare(b.condition));c.comparison=caseComparison(c.conditions);}
  // Keep failures, unknown/excluded and retried cases before uneventful passes.
  const priority=c=>c.conditions.some(x=>x.outcome==='fail')?0:c.conditions.some(x=>['unknown','not_selected'].includes(x.outcome))?1:c.conditions.some(x=>x.excluded_count||x.execution_failures)?2:3;
  cases.sort((a,b)=>priority(a)-priority(b)||a.case_id.localeCompare(b.case_id)||a.repetition-b.repetition);
  const limits=report.comparison_limits??report.limits??[],summary={kind:'instruction_loop_evaluation_summary_v1',report_digest:canonicalDigest(report),
    source_kind:report.kind,total_case_count:cases.length,cases:cases.slice(0,32),omitted_case_count:Math.max(0,cases.length-32),
    comparison_limits:limits.slice(0,16).map(value=>{let summary=null;try{if(Buffer.byteLength(value)<=256)summary=assertPublicInstructionSummary(value);}catch{}return {digest:canonicalDigest(value),summary};}),
    omitted_limit_count:Math.max(0,limits.length-16),raw_logs_included:false,formal_admission_implied:false};
  while(Buffer.byteLength(JSON.stringify(summary))>32768&&summary.cases.length){summary.cases.pop();summary.omitted_case_count++;}
  validateInstructionEvaluationSummary(summary,summary.report_digest);return summary;
}
export function validateInstructionEvaluationSummary(s,reportDigest){
  const keys=(v,k)=>assert.deepEqual(Object.keys(v).sort(),k.sort());
  const digest=v=>assert.match(v,/^sha256:[a-f0-9]{64}$/u),integer=v=>assert.ok(Number.isSafeInteger(v)&&v>=0);
  keys(s,['kind','report_digest','source_kind','total_case_count','cases','omitted_case_count','comparison_limits','omitted_limit_count','raw_logs_included','formal_admission_implied']);
  assert.equal(s.kind,'instruction_loop_evaluation_summary_v1');assert.equal(s.report_digest,reportDigest);digest(s.report_digest);
  assert.ok(['practical_evaluation_run_report_v1','supervised_instruction_reference_report_v1'].includes(s.source_kind));
  assert.equal(s.raw_logs_included,false);assert.equal(s.formal_admission_implied,false);assert.ok(Buffer.byteLength(JSON.stringify(s))<=32768);
  assert.ok(Array.isArray(s.cases)&&s.cases.length<=32);integer(s.total_case_count);integer(s.omitted_case_count);integer(s.omitted_limit_count);
  assert.equal(s.total_case_count,s.cases.length+s.omitted_case_count);const seen=new Set();
  for(const c of s.cases){
    // Match the existing supervisor/native catalog vocabulary. The summary's
    // byte budget bounds long labels without truncating or renaming identities.
    keys(c,['case_id','repetition','conditions','comparison']);assert.match(c.case_id,/^[A-Za-z0-9._-]+$/u);integer(c.repetition);assert.ok(c.repetition>0);
    const key=JSON.stringify([c.case_id,c.repetition]);assert.ok(!seen.has(key));seen.add(key);
    assert.ok(Array.isArray(c.conditions)&&c.conditions.length>0&&c.conditions.length<=2);const conditions=new Set();
    for(const v of c.conditions){
      keys(v,['condition','outcome','attempt_count','excluded_count','execution_failures','selected_result_digest','metrics','reference_points',...(Object.hasOwn(v,'fixed_reference')?['fixed_reference']:[])]);
      if(Object.hasOwn(v,'fixed_reference'))validateFixedPointReferenceSummary(v.fixed_reference);
      assert.ok(['baseline','candidate','challenger'].includes(v.condition)&&!conditions.has(v.condition));conditions.add(v.condition);
      assert.ok(['pass','fail','unknown','not_selected'].includes(v.outcome));integer(v.attempt_count);integer(v.excluded_count);integer(v.execution_failures);
      assert.ok(v.attempt_count>0&&v.excluded_count<=v.attempt_count&&v.execution_failures<=v.attempt_count);
      if(v.outcome==='not_selected'){assert.equal(v.selected_result_digest,null);assert.equal(v.excluded_count,v.attempt_count);assert.ok(Object.values(v.metrics).every(value=>value===null));}else{digest(v.selected_result_digest);assert.equal(v.excluded_count,v.attempt_count-1);}
      keys(v.metrics,[...evaluationMetrics]);for(const value of Object.values(v.metrics))assert.ok(value===null||numberOrNull(value)===value);
      if(v.reference_points!==null){keys(v.reference_points,['confirmed','unknown','unmet','maximum']);for(const value of Object.values(v.reference_points))assert.ok(value===null||numberOrNull(value)===value);}
    }
    assert.deepEqual(c.comparison,caseComparison(c.conditions));
  }
  assert.ok(Array.isArray(s.comparison_limits)&&s.comparison_limits.length<=16);
  for(const limit of s.comparison_limits){keys(limit,['digest','summary']);digest(limit.digest);if(limit.summary!==null){assertPublicInstructionSummary(limit.summary);assert.ok(Buffer.byteLength(limit.summary)<=256);}}
  return s;
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
  if(observation.kind==='instruction_loop_recovery_v1'){
    assert.deepEqual(Object.keys(observation).sort(),['feedback','kind','previous']);
    const feedback=projectInstructionLoopObservation(observation.feedback),p=observation.previous;
    assert.deepEqual(Object.keys(p).sort(),['run_id','journal_digest','policy_digest','failed_stage','failed_job_digest','result_digest','reason_summary','previous_state_completed','approval_carried_forward'].sort());
    assert.match(p.run_id,/^[A-Za-z0-9._-]+$/u);for(const key of ['journal_digest','policy_digest','failed_job_digest','result_digest'])assert.match(p[key],/^sha256:[a-f0-9]{64}$/u);
    assert.ok(['generate','register','select'].includes(p.failed_stage));assert.equal(p.previous_state_completed,false);assert.equal(p.approval_carried_forward,false);assertPublicInstructionSummary(p.reason_summary);
    return {...feedback,previous_failed_run:structuredClone(p)};
  }
  if (observation.kind === 'instruction_loop_continuation_v1') {
    assert.deepEqual(Object.keys(observation).sort(), ['feedback', 'kind', 'previous']);
    const feedback = projectInstructionLoopObservation(observation.feedback);
    const p = observation.previous;
    assert.deepEqual(Object.keys(p).sort(), ['candidate_digest', 'decisions', 'failure_count', 'journal_digest', 'outcome', 'policy_digest', 'report_digest', 'result_summary', 'run_id', 'unknown_quality', ...(p.evaluation_summary===undefined?[]:['evaluation_summary']),...(p.report_revision===undefined?[]:['report_revision'])].sort());
    for (const k of ['journal_digest', 'policy_digest', 'candidate_digest']) assert.match(p[k], /^sha256:[a-f0-9]{64}$/u);
    assert.ok(p.report_digest === null || /^sha256:[a-f0-9]{64}$/u.test(p.report_digest));
    assert.match(p.run_id, /^[a-zA-Z0-9._-]{1,100}$/u); assert.match(p.outcome, /^[a-z_]{1,80}$/u);
    assert.ok(Number.isSafeInteger(p.failure_count) && p.failure_count >= 0);
    assert.equal(typeof p.unknown_quality, 'boolean');
    assertPublicInstructionSummary(p.result_summary);
    if(p.report_revision!==undefined){const r=p.report_revision;assert.deepEqual(Object.keys(r).sort(),['original_report_digest','effective_report_digest','readout_digest','ledger_digest','selection_digest','human_decision_scope','approval_carried_forward'].sort());
      for(const k of ['original_report_digest','effective_report_digest','readout_digest','ledger_digest','selection_digest'])assert.match(r[k],/^sha256:[a-f0-9]{64}$/u);
      assert.equal(r.original_report_digest,p.report_digest);assert.equal(r.human_decision_scope,'original_packet_only');assert.equal(r.approval_carried_forward,false);}
    if(p.evaluation_summary!==undefined)validateInstructionEvaluationSummary(p.evaluation_summary,p.report_revision?.effective_report_digest??p.report_digest);
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
