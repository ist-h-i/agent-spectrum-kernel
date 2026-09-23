import { createHash } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const KERNEL_SETUP_INPUTS = Object.freeze([
  "AGENTS.md",
  "CUSTOM_INSTRUCTIONS.md",
  "schemas/review-signal-gate-map.json",
]);
const SETUP_SOURCE_INPUTS = Object.freeze([
  "manifest.json",
  "scripts/install-kernel.mjs",
  "scripts/install-codex-adapter.mjs",
  "scripts/install-claude-adapter.mjs",
  "scripts/installer-lifecycle.mjs",
  "scripts/ask-doctor.mjs",
  "scripts/ask-setup.mjs",
  "scripts/ask-setup-inputs.mjs",
  "schemas/adoption-plan.schema.json",
  "schemas/adoption-apply-result.schema.json",
  "docs/fixtures/adapter-runtime-profiles.json",
]);
const SENSITIVE_BASENAMES = new Set([".env", ".npmrc", ".netrc", "credentials", "credentials.json"]);
const SENSITIVE_SUFFIXES = [".pem", ".key", ".p12", ".pfx", ".jks"];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function jsonDigest(value) {
  return `sha256:${sha256(canonicalJson(value))}`;
}

export function pathInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function safeLstat(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function checkedPath(root, path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)
    || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Setup path must be repository-relative without traversal: ${path}`);
  }
  const absolute = resolve(root, path);
  if (!pathInside(root, absolute) || absolute === root) throw new Error(`Setup path escapes repository: ${path}`);
  let cursor = root;
  // Check each ancestor with lstat: existsSync/realpath alone miss dangling links.
  for (const part of path.split("/")) {
    cursor = resolve(cursor, part);
    const stat = safeLstat(cursor);
    if (!stat) break;
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not supported for setup planning: ${path}`);
  }
  return absolute;
}

function isSensitivePath(path) {
  const normalized = path.split(sep).join("/");
  const base = basename(normalized);
  return SENSITIVE_BASENAMES.has(base) || base.startsWith(".env.")
    || SENSITIVE_SUFFIXES.some((suffix) => base.endsWith(suffix))
    || normalized.startsWith(".git/") || normalized.startsWith(".ssh/") || normalized.startsWith(".aws/");
}

export function collectPathEntries(root, relativeRoot, { includeContentHash = true } = {}) {
  const absolute = checkedPath(root, relativeRoot);
  if (!safeLstat(absolute)) return [];
  const entries = [];
  const visit = (path, rel) => {
    const current = lstatSync(path);
    const posixRel = rel.split(sep).join("/");
    if (current.isSymbolicLink()) throw new Error(`Symlink is not supported for setup planning: ${posixRel}`);
    if (current.isDirectory()) {
      entries.push({ path: `${posixRel}/`, type: "directory" });
      for (const name of readdirSync(path).sort()) visit(resolve(path, name), join(rel, name));
      return;
    }
    if (!current.isFile()) throw new Error(`Unsupported setup file type: ${posixRel}`);
    if (!includeContentHash || isSensitivePath(posixRel)) {
      entries.push({ path: posixRel, type: "file", content: "omitted" });
      return;
    }
    entries.push({ path: posixRel, type: "file", sha256: sha256(readFileSync(path)) });
  };
  visit(absolute, relativeRoot);
  return entries;
}

export function validateSetupPaths(target, paths) {
  const root = realpathSync(target);
  for (const path of [...new Set(paths)].sort()) collectPathEntries(root, path, { includeContentHash: false });
}

export function copyTargetForSimulation(target, destination, paths) {
  const root = realpathSync(target);
  const selected = [...new Set(paths)].sort();
  // Reject every relevant link, including internal links, before creating staging.
  validateSetupPaths(root, selected);
  const prospective = resolve(realpathSync(dirname(destination)), basename(destination));
  if (pathInside(root, prospective)) throw new Error("Staging must be outside the target repository.");
  mkdirSync(destination, { recursive: true });
  const staging = realpathSync(destination);
  if (pathInside(root, staging)) throw new Error("Staging must be outside the target repository.");
  for (const path of selected) {
    const source = checkedPath(root, path);
    if (!safeLstat(source)) continue;
    const output = checkedPath(staging, path);
    mkdirSync(dirname(output), { recursive: true });
    cpSync(source, output, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      preserveTimestamps: false,
      filter: (from, to) => {
        checkedPath(root, relative(root, from).split(sep).join("/"));
        checkedPath(staging, relative(staging, to).split(sep).join("/"));
        return true;
      },
    });
    // Never let a copied link become an ancestor of a later copy or installer write.
    validateSetupPaths(staging, [path]);
  }
  validateSetupPaths(staging, selected);
}

export function buildSetupSourceIdentity(sourceRoot, { selectedSkills, coreAssets, rendererInputs = {}, projection = null, revision = null }) {
  const root = realpathSync(sourceRoot);
  // Renderer inventories describe projected inputs, not every transitive import.
  // Bind local modules conservatively rather than maintaining another import parser.
  const modules = collectPathEntries(root, "scripts", { includeContentHash: false })
    .filter((entry) => entry.type === "file" && entry.path.endsWith(".mjs"))
    .map((entry) => entry.path);
  const paths = [...new Set([
    ...modules,
    ...SETUP_SOURCE_INPUTS,
    ...KERNEL_SETUP_INPUTS,
    ...coreAssets,
    ...selectedSkills.map((skill) => `skills/${skill}/SKILL.md`),
    ...Object.values(rendererInputs).flat().map((input) => input.path),
  ])].sort();
  const files = paths.map((path) => {
    const absolute = checkedPath(root, path);
    const stat = safeLstat(absolute);
    if (!stat?.isFile()) throw new Error(`Required setup source file is missing or not regular: ${path}`);
    return { path, sha256: sha256(readFileSync(absolute)) };
  });
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  const runtimeProfiles = JSON.parse(readFileSync(resolve(root, "docs/fixtures/adapter-runtime-profiles.json"), "utf8"));
  const projectionDigest = projection === null ? null : jsonDigest(projection);
  return {
    name: manifest.name ?? "agent-spectrum-kernel",
    version: manifest.version ?? null,
    revision,
    projection_digest: projectionDigest,
    files,
    identity_digest: jsonDigest({ files, revision, projection_digest: projectionDigest }),
    runtime_profile_fixture_digest: jsonDigest(runtimeProfiles),
  };
}
