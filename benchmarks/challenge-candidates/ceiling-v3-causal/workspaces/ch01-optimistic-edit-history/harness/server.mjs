import { isDeepStrictEqual } from 'node:util';
const copy = value => structuredClone(value);
export const rowKey = (tenantId, rowId) => JSON.stringify([tenantId, rowId]);
export class EditServer {
  #rows = new Map();
  #accepted = new Map();
  #changes = new Map();
  constructor(rows) { for (const row of rows) this.#rows.set(rowKey(row.tenantId, row.rowId), copy(row)); }
  load(tenantId, rowId) { return copy(this.#rows.get(rowKey(tenantId, rowId)) ?? null); }
  changesSince(tenantId, rowId, version) {
    return [...new Set((this.#changes.get(rowKey(tenantId, rowId)) ?? [])
      .filter(change => change.version > version).flatMap(change => change.fields))];
  }
  lookup(tenantId, operationId) { return copy(this.#accepted.get(rowKey(tenantId, operationId))?.result ?? null); }
  request(request) {
    const { tenantId, rowId, operationId, baseVersion, patch } = request;
    const key = rowKey(tenantId, operationId), previous = this.#accepted.get(key);
    if (previous) return isDeepStrictEqual(previous.request, request) ? copy(previous.result) : { status: 'id_conflict' };
    if (!patch || !Object.keys(patch).length || Object.keys(patch).some(k => !['name','quantity'].includes(k)) ||
        ('quantity' in patch && (!Number.isSafeInteger(patch.quantity) || patch.quantity < 0)) ||
        ('name' in patch && typeof patch.name !== 'string')) return { status: 'invalid' };
    const row = this.load(tenantId, rowId);
    if (!row) return { status: 'missing' };
    if (row.version !== baseVersion) return { status: 'conflict', row };
    const next = { ...row, ...copy(patch), version: row.version + 1 };
    const identity = rowKey(tenantId, rowId);
    this.#rows.set(identity, next);
    const changes = this.#changes.get(identity) ?? [];
    changes.push({ version: next.version, fields: Object.keys(patch) });
    this.#changes.set(identity, changes);
    const result = { status: 'accepted', row: copy(next), operationId };
    this.#accepted.set(key, { request: copy(request), result });
    return copy(result);
  }
  external(tenantId, rowId, patch) {
    const row = this.load(tenantId, rowId);
    if (!row) throw new Error('missing row');
    const result = this.request({ tenantId, rowId, patch, baseVersion: row.version, operationId: `external:${rowId}:${row.version}` });
    if (result.status !== 'accepted') throw new Error(result.status);
    return result.row;
  }
}
