// Newly authored public prose and a fake consumer. No private evaluation assets.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as review from './ask-review-target-requirement.mjs';

const method = { aliases: ['event.preventDefault()'] };
const suite = { aliases: ['widget integration suite', 'widget interaction tests'] };
const options = { revision: '2' };
test('v2 preserves a method-name dot and ignores unrelated explanation', () => {
  assert.equal(review.classifyTargetRequirement('Call event.preventDefault(). Preserve the synthetic focus order.', method, options), 'required');
  assert.equal(review.classifyTargetRequirement('Call event.preventDefault(). Preserve the synthetic focus order.', method), 'unknown');
});
test('v2 permits an exact target phrase without generalizing its qualifiers', () => {
  const target = { aliases: ['event.preventDefault() for every synthetic key'] };
  assert.equal(review.classifyTargetRequirement('Call event.preventDefault() for every synthetic key. Preserve the label.', target, options), 'required');
  assert.equal(review.classifyTargetRequirement('Call event.preventDefault() for some synthetic keys.', target, options), 'unknown');
});
test('v2 recognizes a direct observed failure beside unrelated source explanation', () => {
  assert.equal(review.classifyObservedVerification('Verified: widget integration suite failed. The code has two handlers.', suite), 'failed');
  assert.equal(review.classifyObservedVerification('The widget interaction tests failed; source code was inspected.', suite), 'failed');
});
test('a synthetic consumer checks observations independently instead of trusting a state label', () => {
  const actual = 'failed';
  const consume = value => {
    const recognized = review.classifyObservedVerification(value.verification.evidence[0].conclusion, suite);
    return recognized !== 'unknown' && recognized === actual && value.verification.state === actual;
  };
  const artifact = { verification: { state: 'failed', evidence: [{ path: 'test/widget.mjs',
    conclusion: 'Verified: widget integration suite failed. The synthetic source has two handlers.' }] } };
  assert.equal(consume(artifact), true);
  assert.equal(consume({ verification: { state: 'failed', evidence: [{ path: 'test/widget.mjs', conclusion: 'Widget integration suite passed.' }] } }), false);
  assert.equal(consume({ verification: { state: 'passed', evidence: artifact.verification.evidence } }), false);
  assert.equal(consume({ verification: { state: 'failed', evidence: [{ path: 'test/widget.mjs', conclusion: 'The outcome is unclear.' }] } }), false);
});
for (const text of [
  'If the widget integration suite failed, investigate.',
  'The example says "widget integration suite failed".',
  'Widget integration suite should fail.',
  'Widget integration suite might have failed.',
  'Widget integration suite failed. Widget integration suite passed.',
  'Widget integration suite failed. All other tests passed.',
  'Widget integration suite failed. It did not fail.',
  'Widget integration suite failed. Explanation: widget integration suite passed.',
  'Widget integration suite failed?',
  'Widget integration suite did not fail.',
  'Widget integration suite failed. No failures occurred.',
  'Widget integration suite failed. No errors were found.',
]) test('unresolved observed assertion stays Unknown: ' + text, () => {
  assert.equal(review.classifyObservedVerification(text, suite), 'unknown');
});
for (const text of [
  'Call event.preventDefault(). Do not call event.preventDefault().',
  'If needed, call event.preventDefault().',
  'The example says "Call event.preventDefault()".',
  'Call event.preventDefault(). It need not be called.',
  'Call event.preventDefault(). event.preventDefault() is unnecessary.',
  'Maybe call event.preventDefault().',
  'Call event.preventDefault()?',
  'Call event.preventDefault(). Optional.',
  "Call event.preventDefault(). Don't.",
  'Call event.preventDefault(). Except on synthetic keys.',
]) test('ambiguous or contrary target instruction stays Unknown: ' + text, () => {
  assert.equal(review.classifyTargetRequirement(text, method, options), 'unknown');
});
test('subjects and aliases are literal, bounded and require a complete match', () => {
  assert.equal(review.classifyObservedVerification('Widget integration suite failed.', { aliases: ['.*'] }), 'unknown');
  assert.equal(review.classifyObservedVerification('Widget integration suite failed.', { aliases: [] }), 'unknown');
  assert.equal(review.classifyObservedVerification('x'.repeat(9000), suite), 'unknown');
  assert.equal(review.classifyTargetRequirement('Call event.preventDefault().', method, { revision: 'future' }), 'unknown');
  assert.equal(review.classifyObservedVerification('Widget integration suite failed.', suite, { revision: 'future' }), 'unknown');
});
