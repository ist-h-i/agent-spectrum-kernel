#!/usr/bin/env node
import { collectPolicyViolations } from './policy-checker.mjs';

const violations = await collectPolicyViolations(process.cwd());

if (violations.length > 0) {
  console.error('Policy violations found:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Policy checks passed.');
