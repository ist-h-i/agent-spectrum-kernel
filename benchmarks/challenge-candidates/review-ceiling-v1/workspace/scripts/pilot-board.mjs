import { readFileSync } from 'node:fs';

function rows(file) {
  const text = readFileSync(new URL('../evidence/pilot-desk/' + file, import.meta.url), 'utf8').trimEnd();
  const [header, ...records] = text.split('\n');
  const fields = header.split(',');
  return records.map(record => Object.fromEntries(record.split(',').map((value, index) => [fields[index], value])));
}

const observations = rows('batches.csv');
const bookings = rows('bookings.csv');
const receipts = rows('clearance.csv');
for (const team of ['cedar', 'larch']) {
  const sample = observations.filter(row => row.cohort === team && row.build === 'r18');
  const completed = sample.reduce((sum, row) => sum + Number(row.n), 0);
  const timely = sample.reduce((sum, row) => sum + Number(row.within800), 0);
  const cleared = new Set(receipts.filter(row => row.team === team && row.effect === 'applied').map(row => row.provider_ref));
  const openUnits = bookings.filter(row => row.team === team && !cleared.has(row.provider_ref)).reduce((sum, row) => sum + Number(row.units), 0);
  console.log(JSON.stringify({team, completed, timely, loadReady: timely >= completed * 0.95, openUnits}));
}
