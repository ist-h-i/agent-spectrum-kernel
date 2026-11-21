import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('the issued desk and kiosk share one route card and shift monitor', t => {
  const directory = mkdtempSync(join(tmpdir(),'route-desk-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const call = (client,q) => JSON.parse(execFileSync(process.execPath,[`release/${client}.mjs`,directory,JSON.stringify(q)],{encoding:'utf8'}));
  const address = {site:'east',slot:'8',issue:'paper-A'};
  const document = {title:'Thursday',driver:'Miki',stops:[{id:'Q',label:'Quay',units:4}]};
  const before = call('kiosk',{op:'install',...address,format:1,raw:{caption:'Thursday',crew:'Miki',visits:[{code:'Q',name:'Quay',count:4}]}});
  assert.equal(before.version,1);
  assert.deepEqual(call('desk',{op:'read',...address}).document,document);
  assert.equal(call('desk',{op:'queue',...address,id:'afternoon'}).stage,'ready');
  assert.equal(call('desk',{op:'dispatch',site:'east',id:'afternoon'}).stage,'printed');
  assert.deepEqual(call('kiosk',{op:'monitor',site:'east',id:'afternoon'}),{stage:'printed',attempt:1});
});

test('a clerk can inspect the original edition after a damaged flight book is corrected', t => {
  const directory = mkdtempSync(join(tmpdir(),'flight-book-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const call = (client,q) => JSON.parse(execFileSync(process.execPath,[`release/${client}.mjs`,directory,JSON.stringify(q)],{encoding:'utf8'}));
  const address = {district:'Coast',book:'Folio 9'};
  const ticket = {site:'east',id:'mail',attempt:1,flight:'DA31',depot:'Port'};
  const limits = [{depot:'Port',capacity:1}];
  call('kiosk',{op:'fileBook',...address,tickets:[ticket],leaves:[{offices:['west']}],limits});
  call('kiosk',{op:'amendBook',...address,edition:1,leaves:[{flights:['DA31']}],limits});
  assert.deepEqual(call('desk',{op:'auditBook',...address,edition:1}),{...address,edition:1,status:'inconsistent',tickets:[]});
  assert.deepEqual(call('desk',{op:'auditBook',...address}),{...address,edition:2,status:'balanced',
    tickets:[{site:'east',id:'mail',attempt:1,outcome:'issued'}]});
});
