import { readFileSync } from 'node:fs';
import { mayAccess as before } from '../base/authorization.mjs';
import { mayAccess as after } from '../src/authorization.mjs';

const ordinary = new Set(['owner-same-tenant', 'service-system-read', 'support-approved-read', 'ordinary-stranger']);
const cases = JSON.parse(readFileSync(new URL('../data/access-cases.json', import.meta.url)));
export const trace = cases.filter(row => ordinary.has(row.case_id)).map(({ case_id, actor, resource, action, exceptions, now }) => ({
  case_id,
  before_allowed: before(actor, resource, action, exceptions, now),
  after_allowed: after(actor, resource, action, exceptions, now),
}));
if (process.argv[1] && new URL('file://' + process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(trace, null, 2));
}
