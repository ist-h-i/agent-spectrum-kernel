// Synthetic public prose only. No private matcher, oracle or evaluator worker.
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTargetRequirement } from './ask-review-target-requirement.mjs';
const target = { aliases: ['telemetry', 'diagnostics upload', 'テレメトリ'] };
for (const [text, expected] of [
  ['Fix telemetry before merge.', 'required'],
  ['Require telemetry to pass before merge.', 'required'],
  ['Telemetry must succeed before merge.', 'required'],
  ['Repair diagnostics upload to unblock merge.', 'required'],
  ['テレメトリの成功をマージの必須条件にする。', 'required'],
  ['Keep telemetry non-blocking.', 'not_required'],
  ['Telemetry is optional.', 'not_required'],
  ['Do not require telemetry before merge.', 'not_required'],
  ['Telemetry need not pass.', 'not_required'],
  ['テレメトリは必須ではない。', 'not_required'],
  ['Fix required tests before merge. Telemetry is optional.', 'not_required'],
  ['Run the required, failure-blocking workflow test step and obtain passing evidence. Keep telemetry failure handling separate; the documented continue-on-error upload is acceptable.', 'unknown'],
  ['Telemetry failed. Fix required tests to unblock merge.', 'unknown'],
  ['Fix tests and telemetry before merge.', 'unknown'],
  ['If telemetry fails, fix it before merge.', 'unknown'],
  ['Consider requiring telemetry before merge.', 'unknown'],
  ['The example says "fix telemetry before merge".', 'unknown'],
  ['Telemetry is optional. Telemetry must succeed before merge.', 'unknown'],
  ['Telemetry must succeed before merge unless its failure is optional.', 'unknown'],
  ['No telemetry change is requested.', 'unknown'],
  ['Require telemetry to be optional.', 'unknown'],
  ['Require telemetry not to block merge.', 'unknown'],
]) test(expected + ': ' + text, () => assert.equal(classifyTargetRequirement(text, target), expected));
test('target aliases are literal strings, not regular expressions', () => {
  assert.equal(classifyTargetRequirement('Tests must pass before merge.', { aliases: ['.*'] }), 'unknown');
});
test('missing or oversized inputs remain unknown', () => {
  assert.equal(classifyTargetRequirement(null, target), 'unknown');
  assert.equal(classifyTargetRequirement('Telemetry must pass.', { aliases: [] }), 'unknown');
  assert.equal(classifyTargetRequirement('Telemetry must pass.' + 'x'.repeat(10000), target), 'unknown');
});
