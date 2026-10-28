const copy = value => structuredClone(value);
export class EditTransport {
  #messages = new Map();
  constructor(server) { this.server = server; }
  load(tenantId, rowId) { return this.server.load(tenantId, rowId); }
  lookup(tenantId, operationId) { return this.server.lookup(tenantId, operationId); }
  changesSince(tenantId, rowId, version) { return this.server.changesSince(tenantId, rowId, version); }
  send(request, callback) {
    const attempts = this.#messages.get(request.operationId) ?? [];
    const message = { request: copy(request), callback, result: null, disconnected: false };
    attempts.push(message); this.#messages.set(request.operationId, attempts);
    return { attempt: attempts.length - 1, cancel: () => { message.disconnected = true; } };
  }
  #message(operationId, attempt) {
    const attempts = this.#messages.get(operationId);
    const message = attempt === undefined ? attempts?.at(-1) : attempts?.[attempt];
    if (!message) throw new Error('unknown message');
    return message;
  }
  accept(operationId, attempt) {
    const message = this.#message(operationId, attempt);
    message.result = this.server.request(message.request);
    return copy(message.result);
  }
  deliver(operationId, attempt) {
    const message = this.#message(operationId, attempt);
    if (!message.result) throw new Error('accept before delivery');
    if (!message.disconnected) message.callback(copy(message.result));
  }
  duplicate(operationId, attempt) { this.deliver(operationId, attempt); }
  disconnect(operationId, attempt) { this.#message(operationId, attempt).disconnected = true; }
  pending() { return [...this.#messages.values()].flat().map(message => copy(message.request)); }
}
