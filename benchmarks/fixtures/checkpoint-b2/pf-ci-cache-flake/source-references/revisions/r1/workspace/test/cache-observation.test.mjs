import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {observeBuild} from '../src/cache-model.mjs';
const config=JSON.parse(readFileSync('ci/build-config.json','utf8')),scenarios=JSON.parse(readFileSync('ci/scenarios.json','utf8'));
for(const run of scenarios.runs)test('reproduce '+run.run_id,()=>{const actual=observeBuild(config,scenarios,run);assert.equal(actual.exit_code,run.run_id==='run-04'?1:0);assert.equal(actual.dependencies,'installed')});
test('controlled cache disable preserves every requested artifact',()=>{for(const run of scenarios.runs)assert.equal(observeBuild(config,scenarios,run,{noCache:true}).exit_code,0)});
