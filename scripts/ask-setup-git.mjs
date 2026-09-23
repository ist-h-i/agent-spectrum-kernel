import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { devNull } from "node:os";
import { isAbsolute, parse, resolve, sep } from "node:path";

// Only an opaque digest of a credential-free locator may leave this module.
// Unknown transports are not guessed or hashed with their credentials intact.
export function setupRepositoryId(origin) {
  if (typeof origin !== "string" || !origin || /[\s\u0000-\u001f\u007f\\]/u.test(origin)) return null;
  let locator;
  if (origin.includes("://")) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      return null;
    }
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol) || !url.hostname || url.pathname === "/" || !url.pathname) return null;
    // Do not hash a token: rotation of userinfo/query/fragment is not drift.
    locator = `url:${url.protocol}//${url.host}${url.pathname}`;
  } else {
    // Keep scp's relative path distinct from an absolute ssh URL path.
    const scp = origin.match(/^(?:[^/@]+@)?(\[[a-f0-9:.]+\]|[a-z0-9.-]+):([^?#]+)(?:[?#].*)?$/i);
    if (!scp || scp[2].startsWith(":")) return null;
    locator = `scp:${scp[1].toLowerCase()}:${scp[2]}`;
  }
  return `git:sha256:${createHash("sha256").update(locator).digest("hex")}`;
}

// Inspect every component before following it. Missing optional metadata is
// allowed, but dangling links and special files must not become reads or waits.
function metadataPath(path, kind) {
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  const parts = absolute.slice(cursor.length).split(sep).filter(Boolean);
  let stat;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = resolve(cursor, parts[index]);
    try {
      stat = lstatSync(cursor);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new Error("Setup Git metadata cannot be inspected safely.");
    }
    if (stat.isSymbolicLink()) throw new Error("Symlink is not supported for setup Git metadata.");
    const expected = index < parts.length - 1 ? "directory" : kind;
    if ((expected === "directory" && !stat.isDirectory())
      || (expected === "file" && !stat.isFile())
      || (expected === "either" && !stat.isDirectory() && !stat.isFile())) {
      throw new Error("Unsupported setup Git metadata file type.");
    }
  }
  return stat;
}

function metadataDirectory(base, pointer) {
  const value = pointer.trim();
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Invalid setup Git directory pointer.");
  const directory = resolve(base, value);
  if (!metadataPath(directory, "directory")) throw new Error("Setup Git metadata directory is missing.");
  return directory;
}

function metadataLayout(gitDir) {
  if (!gitDir || !metadataPath(gitDir, "directory")) return null;
  const commonDirPath = resolve(gitDir, "commondir");
  const commonDir = metadataPath(commonDirPath, "file")
    ? metadataDirectory(gitDir, readFileSync(commonDirPath, "utf8")) : gitDir;
  const configPath = resolve(commonDir, "config");
  metadataPath(configPath, "file");
  return { commonDir, configPath };
}

// Guard all paths used by the existing readGitRevision() before invoking it.
// Git worktree/submodule pointer files remain supported; filesystem links do not.
// As with setup snapshots, concurrent mutation is outside this static boundary.
export function validateSetupGitMetadata(target) {
  const root = realpathSync(target);
  const gitPath = resolve(root, ".git");
  const stat = metadataPath(gitPath, "either");
  if (!stat) return null;
  let gitDir = gitPath;
  if (stat.isFile()) {
    const match = readFileSync(gitPath, "utf8").trim().match(/^gitdir:\s*(.+)$/);
    if (!match) throw new Error("Invalid setup Git directory pointer.");
    gitDir = metadataDirectory(root, match[1]);
  }
  const { commonDir } = metadataLayout(gitDir);
  const headPath = resolve(gitDir, "HEAD");
  const head = metadataPath(headPath, "file") ? readFileSync(headPath, "utf8").trim() : "";
  const refMatch = head.match(/^ref:\s*(.+)$/);
  if (refMatch) {
    const ref = refMatch[1];
    if (!ref.startsWith("refs/") || isAbsolute(ref) || ref.includes("\\")
      || /[\u0000-\u001f\u007f]/u.test(ref)
      || ref.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Invalid setup Git reference path.");
    }
    for (const refRoot of new Set([gitDir, commonDir])) metadataPath(resolve(refRoot, ref), "file");
  }
  for (const refRoot of new Set([gitDir, commonDir])) metadataPath(resolve(refRoot, "packed-refs"), "file");
  return gitDir;
}

export function readSetupRepositoryId(gitDir) {
  const layout = metadataLayout(gitDir);
  if (!layout || !metadataPath(layout.configPath, "file")) return null;
  const { configPath } = layout;
  // Ignore inherited config, repository selection, and tracing overrides.
  // In particular, tracing must not write the raw origin to an external file.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  Object.assign(env, {
    // Config's optional repository discovery can process includeIf even with
    // --no-includes. Use only the named file, without discovering a repository.
    GIT_DIR: devNull,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  });
  const result = spawnSync("git", ["config", "--file", configPath, "--no-includes", "--get-all", "remote.origin.url"], {
    cwd: gitDir, env, encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  const origins = result.stdout.replace(/\r?\n$/, "").split(/\r?\n/);
  // Multiple origins are ambiguous; do not invent a repository identity.
  return origins.length === 1 ? setupRepositoryId(origins[0]) : null;
}
