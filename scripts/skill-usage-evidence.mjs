// Import caller-supplied local evidence only. Never enables an exporter, scans
// sessions, retains tool arguments, or infers successful reasoning/quality.
import assert from 'node:assert/strict';
import { canonicalDigest, putContentAddressedJson } from './content-addressed-store.mjs';
import { verifyInstructionEnvironment } from './instruction-environment.mjs';

function attributes(record) {
  if (!Array.isArray(record.attributes)) return record.attributes ?? record;
  return Object.fromEntries(record.attributes.map(a => [a.key,
    a.value?.stringValue ?? a.value?.boolValue ?? a.value?.intValue]));
}
function records(input) {
  if (Array.isArray(input)) return input;
  assert.ok(input && Array.isArray(input.resourceLogs), 'OTLP JSON or a local record array required');
  return input.resourceLogs.flatMap(r => (r.scopeLogs ?? []).flatMap(s => s.logRecords ?? []));
}
export function buildSkillUsageEvidence({ environmentObjectDigest, environment, runId, sessionId, producerVersion,
  input = [], selfReportedSkillIds = null, captureState = 'available' }) {
  assert.ok(['available', 'disabled', 'unsupported', 'unknown'].includes(captureState), 'capture status required');
  for (const [label, value] of Object.entries({ runId, sessionId, producerVersion })) assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 256, `${label} required`);
  assert.match(environmentObjectDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(canonicalDigest(environment), environmentObjectDigest, 'exact environment binding required');
  const names = new Map();
  for (const binding of [...environment.bindings, ...(environment.components ?? [])]) {
    if (binding.asset.asset_type !== 'skill') continue;
    for (const f of binding.files) {
      const match = f.target.match(/^\.(?:agents|claude)\/skills\/([^/]+)\/SKILL\.md$/);
      if (match) {
        assert.ok(!names.has(match[1]) || names.get(match[1]) === binding.asset.stable_id, 'ambiguous Skill name mapping');
        names.set(match[1], binding.asset.stable_id);
      }
    }
  }
  const all = records(input);
  assert.ok(all.length <= 10000, 'bounded record inventory required');
  if (captureState !== 'available') assert.equal(all.length, 0, 'unavailable capture cannot contain events');
  const observed = new Map(); let unmatched = 0, redacted = 0;
  for (const record of all) {
    const a = attributes(record);
    const event = a['event.name'] ?? record.event_name ?? record.hook_event_name ?? record.body?.stringValue;
    const codex = environment.adapter === 'codex';
    const otel = event === (codex ? 'codex.skill_invocation' : 'skill_activated') || !codex && event === 'claude_code.skill_activated';
    const hook = !codex && ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptExpansion'].includes(event);
    if (!otel && !hook) continue;
    const session = a['conversation.id'] ?? a['session.id'] ?? a.session_id ?? record.session_id;
    assert.equal(session, sessionId, 'foreign or missing evidence session binding');
    if (hook && event !== 'UserPromptExpansion' && record.tool_name !== 'Skill') continue;
    if (event === 'UserPromptExpansion' && record.expansion_type !== 'slash_command') continue;
    const name = otel ? a['skill.name'] : event === 'UserPromptExpansion' ? record.command_name : record.tool_input?.skill;
    if (name === 'custom_skill') { redacted++; continue; }
    const assetId = names.get(name);
    if (!assetId) { unmatched++; continue; }
    const kind = otel ? 'detected_invocation' : event === 'PreToolUse' ? 'tool_attempt'
      : event === 'PostToolUse' ? 'tool_succeeded' : event === 'PostToolUseFailure' ? 'tool_failed' : 'command_expansion';
    const trigger = otel ? codex ? a['skill.invocation_type'] : a.invocation_trigger : null;
    const safeTrigger = ['explicit', 'implicit', 'user-slash', 'claude-proactive', 'nested-skill'].includes(trigger) ? trigger : null;
    // Per-run presence only. Deliberately do not count invocations: upstream
    // best-effort deduplication and multiple hook paths prevent sound counting.
    const item = { asset_id: assetId, evidence_kind: kind, trigger: safeTrigger };
    observed.set(canonicalDigest(item), item);
  }
  if (selfReportedSkillIds !== null) {
    assert.ok(Array.isArray(selfReportedSkillIds) && selfReportedSkillIds.length <= 256 && new Set(selfReportedSkillIds).size === selfReportedSkillIds.length, 'bounded unique self-report required');
    const allowed = new Set([...environment.bindings, ...(environment.components ?? [])].filter(b => b.asset.asset_type === 'skill').map(b => b.asset.stable_id));
    assert.ok(selfReportedSkillIds.every(id => allowed.has(id)), 'self-report must reference registered environment Skills');
  }
  return { schema_version: '1.0.0', object_kind: 'skill_usage_evidence', adapter: environment.adapter,
    environment_object_digest: environmentObjectDigest, run_digest: canonicalDigest(runId), session_digest: canonicalDigest(sessionId),
    producer_version_digest: canonicalDigest(producerVersion), capture_state: captureState,
    mechanical_status: observed.size || redacted ? 'observed_partial' : 'not_observed',
    mechanical_observations: [...observed.values()].sort((a, b) => canonicalDigest(a).localeCompare(canonicalDigest(b))),
    unmatched_event_count: unmatched, redacted_event_count: redacted,
    self_report: { status: selfReportedSkillIds === null ? 'not_reported' : 'reported', asset_ids: [...(selfReportedSkillIds ?? [])].sort() },
    successful_read_implied: false, cognitive_use_implied: false, quality_effect_implied: false, authority_implied: false };
}
export function importSkillUsageEvidence(options) {
  const { environment } = verifyInstructionEnvironment(options);
  const evidence = buildSkillUsageEvidence({ ...options, environment });
  return { object_digest: putContentAddressedJson({ storeRoot: options.storeRoot, artifact: evidence }).digest, evidence };
}
