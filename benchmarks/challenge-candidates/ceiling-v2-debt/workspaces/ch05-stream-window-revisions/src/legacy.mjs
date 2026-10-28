// Legacy append-only client kept its own event-ID dedup cache.
export function createLegacyConsumer(pipeline){const seen=new Set();return {push(event){const key=event.tenant+':'+event.id;if(seen.has(key))return {accepted:true};seen.add(key);return pipeline.ingest(event);},watermark:(tenant,value)=>pipeline.advanceWatermark(tenant,value)};}
