import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { openBook } from '../src/ledger.mjs';

const archive = JSON.parse(readFileSync(new URL('../data/initial-state.json', import.meta.url)));
const order = {ticket: {office: 'bay', day: '2025-05-01', serial: '31'}, from: 'float', to: 'merchant', limit: '400'};
const advice = {ticket: order.ticket, revision: 1, gross: '200', final: false, valueDay: order.ticket.day};

test('teller export still reconciles at handover', () => {
  const book = openBook(archive);
  assert.deepEqual(book.balance('float'), {posted: '99400', available: '97500'});
  assert.deepEqual(book.statement('merchant', '2025-04-10'), [{
    ticket: {office: 'north', day: '2025-04-08', serial: '14'}, revision: 1, valueDay: '2025-04-10', movement: '594'
  }]);
});

test('normal teller order arrives from the branch gateway', () => {
  const book = openBook(archive);
  assert.equal(book.place(order), 'opened');
  assert.deepEqual(book.receive({feed: 'local', codec: 'json', after: 0, rows: [advice]}), {status: 'ok', through: 1});
  assert.deepEqual(book.balance('merchant'), {posted: '791', available: '791'});
  const saved = openBook(JSON.parse(JSON.stringify(book.dump())));
  assert.equal(saved.place(order), 'replayed');
  assert.deepEqual(saved.balance('float'), {posted: '99200', available: '97100'});
});

test('the bank can check its archived delivery position', () => {
  const book = openBook(archive);
  assert.deepEqual(book.receive({feed: 'night', codec: 'json', after: 28, rows: []}), {status: 'gap', through: 27});
});
