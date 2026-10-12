// Closed actual-condition profiles. Selection grants no execution or scoring authority.
import assert from 'node:assert/strict';

export const PRIMARY_EVALUATION_PROFILE_ID = 'primary_single_shot_v1';
export const PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID = 'primary_principles_v2_single_shot_v1';
export const PRIMARY_EVALUATION_CONDITIONS = Object.freeze(['plain', 'kernel_principles_v1', 'full_ask']);
export const PRIMARY_PRINCIPLES_V2_EVALUATION_CONDITIONS = Object.freeze(['plain', 'kernel_principles_v2', 'full_ask']);
const profiles = Object.freeze([
  Object.freeze({ id: PRIMARY_EVALUATION_PROFILE_ID, profile_id: PRIMARY_EVALUATION_PROFILE_ID,
    kernel_condition: 'kernel_principles_v1', conditions: PRIMARY_EVALUATION_CONDITIONS, schema_prefix: 'primary' }),
  Object.freeze({ id: PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID, profile_id: PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID,
    kernel_condition: 'kernel_principles_v2', conditions: PRIMARY_PRINCIPLES_V2_EVALUATION_CONDITIONS, schema_prefix: 'primary-k2' }),
]);
export function getPrimaryEvaluationProfile(profileId) {
  const profile = profiles.find(value => value.id === profileId);
  assert.ok(profile, 'primary unknown evaluation profile'); return profile;
}
export function primaryProfileForKernel(kernelCondition) {
  const profile = profiles.find(value => value.kernel_condition === kernelCondition);
  assert.ok(profile, 'primary condition aliases forbidden'); return profile;
}
export function primaryProfileForRequest(request) {
  const profile = getPrimaryEvaluationProfile(request?.profile_id);
  assert.equal(request.binding?.profile_id, profile.id, 'primary request binding profile mismatch');
  if (request.evaluator_binding !== undefined) assert.equal(request.evaluator_binding?.profile_id, profile.id, 'primary evaluator binding profile mismatch');
  assert.deepEqual(request.conditions, profile.conditions, 'primary actual condition IDs required');
  assert.deepEqual(request.slots?.map(slot => slot.condition), profile.conditions, 'primary request slot condition mismatch');
  return profile;
}
