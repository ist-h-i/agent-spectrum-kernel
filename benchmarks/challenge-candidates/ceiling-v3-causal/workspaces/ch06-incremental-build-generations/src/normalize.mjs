export function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export function normalize(input,legacy=false){
  let value=structuredClone(input);
  if(legacy){const files={};for(const source of value.sources){if(Object.hasOwn(files,source.path)){const error=new Error('duplicate path');error.code='duplicate_path';throw error;}files[source.path]={text:source.body,...(source.requires?{imports:source.requires}:{}),...(source.discover?{discover:source.discover}:{}),...(source.globs?{globs:source.globs}:{}),...(source.fail?{fail:true}:{})};}
    value={projectId:value.project,generation:value.revision,compilerVersion:value.compiler,config:typeof value.settings==='string'?JSON.parse(value.settings):value.settings,files};}
  value.projectId??='default';
  value.config={...value.config};value.files=Object.fromEntries(Object.entries(value.files).sort(([a],[b])=>a.localeCompare(b)));
  value.targets=Array.isArray(value.targets)?[...value.targets]:Object.keys(value.files);
  return value;
}
export const signature=s=>JSON.stringify(canonical({projectId:s.projectId,generation:s.generation,compilerVersion:s.compilerVersion,config:s.config,files:s.files}));
