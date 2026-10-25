import assert from'node:assert/strict';import{scenarioTest}from'../harness/scenario.mjs';
import{readFileSync}from'node:fs';
const program=JSON.parse(readFileSync(new URL('../data/normal-scenario.json',import.meta.url),'utf8'));
scenarioTest("ordinary legacy price survives a complete one-page migration",{program,check(o){assert.equal(o.page?.ok,true);assert.equal(o.page?.value?.complete,true);assert.deepEqual(o.legacy,{status:200,body:{price:'12.50',currency:'USD'}});assert.deepEqual(o.modern?.value,{amountMinor:'1250',currency:'USD',taxMode:'included'});}});
