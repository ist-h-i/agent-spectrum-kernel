export function createEngine({ compiler, publisher, concurrency = 2, canCommit = () => true }) {
  const committed = new Map(), known = new Map(), waiters = [];
  let active = 0, request = 0;
  async function compile(input) {
    if (active >= concurrency) await new Promise(resolve => waiters.push(resolve));
    else active++;
    try { return await compiler.compile(input); }
    finally { if (waiters.length) waiters.shift()(); else active--; }
  }
  const identity = (snapshot,path) => JSON.stringify([path,snapshot.files[path],snapshot.compilerVersion,snapshot.config,compiler.inspect(snapshot,path)]);
  function cycles(nodes) {
    const color = new Map(), stack = [], found = new Map();
    function walk(path) {
      if (!nodes.has(path)) return;
      if (color.get(path) === 1) {
        const cycle = [...stack.slice(stack.indexOf(path)),path];
        for (const member of cycle.slice(0,-1)) found.set(member,cycle);
        return;
      }
      if (color.get(path) === 2) return;
      color.set(path,1); stack.push(path);
      for (const dep of nodes.get(path).deps) walk(dep);
      stack.pop(); color.set(path,2);
    }
    for (const path of nodes.keys()) walk(path);
    return found;
  }
  return {
    async build(input) {
      const snapshot = structuredClone(input), mine = ++request;
      const cache=new Map(committed),discoveries=new Map(known),used=new Set();
      const nodes = new Map(Object.keys(snapshot.files).sort().map(path => {
        const visible = compiler.inspect(snapshot,path);
        return [path,{ status:'pending', deps: discoveries.get(identity(snapshot,path)) ?? [...new Set([...visible.imports,...visible.globMatches])].sort() }];
      }));
      const running = new Map();
      while ([...nodes.values()].some(node => node.status === 'pending' || node.status === 'running')) {
        for (const [path,cycle] of cycles(nodes)) {
          const node = nodes.get(path);
          if (node.status === 'pending') { node.status = 'failed'; node.result = {status:'failed',reason:'cycle',cycle}; }
        }
        let changed = true;
        while (changed) {
          changed = false;
          for (const node of nodes.values()) {
            if (node.status !== 'pending') continue;
            const missing = node.deps.find(dep => !nodes.has(dep));
            const failed = node.deps.find(dep => nodes.get(dep)?.status === 'failed');
            if (missing || failed) {
              node.status = 'failed'; node.result = {status:'failed',reason:missing?'missing_dependency':'dependency_failed',dependency:missing??failed}; changed = true;
            }
          }
        }
        for (const [path,node] of nodes) {
          if (running.size >= concurrency) break;
          if (node.status !== 'pending' || !node.deps.every(dep => nodes.get(dep)?.status === 'ok')) continue;
          const dependencies = Object.fromEntries(node.deps.map(dep=>[dep,nodes.get(dep).result.output]));
          const key = JSON.stringify([identity(snapshot,path),node.deps.map(dep=>[dep,dependencies[dep]])]);
          if (cache.has(key)) { used.add(key); node.status = 'ok'; node.result = {status:'ok',output:cache.get(key)}; continue; }
          node.status = 'running';
          const promise = compile({snapshot,path,dependencies}).then(result => {
            if (result.status === 'dependencies') {
              node.deps = [...new Set(result.paths)].sort();
              discoveries.set(identity(snapshot,path),node.deps);
              node.status = 'pending';
            } else if (result.status === 'ok') {
              node.deps = [...new Set(result.dependencies)].sort();
              discoveries.set(identity(snapshot,path),node.deps);
              const finalKey = JSON.stringify([identity(snapshot,path),node.deps.map(dep=>[dep,dependencies[dep]])]);
              cache.set(finalKey,result.output);used.add(finalKey);
              node.status = 'ok'; node.result = {status:'ok',output:result.output};
            } else { node.status = 'failed'; node.result = {status:'failed',reason:result.reason,path:result.path}; }
          }).finally(()=>running.delete(path));
          running.set(path,promise);
        }
        if (running.size) await Promise.race(running.values());
        else if ([...nodes.values()].some(node=>node.status==='pending')) {
          // Cached dependencies can unlock their dependents in the next pass.
          if (![...nodes.values()].some(node=>node.status==='pending'&&node.deps.every(dep=>nodes.get(dep)?.status==='ok'))) throw new Error('Unresolved dependency graph');
        }
      }
      const result = {generation:snapshot.generation,results:Object.fromEntries([...nodes].map(([path,node])=>[path,node.result]))};
      if(true){committed.clear();for(const key of used)committed.set(key,cache.get(key));known.clear();for(const path of Object.keys(snapshot.files)){const key=identity(snapshot,path);if(discoveries.has(key))known.set(key,discoveries.get(key));}}
      if (mine === request) publisher.publish({...result,__requestTag:snapshot.__requestTag});
      return result;
    }
  };
}
