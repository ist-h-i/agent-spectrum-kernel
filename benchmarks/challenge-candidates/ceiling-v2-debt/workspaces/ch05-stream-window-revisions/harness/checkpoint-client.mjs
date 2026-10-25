export function alterExport(snapshot){if(snapshot.events[0])snapshot.events[0].amountMinor='999';snapshot.watermarks.push(['a',999]);return null;}
