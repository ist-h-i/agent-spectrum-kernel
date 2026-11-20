// The published portfolio owns task metadata. This digest retains the fixed
// admission boundary previously enforced by a second list of the same rows.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../benchmarks/portfolio-catalog.json', import.meta.url)));
const rows = catalog.fixtures.filter(row => row.fixture_role === 'primary')
  .map(row => [row.fixture_id, row.suite, row.task_class, row.domain, row.difficulty, row.repetitions]);
assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
  '07953cbc9c24e373bd2f7fe54bd2df9b501de4b1d48d7156b3bb2bb582bd91f4',
  'fixed primary admission metadata changed');
export const PRIMARY_FIXTURE_REGISTRY = Object.freeze(rows.map(Object.freeze));
