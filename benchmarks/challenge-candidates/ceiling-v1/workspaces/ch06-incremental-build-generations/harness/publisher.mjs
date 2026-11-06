export function createPublisher() {
  const history = [];
  return {
    publish(result) { history.push(structuredClone(result)); },
    latest() { return history.length ? structuredClone(history.at(-1)) : null; },
    history() { return structuredClone(history); }
  };
}
