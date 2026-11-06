import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionStore} from '../harness/session-store.mjs';
test('session store values are detached',()=>{const store=new SessionStore();const a=store.read('desk');assert.equal(a.revision,0);assert.equal(store.compareAndSwap('desk',0,{x:1}).accepted,true);const value=store.read('desk');value.value.x=9;assert.equal(store.read('desk').value.x,1);assert.equal(store.compareAndSwap('desk',0,{x:2}).accepted,false);});
