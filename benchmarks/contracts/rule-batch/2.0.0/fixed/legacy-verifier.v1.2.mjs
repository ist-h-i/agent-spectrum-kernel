import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Standalone, dependency-free, candidate-agnostic verifier. JSONL stdout only.
// argv: candidate snapshot root, saved legacy baseline root.
const [candidate, baseline] = process.argv.slice(2).map(x => resolve(x));
if (!candidate || !baseline) throw new Error('usage: node verifier.v1.mjs CANDIDATE BASELINE');
const api = await import(pathToFileURL(join(candidate, 'src/index.mjs')));
const legacy = await import(pathToFileURL(join(baseline, 'src/index.mjs')));
const { RuleService, RuleStore, RuleValidationError, VersionConflictError } = api;
const emitted = [];
function check(requirement, id, fn) {
  try { fn(); emitted.push({ requirement, id, status: 'pass' }); }
  catch (e) { emitted.push({ requirement, id, status: 'fail', error: { name: e.name, message: e.message, stack: e.stack } }); }
}
const make = (initial = {}) => { const store = new RuleStore(initial); return { store, service: new RuleService(store) }; };
const set = (...args) => ({ op: 'set', key: args[0], value: args.length > 1 ? args[1] : true });
const del = key => ({ op: 'delete', key });
const req = (operations = [set('a')], requestId = 'r1', expectedVersion = 0) => ({ requestId, expectedVersion, operations });
const view = ({ store, service }) => ({ version: store.version, rules: service.list() });
const invalid = (r, type = RuleValidationError) => { const x = make({ stable: 7 }); const before = view(x); assert.throws(() => x.service.applyBatch(r), type); assert.deepEqual(view(x), before); };
const freeze = x => { if (x && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); } return x; };

check(1, 'public-call-and-exported-errors', () => {
  assert.equal(typeof RuleService.prototype.applyBatch, 'function');
  for (const C of [RuleValidationError, VersionConflictError]) assert.equal(typeof C, 'function');
  const x = make(); assert.equal(x.service.applyBatch(req()).version, 1);
  assert.throws(() => x.service.applyBatch(req([set('b')], 'r2', 0)), VersionConflictError);
  let err; try { x.service.applyBatch(req([set('a', false)])); } catch (e) { err = e; }
  assert.ok(err instanceof Error);
  assert.ok(Object.values(api).some(C => typeof C === 'function' && C.prototype instanceof Error && err instanceof C), 'idempotency error type exported');
});
const badRequests = [null, [], 'request', 3, true, {}, { expectedVersion: 0, operations: [set('a')] }, { requestId: 'r1', operations: [set('a')] }, { requestId: 'r1', expectedVersion: 0 }, { ...req(), extra: 1 }];
badRequests.forEach((r,i) => check(2, `top-shape-${i}`, () => invalid(r)));
const badIds = ['', 'a'.repeat(65), '-a', '_a', 'a b', 'a.b', 'a\n', 1, null, true];
badIds.forEach((v,i) => check(2, `requestId-reject-${i}`, () => invalid({ ...req(), requestId: v })));
['a', 'A'.repeat(64), 'a_B-1'].forEach((v,i) => check(2, `requestId-accept-${i}`, () => assert.equal(make().service.applyBatch(req([set('a')],v)).requestId, v)));
[-1, .5, '0', null, true, NaN, Infinity].forEach((v,i) => check(2, `version-reject-${i}`, () => invalid({ ...req(), expectedVersion: v })));
[1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, 1e20].forEach((v,i) => check(2, `integer-no-schema-maximum-${i}`, () => invalid({ ...req(), expectedVersion: v }, VersionConflictError)));
const badOperations = [null, {}, 'ops', [], Array.from({length:21},(_,i)=>set(`k${i}`)), [null], [[]], ['op'], [{op:'set',key:'a'}], [{op:'set',value:true}], [{op:'set',key:'a',value:true,extra:1}], [{op:'delete',key:'a',value:true}], [{op:'delete'}], [{key:'a',value:true}], [{op:'other',key:'a'}], [{op:1,key:'a'}], [{op:'set',key:1,value:true}]];
badOperations.forEach((v,i) => check(2, `operations-reject-${i}`, () => invalid({ ...req(), operations: v })));
check(2, 'operations-length-20', () => assert.equal(make().service.applyBatch(req(Array.from({length:20},(_,i)=>set(`k${i}`,i)))).version,1));

[' A ', 'a'.repeat(32), 'a._-09', '\tFeature.Enabled\n'].forEach((key,i) => check(3, `canonical-accept-${i}`, () => assert.deepEqual(make().service.applyBatch(req([set(key)])).rules, {[key.trim().toLowerCase()]:true})));
['', ' ', 'a'.repeat(33), '1a', 'a b', 'a/b', 'é', 'a\nb', '_a', '.', null, 1].forEach((key,i) => check(3, `canonical-reject-${i}`, () => invalid(req([set(key)]))));
[[set(' A '),set('a',false)],[set(' A '),del('a')],[del(' A '),del('a')]].forEach((ops,i) => check(3,`duplicate-${i}`,()=>invalid(req(ops))));

[null, '', 'text', false, true, 0, -0, 1.5, -7, Number.MAX_VALUE].forEach((v,i) => check(4,`scalar-accept-${i}`,()=>assert.ok(Object.is(make().service.applyBatch(req([set('a',v)])).rules.a,v))));
[[], {}, undefined, 1n, NaN, Infinity, -Infinity, Symbol('x'), ()=>1].forEach((v,i) => check(4,`scalar-reject-${i}`,()=>invalid(req([set('first',1),set('a',v)]))));

check(5,'version-mismatch-preserves-state',()=>invalid(req([set('a')],'r1',1),VersionConflictError));
[[set('new',1),set('not valid',2)],[set('new',1),set('other',{})],[set('new',1),del(' NEW ')],[del('stable'),{op:'invalid',key:'a'}]].forEach((ops,i)=>check(5,`late-failure-and-id-recovery-${i}`,()=>{
  const x=make({stable:7});const before=view(x);
  assert.throws(()=>x.service.applyBatch(req(ops)),RuleValidationError);assert.deepEqual(view(x),before);
  assert.equal(x.service.applyBatch(req([set('fixed',true)])).version,1);
}));
check(5,'old-receipt-and-new-id-survive-failure',()=>{
  const x=make(); const original=req([set('a',1)]);const receipt=x.service.applyBatch(original);const before=view(x);
  assert.throws(()=>x.service.applyBatch(req([set('b')],'r2',0)),VersionConflictError);assert.deepEqual(view(x),before);
  assert.throws(()=>x.service.applyBatch(req([set('a',2)])),Error);assert.deepEqual(view(x),before);
  assert.deepEqual(x.service.applyBatch(original),receipt);assert.equal(x.service.applyBatch(req([set('b')],'r2',1)).version,2);
});

check(6,'mixed-batch-one-increment',()=>{
 const x=make({old:9,a:1});assert.deepEqual(x.service.applyBatch(req([set('a',2),set('z',3),del('old'),del('absent')])),{requestId:'r1',version:1,rules:{a:2,z:3}});assert.equal(x.store.version,1);
});
check(6,'no-op-batch-increments-once',()=>{
 const x=make();const r=req([del('missing'),del('other')]);assert.equal(x.service.applyBatch(r).version,1);assert.equal(x.service.applyBatch(r).version,1);assert.equal(x.store.version,1);assert.equal(x.service.applyBatch(req([del('missing')],'r2',1)).version,2);
});
check(6,'twenty-sets-one-increment',()=>{const x=make();const r=x.service.applyBatch(req(Array.from({length:20},(_,i)=>set(`k${i}`,i))));assert.equal(r.version,1);assert.equal(x.store.version,1);assert.equal(Object.keys(r.rules).length,20);});

check(7,'normalized-replay-before-current-version',()=>{
 const x=make(); const first=req([set(' Feature.Enabled ',true),del('old')]);const receipt=x.service.applyBatch(first);
 x.service.put('later',8);x.service.applyBatch(req([set('new',7)],'r2',2));
 assert.deepEqual(x.service.applyBatch({operations:[{value:true,key:'feature.enabled',op:'set'},{key:' OLD ',op:'delete'}],expectedVersion:0,requestId:'r1'}),receipt);assert.equal(x.store.version,3);assert.deepEqual(x.service.list(),{'feature.enabled':true,later:8,new:7});
});
const collisionRequests=[req([set('a',1),set('b',2)],'r1',1),req([set('a',9),set('b',2)]),req([set('a','1'),set('b',2)]),req([set('a',true),set('b',2)]),req([del('a'),set('b',2)]),req([set('c',1),set('b',2)]),req([set('b',2),set('a',1)]),req([set('a',1)])];
collisionRequests.forEach((r,i)=>check(7,`changed-normalized-field-${i}`,()=>{const x=make();const first=req([set('a',1),set('b',2)]);const receipt=x.service.applyBatch(first);const before=view(x);assert.throws(()=>x.service.applyBatch(r),Error);assert.deepEqual(view(x),before);assert.deepEqual(x.service.applyBatch(first),receipt);}));

check(8,'frozen-input-no-mutation',()=>{const x=make();const r=freeze(req([set(' A ',null),del('missing')]));const before=structuredClone(r);x.service.applyBatch(r);assert.deepEqual(r,before);});
check(8,'receipt-replay-nested-aliasing',()=>{
 const initial={legacy:{nested:[1]}};const x=make(initial);initial.legacy.nested.push(9);
 const r=req([set('a',true)]);const first=x.service.applyBatch(r);const saved=structuredClone(first);
 first.rules.legacy.nested.push(2);first.rules.a=false;first.version=88;first.requestId='other';
 assert.deepEqual(x.service.applyBatch(r),saved);assert.deepEqual(x.service.get('legacy'),{nested:[1]});
 const replay=x.service.applyBatch(r);replay.rules.legacy.nested.push(3);delete replay.rules.a;
 assert.deepEqual(x.service.applyBatch(r),saved);assert.deepEqual(x.service.list(),{legacy:{nested:[1]},a:true});
});
check(8,'caller-request-after-acceptance-not-retained',()=>{const x=make();const r=req([set('a',1)]);const first=x.service.applyBatch(r);r.operations[0].value=2;r.operations[0].key='b';assert.deepEqual(x.service.applyBatch(req([set('a',1)])),first);});

check(9,'exact-receipt-fields-and-lexical-order',()=>{
 const x=make({z:1,'a_':2,'a.':3,'a-':4});const r=req([set('b',null),set('a',false)]);const receipt=x.service.applyBatch(r);
 assert.deepEqual(Object.keys(receipt).sort(),['requestId','rules','version']);assert.equal(receipt.requestId,'r1');assert.equal(receipt.version,1);assert.deepEqual(Object.keys(receipt.rules),['a','a-','a.','a_','b','z']);assert.deepEqual(Object.keys(x.service.applyBatch(r).rules),Object.keys(receipt.rules));
});

function legacyTrace(lib){
 const initial={z:{nested:[1]},a:false};const store=new lib.RuleStore(initial),s=new lib.RuleService(store),out=[];
 const act=(id,fn)=>{try {out.push({id,result:structuredClone(fn()),version:store.version});}catch(e){out.push({id,error:{name:e.name,code:e.code,message:e.message},version:store.version});}};
 initial.z.nested.push(8);act('get-clone',()=>s.get(' Z '));const got=s.get('z');got.nested.push(2);act('list-clone',()=>s.list());const listed=s.list();listed.z.nested.push(3);
 act('missing-get',()=>s.get('absent'));act('put-normalize',()=>s.put(' B ',null));act('replace',()=>s.put('a',2));act('put-string',()=>s.put('a','v'));act('delete-existing',()=>s.delete(' B '));act('delete-missing',()=>s.delete('absent'));
 for(const value of [{},[],undefined,NaN,Infinity,1n])act('invalid-scalar-'+String(value),()=>s.put('q',value));
 for(const key of ['not valid','',1,null])act('invalid-key-'+String(key),()=>s.get(key));
 act('final-list',()=>s.list());return out;
}
check(10,'legacy-differential-trace',()=>assert.deepEqual(legacyTrace(api),legacyTrace(legacy)));
const diagnostic = [];
for (const [label,lib] of [['candidate',api],['legacy',legacy]]) {
 try {const s=new lib.RuleService(new lib.RuleStore());s.put('\u212A',1);diagnostic.push({label,unicode_kelvin:'accepted',rules:s.list()});}
 catch(e){diagnostic.push({label,unicode_kelvin:'rejected',error:e.name});}
}
for (const row of emitted) console.log(JSON.stringify({kind:'case',...row}));
console.log(JSON.stringify({kind:'diagnostic',graded:false,unicode_ascii_contract_conflict:diagnostic}));
console.log(JSON.stringify({kind:'summary',candidate,total:emitted.length,passed:emitted.filter(x=>x.status==='pass').length,failed:emitted.filter(x=>x.status==='fail').length,requirements:Array.from({length:10},(_,i)=>({number:i+1,passed:emitted.filter(x=>x.requirement===i+1&&x.status==='pass').length,failed:emitted.filter(x=>x.requirement===i+1&&x.status==='fail').length}))}));
process.exitCode=emitted.some(x=>x.status==='fail')?1:0;
