import {createSink} from './sink.mjs';
import {safeData,safeStringify} from './safe-json.mjs';
const byteLength=Buffer.byteLength.bind(Buffer),decimal=String,append=Function.call.bind(Array.prototype.push);
const bytes=value=>byteLength(safeStringify(value));
export async function runLogicalProfile({mode}){
 if(!['closed','live','producers'].includes(mode))throw new Error('Unknown profile');
 const {createPipeline}=await import('../src/pipeline.mjs');
 const sink=createSink({collect:false}),pipeline=createPipeline({windowSize:100,allowedLateness:20,sink});
 const rounds=mode==='live'?1:96,tenants=4,ids=mode==='live'?192:8,producers=mode==='producers'?16:0;
 let calls=0,accepted=0;const samples=[];
 for(let round=0;round<rounds;round++){
  for(let tenant=0;tenant<tenants;tenant++){
   if(producers){for(let producer=0;producer<producers;producer++){
    const input={tenantId:decimal(tenant),producerId:decimal(producer),sequence:round+1,events:[{tenantId:decimal(tenant),eventId:decimal(producer),revision:0,eventTime:round*100+1,amountMinor:'1',deleted:false}]};
    const result=pipeline.ingestEnvelope(input);calls++;if(result.accepted)accepted++;
   }}else for(let id=0;id<ids;id++)for(let revision=0;revision<3;revision++){
    const result=pipeline.ingest({tenantId:decimal(tenant),eventId:round+':'+id,revision,eventTime:round*100+1,amountMinor:decimal(revision+1),deleted:false});calls++;if(result.accepted)accepted++;
   }
   if(mode!=='live'){pipeline.advanceWatermark(decimal(tenant),(round+1)*100+20);calls++;}
  }
  const c=safeData(pipeline.exportCheckpoint());let bodyRows=0;if(c.producers)for(let i=0;i<c.producers.length;i++)bodyRows+=c.producers[i].events.length;append(samples,{round,events:c.events.length,watermarks:c.watermarks.length,producers:c.producers?.length??null,producerBodyRows:c.producers?bodyRows:null,jsonBytes:bytes(c)});
 }
 return {mode,rounds,tenants,ids,producerCount:producers,calls,accepted,samples,sink:sink.snapshot(),checkpoint:pipeline.exportCheckpoint(),runtimeQualified:false};
}
