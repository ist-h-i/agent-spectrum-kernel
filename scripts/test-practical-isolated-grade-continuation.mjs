import test from 'node:test';
import assert from 'node:assert/strict';
import {unattemptedPracticalRows} from './practical-isolated-grade-continuation.mjs';
const row=id=>({id,block_id:id,condition:'baseline'});
test('isolated grade continuation preserves plan order and never requeues an attempted row',()=>{
 const state={rows:['a','b','c','d'].map(row),attempts:[{row:row('a')},{row:row('b')}],counts:{'["a","baseline"]':1,'["b","baseline"]':1}};
 assert.deepEqual(unattemptedPracticalRows(state,[],[]),[row('c'),row('d')]);
 assert.deepEqual(state.attempts.map(a=>a.row.id),['a','b']);
});
for(const kind of ['reserved','native','count'])test(`unattempted continuation refuses ${kind} evidence without a recorded attempt`,()=>{
 const state={rows:['a','b'].map(row),attempts:[{row:row('a')}],counts:{}};
 const events=kind==='reserved'?[{state:{active:{kind:'trial',input:{row:row('b')}}}}]:[];
 const native=kind==='native'?[{kind:'trial',input:{row:row('b')}}]:[];
 if(kind==='count')state.counts['["b","baseline"]']=1;
 assert.throws(()=>unattemptedPracticalRows(state,events,native),/reservation|dispatch|count/);
});
