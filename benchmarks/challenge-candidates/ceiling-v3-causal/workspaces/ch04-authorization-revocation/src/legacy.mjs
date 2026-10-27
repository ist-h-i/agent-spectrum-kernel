
export function createLegacyLookup(service,contextId){let last=null;return{read(resource){const result=service.detail(contextId,resource);if(result.status==='allowed')last=result.body;return last;}};}
