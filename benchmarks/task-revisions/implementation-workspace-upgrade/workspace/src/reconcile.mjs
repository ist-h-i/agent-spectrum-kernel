export function decode(format, raw) {
  if (format === 2) return {title:raw.title,driver:raw.driver,stops:raw.stops.map(({id,label,units}) => ({id,label,units}))};
  return {title:raw.caption,driver:raw.crew,stops:raw.visits.map(stop => ({id:stop.code,label:stop.name,units:stop.count}))};
}

export function encode(format, previous, document) {
  if (format === 2) return document;
  return {caption:document.title,crew:document.driver,visits:document.stops.map(stop => ({code:stop.id,name:stop.label,count:stop.units}))};
}

// The initial importer assumed the whole route was locked while a sheet was away.
export function reconcile(base, live, proposal) {
  if (JSON.stringify(live) === JSON.stringify(base)) return proposal;
  if (JSON.stringify(live) === JSON.stringify(proposal)) return live;
  return null;
}
