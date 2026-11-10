import assert from 'node:assert/strict';
export const FULL_REVIEW_FINDING_CONTRACT_PATH='docs/review-finding-contract.md';
export function instructionPath(path) {
  assert.equal(typeof path, 'string', 'instruction path required');
  assert.ok(path.length <= 512 && /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(path)
    && !path.split('/').some(p => ['.', '..', '.git', '.env'].includes(p)), 'unsafe instruction path');
  return path;
}
export function instructionTargetPath(adapter, path, support = false) {
  assert.ok(['codex', 'claude_code'].includes(adapter), 'unsupported adapter');
  instructionPath(path);
  const prefix = adapter === 'codex' ? '.agents' : '.claude';
  const asset = new RegExp(`^\\${prefix}/(?:skills|${adapter === 'codex' ? 'prompts|commands' : 'commands'})/.+`);
  assert.ok(asset.test(path) || support && (/^(?:AGENTS|CLAUDE)\.md$/.test(path) || /^(?:docs|schemas|scripts)\/.+/.test(path)), 'unsupported or other-adapter instruction path');
  return path;
}
