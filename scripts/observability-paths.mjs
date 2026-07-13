import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const DEFAULT_RUNTIME_EVENT_STORE = "ask-runtime/metrics/events.jsonl";

export function resolveObservabilityPath(projectRoot, configuredPath) {
  const root = resolve(projectRoot);
  const configured = String(configuredPath || DEFAULT_RUNTIME_EVENT_STORE);
  if (isAbsolute(configured)) return resolve(configured);
  if (!configured.startsWith("ask-runtime/")) return resolve(root, configured);

  const suffix = configured.slice("ask-runtime/".length);
  if (!suffix || suffix.split(/[\\/]/).includes("..")) {
    throw new Error("ask-runtime path must stay inside the runtime-owned storage root");
  }
  const gitDirectory = resolveGitDirectory(root);
  return gitDirectory
    ? resolve(gitDirectory, "agent-spectrum-kernel", suffix)
    : resolve(root, ".agent-spectrum-kernel/runtime", suffix);
}

export function resolveGitDirectory(projectRoot) {
  const marker = resolve(projectRoot, ".git");
  if (!existsSync(marker)) return null;
  if (statSync(marker).isDirectory()) return marker;
  if (!statSync(marker).isFile()) return null;
  const match = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(marker, "utf8"));
  if (!match) return null;
  const candidate = resolve(dirname(marker), match[1]);
  return existsSync(candidate) && statSync(candidate).isDirectory() ? candidate : null;
}
