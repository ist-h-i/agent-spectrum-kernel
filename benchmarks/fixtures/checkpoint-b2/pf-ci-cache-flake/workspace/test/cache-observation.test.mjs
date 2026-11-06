import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeBuild} from '../src/cache-model.mjs';

const config=JSON.parse(readFileSync('ci/build-config.json','utf8'));
const scenarios=JSON.parse(readFileSync('ci/scenarios.json','utf8'));
const fields=['run_id','node_major','lock_digest','requested_key','restored_key','restored_cache','dependencies','artifact_version','required_artifact_version','exit_code'].sort();

for(const run of scenarios.runs)test('local observation interface '+run.run_id,()=>{
 const before=structuredClone({config,scenarios,run});
 const actual=observeBuild(config,scenarios,run);
 assert.deepEqual(Object.keys(actual).sort(),fields);
 assert.equal(actual.run_id,run.run_id);
 assert.equal(typeof actual.requested_key,'string');
 assert.ok(actual.restored_key===null||typeof actual.restored_key==='string');
 assert.ok(actual.restored_cache===null||typeof actual.restored_cache==='string');
 assert.ok(Number.isInteger(actual.node_major));
 assert.ok(Number.isInteger(actual.artifact_version));
 assert.ok(Number.isInteger(actual.required_artifact_version));
 assert.ok([0,1].includes(actual.exit_code));
 assert.deepEqual({config,scenarios,run},before);
 const again=observeBuild(config,scenarios,run);
 assert.deepEqual(again,actual);
 assert.notEqual(again,actual);
});

test('unsupported reproducer inputs are rejected without service work',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['scripts/reproduce-cache.mjs','--unsupported-option'],{encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/Unsupported experiment option/);
});
