import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY_PROFILE_SCHEMAS } from './ask-primary-evaluation-scope.mjs';
import { PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID, getPrimaryEvaluationProfile } from './ask-primary-evaluation-profile.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export function primarySchemaBytes(name, { root = ROOT, profileId = PRIMARY_EVALUATION_PROFILE_ID } = {}) {
  const profile = getPrimaryEvaluationProfile(profileId);
  const value = JSON.parse(readFileSync(resolve(root, `benchmarks/schemas/${name}.schema.json`)));
  function extend(item) {
    if (!item || typeof item !== 'object') return;
    if (JSON.stringify(item.enum) === JSON.stringify(['plain', 'kernel_only', 'adaptive_ask', 'full_ask'])) item.enum = [...profile.conditions];
    for (const child of Object.values(item)) extend(child);
  }
  extend(value); value.title = `Primary grading compatibility profile: ${value.title}`;
  if (profile.id === PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID) value.title = value.title.replace('Primary grading compatibility profile:', 'Primary K-principles v2 grading compatibility profile:');
  value.$comment = 'Additive actual-condition schema; original wire schema_path retained. Requires reverified primary controller producer scope. No scoring rules changed.';
  const coverage = value.properties?.completeness?.properties?.by_condition;
  if (coverage) { if (coverage.minItems === 4) coverage.minItems = 3; if (coverage.maxItems === 4) coverage.maxItems = 3; }
  return Buffer.from(JSON.stringify(value, null, 2) + '\n');
}
export function generatePrimaryGradingSchemas({ check = false, root = ROOT } = {}) {
  for (const profileId of [PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID]) for (const name of PRIMARY_PROFILE_SCHEMAS) {
    const profile = getPrimaryEvaluationProfile(profileId);
    const path = resolve(root, `benchmarks/schemas/${profile.schema_prefix}-${name}.schema.json`), bytes = primarySchemaBytes(name, { root, profileId });
    if (check) { if (!readFileSync(path).equals(bytes)) throw new Error(`stale primary schema: ${name}`); }
    else if (profileId === PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID) writeFileSync(path, bytes, { flag: 'wx' });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { generatePrimaryGradingSchemas({ check: process.argv.includes('--check') }); console.log('Primary grading schemas verified'); }
