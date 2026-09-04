import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const FULL_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

function portablePath(value) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\\")) throw new Error("historical Git source path must be a portable relative path");
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("historical Git source path contains an unsafe segment");
  return value;
}

function runGit(repositoryRoot, args, { encoding = "utf8" } = {}) {
  const result = spawnSync("git", ["--no-replace-objects", "-C", repositoryRoot, ...args], {
    encoding,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function materializeGitRevisionSources({ repositoryRoot, targetRoot, revision, sources }) {
  if (!FULL_COMMIT.test(revision ?? "")) throw new Error("historical Git source revision must be a full lowercase commit SHA");
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("historical Git sources must be a non-empty array");

  const resolvedRevision = runGit(repositoryRoot, ["rev-parse", "--verify", `${revision}^{commit}`]);
  if (resolvedRevision.status !== 0 || resolvedRevision.stdout.trim() !== revision) {
    throw new Error(`historical Git source revision is unavailable: ${revision}`);
  }

  const materialized = [];
  const seenPaths = new Set();
  for (const source of sources) {
    const path = portablePath(source?.path);
    if (seenPaths.has(path)) throw new Error(`historical Git source path is duplicated: ${path}`);
    seenPaths.add(path);
    if (!SHA256.test(source?.rawDigest ?? "")) throw new Error(`historical Git source digest is invalid: ${path}`);

    const blob = runGit(repositoryRoot, ["show", `${revision}:${path}`], { encoding: null });
    if (blob.status !== 0) throw new Error(`historical Git source is unavailable at ${revision}: ${path}`);
    const actualDigest = rawDigest(blob.stdout);
    if (actualDigest !== source.rawDigest) throw new Error(`historical Git source digest mismatch for ${path}: expected ${source.rawDigest}, received ${actualDigest}`);

    const target = resolve(targetRoot, path);
    const targetRelative = relative(resolve(targetRoot), target);
    if (!targetRelative || targetRelative === ".." || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) throw new Error(`historical Git source escapes target root: ${path}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, blob.stdout, { flag: "wx" });
    materialized.push(Object.freeze({ path, raw_digest: actualDigest, byte_length: blob.stdout.length }));
  }

  return Object.freeze(materialized);
}
