import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from './content-addressed-store.mjs';
import { buildSkillUsageEvidence } from './skill-usage-evidence.mjs';
function input(adapter) {
  const environment = { adapter, bindings: [{ asset: { asset_type: 'skill', stable_id: 'ask.skill.verify' },
    files: [{ source: 'skills/verify/SKILL.md', target: `.${adapter === 'codex' ? 'agents' : 'claude'}/skills/verify/SKILL.md` }] }] };
  return { environment, environmentObjectDigest: canonicalDigest(environment), runId: 'private-run', sessionId: 'private-session', producerVersion: 'observed-cli' };
}
for (const adapter of ['codex', 'claude_code']) test(`${adapter}: minimize OTLP evidence and keep self-report separate`, () => {
  const options = input(adapter);
  const attributes = Object.entries({ 'event.name': adapter === 'codex' ? 'codex.skill_invocation' : 'skill_activated',
    [adapter === 'codex' ? 'conversation.id' : 'session.id']: options.sessionId, 'skill.name': 'verify',
    'skill.invocation_type': 'implicit', invocation_trigger: 'claude-proactive', prompt: 'DO NOT RETAIN', email: 'private@example.com' })
    .map(([key, value]) => ({ key, value: { stringValue: value } }));
  const result = buildSkillUsageEvidence({ ...options, input: { resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes }] }] }] }, selfReportedSkillIds: [] });
  assert.equal(result.mechanical_status, 'observed_partial');
  assert.equal(result.mechanical_observations[0].evidence_kind, 'detected_invocation');
  assert.deepEqual(result.self_report, { status: 'reported', asset_ids: [] });
  assert.equal(result.quality_effect_implied, false);
  for (const text of ['DO NOT RETAIN', 'private@example.com', options.sessionId, options.runId]) assert.ok(!JSON.stringify(result).includes(text));
  assert.throws(() => buildSkillUsageEvidence({ ...options, input: [{ attributes: Object.fromEntries(attributes.map(a => [a.key, a.value.stringValue])).valueOf(), 'conversation.id': 'wrong' }], sessionId: 'foreign' }), /session/);
});
test('Claude hook paths distinguish attempt, success, failure, and direct command expansion', () => {
  const options = input('claude_code');
  const hooks = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptExpansion'].map(hook_event_name => ({
    hook_event_name, session_id: options.sessionId, tool_name: 'Skill', tool_input: { skill: 'verify', args: 'secret args' },
    expansion_type: 'slash_command', command_name: 'verify', prompt: 'secret prompt' }));
  const result = buildSkillUsageEvidence({ ...options, input: hooks });
  assert.deepEqual(result.mechanical_observations.map(x => x.evidence_kind).sort(), ['command_expansion', 'tool_attempt', 'tool_failed', 'tool_succeeded']);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('missing, disabled, redacted and unrecognized evidence never means unused', () => {
  const options = input('claude_code');
  for (const captureState of ['available', 'disabled', 'unsupported', 'unknown']) {
    const result = buildSkillUsageEvidence({ ...options, captureState });
    assert.equal(result.mechanical_status, 'not_observed');
    assert.equal(result.self_report.status, 'not_reported');
  }
  const result = buildSkillUsageEvidence({ ...options, input: [{ 'event.name': 'skill_activated', 'session.id': options.sessionId, 'skill.name': 'custom_skill' }] });
  assert.equal(result.redacted_event_count, 1); assert.equal(result.mechanical_observations.length, 0);
  assert.throws(() => buildSkillUsageEvidence({ ...options, selfReportedSkillIds: ['unknown'] }), /registered/);
});
