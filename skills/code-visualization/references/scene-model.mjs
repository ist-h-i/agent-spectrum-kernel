const shapeNames = new Set(['request', 'artifact', 'shelf', 'route', 'gate', 'person', 'result', 'list', 'stop', 'service']);
const stateNames = new Set(['empty', 'blocked']);
const idPattern = /^[a-z][a-z0-9-]{0,35}$/u;

function valid(condition, message) {
  if (!condition) throw new Error(`Invalid guide visual: ${message}`);
}
const text = (value, length) => typeof value === 'string' && value.trim() && [...value].length <= length;
const directory = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key));
const index = value => Number.isSafeInteger(value) && value >= 0;
const optionalText = (value, length) => value === undefined || text(value, length);

/** Validate the graph separately from Git evidence; carry only approved fields to the browser. */
export function compileScene(visual, sides, templateId) {
  valid(directory(visual, ['nodes', 'cases']), 'expected nodes and cases');
  const { nodes, cases } = visual;
  valid(Array.isArray(nodes) && nodes.length && nodes.length <= 16, 'use 1–16 representative objects per scene');
  valid(Array.isArray(cases) && cases.length && cases.length <= 8, 'use 1–8 representative cases per scene');
  const objects = new Map(), coordinates = new Set(), tags = new Map();
  for (const node of nodes) {
    valid(directory(node, ['id', 'label', 'caption', 'shape', 'stage', 'track', 'refs', 'items']), 'object fields');
    const { id, label, caption, shape, stage, track = 0 } = node;
    valid(typeof id === 'string' && idPattern.test(id) && !objects.has(id), 'unique object id');
    valid(text(label,36) && optionalText(caption,42) && shapeNames.has(shape), `object ${id} label/shape`);
    valid(index(stage) && stage < 8 && [-1,0,1].includes(track), `object ${id} stage/track`);
    valid(!coordinates.has(stage+':'+track), 'two objects overlap; share one object or change its placement');
    coordinates.add(stage+':'+track);
    valid(Array.isArray(node.refs) && node.refs.length && node.refs.length <= 8, `object ${id} needs source step bindings`);
    const found = new Set();
    const refs = node.refs.map(ref => {
      valid(directory(ref, ['side','step','branch']) && ['base','target'].includes(ref.side)
        && index(ref.step) && (ref.branch === undefined || index(ref.branch)), `invalid binding on ${id}`);
      const top = sides[ref.side]?.[ref.step];
      const item = ref.branch === undefined ? top : top?.branches?.[ref.branch];
      valid(item, `unresolved step or branch for ${id}`);
      const token = templateId(ref.side,ref.step,ref.branch);
      valid(!found.has(token), `duplicate binding on ${id}`);
      found.add(token);
      return { side: ref.side, token, status: item.status, ...(top.delta ? { delta: top.delta } : {}) };
    });
    const nodeItems = node.items ?? [];
    valid(Array.isArray(nodeItems) && nodeItems.length <= 6, `too many identity tags on ${id}`);
    const itemIds = new Set();
    const items = nodeItems.map(item => {
      valid(directory(item,['id','label','excluded']) && typeof item.id === 'string' && idPattern.test(item.id)
        && text(item.label,32) && (item.excluded === undefined || typeof item.excluded === 'boolean'), `identity tag on ${id}`);
      valid(!itemIds.has(item.id), `duplicate identity tag on ${id}`);
      itemIds.add(item.id);
      valid(!tags.has(item.id) || tags.get(item.id) === item.label, `identity tag ${item.id} changes its label`);
      tags.set(item.id,item.label);
      return { id:item.id, label:item.label, excluded:item.excluded === true };
    });
    objects.set(id, { id,label,caption:caption ?? '',shape,stage,track,refs,items });
  }
  const visited = new Set();
  const labels = new Set();
  const compiled = cases.map(entry => {
    valid(directory(entry,['label','base','target','overrides']) && text(entry.label,40) && !labels.has(entry.label), 'unique case label');
    labels.add(entry.label);
    const result={label:entry.label,base:[],target:[],overrides:[]};
    for (const side of ['base','target']) {
      if (!sides[side]) {
        valid(entry[side] === undefined, `case must omit absent ${side} path`);
        continue;
      }
      const path = entry[side];
      valid(Array.isArray(path) && path.length && path.length <= 20, `case needs a ${side} path`);
      for (const id of path) {
        valid(typeof id === 'string' && objects.get(id)?.refs.some(ref => ref.side === side), `object ${id} needs ${side} evidence binding`);
        visited.add(id);
      }
      valid(path.every((id,i) => i === 0 || path[i-1] !== id), 'path has consecutive duplicate objects');
      result[side]=path;
    }
    if (sides.base && sides.target) valid(result.base[0] === result.target[0], 'compare the same input object on both sides');
    const overrides=entry.overrides ?? {};
    valid(directory(overrides,[...objects.keys()]), 'case override names a missing object');
    for (const [id,override] of Object.entries(overrides)) {
      valid(directory(override,['label','caption','state','items']) && optionalText(override.label,36)
        && optionalText(override.caption,42) && (override.state === undefined || stateNames.has(override.state))
        && Object.keys(override).length, `invalid case state for ${id}`);
      if (override.state === 'empty') valid(!result.base.includes(id) && !result.target.includes(id), 'empty object cannot receive a moving object');
      const included=override.items;
      const nodeItems=objects.get(id).items;
      valid(included === undefined || (Array.isArray(included) && new Set(included).size === included.length
        && included.every(tag=>nodeItems.some(item=>item.id===tag))), `unknown or duplicate identity override for ${id}`);
      const items=included===undefined ? undefined : included.map(tag=>nodeItems.find(item=>item.id===tag));
      result.overrides.push({id,state:override.state,label:override.label,caption:override.caption,items});
    }
    return result;
  });
  valid([...objects.keys()].every(id=>visited.has(id)), 'an object is not visited by any case');
  const scale = Math.max(...[...objects.values()].map(item => item.stage));
  return { nodes:[...objects.values()], cases:compiled, stages:scale+1 };
}
