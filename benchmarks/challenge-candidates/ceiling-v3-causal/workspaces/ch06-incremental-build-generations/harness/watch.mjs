export function nextSnapshot(previous, event) {
  const snapshot = structuredClone(previous);
  snapshot.generation = event.generation;
  if (event.put) snapshot.files[event.put.path] = structuredClone(event.put.file);
  if (event.delete) delete snapshot.files[event.delete];
  if (event.config) snapshot.config = structuredClone(event.config);
  if (event.compilerVersion) snapshot.compilerVersion = event.compilerVersion;
  return snapshot;
}
