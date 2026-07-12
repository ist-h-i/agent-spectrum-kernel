import { AuthError } from './errors.mjs';
import { sameDigest } from './tokens.mjs';

export class SessionStore {
  #records = new Map();
  #refreshIndex = new Map();

  constructor({ beforeWrite = async () => {} } = {}) {
    this.beforeWrite = beforeWrite;
  }

  create(session) {
    if (this.#records.has(session.id)) throw new AuthError('Duplicate session');
    const copy = structuredClone(session);
    this.#records.set(copy.id, copy);
    this.#refreshIndex.set(copy.refreshHash, copy.id);
    return structuredClone(copy);
  }

  getById(id) {
    const session = this.#records.get(id);
    return session ? structuredClone(session) : null;
  }

  findByRefreshHash(refreshHash) {
    const id = this.#refreshIndex.get(refreshHash);
    const session = id ? this.#records.get(id) : null;
    if (!session || !sameDigest(session.refreshHash, refreshHash)) return null;
    return structuredClone(session);
  }

  async rotate(id, expectedRefreshHash, nextRefreshHash) {
    await this.beforeWrite({ id, expectedRefreshHash, nextRefreshHash });
    const session = this.#records.get(id);
    if (!session) throw new AuthError();
    this.#refreshIndex.delete(expectedRefreshHash);
    session.refreshHash = nextRefreshHash;
    this.#refreshIndex.set(nextRefreshHash, id);
    return structuredClone(session);
  }
}
