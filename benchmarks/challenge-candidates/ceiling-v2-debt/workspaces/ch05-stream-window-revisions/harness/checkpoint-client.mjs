export function alterExport(snapshot){if(snapshot.events[0])snapshot.events[0].amountMinor='999';snapshot.watermarks.push(['a',999]);return null;}

// Exercise the caller-owned checkpoint through public APIs in one process.
export function alterExportThenIngest(pipeline,event){
  const snapshot=pipeline.exportCheckpoint();
  alterExport(snapshot);
  return pipeline.ingest(event);
}
