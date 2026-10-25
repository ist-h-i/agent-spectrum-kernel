import { runMeasurement } from './measure-api.mjs';
for (const record of await runMeasurement()) console.log(JSON.stringify(record));
