// Pure scheduling policy. No implementation or process is loaded here.
export const NORMAL_PROGRAM_MS=15000,RESOURCE_PROGRAM_MS=90000,CONTAINER_MS=120000;
export const NORMAL_BATCH_SIZE=6;
export function planServiceBatches(scenarios,capabilities){
  if(!Array.isArray(scenarios)||!scenarios.length||scenarios.length>129)throw Error('one to129 unique (128 submitted plus evaluator confirmation) scenarios required');
  const resources=capabilities.resourceProfiles??[];
  if(!Array.isArray(resources)||resources.some(x=>typeof x!=='string'))throw Error('invalid public resource profile allowlist');
  const result=[],heavy=[];let normal=[];
  const flush=()=>{if(normal.length){result.push({kind:'normal',program_timeout_ms:NORMAL_PROGRAM_MS,scenarios:normal});normal=[];}};
  const ids=new Set();
  for(const scenario of scenarios){
    if(!scenario||typeof scenario.id!=='string'||ids.has(scenario.id)||!scenario.program)throw Error('unique scenario identity required');ids.add(scenario.id);
    if(Object.hasOwn(scenario.program,'resourceProfile')){
      if(!resources.includes(scenario.program.resourceProfile))throw Error('undeclared public resource profile');
      heavy.push({kind:'resource',profile:scenario.program.resourceProfile,program_timeout_ms:RESOURCE_PROGRAM_MS,scenarios:[scenario]});
    }else{normal.push(scenario);if(normal.length===NORMAL_BATCH_SIZE)flush();}
  }
  flush();return [...result,...heavy];
}
export function estimateServiceContainers(scenarios,capabilities){return planServiceBatches(scenarios,capabilities).length;}
