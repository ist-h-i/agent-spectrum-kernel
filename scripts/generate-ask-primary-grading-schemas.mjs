import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY_PROFILE_SCHEMAS } from './ask-primary-evaluation-scope.mjs';
import { PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID, getPrimaryEvaluationProfile } from './ask-primary-evaluation-profile.mjs';
import { PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION, PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION } from './ask-benchmark-command-evidence.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export function primarySchemaBytes(name, { root = ROOT, profileId = PRIMARY_EVALUATION_PROFILE_ID } = {}) {
  const profile = getPrimaryEvaluationProfile(profileId);
  const value = JSON.parse(readFileSync(resolve(root, `benchmarks/schemas/${name}.schema.json`)));
  function extend(item) {
    if (!item || typeof item !== 'object') return;
    if (JSON.stringify(item.enum) === JSON.stringify(['plain', 'kernel_only', 'adaptive_ask', 'full_ask'])) item.enum = [...profile.conditions];
    // Only primary capture schemas admit the explicitly versioned saved parser.
    if (item.properties?.parser_revision?.const === '1.3.0') item.properties.parser_revision = { enum: ['1.3.0', '1.4.0-primary-saved'] };
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
export function generatePrimaryCommandEvidenceV2Schemas({ check = false, root = ROOT } = {}) {
  for (const profileId of [PRIMARY_EVALUATION_PROFILE_ID, PRIMARY_PRINCIPLES_V2_EVALUATION_PROFILE_ID]) {
    const profile = getPrimaryEvaluationProfile(profileId);
    const value = JSON.parse(primarySchemaBytes('portfolio-command-evidence', { root, profileId }));
    function select(item) {
      if (!item || typeof item !== 'object') return;
      if (item.properties?.parser_revision?.enum) item.properties.parser_revision = { const: PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION };
      for (const child of Object.values(item)) select(child);
    }
    select(value);
    value.title += ' (explicit saved-command processing v2)';
    const path = resolve(root, `benchmarks/schemas/${profile.schema_prefix}-saved-v2-portfolio-command-evidence.schema.json`);
    const raw = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (check) { if (!readFileSync(path).equals(raw)) throw new Error('stale primary v2 command evidence schema'); }
    else writeFileSync(path, raw, { flag: 'wx' });
  }
}
export function generatePrimaryCommandEvidenceV3Schemas({ check = false, root = ROOT } = {}) {
  for (const prefix of ['primary', 'primary-k2']) {
    const value = JSON.parse(readFileSync(resolve(root, `benchmarks/schemas/${prefix}-saved-v2-portfolio-command-evidence.schema.json`)));
    function select(item) {
      if (!item || typeof item !== 'object') return;
      if (item.const === PRIMARY_SAVED_COMMAND_EVIDENCE_V2_PARSER_REVISION) item.const = PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION;
      for (const child of Object.values(item)) select(child);
    }
    select(value); value.title = value.title.replace('processing v2', 'processing v3');
    const path = resolve(root, `benchmarks/schemas/${prefix}-saved-v3-portfolio-command-evidence.schema.json`);
    const raw = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (check) { if (!readFileSync(path).equals(raw)) throw new Error('stale primary v3 command evidence schema'); }
    else writeFileSync(path, raw, { flag: 'wx' });
  }
}
export function generatePrimaryCommandEvidenceV4Schemas({ check = false, root = ROOT } = {}) {
  for (const prefix of ['primary', 'primary-k2']) {
    const value = JSON.parse(readFileSync(resolve(root, `benchmarks/schemas/${prefix}-saved-v3-portfolio-command-evidence.schema.json`)));
    function select(item) {
      if (!item || typeof item !== 'object') return;
      if (item.const === PRIMARY_SAVED_COMMAND_EVIDENCE_V3_PARSER_REVISION) item.const = PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION;
      for (const child of Object.values(item)) select(child);
    }
    select(value); value.title = value.title.replace('processing v3', 'processing v4');
    const path = resolve(root, `benchmarks/schemas/${prefix}-saved-v4-portfolio-command-evidence.schema.json`);
    const raw = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (check) { if (!readFileSync(path).equals(raw)) throw new Error('stale primary v4 command evidence schema'); }
    else writeFileSync(path, raw, { flag: 'wx' });
  }
}
export function generatePrimaryCommandEvidenceV5Schemas({ check = false, root = ROOT } = {}) {
  for (const prefix of ['primary', 'primary-k2']) {
    const value = JSON.parse(readFileSync(resolve(root, `benchmarks/schemas/${prefix}-saved-v4-portfolio-command-evidence.schema.json`)));
    function select(item) {
      if (!item || typeof item !== 'object') return;
      if (item.const === PRIMARY_SAVED_COMMAND_EVIDENCE_V4_PARSER_REVISION) item.const = PRIMARY_SAVED_COMMAND_EVIDENCE_V5_PARSER_REVISION;
      for (const child of Object.values(item)) select(child);
    }
    select(value); value.title = value.title.replace('processing v4', 'processing v5');
    // No raw command text: the finite grammar trace can only copy public bytes.
    value.$defs.commandEvidence.required.push('literal_word_encoding');
    value.$defs.commandEvidence.properties.literal_word_encoding = {
      type: ['string', 'null'], minLength: 1, maxLength: 1048576, pattern: '^[lensd]+$',
    };
    const path = resolve(root, `benchmarks/schemas/${prefix}-saved-v5-portfolio-command-evidence.schema.json`);
    const raw = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (check) { if (!readFileSync(path).equals(raw)) throw new Error('stale primary v5 command evidence schema'); }
    else writeFileSync(path, raw, { flag: 'wx' });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const generate = process.argv.includes('--command-evidence-v5') ? generatePrimaryCommandEvidenceV5Schemas : process.argv.includes('--command-evidence-v4') ? generatePrimaryCommandEvidenceV4Schemas : process.argv.includes('--command-evidence-v3') ? generatePrimaryCommandEvidenceV3Schemas
    : process.argv.includes('--command-evidence-v2') ? generatePrimaryCommandEvidenceV2Schemas : generatePrimaryGradingSchemas;
  generate({ check: process.argv.includes('--check') }); console.log('Primary grading schemas verified');
}
