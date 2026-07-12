import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'input-manifest.json'), 'utf8'));
let failed = false;
for (const [fixtureId, fixture] of Object.entries(manifest.fixtures)) {
  for (const expected of fixture.files) {
    const absolute = path.join(root, fixtureId, expected.path);
    if (!fs.existsSync(absolute)) {
      console.error(`MISSING ${fixtureId}/${expected.path}`);
      failed = true;
      continue;
    }
    const bytes = fs.readFileSync(absolute);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== expected.sha256 || bytes.length !== expected.bytes) {
      console.error(`MISMATCH ${fixtureId}/${expected.path}`);
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
else console.log('All agent-visible fixture inputs match input-manifest.json.');
