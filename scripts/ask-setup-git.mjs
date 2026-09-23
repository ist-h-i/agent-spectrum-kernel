import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { devNull } from "node:os";
import { resolve } from "node:path";

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

export function readSetupRepositoryId(gitDir) {
  if (!gitDir || !existsSync(gitDir)) return null;
  const commonDirPath = resolve(gitDir, "commondir");
  const commonDir = existsSync(commonDirPath)
    ? resolve(gitDir, readFileSync(commonDirPath, "utf8").trim()) : gitDir;
  const configPath = resolve(commonDir, "config");
  if (!existsSync(configPath)) return null;
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
