import {decodeDrafts,encodeDrafts} from './session.mjs';
import { EditHistory } from './history.mjs';
const clone = value => structuredClone(value);
export function createEditor({ transport, tenantId }) {
  let tenant = tenantId, serial = 0;
  const rows = new Map(), operations = new Map(), listeners = new Map(), history = new EditHistory();
  function state(rowId) {
    if (!rows.has(rowId)) rows.set(rowId, { confirmed: transport.load(tenant, rowId), pending: {}, conflicts: [], status: 'idle' });
    return rows.get(rowId);
  }
  function notify(rowId) { for (const fn of listeners.get(rowId) ?? []) fn(clone(state(rowId))); }
  const api = {
    saveDrafts(){return encodeDrafts(tenant,[...operations.values()].filter(o=>o.status==='queued').map((o,i)=>({operationId:o.operationId,tenantId:o.tenantId,rowId:o.rowId,patch:o.patch,baseVersion:o.baseVersion,before:o.before,order:i+1})));},
    restoreDrafts(blob){const archive=decodeDrafts(blob);tenant=archive.tenantId;for(const d of archive.drafts){const id=api.edit(d.rowId,d.patch);operations.get(id).before=d.before;}return archive.drafts.length;},
    open(rowId, listener) {
      const subscriptions = listeners.get(rowId) ?? new Set();
      listeners.set(rowId, subscriptions); subscriptions.add(listener); listener(clone(state(rowId)));
      return () => subscriptions.delete(listener);
    },
    snapshot: rowId => clone(state(rowId)),
    edit(rowId, patch) {
      if (!patch || !Object.keys(patch).length || Object.keys(patch).some(k => !['name','quantity'].includes(k)) ||
          ('quantity' in patch && (!Number.isSafeInteger(patch.quantity) || patch.quantity < 0)) ||
          ('name' in patch && typeof patch.name !== 'string')) throw new Error('invalid edit');
      const current = state(rowId), operationId = `${tenant}:${++serial}`;
      const operation = { operationId, tenantId: tenant, rowId, baseVersion: current.confirmed.version, patch: clone(patch), before: clone(current.confirmed), status: 'queued', undone: false };
      operations.set(operationId, operation); history.record(operation);
      Object.assign(current.pending, patch); current.status = 'pending'; notify(rowId); return operationId;
    },
    flush(operationId) {
      const op = operations.get(operationId);
      if (!op || op.status !== 'queued') return;
      op.status = 'sent';
      transport.send({ operationId, tenantId: op.tenantId, rowId: op.rowId, baseVersion: op.baseVersion, patch: op.patch }, result => {
        const current = state(op.rowId);
        if (result.status === 'accepted') { current.confirmed = result.row; current.pending = {}; current.status = 'idle'; op.status = 'accepted'; }
        else { current.status = 'conflict'; current.conflicts = Object.keys(op.patch); op.status = result.status; }
        notify(op.rowId);
      });
    },
    receive(row) { const current = state(row.rowId); current.confirmed = clone(row); notify(row.rowId); },
    undo(rowId) {
      const op = history.latest(rowId); if (!op) return null;
      op.undone = true;
      if (op.status === 'queued') { op.status = 'cancelled'; state(rowId).pending = {}; state(rowId).status = 'idle'; notify(rowId); return null; }
      const patch = Object.fromEntries(Object.keys(op.patch).map(k => [k, op.before[k]]));
      return api.edit(rowId, patch);
    },
    switchTenant(nextTenant) { tenant = nextTenant; rows.clear(); for (const rowId of listeners.keys()) notify(rowId); },
  };
  return api;
}
