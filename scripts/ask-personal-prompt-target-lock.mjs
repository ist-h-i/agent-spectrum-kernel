// One process-level lock shared by normal Codex and personal Prompt mutations.
// This is not host isolation, a PID lease, adoption or rollback authority.
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertSetupWritePaths } from "./ask-setup-apply-state.mjs";
export const PERSONAL_PROMPT_TARGET_STATE = ".agent-spectrum-kernel/personal-prompt-target-state.json";
export const PERSONAL_PROMPT_TARGET_JOURNAL = `${PERSONAL_PROMPT_TARGET_STATE}.operation.json`;
export const PERSONAL_PROMPT_TARGET_MARKER = `${PERSONAL_PROMPT_TARGET_STATE}.in-progress.json`;
export const PERSONAL_PROMPT_TARGET_LOCK = `${PERSONAL_PROMPT_TARGET_STATE}.lock`;
export const PERSONAL_PROMPT_TARGET_EVIDENCE = ".agent-spectrum-kernel/personal-prompt-target-evidence";
const stat = path => { try { return lstatSync(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const same = (s, expected) => s?.isDirectory() && !s.isSymbolicLink() && s.dev === expected.dev && s.ino === expected.ino;
export function personalPromptTargetActive(root, { excludeOwnedLock = false } = {}) {
  return [PERSONAL_PROMPT_TARGET_STATE, PERSONAL_PROMPT_TARGET_JOURNAL, PERSONAL_PROMPT_TARGET_MARKER,
    ...(excludeOwnedLock ? [] : [PERSONAL_PROMPT_TARGET_LOCK])].some(path => Boolean(stat(join(root, path))));
}
export function withPersonalPromptTargetLock(root, run) {
  assertSetupWritePaths(root, [PERSONAL_PROMPT_TARGET_LOCK]);
  const metadata = join(root, dirname(PERSONAL_PROMPT_TARGET_STATE)), createdMeta = !stat(metadata);
  if (createdMeta) mkdirSync(metadata);
  const metadataIdentity = stat(metadata); let owned = null;
  try {
    mkdirSync(join(root, PERSONAL_PROMPT_TARGET_LOCK)); owned = stat(join(root, PERSONAL_PROMPT_TARGET_LOCK));
    return run({ identity: { dev: owned.dev, ino: owned.ino }, createdMeta });
  } finally {
    if (owned) {
      assert.ok(same(stat(join(root, PERSONAL_PROMPT_TARGET_LOCK)), owned), "personal Prompt target lock changed");
      assert.deepEqual(readdirSync(join(root, PERSONAL_PROMPT_TARGET_LOCK)), [], "personal Prompt target lock not empty");
      rmdirSync(join(root, PERSONAL_PROMPT_TARGET_LOCK));
    }
    if (createdMeta && same(stat(metadata), metadataIdentity) && readdirSync(metadata).length === 0) rmdirSync(metadata);
  }
}
