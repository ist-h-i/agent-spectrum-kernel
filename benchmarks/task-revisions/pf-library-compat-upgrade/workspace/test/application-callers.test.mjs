import assert from 'node:assert/strict';
import { posix, win32 } from 'node:path';
import { test } from 'node:test';
import { scheduledExport } from '../src/scheduled-export.mjs';
import { downloadExport } from '../src/download-export.mjs';

for (const caller of [scheduledExport, downloadExport]) {
  for (const [platform, paths, root] of [['posix', posix, '/out'], ['win32', win32, 'Q:\\out']]) {
    test(`${caller.name} exports a compatible manifest and can fall back on ${platform}`, async () => {
      const entries = [{ relativePath: 'a/note.txt', text: '雪' }, { relativePath: 'b/note.txt', text: '' }];
      for (const libraryVersion of [undefined, 1, 2]) {
        const result = await caller(entries, { root, platform, libraryVersion });
        assert.deepEqual(result, { version: 1, items: entries.map(entry => ({
          path: paths.join(root, entry.relativePath), bytes: Buffer.byteLength(entry.text),
        })) });
      }
    });
  }
}
