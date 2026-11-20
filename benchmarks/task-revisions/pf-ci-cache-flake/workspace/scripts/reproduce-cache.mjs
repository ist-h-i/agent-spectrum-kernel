import {readFileSync} from 'node:fs';import {observeBuild} from '../src/cache-model.mjs';
const args=process.argv.slice(2);if(args.some(a=>!['--no-cache','--include-lock','--node-major=24','--node-major=25'].includes(a)))throw new Error('Unsupported experiment option');
const options={noCache:args.includes('--no-cache'),includeLock:args.includes('--include-lock'),nodeMajor:args.includes('--node-major=25')?25:24};
const config=JSON.parse(readFileSync('ci/build-config.json','utf8')),scenarios=JSON.parse(readFileSync('ci/scenarios.json','utf8'));
console.log(JSON.stringify({measured_external_ci:false,options,observations:scenarios.runs.map(run=>observeBuild(config,scenarios,run,options))},null,2));
