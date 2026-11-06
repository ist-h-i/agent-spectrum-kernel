import { toV1, toV2 } from './money.mjs';

export class MigrationService {
  constructor(store) { this.store = store; }
  readV1(id) { return this.store.read(id)?.v1 ?? null; }
  readV2(id) {
    const row = this.store.read(id);
    return row ? row.v2 ?? toV2(row.v1) : null;
  }
  writeV1(id, value, context) {
    const row = this.store.read(id);
    const next = { v1: value, v2: toV2(value) };
    return { ok: this.store.compareAndSet(id, row?.revision ?? 0, next) };
  }
  writeV2(id, value, context) {
    if (this.store.state().phase === 'mixed' && value?.taxMode === 'excluded') return { ok: false, reason: 'mixed-tax-mode' };
    const row = this.store.read(id);
    return { ok: this.store.compareAndSet(id, row?.revision ?? 0, { v1: toV1(value), v2: value }) };
  }
  backfill() {
    const report = { migrated: [], skipped: [], conflicts: [] };
    for (const row of this.store.scan()) {
      try {
        const value = toV2(row.v1);
        this.store.checkpoint('backfill:read');
        const current = this.store.read(row.id);
        this.store.compareAndSet(row.id, current.revision, { ...row, v2: value });
        report.migrated.push(row.id);
      } catch (error) { report.skipped.push({ id: row.id, reason: error.message }); }
    }
    return report;
  }
  drainQueue() {
    for (const item of this.store.state().queue.filter(entry => entry.status === 'pending')) {
      const command = item.command;
      const result = command.version === 'v1'
        ? this.writeV1(command.id, command.value, command)
        : this.writeV2(command.id, command.value, command);
      this.store.settle(item.id, result);
    }
    return this.store.state().queue;
  }
  activateV2() {
    const state = this.store.state();
    if (Object.values(state.writers).some(writer => writer.active && writer.version === 'v1')) return { ok: false, reason: 'active-v1' };
    if (state.queue.some(item => item.status === 'pending')) return { ok: false, reason: 'pending-queue' };
    return { ok: this.store.updateControl(state.revision, { ...state, phase: 'v2', epoch: state.epoch + 1 }) };
  }
  rollback() {
    const state = this.store.state();
    return { ok: this.store.updateControl(state.revision, { ...state, phase: 'mixed', epoch: state.epoch + 1 }) };
  }
}
