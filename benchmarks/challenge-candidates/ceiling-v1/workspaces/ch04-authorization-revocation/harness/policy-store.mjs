const copy = value => structuredClone(value);
export class PolicyStore {
  constructor(policies = {}) { this.policies = copy(policies); this.listeners = new Set(); this.notifications = []; }
  revision(tenant) { return this.policies[tenant]?.revision ?? null; }
  snapshot(tenant) { return copy(this.policies[tenant] ?? null); }
  replace(tenant, policy) {
    const revision = (this.policies[tenant]?.revision ?? 0) + 1;
    this.policies[tenant] = { ...copy(policy), revision };
    this.notifications.push({ tenant, revision });
    return { tenant, revision };
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  deliver(index = 0, duplicate = false) {
    const event = this.notifications[index];
    if (!event) throw new Error('notification-missing');
    if (!duplicate) this.notifications.splice(index, 1);
    for (const listener of this.listeners) listener(copy(event));
  }
}

export class ChunkAdapter {
  constructor(store) { this.store = store; this.accepted = new Map(); this.completed = []; this.next = 1; this.hook = null; this.loseReply = false; }
  beforeAccept(callback) { this.hook = callback; }
  loseNextReply() { this.loseReply = true; }
  beginChunk({ tenant, expectedRevision, resource, bytes }) {
    const hook = this.hook; this.hook = null; hook?.();
    if (this.store.revision(tenant) !== expectedRevision) return { status: 'revision-conflict' };
    const receipt = `chunk-${this.next++}`;
    this.accepted.set(receipt, { tenant, revision: expectedRevision, resource, bytes });
    if (this.loseReply) { this.loseReply = false; return { status: 'unknown' }; }
    return { status: 'accepted', receipt };
  }
  finish(receipt) {
    const chunk = this.accepted.get(receipt);
    if (!chunk) return { status: 'missing' };
    if (!this.completed.some(item => item.receipt === receipt)) this.completed.push({ receipt, ...copy(chunk) });
    return { status: 'completed', receipt };
  }
}
