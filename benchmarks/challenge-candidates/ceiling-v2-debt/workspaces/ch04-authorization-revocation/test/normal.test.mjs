import assert from'node:assert/strict';import{scenarioTest}from'../harness/scenario.mjs';
import{readFileSync}from'node:fs';
const program=JSON.parse(readFileSync(new URL('../data/normal-scenario.json',import.meta.url),'utf8'));
scenarioTest("legacy lookup uses an ordinary granted context",{program,check(o){assert.equal(o.body,'monthly bulletin');}});
