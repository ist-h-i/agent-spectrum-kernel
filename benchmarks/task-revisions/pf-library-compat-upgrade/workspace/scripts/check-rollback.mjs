import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {buildManifest} from '../src/archive-compat.mjs';
const matrix=JSON.parse(readFileSync(new URL('../data/compatibility-matrix.json',import.meta.url),'utf8')),settings=JSON.parse(readFileSync(new URL('../config/migration-settings.json',import.meta.url),'utf8'));
assert.equal(settings.library_version,2);assert.equal(settings.rollback_version,1);assert.equal(settings.writes_external_state,false);
for(const platform of matrix.platforms){const entries=matrix.cases.map(([relativePath,text])=>({relativePath,text})),base={root:matrix.roots[platform],platform};assert.deepEqual(await buildManifest(entries,{...base,libraryVersion:settings.library_version}),await buildManifest(entries,{...base,libraryVersion:settings.rollback_version}))}
console.log(JSON.stringify({checked_platforms:matrix.platforms,local_rollback_compatibility:true,external_migration:false}));
