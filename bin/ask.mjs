#!/usr/bin/env node
// npm invokes this file through a symlink on Unix. Its module URL still resolves
// to the package, so existing CLI entry guards receive a real script pathname.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../dist/scripts/ask-package-cli.mjs', import.meta.url));
const child = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
if (child.error) console.error(`ask: ${child.error.message}. Run npm run build in a source checkout.`);
process.exitCode = child.status ?? 1;
