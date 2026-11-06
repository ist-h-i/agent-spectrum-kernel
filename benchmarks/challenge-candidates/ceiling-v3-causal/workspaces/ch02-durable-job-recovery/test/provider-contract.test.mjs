import test from 'node:test';
import assert from 'node:assert/strict';
import {DurableStore} from '../harness/store.mjs';
test('store pages expose detached values',()=>{const store=new DurableStore();store.putIfAbsent('a',{x:1});const page=store.page(null,1);assert.equal(page.done,true);assert.equal(page.items.length,1);page.items[0].x=9;assert.equal(store.read('a').x,1);});
