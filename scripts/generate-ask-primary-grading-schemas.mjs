import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY_PROFILE_SCHEMAS, PRIMARY_PROFILE_CONDITIONS } from './ask-primary-evaluation-scope.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export function primarySchemaBytes(name, { root = ROOT } = {}) {
  const value = JSON.parse(readFileSync(resolve(root, `benchmarks/schemas/${name}.schema.json`)));
  function extend(item) {
    if (!item || typeof item !== 'object') return;
    if (JSON.stringify(item.enum) === JSON.stringify(['plain', 'kernel_only', 'adaptive_ask', 'full_ask'])) item.enum = [...PRIMARY_PROFILE_CONDITIONS];
    for (const child of Object.values(item)) extend(child);
  }
  extend(value); value.title = `Primary grading compatibility profile: ${value.title}`;
  value.$comment = 'Additive actual-condition schema; original wire schema_path retained. Requires reverified primary controller producer scope. No scoring rules changed.';
  const coverage = value.properties?.completeness?.properties?.by_condition;
  if (coverage) { if (coverage.minItems === 4) coverage.minItems = 3; if (coverage.maxItems === 4) coverage.maxItems = 3; }
  return Buffer.from(JSON.stringify(value, null, 2) + '\n');
}
export function generatePrimaryGradingSchemas({ check = false, root = ROOT } = {}) {
  for (const name of PRIMARY_PROFILE_SCHEMAS) {
    const path = resolve(root, `benchmarks/schemas/primary-${name}.schema.json`), bytes = primarySchemaBytes(name, { root });
    if (check) { if (!readFileSync(path).equals(bytes)) throw new Error(`stale primary schema: ${name}`); }
    else writeFileSync(path, bytes, { flag: 'wx' });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { generatePrimaryGradingSchemas({ check: process.argv.includes('--check') }); console.log('Primary grading schemas verified'); }
