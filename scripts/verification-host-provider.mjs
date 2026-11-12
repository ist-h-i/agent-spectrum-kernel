// Explicit trusted host integration, never discovered from evidence or repository
// configuration. The pinned module runs with the operator's privileges, NOT in a
// sandbox. Current state must be read on each call; historical JSON is not a provider.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
const LIMIT = 1024 * 1024;
const RUNNER = `
let input=''; for await (const chunk of process.stdin) input+=chunk;
const {source,providerId,query}=JSON.parse(input);
const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
if(!module.providers || typeof module.providers[providerId]!=='function') throw new Error('missing provider');
const result=await module.providers[providerId](Object.freeze(query));
process.stdout.write(JSON.stringify(result));
`;
function sourceAt(modulePath, expectedDigest) {
  if (!isAbsolute(modulePath) || !/^sha256:[a-f0-9]{64}$/u.test(expectedDigest)) throw new Error('trusted provider needs absolute module path and sha256 digest');
  const stat = lstatSync(modulePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT) throw new Error('invalid trusted provider file');
  const source = readFileSync(modulePath);
  if (source.length > LIMIT || `sha256:${createHash('sha256').update(source).digest('hex')}` !== expectedDigest) throw new Error('trusted provider digest mismatch');
  return source.toString('utf8');
}
export function trustedHostProviders({ modulePath, expectedDigest, providerIds }) {
  sourceAt(modulePath, expectedDigest); // Validate before constructing a capability.
  return Object.fromEntries(providerIds.map(providerId => [providerId, async (query, { signal }) => {
    const source = sourceAt(modulePath, expectedDigest); // Recheck on both observations.
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '--eval', RUNNER], { stdio: ['pipe', 'pipe', 'pipe'], signal, detached: process.platform !== 'win32' });
      let chunks = [], size = 0, failed = false;
      const stop = () => {
        if (process.platform !== 'win32' && child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
        } else child.kill('SIGKILL');
      };
      const fail = () => {
        failed = true; stop();
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
        reject(new Error('trusted provider unavailable'));
      };
      const timer = setTimeout(fail, 10000);
      child.on('error', fail);
      child.on('exit', stop); // A host observation must not leave owned descendants running.
      child.stdin.on('error', fail);
      child.stdout.on('data', chunk => { size += chunk.length; if(size > LIMIT) fail(); else chunks.push(chunk); });
      // Diagnostics may contain credentials/private response bodies. Do not retain them.
      child.stderr.on('data', () => {});
      child.on('close', code => {
        clearTimeout(timer);
        if (failed) return;
        if (code !== 0) return reject(new Error('trusted provider unavailable'));
        try { resolve(parseJsonRejectDuplicateKeys(Buffer.concat(chunks), 'host observation')); }
        catch { reject(new Error('invalid host observation')); }
      });
      child.stdin.end(JSON.stringify({ source, providerId, query }));
    });
  }]));
}
