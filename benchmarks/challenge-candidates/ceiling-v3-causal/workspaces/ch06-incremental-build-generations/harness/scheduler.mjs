export async function flushMicrotasks(rounds = 20) {
  for (let turn = 0; turn < rounds; turn++) await Promise.resolve();
}

export async function drain(compiler, { maxSteps = 1000, order = 'first' } = {}) {
  for (let step = 0; step < maxSteps; step++) {
    await flushMicrotasks();
    const pending = compiler.pending();
    if (!pending.length) return;
    compiler.complete(order === 'last' ? pending.at(-1).id : pending[0].id);
  }
  throw new Error('Compiler did not quiesce within finite scheduler limit');
}
