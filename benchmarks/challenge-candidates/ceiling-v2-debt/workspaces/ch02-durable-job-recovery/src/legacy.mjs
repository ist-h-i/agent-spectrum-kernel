import {jobKey} from '../harness/store.mjs';
const states={queued:'pending',running:'working',confirming:'working',succeeded:'done',cancelled:'aborted',failed:'error'};
function project(job){return job===null?null:{id:job.key,status:states[job.state],receipt:job.receipt,error:null};}
export function createLegacyQueue(queue){return{
  submit({tenant,request,document}){return project(queue.enqueue(tenant,request,document));},
  poll(tenant,request){return project(queue.snapshot(jobKey(tenant,request)));},
  cancel(tenant,request){return project(queue.cancel(jobKey(tenant,request)));},
};}
