export class ProcessCrash extends Error { constructor(point) { super(`process stopped at ${point}`); this.code = 'PROCESS_CRASH'; } }
export class Faults {
  #stops = new Set();
  #hooks = new Map();
  stop(point) { this.#stops.add(point); }
  hook(point, fn) { this.#hooks.set(point, fn); }
  hit(point) {
    const fn = this.#hooks.get(point); this.#hooks.delete(point); fn?.();
    if (this.#stops.delete(point)) throw new ProcessCrash(point);
  }
}
