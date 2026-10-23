import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Source A is the source of the frozen rendered archive, not the older
// execution_repository used for the evaluation workspace. These are the same
// immutable pins previously exported by prompt-v2-preregistration-samples.mjs.
export const PROMPT_V2_RENDERER_SOURCE = Object.freeze({
  revision: "c508a767f3386dac10180770edf37a67806fbb1b",
  tree: "d7d377c1265f0fb47119bfc80a2f3eb9535cf163",
});

const RENDERERS = new Set(["scripts/install-claude-adapter.mjs", "scripts/install-codex-adapter.mjs"]);
const SHA = /^[a-f0-9]{40}$/;

// Read-only historical identity check. Never renders a Prompt, executes an old
// installer, authorizes a run, or falls back to a file from the current checkout.
export function verifyHistoricalRenderer(root, repository, binding) {
  if (!repository || !SHA.test(repository.revision) || !SHA.test(repository.tree)) throw new Error("Historical renderer requires exact source revision and tree");
  if (!binding || !RENDERERS.has(binding.path) || !/^sha256:[a-f0-9]{64}$/.test(binding.raw_byte_digest)) throw new Error("Invalid historical renderer binding");
  const git = (args) => {
    const result = spawnSync("git", ["--no-replace-objects", "-C", root, ...args], {
      encoding: null, timeout: 10000, maxBuffer: 2 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error(`Historical renderer Git object unavailable (${repository.revision}): ${result.error?.message ?? result.stderr?.toString("utf8").trim()}`);
    return result.stdout;
  };
  const tree = git(["rev-parse", `${repository.revision}^{tree}`]).toString("utf8").trim();
  if (tree !== repository.tree) throw new Error("Historical renderer source tree mismatch");
  const entry = git(["ls-tree", "-z", repository.revision, "--", binding.path]).toString("utf8");
  const match = entry.match(/^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/);
  if (!match || match[3] !== binding.path) throw new Error("Historical renderer must be an exact regular Git blob");
  const bytes = git(["cat-file", "blob", match[2]]);
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== binding.raw_byte_digest) throw new Error(`Historical renderer raw byte digest mismatch: ${binding.path}`);
}

// Synchronous scope for validators that need every frozen authority, not only
// the renderer. Callbacks must finish before the temporary checkout is removed.
export function withHistoricalPromptV2Source(root, callback) {
  const { revision, tree } = PROMPT_V2_RENDERER_SOURCE;
  const temporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-prompt-v2-source-")));
  const sourceRoot = resolve(temporaryRoot, "source");
  const git = (args) => execFileSync("git", ["--no-replace-objects", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  let added = false;
  try {
    git(["worktree", "add", "--detach", sourceRoot, revision]);
    added = true;
    if (git(["-C", sourceRoot, "rev-parse", "HEAD"]).trim() !== revision
      || git(["-C", sourceRoot, "rev-parse", "HEAD^{tree}"]).trim() !== tree) {
      throw new Error("Prompt v2 detached source revision/tree mismatch");
    }
    if (git(["-C", sourceRoot, "status", "--porcelain"]) !== "") throw new Error("Prompt v2 detached source worktree is not clean");
    return callback({ sourceRoot, temporaryRoot });
  } finally {
    if (added) git(["worktree", "remove", "--force", sourceRoot]);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
