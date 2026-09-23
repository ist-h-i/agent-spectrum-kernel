import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { readStableBytes } from "./content-addressed-store.mjs";

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

/**
 * Pin a trusted checkout when the importing module is evaluated, not at its first
 * later API call. This detects a checkout switch in a long-lived Node process.
 * It is a session consistency guard, not a hostile-loader/host attestation.
 * Capture errors are retained so pure imports do not perform successful fallback.
 */
export function pinSourceSession(root, paths) {
  let captured;
  let captureError;
  const repository = resolve(root);
  const inventory = [...paths];
  const pinnedBytes = new Map();
  const git = (args, encoding = "utf8") => execFileSync("git", ["-C", repository, ...args], {
    encoding, timeout: 10000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const identity = () => {
    const revision = git(["rev-parse", "--verify", "HEAD"]).trim();
    const tree = git(["rev-parse", "--verify", `${revision}^{tree}`]).trim();
    if (!/^[a-f0-9]{40}$/u.test(revision) || !/^[a-f0-9]{40}$/u.test(tree)) fail("SUCCESSOR_GIT_INVALID", "source session");
    return { revision, tree };
  };
  const verifyFiles = (pin) => {
    if (realpathSync(repository) !== repository) fail("SUCCESSOR_IMPLEMENTATION_TRANSPLANT", "repository path");
    if (git(["status", "--porcelain", "--untracked-files=normal"]).trim() !== "") fail("SUCCESSOR_DIRTY_SOURCE", "repository");
    for (const path of inventory) {
      if (typeof path !== "string" || !/^[A-Za-z0-9._/-]+$/u.test(path)
          || path.split("/").some(part => ["", ".", ".."].includes(part))) fail("SUCCESSOR_PATH_REJECTED", "source inventory");
      let current = repository;
      for (const part of path.split("/")) {
        current = resolve(current, part);
        if (!current.startsWith(`${repository}${sep}`) || lstatSync(current).isSymbolicLink()) fail("SUCCESSOR_IMPLEMENTATION_TRANSPLANT", path);
      }
      const stat = lstatSync(current);
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024) fail("SUCCESSOR_IMPLEMENTATION_TRANSPLANT", path);
      const live = readStableBytes(current, "loaded implementation", 4 * 1024 * 1024);
      if (!pinnedBytes.has(path)) pinnedBytes.set(path, git(["show", `${pin.revision}:${path}`], null));
      const committed = pinnedBytes.get(path);
      if (!live.equals(committed)) fail("SUCCESSOR_IMPLEMENTATION_TRANSPLANT", path);
    }
    const after = identity();
    if (after.revision !== pin.revision || after.tree !== pin.tree) fail("SUCCESSOR_SOURCE_SESSION_CHANGED", "checkout changed during verification");
  };
  try {
    captured = identity();
    verifyFiles(captured);
  } catch (error) { captureError = error; }
  return Object.freeze({
    assertCurrent() {
      if (captureError) throw captureError;
      const now = identity();
      if (now.revision !== captured.revision || now.tree !== captured.tree) {
        fail("SUCCESSOR_SOURCE_SESSION_CHANGED", "restart the process from the exact candidate checkout");
      }
      verifyFiles(captured);
      return { ...captured };
    },
  });
}
