import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEditor } from '../src/editor.mjs';
import { EditServer } from '../harness/server.mjs';
import { EditTransport } from '../harness/transport.mjs';
import { mountList, mountDetail } from '../harness/views.mjs';
const rows = JSON.parse(readFileSync(new URL('../data/rows.json', import.meta.url)));
test('normal edit is shared by list and detail, confirmed after response', () => {
  const server = new EditServer(rows), transport = new EditTransport(server);
  const editor = createEditor({ transport, tenantId: 'north' });
  const list = mountList(editor, 'a'), detail = mountDetail(editor, 'a');
  const id = editor.edit('a', { quantity: 3 });
  assert.equal(list.current().confirmed.quantity, 2);
  assert.equal(list.current().pending.quantity, 3);
  editor.flush(id); transport.accept(id); transport.deliver(id);
  assert.equal(list.current().confirmed.quantity, 3);
  assert.deepEqual(list.current(), detail.current());
  assert.equal(list.current().status, 'idle');
  list.close(); detail.close();
});
test('queued edit can be undone and invalid input is rejected', () => {
  const editor = createEditor({ transport: new EditTransport(new EditServer(rows)), tenantId: 'north' });
  editor.edit('a', { name: 'Paper' }); editor.undo('a');
  assert.equal(editor.snapshot('a').confirmed.name, 'Notebook');
  assert.deepEqual(editor.snapshot('a').pending, {});
  assert.throws(() => editor.edit('a', { quantity: -1 }));
});
