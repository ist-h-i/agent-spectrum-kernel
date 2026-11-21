import { openWorkspace } from './database.mjs';
import { observe } from './operator.mjs';
import { readCard, importSheet, recheck, sheet } from '../src/workspace.mjs';
import { queue, dispatch, recover, job } from '../src/delivery.mjs';
import * as relief from '../src/workspace.mjs';
import { send, lookup } from './printer.mjs';

const directory = process.argv[2];
const q = JSON.parse(process.argv[3]);
const db = openWorkspace(directory);
const context = {
  db,
  progress: detail => observe('member', detail),
  send: (...args) => send(directory, ...args),
  lookup: (...args) => lookup(directory, ...args),
};
try {
  const op = {read:readCard,import:importSheet,recheck,sheet,queue,dispatch,recover,job,queueReceipt:relief.queueReceipt,handover:relief.handover,auditBook:relief.auditBook}[q.op];
  if (!op) throw new Error('unknown desk operation');
  const result = await op(context,q);
  console.log(JSON.stringify(result));
} finally {
  db.close();
}
