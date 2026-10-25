import test from 'node:test';
import assert from 'node:assert/strict';
import {PriceStore} from '../harness/store.mjs';
import {legacyBatchImport} from '../harness/consumers.mjs';
test('retired legacy handle cannot resume after writer registration changes to v2',()=>{
 const store=new PriceStore([{tenant:'east',id:'b',revision:1,v1:{price:'12.50',currency:'USD'},v2:null}]);
 const old=store.registerWriter('east','writer','v1');
 store.retireWriter('east','writer');store.registerWriter('east','writer','v2');
 assert.equal(legacyBatchImport(store,old,'b',{price:'99',currency:'USD'}),false);
 assert.equal(store.read('east','b').revision,1);
 assert.equal(store.read('east','b').v1.price,'12.50');
});
