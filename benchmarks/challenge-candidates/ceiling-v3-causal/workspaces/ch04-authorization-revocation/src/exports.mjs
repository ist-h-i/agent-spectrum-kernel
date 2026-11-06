
const terminal=new Set(['completed','denied','cancelled','unknown']);
export class ExportCoordinator{
 constructor(service,chunks,chunkSize){this.service=service;this.chunks=chunks;this.chunkSize=chunkSize;this.jobs=new Map();this.namespace='export';this.next=1;}
 request(contextId,resource){const auth=this.service.authorize(contextId,resource,'export');if(!auth.context?.active)return{status:'closed'};if(!auth.allowed)return{status:'denied'};const jobId=this.namespace+':'+this.next++;this.jobs.set(jobId,{id:jobId,contextId,contextRevision:auth.context.revision,tenant:auth.context.tenant,user:auth.context.user,linkToken:auth.context.linkToken,resource,offset:0,status:'queued',pending:null,acked:new Set()});return{status:'queued',jobId};}
 run(jobId){const job=this.jobs.get(jobId);if(!job)return{status:'missing'};if(terminal.has(job.status))return{status:job.status};if(job.pending)return{status:'running',receipt:job.pending};
  for(let attempt=0;attempt<3;attempt++){const auth=this.service.authorize(job.contextId,job.resource,'export');if(!auth.context?.active){job.status='cancelled';this.chunks.cancel(jobId);return{status:job.status};}if(!auth.allowed){job.status='denied';return{status:job.status};}
   const body=auth.policy.resources[job.resource].body,bytes=body.slice(job.offset,job.offset+this.chunkSize);
   const result=this.chunks.beginChunk({jobId,attemptId:String(job.offset),contextId:job.contextId,expectedContextRevision:job.contextRevision,tenant:job.tenant,expectedPolicyRevision:auth.policy.revision,expectedCapabilities:this.service.capabilities.revisions(auth.context.capabilityId)??[],resource:job.resource,bytes});
   if(result.status==='revision-conflict'||result.status==='context-conflict')continue;
   if(result.status==='cancelled'){job.status='cancelled';return{status:job.status};}
   if(result.status!=='accepted'){job.status='unknown';return{status:job.status};}
   job.pending=result.receipt;job.length=body.length;job.status='running';return{status:'running',receipt:result.receipt};
  }return{status:'retry'};
 }
 complete(jobId,receipt){const job=this.jobs.get(jobId);if(!job)return{status:'missing'};const fact=this.chunks.receipt(receipt);if(!fact||fact.status!=='completed'||fact.jobId!==jobId||job.pending!==receipt)return this.status(jobId);job.acked.add(receipt);job.offset+=fact.bytes.length;job.pending=null;job.status=job.offset>=job.length?'completed':'running';return this.status(jobId);}
 cancel(jobId){const job=this.jobs.get(jobId);if(!job)return{status:'missing'};if(['queued','running'].includes(job.status))job.status='cancelled';return{status:job.status};}
 status(id){const job=this.jobs.get(id);return job?{status:job.status,offset:job.offset}:{status:'missing'};}
}
