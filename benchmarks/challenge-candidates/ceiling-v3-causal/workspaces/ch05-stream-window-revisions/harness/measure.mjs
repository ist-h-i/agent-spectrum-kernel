import {runMeasurement} from './measure-api.mjs';
for(const row of await runMeasurement())console.log(JSON.stringify(row));
