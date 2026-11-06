const copy = value => structuredClone(value);

export class PriceStore {
  constructor(records = []) {
    this.records = new Map(records.map(record => [record.id, copy(record)]));
    this.control = { revision: 1, phase: 'mixed', epoch: 1, writers: {}, queue: [] };
    this.hooks = new Map();
  }
  read(id) { return copy(this.records.get(id) ?? null); }
  scan() { return [...this.records.values()].map(copy).sort((a, b) => a.id.localeCompare(b.id)); }
  state() { return copy(this.control); }
  once(point, callback) { this.hooks.set(point, callback); }
  checkpoint(point) { const hook = this.hooks.get(point); this.hooks.delete(point); hook?.(); }
  compareAndSet(id, revision, next) {
    const current = this.records.get(id);
    if ((current?.revision ?? 0) !== revision) return false;
    this.records.set(id, { ...copy(next), id, revision: revision + 1 });
    return true;
  }
  updateControl(revision, next) {
    if (this.control.revision !== revision) return false;
    this.control = { ...copy(next), revision: revision + 1 };
    return true;
  }
  registerWriter(id, version) {
    if (!['v1', 'v2'].includes(version)) throw new Error('writer-version');
    if (version === 'v1' && this.control.phase === 'v2') throw new Error('v1-disabled');
    this.control.writers[id] = { version, active: true };
    this.control.revision++;
    return this.control.epoch;
  }
  retireWriter(id) {
    if (this.control.writers[id]) this.control.writers[id].active = false;
    this.control.revision++;
  }
  enqueue(id, command) {
    if (this.control.queue.some(item => item.id === id)) throw new Error('queue-id');
    this.control.queue.push({ id, command: copy(command), status: 'pending', reason: null });
    this.control.revision++;
  }
  settle(id, result) {
    const item = this.control.queue.find(entry => entry.id === id);
    if (!item) throw new Error('queue-missing');
    Object.assign(item, { status: result.ok ? 'applied' : 'rejected', reason: result.reason ?? null });
    this.control.revision++;
  }
}
