import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDrafts,encodeDrafts} from '../src/session.mjs';
import {createEditor} from '../src/editor.mjs';
import {EditServer} from '../harness/server.mjs';
import {EditTransport} from '../harness/transport.mjs';
import {legacyEdit,legacyRead} from '../harness/legacy-clients.mjs';
test('legacy inventory form submits and reads ordinary edit',()=>{const transport=new EditTransport(new EditServer([{tenantId:'shop',rowId:'r',version:1,name:'Pen',quantity:2}]));const editor=createEditor({transport,tenantId:'shop'});const ticket=legacyEdit(editor,'r','stock',4);transport.accept(ticket.op);transport.deliver(ticket.op);assert.equal(legacyRead(editor,'r').stock,4);});
test('v2 empty draft codec stays JSON compatible',()=>assert.deepEqual(decodeDrafts(encodeDrafts('shop',[])),{format:2,tenantId:'shop',drafts:[]}));
