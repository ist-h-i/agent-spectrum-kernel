export function createBuildSystem({ compiler, publisher, concurrency = 2 }) {
  const cache = new Map();
  return {
    async build(snapshot) {
      const results = {};
      for (const path of Object.keys(snapshot.files).sort()) {
        const file = snapshot.files[path];
        const key = JSON.stringify(file);
        let output = cache.get(key);
        if (!output) {
          const result = await compiler.compile({ snapshot, path, dependencies: {} });
          if (result.status !== 'ok') {
            results[path] = { status: 'failed', reason: result.reason ?? 'dependency' };
            continue;
          }
          output = result.output;
          cache.set(key, output);
        }
        results[path] = { status: 'ok', output };
      }
      publisher.publish({ generation: snapshot.generation, results });
      return { generation: snapshot.generation, results };
    }
  };
}
