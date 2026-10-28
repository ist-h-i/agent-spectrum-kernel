import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueue} from '../src/queue.mjs';
import {DurableStore} from '../harness/store.mjs';
import {IdempotentSink} from '../harness/sink.mjs';
import {legacySubmit,legacyPoll} from '../harness/legacy-clients.mjs';
test('legacy submission uses new worker and old status poll',()=>{const q=createQueue({store:new DurableStore(),sink:new IdempotentSink()});const receipt=legacySubmit(q,{tenant:'shop',request:'report',document:{title:'Daily',rows:[1]}});q.claim('worker');q.run(receipt.id,'worker');assert.equal(legacyPoll(q,'shop','report').status,'done');});
