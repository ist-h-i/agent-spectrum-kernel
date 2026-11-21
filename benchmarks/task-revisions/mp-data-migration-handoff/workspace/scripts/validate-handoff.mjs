import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = path => JSON.parse(readFileSync(join(workspace, path), 'utf8'));
const lines = path => readFileSync(join(workspace, path), 'utf8').trimEnd().split('\n').map(line => JSON.parse(line));
const report = JSON.parse(readFileSync(process.argv[2] ?? 'handoff.json', 'utf8'));
const schema = load('handoff.schema.json');

function validate(spec, value, path) {
  if (spec.$ref) return validate(schema.$defs[spec.$ref.slice('#/$defs/'.length)], value, path);
  if (spec.enum) {
    assert.ok(spec.enum.includes(value), path + ' requires an enumerated value');
    return;
  }
  const types = Array.isArray(spec.type) ? spec.type : [spec.type];
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : typeof value;
  assert.ok(types.includes(actual), path + ' has the wrong type');
  if (actual === 'object') {
    assert.deepEqual(Object.keys(value).sort(), Object.keys(spec.properties).sort(), path + ' fields');
    for (const [key, field] of Object.entries(spec.properties)) validate(field, value[key], path + '.' + key);
  } else if (actual === 'array') {
    assert.ok(value.length >= spec.minItems, path + ' is empty');
    if (spec.uniqueItems) assert.equal(new Set(value.map(item => JSON.stringify(item))).size, value.length, path + ' contains duplicates');
    value.forEach((item, i) => validate(spec.items, item, path + '[' + i + ']'));
  } else if (actual === 'integer') {
    assert.ok(value >= spec.minimum, path + ' is out of range');
  } else if (actual === 'string' && spec.minLength) {
    assert.ok(value.trim().length >= spec.minLength, path + ' must contain text');
  }
}

function matchIds(rows, field, expected) {
  assert.deepEqual(rows.map(row => row[field]).sort(), [...expected].sort(), 'unexpected or missing ' + field);
}
validate(schema, report, 'handoff');
const {assignments} = load('operations/work-orders.json');
const {pages} = load('operations/pages.json');
const catalog = load('operations/commands.json');
matchIds(report.dispatch, 'work', assignments.map(row => row.id));
matchIds(report.pages, 'page', pages.map(row => row.page));
const records = new Set([
  ...assignments, ...load('state/routing.json').entries, ...load('evidence/compatibility.json').certifications,
  ...lines('evidence/checkpoint-journal.ndjson'), ...lines('state/grants.ndjson'),
  ...lines('evidence/comparisons.ndjson'), ...lines('evidence/outbox.ndjson'),
].map(record => record.id));

function validateDecision(row, available) {
  const command = catalog.dispatch.find(item => item.id === row.next.command);
  assert.ok(command, 'unknown command');
  assert.equal(typeof row.next.delivery_key === 'string', command.delivery_key, 'key requirement differs from command');
  assert.ok(row.sources.every(id => available.has(id)), 'unknown or out-of-scope evidence');
}
for (const row of report.dispatch) validateDecision(row, records);
for (const row of report.pages) {
  const page = pages.find(item => item.page === row.page);
  validateDecision(row, new Set([...records, page.page, ...page.entries.map(entry => entry.id)]));
}
assert.ok(report.containment.actions.every(id => catalog.incident_actions.includes(id)), 'unknown incident action');
assert.ok(report.containment.retain.every(id => catalog.record_stores.includes(id)), 'unknown record store');
console.log(JSON.stringify({validation: 'pass', assignments: report.dispatch.length, pages: report.pages.length}));
