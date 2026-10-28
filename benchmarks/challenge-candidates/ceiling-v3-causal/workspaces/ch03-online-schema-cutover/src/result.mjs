export const ok=value=>value===undefined?{ok:true}:{ok:true,value};
export const fail=(code,ids)=>({ok:false,error:{code,retryable:code==='REVISION_CONFLICT',...(ids?{ids}: {})}});
export const id=value=>typeof value==='string'&&value.length>0;
