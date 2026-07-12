export class SerialExecutor {
  #tail = Promise.resolve();

  run(operation) {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.catch(() => {});
    return result;
  }
}
