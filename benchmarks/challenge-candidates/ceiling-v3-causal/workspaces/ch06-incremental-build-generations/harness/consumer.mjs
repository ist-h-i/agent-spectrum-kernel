export function buildView(publisher) {
  const current = publisher.latest();
  if (!current) return { generation: null, successful: [], failed: [] };
  return {
    generation: current.generation,
    successful: Object.keys(current.results).filter(path => current.results[path].status === 'ok').sort(),
    failed: Object.keys(current.results).filter(path => current.results[path].status !== 'ok').sort()
  };
}
