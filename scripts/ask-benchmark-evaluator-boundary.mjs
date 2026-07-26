import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { extname, posix, relative, resolve, sep, win32 } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { computePortfolioCatalogDigest } from "./ask-benchmark-portfolio-catalog.mjs";
import { canonicalDigest, stableCanonicalJson } from "./ask-benchmark-materialize.mjs";
import { verifyNormalizedPortfolioResults } from "./ask-benchmark-normalized-results.mjs";
import { validatePortfolioPolicyArtifacts } from "./ask-benchmark-portfolio-policy.mjs";
import {
  computeFinalAdmissionRecordDigest,
  computeOutputContractDigest,
  computePolicyManifestDigest,
  computeRequirementRecordDigest,
  computeRequirementSetDigest,
  computeScoringInputFreezeManifestDigest,
  computeScoringPolicyDigest,
  BINARY_SCOPE_VERIFICATION_PROFILE_NAME,
  deriveEffectiveVerificationEvidenceReferences,
  deriveEffectiveVerificationEvidenceState,
  FINAL_ADMISSION_RECORD_SCHEMA_PATH,
  SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH,
  validateFinalAdmissionRecordContract,
  validateBinaryScopeVerificationResult,
  validateRequirementRecordContract,
  validateRequirementResultObservations,
  validateScoringContractSchemaParity,
  validateScoringInputBindings,
} from "./ask-benchmark-scoring-contract.mjs";

export const EVALUATOR_REFERENCE_SCHEMA_PATH = "benchmarks/schemas/evaluator-reference.schema.json";
export const PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-bundle.schema.json";
export const PRIVATE_EVALUATOR_INDEPENDENCE_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-independence-statement.schema.json";
export const PRIVATE_EVALUATOR_FRAGMENT_SCHEMA_PATH = "benchmarks/schemas/private-evaluator-fragment.schema.json";
export const PRIVATE_EVALUATION_RECORD_SCHEMA_PATH = "benchmarks/schemas/private-evaluation-record.schema.json";
export const REPOSITORY_DIFF_ARTIFACT_SCHEMA_PATH = "benchmarks/schemas/repository-diff-artifact.schema.json";
export const EVALUATION_INPUT_FAILURE_ARTIFACT_SCHEMA_PATH = "benchmarks/schemas/evaluation-input-failure-artifact.schema.json";
export const EVALUATOR_CHECK_ARTIFACT_SCHEMA_PATH = "benchmarks/schemas/evaluator-check-artifact.schema.json";
export const EVALUATOR_RESULT_SCHEMA_PATH = "benchmarks/schemas/evaluator-result-envelope.schema.json";
export const EVALUATOR_DEPENDENCY_ENTRY_PATHS = Object.freeze([
  "scripts/ask-benchmark-scoring-contract.mjs",
  "scripts/ask-benchmark-materialize.mjs",
  "scripts/ask-benchmark-normalized-results.mjs",
  "scripts/ask-benchmark-evaluator-boundary.mjs",
]);
export const EVALUATOR_AUTHORITY_PATHS = Object.freeze([
  "benchmarks/schemas/evaluator-reference.schema.json",
  "benchmarks/schemas/evaluator-result-envelope.schema.json",
  "benchmarks/schemas/evaluator-check-artifact.schema.json",
  "benchmarks/schemas/evaluation-input-failure-artifact.schema.json",
  "benchmarks/schemas/portfolio-final-admission-record.schema.json",
  "benchmarks/schemas/portfolio-requirement-record.schema.json",
  "benchmarks/schemas/portfolio-output-contract.schema.json",
  "benchmarks/schemas/private-evaluator-bundle.schema.json",
  "benchmarks/schemas/private-evaluator-fragment.schema.json",
  "benchmarks/schemas/private-evaluator-independence-statement.schema.json",
  "benchmarks/schemas/private-evaluation-record.schema.json",
  "benchmarks/schemas/repository-diff-artifact.schema.json",
  "benchmarks/schemas/scoring-input-freeze-manifest.schema.json",
]);
const CATALOG_SCHEMA_PATH = "benchmarks/schemas/portfolio-catalog.schema.json";
const POLICY_MANIFEST_SCHEMA_PATH = "benchmarks/schemas/portfolio-policy-manifest.schema.json";
const SCORING_POLICY_SCHEMA_PATH = "benchmarks/schemas/portfolio-scoring-policy.schema.json";
const ADMISSION_POLICY_SCHEMA_PATH = "benchmarks/schemas/portfolio-admission-policy.schema.json";
const ADMISSION_POLICY_PATH = "benchmarks/portfolio-admission-policy.json";
const REQUIREMENT_RECORD_SCHEMA_PATH = "benchmarks/schemas/portfolio-requirement-record.schema.json";
const OUTPUT_CONTRACT_SCHEMA_PATH = "benchmarks/schemas/portfolio-output-contract.schema.json";

const MAX_PUBLIC_ARTIFACT_BYTES = 1024 * 1024;
const MAX_JSON_ARTIFACT_BYTES = 1024 * 1024;
const MAX_BOUNDARY_FILE_BYTES = 256 * 1024 * 1024;
const MAX_BOUNDARY_FILES = 100_000;
const MAX_BOUNDARY_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const DIGEST_CHUNK_BYTES = 64 * 1024;
const BOUNDARY_MARKERS = [
  ["materializedPath", "materialized root", "materialization-manifest.json"],
  ["selectionState", "selection-state root", "selection-state.json"],
  ["runDir", "execution run root", "run-identity.json"],
  ["normalizedResultsPath", "normalized-results root", "normalized-results-root.json"],
];
const PUBLIC_FORBIDDEN_FIELDS = new Set([
  "credential",
  "credentials",
  "customer_data",
  "expected_decision",
  "expected_finding",
  "expected_finding_details",
  "expected_patch",
  "hidden_answer",
  "hidden_test_source",
  "hidden_tests",
  "matcher",
  "matcher_expression",
  "oracle",
  "oracle_text",
  "personal_data",
  "private_evaluator_path",
  "private_storage_uri",
  "raw_evaluator_prompt",
  "reference_answer",
  "rubric",
  "secret",
  "secrets",
]);

function createScanBudget(label) {
  return { label, files: 0, bytes: 0 };
}

function accountForFile(status, budget, label) {
  if (status.size > MAX_BOUNDARY_FILE_BYTES) throw new Error(`${label} exceeds the per-file boundary inspection limit`);
  budget.files += 1;
  budget.bytes += status.size;
  if (budget.files > MAX_BOUNDARY_FILES) throw new Error(`${budget.label} exceeds the boundary inspection file-count limit`);
  if (budget.bytes > MAX_BOUNDARY_TOTAL_BYTES) throw new Error(`${budget.label} exceeds the boundary inspection byte limit`);
}

function streamingFileDigest(path, label, budget = createScanBudget(label)) {
  assertRegularFile(path, label);
  const initialStatus = lstatSync(path);
  accountForFile(initialStatus, budget, label);
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(DIGEST_CHUNK_BYTES);
  let descriptor;
  let bytes = 0;
  try {
    descriptor = openSync(path, "r");
    const openedStatus = fstatSync(descriptor);
    if (!openedStatus.isFile() || openedStatus.dev !== initialStatus.dev || openedStatus.ino !== initialStatus.ino || openedStatus.size !== initialStatus.size) {
      throw new Error(`${label} changed during boundary inspection`);
    }
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      hash.update(chunk.subarray(0, count));
      bytes += count;
    }
    const finalStatus = fstatSync(descriptor);
    if (finalStatus.size !== openedStatus.size || finalStatus.mtimeMs !== openedStatus.mtimeMs || finalStatus.ctimeMs !== openedStatus.ctimeMs) {
      throw new Error(`${label} changed during boundary inspection`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (bytes !== initialStatus.size) throw new Error(`${label} changed during boundary inspection`);
  return { bytes, digest: `sha256:${hash.digest("hex")}` };
}

function isInside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${sep}`);
}

function canonicalFilesystemPath(path) {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const suffix = [];
  let current = absolute;
  while (!existsSync(current)) {
    const parent = resolve(current, "..");
    if (parent === current) return absolute;
    suffix.unshift(relative(parent, current));
    current = parent;
  }
  return resolve(realpathSync(current), ...suffix);
}

function pathsOverlap(left, right) {
  const canonicalLeft = canonicalFilesystemPath(left);
  const canonicalRight = canonicalFilesystemPath(right);
  return isInside(canonicalLeft, canonicalRight) || isInside(canonicalRight, canonicalLeft);
}

function assertRegularFile(path, label) {
  if (!path || !existsSync(path)) throw new Error(`${label} is missing`);
  const status = lstatSync(path);
  if (status.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!status.isFile()) throw new Error(`${label} must be a regular file`);
}

function assertRealDirectory(path, label) {
  if (!path || !existsSync(path)) throw new Error(`${label} is missing`);
  const status = lstatSync(path);
  if (status.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!status.isDirectory()) throw new Error(`${label} must be a directory`);
  return realpathSync(path);
}

function assertPortableRelativePath(value, label) {
  const segments = typeof value === "string" ? value.split("/") : [];
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 240
    || value.includes("\\")
    || value.includes(":")
    || value.includes("\0")
    || posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || /^(?:\\\\[?.]\\|[A-Za-z]:[\\/])/u.test(value)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || posix.normalize(value) !== value
  ) {
    throw new Error(`${label} must be a portable normalized relative path without escape segments`);
  }
  return value;
}

function assertPathInsideRootWithoutSymlinks(root, path, label) {
  const canonicalRoot = realpathSync(root);
  const relativePath = relative(root, path).split(sep).join("/");
  assertPortableRelativePath(relativePath, label);
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    if (!existsSync(current)) throw new Error(`${label} is missing`);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symlink`);
  }
  if (!isInside(canonicalRoot, realpathSync(path))) throw new Error(`${label} escapes the private evaluator root`);
  return relativePath;
}

function readJsonArtifact(path, label, { publicArtifact = false } = {}) {
  const byteLimit = publicArtifact ? MAX_PUBLIC_ARTIFACT_BYTES : MAX_JSON_ARTIFACT_BYTES;
  assertRegularFile(path, label);
  const stable = readStableFile(realpathSync(path), label, byteLimit, { allowEmpty: false });
  const { bytes } = stable;
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  assertNoDuplicateJsonObjectKeys(bytes.toString("utf8"), label);
  return { ...stable, value };
}

function assertNoDuplicateJsonObjectKeys(source, label) {
  let offset = 0;
  const whitespace = /\s/u;

  function skipWhitespace() {
    while (whitespace.test(source[offset] ?? "")) offset += 1;
  }

  function parseString() {
    const start = offset;
    if (source[offset] !== '"') throw new Error(`${label} has an invalid JSON string`);
    offset += 1;
    while (offset < source.length) {
      if (source[offset] === "\\") {
        offset += 2;
        continue;
      }
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset));
      }
      offset += 1;
    }
    throw new Error(`${label} has an unterminated JSON string`);
  }

  function parseValue() {
    skipWhitespace();
    if (source[offset] === "{") return parseObject();
    if (source[offset] === "[") return parseArray();
    if (source[offset] === '"') {
      parseString();
      return;
    }
    while (offset < source.length && !/[\s,\]}]/u.test(source[offset])) offset += 1;
  }

  function parseObject() {
    offset += 1;
    const keys = new Set();
    skipWhitespace();
    if (source[offset] === "}") {
      offset += 1;
      return;
    }
    while (offset < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) throw new Error(`${label} contains a duplicate JSON object key`);
      keys.add(key);
      skipWhitespace();
      if (source[offset] !== ":") throw new Error(`${label} has invalid JSON object syntax`);
      offset += 1;
      parseValue();
      skipWhitespace();
      if (source[offset] === "}") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") throw new Error(`${label} has invalid JSON object syntax`);
      offset += 1;
    }
  }

  function parseArray() {
    offset += 1;
    skipWhitespace();
    if (source[offset] === "]") {
      offset += 1;
      return;
    }
    while (offset < source.length) {
      parseValue();
      skipWhitespace();
      if (source[offset] === "]") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") throw new Error(`${label} has invalid JSON array syntax`);
      offset += 1;
    }
  }

  parseValue();
  skipWhitespace();
  if (offset !== source.length) throw new Error(`${label} contains trailing JSON content`);
}

function rawByteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function checkedInBytes(root, relativePath) {
  try {
    const repositoryTop = realpathSync(execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim());
    if (repositoryTop !== root) return null;
    return execFileSync("git", ["-C", root, "show", `HEAD:${relativePath}`], { encoding: null, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function checkedInBytesAtRevision(root, revision, relativePath) {
  const key = `${root}\0${revision}\0${relativePath}`;
  const cached = CHECKED_IN_REVISION_BYTES.get(key);
  if (cached) return cached;
  try {
    const bytes = execFileSync("git", ["-C", root, "show", `${revision}:${relativePath}`], {
      encoding: null,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    CHECKED_IN_REVISION_BYTES.set(key, bytes);
    return bytes;
  } catch {
    return null;
  }
}

const CHECKED_IN_REVISION_BYTES = new Map();

function lexModule(source, label) {
  const tokens = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  const advance = () => {
    const character = source[offset++];
    if (character === "\n") { line += 1; column = 1; } else column += 1;
    return character;
  };
  const consumeQuoted = (quote) => {
    const start = { line, column };
    let raw = quote;
    advance();
    while (offset < source.length) {
      const character = advance();
      raw += character;
      if (character === "\\") {
        if (offset >= source.length) throw new Error(`${label} contains an unterminated string`);
        raw += advance();
      } else if (character === quote) {
        try {
          const value = raw.slice(1, -1).replace(/\\\\(.)/gsu, "$1");
          tokens.push({ type: "string", value, ...start });
          return;
        } catch { throw new Error(`${label} contains an invalid string literal`); }
      } else if (character === "\n" || character === "\r") throw new Error(`${label} contains an unterminated string`);
    }
    throw new Error(`${label} contains an unterminated string`);
  };
  while (offset < source.length) {
    const character = source[offset];
    if (/\s/u.test(character)) { advance(); continue; }
    if (character === "/" && source[offset + 1] === "/") { while (offset < source.length && advance() !== "\n") {} continue; }
    if (character === "/" && source[offset + 1] === "*") {
      advance(); advance();
      while (offset < source.length && !(source[offset] === "*" && source[offset + 1] === "/")) advance();
      if (offset >= source.length) throw new Error(`${label} contains an unterminated comment`);
      advance(); advance(); continue;
    }
    const previous = tokens.at(-1)?.value;
    const regexPrefix = previous === undefined || ["(", "[", "{", "=", ":", ",", ";", "!", "?", "return", "=>"].includes(previous);
    if (character === "/" && regexPrefix) {
      advance();
      let inCharacterClass = false;
      while (offset < source.length) {
        const value = advance();
        if (value === "\\" && offset < source.length) advance();
        else if (value === "[") inCharacterClass = true;
        else if (value === "]") inCharacterClass = false;
        else if (value === "/" && !inCharacterClass) break;
        else if (value === "\n" || value === "\r") throw new Error(`${label} contains an unterminated regular expression`);
      }
      if (source[offset - 1] !== "/") throw new Error(`${label} contains an unterminated regular expression`);
      while (offset < source.length && /[A-Za-z]/u.test(source[offset])) advance();
      continue;
    }
    if (character === '"' || character === "'") { consumeQuoted(character); continue; }
    if (character === "`") {
      advance();
      while (offset < source.length) { const value = advance(); if (value === "\\" && offset < source.length) advance(); else if (value === "`") break; }
      if (source[offset - 1] !== "`") throw new Error(`${label} contains an unterminated template literal`);
      continue;
    }
    const start = { line, column };
    if (/[A-Za-z_$]/u.test(character)) {
      let value = "";
      while (offset < source.length && /[A-Za-z0-9_$]/u.test(source[offset])) value += advance();
      tokens.push({ type: "identifier", value, ...start }); continue;
    }
    tokens.push({ type: "punctuation", value: advance(), ...start });
  }
  return tokens;
}

function assertNoUnsupportedLocalLoad(tokens, index, label) {
  const token = tokens[index];
  const next = tokens[index + 1];
  if (["createRequire", "require", "eval", "Function"].includes(token.value) && next?.value === "(") throw new Error(`${label} contains unsupported local module loading via ${token.value}`);
  if (token.value === "import" && next?.value === "." && tokens[index + 2]?.value === "meta" && tokens[index + 3]?.value === "." && tokens[index + 4]?.value === "resolve") throw new Error(`${label} contains unsupported local module loading via import.meta.resolve`);
}

function dependencySpecifierTarget(root, fromPath, specifier, label) {
  if (!specifier.startsWith(".")) return null;
  if (specifier.includes("\\") || specifier.includes(":") || specifier.includes("\0") || posix.isAbsolute(specifier) || win32.isAbsolute(specifier) || specifier.split("/").some((segment) => segment === ".." || segment === "")) throw new Error(`${label} specifier is not portable`);
  const fromDirectory = resolve(root, fromPath, "..");
  const candidate = resolve(fromDirectory, specifier);
  if (!isInside(root, candidate)) throw new Error(`${label} escapes the repository root`);
  const candidates = [candidate, `${candidate}.mjs`, `${candidate}.js`, `${candidate}.json`];
  const target = candidates.find((path) => existsSync(path));
  if (!target) throw new Error(`${label} target is missing: ${specifier}`);
  const relativeTarget = relative(root, target).split(sep).join("/");
  assertPortableRelativePath(relativeTarget, `${label} target`);
  assertPathInsideRootWithoutSymlinks(root, target, `${label} target`);
  return relativeTarget;
}

function parseLocalModuleEdges(root, path, source) {
  const tokens = lexModule(source, `evaluator dependency ${path}`);
  const edges = [];
  const add = (kind, token) => {
    const target = dependencySpecifierTarget(root, path, token.value, `${kind} from ${path}`);
    if (!target) return;
    const edge = { from: path, to: target, kind, specifier: token.value, source_location: { line: token.line, column: token.column } };
    edge.edge_digest = canonicalDigest(edge);
    edges.push(edge);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    assertNoUnsupportedLocalLoad(tokens, index, `evaluator dependency ${path}`);
    if (token.value === "import") {
      const next = tokens[index + 1];
      if (next?.value === "(") {
        const literal = tokens[index + 2];
        if (literal?.type !== "string" || tokens[index + 3]?.value !== ")") throw new Error(`evaluator dependency ${path} contains an unsupported computed dynamic import`);
        add("dynamic_import", literal);
      } else if (next?.type === "string") add("static_import", next);
      else {
        for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ";"; cursor += 1) {
          if (tokens[cursor].value === "from") {
            const literal = tokens[cursor + 1];
            if (literal?.type !== "string") throw new Error(`evaluator dependency ${path} has an invalid static import`);
            add("static_import", literal);
            break;
          }
          if (tokens[cursor].value === "import" || tokens[cursor].value === "export") break;
        }
      }
    } else if (token.value === "export") {
      for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ";"; cursor += 1) {
        if (tokens[cursor].value === "from") {
          const literal = tokens[cursor + 1];
          if (literal?.type !== "string") throw new Error(`evaluator dependency ${path} has an invalid export-from`);
          add("export_from", literal);
          break;
        }
        if (tokens[cursor].value === "import" || tokens[cursor].value === "export") break;
      }
    }
  }
  return edges;
}

function dependencyFileType(path) {
  if (EVALUATOR_AUTHORITY_PATHS.includes(path)) return "authority_data";
  if (extname(path).toLowerCase() === ".json") return "json";
  return "module";
}

export function deriveEvaluatorDependencyGraph({ root, baseRevision, entryPaths = EVALUATOR_DEPENDENCY_ENTRY_PATHS } = {}) {
  const canonicalRoot = assertRealDirectory(root, "evaluator dependency graph repository root");
  if (!baseRevision || !/^[a-f0-9]{40}$/u.test(baseRevision)) throw new Error("evaluator dependency graph base Git revision is invalid");
  const entries = [...entryPaths].map((path) => assertPortableRelativePath(path, "evaluator dependency graph entry path")).sort();
  if (new Set(entries).size !== entries.length) throw new Error("evaluator dependency graph entry paths contain duplicates");
  const nodePaths = new Set();
  const edges = new Map();
  const visit = (path) => {
    if (nodePaths.has(path)) return;
    nodePaths.add(path);
    const absolute = resolveAuthorityArtifactPath(canonicalRoot, path, `evaluator dependency ${path}`);
    const bytes = readFileSync(absolute);
    const fileType = dependencyFileType(path);
    const committed = checkedInBytesAtRevision(canonicalRoot, baseRevision, path);
    if (!committed) throw new Error(`evaluator dependency base Git revision is unavailable at ${path}`);
    if (committed.length !== bytes.length || rawByteDigest(committed) !== rawByteDigest(bytes)) throw new Error(`evaluator dependency bytes do not match the base Git revision at ${path}`);
    if (fileType !== "json") {
      for (const edge of parseLocalModuleEdges(canonicalRoot, path, bytes.toString("utf8"))) {
        const edgeKey = stableCanonicalJson(edge);
        edges.set(edgeKey, edge);
        visit(edge.to);
      }
    }
  };
  for (const entry of entries) visit(entry);
  for (const authorityPath of EVALUATOR_AUTHORITY_PATHS) {
    visit(authorityPath);
    const owner = authorityPath.includes("scoring-input") || authorityPath.includes("portfolio-" )
      ? "scripts/ask-benchmark-scoring-contract.mjs"
      : "scripts/ask-benchmark-evaluator-boundary.mjs";
    const edge = { from: owner, to: authorityPath, kind: "authority_read", specifier: authorityPath, syntax_identity: ["authority_read", owner, authorityPath].join(":") };
    edge.edge_digest = canonicalDigest(edge);
    edges.set(stableCanonicalJson(edge), edge);
  }
  const casePaths = new Map();
  for (const path of nodePaths) {
    const folded = path.toLocaleLowerCase("en-US");
    if (casePaths.has(folded) && casePaths.get(folded) !== path) throw new Error(`evaluator dependency graph contains a case collision: ${casePaths.get(folded)} / ${path}`);
    casePaths.set(folded, path);
  }
  const nodeInventory = [...nodePaths].sort().map((path) => {
    const bytes = readFileSync(resolve(canonicalRoot, path));
    const committed = checkedInBytesAtRevision(canonicalRoot, baseRevision, path);
    return {
      path,
      bytes: bytes.length,
      sha256: rawByteDigest(bytes),
      file_type: dependencyFileType(path),
      base_git_revision_bytes: committed.length,
      base_git_revision_sha256: rawByteDigest(committed),
    };
  });
  const edgeInventory = [...edges.values()].sort((left, right) => stableCanonicalJson(left).localeCompare(stableCanonicalJson(right)));
  const graph = { entry_paths: entries, node_inventory: nodeInventory, edge_inventory: edgeInventory };
  return { ...graph, graph_digest: canonicalDigest(graph) };
}

export function validateEvaluatorSourceIdentity({ identity, root, expectedRevision = null, expectedGeneratorSourceDigest = null, label = "evaluator source identity" }) {
  if (!identity || typeof identity !== "object" || !Array.isArray(identity.source_files) || identity.source_files.length === 0 || !identity.dependency_graph) throw new Error(`${label} is missing or empty`);
  if (expectedRevision && identity.base_git_revision !== expectedRevision) throw new Error(`${label} base Git revision drift`);
  if (expectedGeneratorSourceDigest && identity.generator_source_digest !== expectedGeneratorSourceDigest) throw new Error(`${label} generator source digest drift`);
  const sourceFiles = identity.source_files.map((entry) => ({ path: assertPortableRelativePath(entry.path, `${label} source path`), bytes: entry.bytes, sha256: entry.sha256 }));
  const sorted = [...sourceFiles].sort((left, right) => left.path.localeCompare(right.path));
  if (stableCanonicalJson(sourceFiles) !== stableCanonicalJson(sorted)) throw new Error(`${label} source inventory is not deterministically ordered`);
  if (new Set(sourceFiles.map(({ path }) => path)).size !== sourceFiles.length) throw new Error(`${label} source inventory contains duplicate paths`);
  if (identity.source_tree_digest !== canonicalDigest(sourceFiles)) throw new Error(`${label} source-tree digest closure is invalid`);
  for (const entry of sourceFiles) {
    const path = resolveAuthorityArtifactPath(realpathSync(root), entry.path, `${label} source`);
    const actual = streamingFileDigest(path, `${label} source ${entry.path}`);
    if (actual.bytes !== entry.bytes || actual.digest !== entry.sha256) throw new Error(`${label} source bytes drift at ${entry.path}`);
    const committed = checkedInBytesAtRevision(realpathSync(root), identity.base_git_revision, entry.path);
    if (!committed) throw new Error(`${label} base Git revision or source path is unavailable at ${entry.path}`);
    if (committed.length !== entry.bytes || rawByteDigest(committed) !== entry.sha256) throw new Error(`${label} source bytes do not match the immutable base Git revision at ${entry.path}`);
  }
  const graph = deriveEvaluatorDependencyGraph({ root, baseRevision: identity.base_git_revision });
  if (stableCanonicalJson(identity.dependency_graph) !== stableCanonicalJson(graph)) throw new Error(`${label} dependency graph closure is invalid`);
  const graphSourceFiles = graph.node_inventory.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
  if (stableCanonicalJson(sourceFiles) !== stableCanonicalJson(graphSourceFiles)) throw new Error(`${label} source inventory does not match the dependency graph`);
  return structuredClone(identity);
}

function resolveAuthorityArtifactPath(authorityRoot, relativePath, label) {
  assertPortableRelativePath(relativePath, `${label} path`);
  const absolutePath = resolve(authorityRoot, relativePath);
  if (!isInside(authorityRoot, absolutePath)) throw new Error(`${label} path escapes the authority root`);
  let current = authorityRoot;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    if (!existsSync(current)) throw new Error(`${label} is missing`);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} path must not traverse a symlink`);
  }
  if (!lstatSync(absolutePath).isFile()) throw new Error(`${label} must be a regular file`);
  if (!isInside(authorityRoot, realpathSync(absolutePath))) throw new Error(`${label} path escapes the authority root`);
  return absolutePath;
}

function authorityRelativePathForSupplied(authorityRoot, suppliedPath, label) {
  if (!suppliedPath) throw new Error(`${label} path is required for scoring input authority closure`);
  const relativePath = relative(authorityRoot, resolve(suppliedPath)).split(sep).join("/");
  assertPortableRelativePath(relativePath, `${label} path`);
  const authoritativePath = resolveAuthorityArtifactPath(authorityRoot, relativePath, label);
  if (resolve(suppliedPath) !== authoritativePath) throw new Error(`${label} supplied path does not match its authority path`);
  return { authoritativePath, relativePath };
}

function readAnchoredFreezeManifest({ root, freezeManifestPath, freezeManifestSourceDigest }) {
  const authorityRoot = assertRealDirectory(root, "scoring input authority root");
  const { authoritativePath, relativePath } = authorityRelativePathForSupplied(authorityRoot, freezeManifestPath, "scoring input freeze manifest");
  const source = readJsonArtifact(authoritativePath, "scoring input freeze manifest", { publicArtifact: true });
  const sourceDigest = rawByteDigest(source.bytes);
  const committed = checkedInBytes(authorityRoot, relativePath);
  const matchesCheckedInBytes = committed !== null && Buffer.compare(source.bytes, committed) === 0;
  if (!matchesCheckedInBytes) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(freezeManifestSourceDigest ?? "")) {
      throw new Error("scoring input freeze manifest requires checked-in bytes or an explicitly approved immutable source digest");
    }
    if (freezeManifestSourceDigest !== sourceDigest) throw new Error("scoring input freeze manifest raw-byte digest does not match the approved immutable source digest");
  }
  assertBenchmarkSchemaInstance(source.value, { schemaPath: resolve(root, SCORING_INPUT_FREEZE_MANIFEST_SCHEMA_PATH), label: "scoring input freeze manifest" });
  assertPublicArtifactTree(source.value, "scoring input freeze manifest");
  if (source.value.manifest_digest !== computeScoringInputFreezeManifestDigest(source.value)) throw new Error("scoring input freeze manifest digest closure is invalid");
  return { authorityRoot, manifest: source.value, manifestPath: authoritativePath, manifestRelativePath: relativePath, sourceDigest };
}

function readFrozenJsonArtifact({ authorityRoot, root, reference, suppliedPath, schemaPath, label, publicArtifact = false }) {
  const authoritativePath = resolveAuthorityArtifactPath(authorityRoot, reference.path, label);
  if (!suppliedPath || resolve(suppliedPath) !== authoritativePath) throw new Error(`${label} supplied path does not match the freeze manifest authority path`);
  const source = readJsonArtifact(authoritativePath, label, { publicArtifact });
  if (rawByteDigest(source.bytes) !== reference.raw_byte_digest) throw new Error(`${label} raw-byte digest does not match the scoring input freeze manifest`);
  assertBenchmarkSchemaInstance(source.value, { schemaPath: resolve(root, schemaPath), label });
  if (publicArtifact) assertPublicArtifactTree(source.value, label);
  return { ...source, absolutePath: authoritativePath };
}

function looksLikePrivatePathOrUri(value) {
  return posix.isAbsolute(value)
    || win32.isAbsolute(value)
    || /^(?:\\\\[?.]\\|[A-Za-z]:[\\/])/u.test(value)
    || value.includes("\\")
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value);
}

function assertPublicArtifactTree(value, label, path = "$", depth = 0) {
  if (depth > 12) throw new Error(`${label} exceeds the public structure depth limit`);
  if (typeof value === "string") {
    if (value.length > 256) throw new Error(`${label} contains oversized raw text at ${path}`);
    if (looksLikePrivatePathOrUri(value)) throw new Error(`${label} contains a private path or storage URI at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertPublicArtifactTree(value[index], label, `${path}[${index}]`, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (PUBLIC_FORBIDDEN_FIELDS.has(key.toLowerCase())) throw new Error(`${label} contains prohibited answer-bearing or private field ${key}`);
    assertPublicArtifactTree(child, label, `${path}.${key}`, depth + 1);
  }
}

function directoryFileInventory(root, label) {
  const files = new Map();
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`${label} contains a symlink`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.set(path, absolute);
      else throw new Error(`${label} contains a non-regular entry`);
      if (files.size > MAX_BOUNDARY_FILES) throw new Error(`${label} exceeds the boundary inspection file-count limit`);
    }
  }
  walk(root);
  return files;
}

function managedRepositoryInventory(root) {
  const canonicalRoot = assertRealDirectory(root, "repository root");
  let repositoryTop;
  let output;
  try {
    repositoryTop = realpathSync(execFileSync("git", ["-C", canonicalRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim());
    output = execFileSync("git", ["-C", canonicalRoot, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw new Error("repository root must be a readable Git worktree root");
  }
  if (repositoryTop !== canonicalRoot) throw new Error("repository root must be the Git worktree root");
  const paths = output.split("\0").filter(Boolean);
  if (paths.length > MAX_BOUNDARY_FILES) throw new Error("managed repository exceeds the boundary inspection file-count limit");
  const files = new Map();
  for (const path of paths) {
    assertPortableRelativePath(path, "managed repository path");
    const absolute = resolve(canonicalRoot, path);
    if (!isInside(canonicalRoot, absolute)) throw new Error("managed repository path escapes the repository root");
    assertRegularFile(absolute, `managed repository file ${path}`);
    files.set(path, absolute);
  }
  return files;
}

function assertNoPrivateMaterial(files, label, privateMaterialDigests) {
  const budget = createScanBudget(label);
  for (const [path, absolute] of files) {
    const evidence = streamingFileDigest(absolute, `${label} file ${path}`, budget);
    if (privateMaterialDigests.has(evidence.digest)) {
      throw new Error(`${label} contains byte-identical private evaluator material: ${path}`);
    }
  }
}

function assertUniqueValues(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

export function computeEvaluatorBundleId(manifest) {
  const identity = {
    schema_version: manifest.schema_version,
    schema_path: manifest.schema_path,
    fixture_identity: manifest.fixture_identity,
    input_identity: manifest.input_identity,
    asset_inventory: manifest.asset_inventory,
  };
  return `evaluator-${canonicalDigest(identity).slice("sha256:".length)}`;
}

export function computeEvaluatorBundleDigest(manifest) {
  const { evaluator_bundle_digest: _digest, ...closure } = manifest;
  return canonicalDigest(closure);
}

export function computeEvaluatorReferenceDigest(reference) {
  const { public_metadata_digest: _digest, ...metadata } = reference;
  return canonicalDigest(metadata);
}

export function computeIndependenceStatementDigest(statement) {
  const { statement_digest: _digest, ...closure } = statement;
  return canonicalDigest(closure);
}

export function validateIndependenceStatement({ statement, manifest, root = null }) {
  if (!statement || typeof statement !== "object" || Array.isArray(statement)) throw new Error("private independence statement must be an object");
  if (root) assertBenchmarkSchemaInstance(statement, { schemaPath: resolve(root, PRIVATE_EVALUATOR_INDEPENDENCE_SCHEMA_PATH), label: "private independence statement" });
  if (statement.schema_version !== "1.1.0" || statement.fixture_id !== manifest.fixture_identity.fixture_id) throw new Error("private independence statement fixture identity mismatch");
  if (statement.statement_digest !== computeIndependenceStatementDigest(statement)) throw new Error("private independence statement digest closure is invalid");
  if (statement.statement_digest !== manifest.independence.statement_digest) throw new Error("private independence statement does not match the manifest assertion");
  if (stableCanonicalJson(statement.generator_role_identity) !== stableCanonicalJson(manifest.generator)) throw new Error("private independence statement generator identity mismatch");
  if (statement.generation_revision !== manifest.evaluator_revision) throw new Error("private independence statement generation revision drift");
  if (statement.evaluator_source_identity || manifest.evaluator_source_identity) {
    if (stableCanonicalJson(statement.evaluator_source_identity) !== stableCanonicalJson(manifest.evaluator_source_identity)) throw new Error("private independence statement evaluator source identity drift");
    if (root) validateEvaluatorSourceIdentity({ identity: statement.evaluator_source_identity, root, expectedRevision: manifest.evaluator_revision, expectedGeneratorSourceDigest: manifest.generator.source_digest, label: "private independence evaluator source identity" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(statement.generation_date) || new Date(`${statement.generation_date}T00:00:00Z`).toISOString().slice(0, 10) !== statement.generation_date) throw new Error("private independence statement generation date is invalid");
  if (statement.frozen_candidate_input?.raw_byte_digest !== manifest.input_identity.fixture_input_digest || typeof statement.frozen_candidate_input?.public_source_path !== "string") throw new Error("private independence statement frozen input raw binding mismatch");
  if (root) {
    const sourcePath = resolveAuthorityArtifactPath(realpathSync(root), statement.frozen_candidate_input.public_source_path, "private independence frozen public source");
    const source = readJsonArtifact(sourcePath, "private independence frozen public source", { publicArtifact: true });
    if (rawByteDigest(source.bytes) !== statement.frozen_candidate_input.raw_byte_digest) throw new Error("private independence frozen public source raw-byte digest drift");
    if (canonicalDigest(source.value) !== statement.frozen_candidate_input.digest) throw new Error("private independence frozen public source semantic digest drift");
    const fixture = source.value.fixtures?.[manifest.fixture_identity.fixture_id];
    if (!fixture) throw new Error("private independence frozen public source fixture binding is missing");
  }
  if (statement.measured_output_used !== false || statement.measured_result_used !== false) throw new Error("private independence statement must exclude measured evidence");
  if (typeof statement.author_scratch?.used !== "boolean" || typeof statement.author_scratch?.scope !== "string" || statement.author_scratch?.contamination_assessment?.state !== "not_used" || typeof statement.author_scratch?.contamination_assessment?.evidence_basis !== "string") throw new Error("private independence statement author-scratch classification is incomplete or contaminated");
  for (const field of ["source_classification", "excluded_source_classification"]) {
    const values = statement[field];
    if (!Array.isArray(values) || values.length === 0 || values.some((entry) => typeof entry !== "string" || entry.length === 0) || new Set(values).size !== values.length) throw new Error(`private independence statement ${field} is invalid`);
  }
  for (const field of ["contaminated_issues_193_196_as_oracle_source", "issue_194_body_used", "issue_194_edit_history_used", "issue_194_legacy_answer_structure_used"]) {
    if (!statement[field] || statement[field].state !== "not_used" || typeof statement[field].evidence_basis !== "string" || statement[field].evidence_basis.length === 0) throw new Error(`private independence statement ${field} is contaminated or incomplete`);
  }
  if (manifest.independence.public_answer_sources_used !== false || manifest.independence.generated_without_agent_output !== true || manifest.independence.measured_agent_access_allowed !== false) throw new Error("private independence manifest assertion is contaminated or unsafe");
  return structuredClone(statement);
}

export function computeEvaluationId(result) {
  return `evaluation-${canonicalDigest({
    scoring_input_freeze_manifest_source_digest: result.scoring_input_freeze_manifest_source_digest,
    scoring_input_freeze_manifest_digest: result.scoring_input_freeze_manifest_digest,
    catalog_digest: result.catalog_digest,
    policy_manifest_digest: result.policy_manifest_digest,
    scoring_policy_digest: result.scoring_policy_digest,
    admission_record_digest: result.admission_record_digest,
    requirement_record_digest: result.requirement_record_digest,
    requirement_set_digest: result.requirement_set_digest,
    output_contract_digest: result.output_contract_digest,
    evaluator_public_reference_digest: result.evaluator_public_reference_digest,
    normalized_result_id: result.normalized_result_id,
    normalized_result_digest: result.normalized_result_digest,
    evaluator_bundle_id: result.evaluator_bundle_id,
    evaluator_bundle_digest: result.evaluator_bundle_digest,
    evaluator_revision: result.evaluator_revision,
  }).slice("sha256:".length, "sha256:".length + 32)}`;
}

export function computeEvaluationDigest(result) {
  const { evaluation_digest: _digest, ...closure } = result;
  return canonicalDigest(closure);
}

function fragmentEnvelopeView(fragment) {
  return {
    ...fragment,
    false_positives: [],
  };
}

export function validatePrivateEvaluatorFragment({ root, fragment, scoringPolicy, requirementRecord, normalizedResult }) {
  assertBenchmarkSchemaInstance(fragment, { schemaPath: resolve(root, PRIVATE_EVALUATOR_FRAGMENT_SCHEMA_PATH), label: "private evaluator result fragment" });
  if (fragment.scoring_ready !== false) throw new Error("private evaluator fragment must remain scoring-ineligible");
  const envelopeView = fragmentEnvelopeView(fragment);
  validateRequirementResultObservations({ scoringPolicy, requirementRecord, evaluatorResult: envelopeView });
  validateBinaryScopeVerificationResult({ evaluatorResult: envelopeView, requirementRecord, normalizedResult });
  return structuredClone(fragment);
}

export function computePrivateEvaluationRecordDigest(record) {
  const closure = structuredClone(record);
  delete closure.evaluation_record_digest;
  return canonicalDigest(closure);
}

export function computeAdapterResultEnvelopeDigest(result) {
  const closure = structuredClone(result);
  delete closure.evaluation_id;
  delete closure.evaluation_digest;
  delete closure.private_evaluation_record_digest;
  return canonicalDigest(closure);
}

function fragmentObservation(fragment, field, fallbackState) {
  const source = fragment[field];
  return { state: source?.state ?? fallbackState, evidence_references: structuredClone(source?.evidence_references ?? []) };
}

function authorityPrivacy() {
  return {
    oracle_content_stored: false,
    rubric_content_stored: false,
    hidden_test_content_stored: false,
    matcher_content_stored: false,
    reference_answer_stored: false,
    raw_evaluator_prompt_stored: false,
    private_path_stored: false,
    secret_customer_or_personal_data_stored: false,
  };
}

export function adaptPrivateEvaluatorFragmentToEnvelope({ root, fragment, authority }) {
  const normalized = authority.normalizedResult;
  const binding = authority.fragmentBinding;
  if (!binding || binding.normalized_result_id !== normalized.normalized_result_id || binding.normalized_result_digest !== normalized.normalized_result_digest || binding.run_instance_id !== normalized.lineage.run_instance_id || binding.case_id !== normalized.lineage.case_id || binding.attempt !== normalized.lineage.attempt) {
    throw new Error("authority-owned fragment binding does not match the supplied normalized result");
  }
  const validated = validatePrivateEvaluatorFragment({
    root,
    fragment,
    scoringPolicy: authority.scoringPolicy,
    requirementRecord: authority.requirementRecord,
    normalizedResult: normalized,
  });
  const lineage = normalized.lineage;
  const manifest = authority.bundleManifest;
  const result = {
    schema_version: "1.0.0",
    schema_path: EVALUATOR_RESULT_SCHEMA_PATH,
    program: "adaptive_ask_evaluator_result",
    scoring_input_freeze_manifest_source_digest: authority.freezeManifestSourceDigest,
    scoring_input_freeze_manifest_digest: authority.freezeManifest.manifest_digest,
    catalog_digest: authority.catalog.catalog_digest,
    policy_manifest_digest: authority.policyManifest.manifest_digest,
    scoring_policy_digest: authority.scoringPolicy.policy_digest,
    admission_record_digest: authority.admissionRecord.admission_digest,
    requirement_record_digest: authority.requirementRecord.requirement_record_digest,
    requirement_set_digest: authority.requirementRecord.requirement_set_digest,
    output_contract_digest: authority.outputContract.output_contract_digest,
    evaluator_public_reference_digest: authority.evaluatorReference.public_metadata_digest,
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: lineage.run_instance_id,
    plan_id: lineage.plan_id,
    plan_digest: lineage.plan_digest,
    fixture_id: lineage.fixture_id,
    fixture_input_digest: lineage.fixture_input_digest,
    case_id: lineage.case_id,
    attempt: lineage.attempt,
    adapter: lineage.adapter_track,
    condition: lineage.condition,
    repetition: lineage.repetition,
    source_snapshot_digest: authority.sourceSnapshotDigest,
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_revision: manifest.evaluator_revision,
    evaluation_id: "evaluation-placeholder",
    evaluation_digest: "sha256:" + "0".repeat(64),
    evaluation_status: validated.evaluation_status,
    requirement_results: structuredClone(validated.requirement_results),
    result_profile: structuredClone(validated.result_profile),
    classification: validated.classification,
    quality: fragmentObservation(validated, "verification_correctness", "fail"),
    safety: fragmentObservation(validated, "evidence_correctness", "fail"),
    findings: structuredClone(validated.findings),
    false_positives: [],
    scope_deviations: structuredClone(validated.scope_deviations),
    decision_correctness: fragmentObservation(validated, "verification_correctness", "fail"),
    verification_correctness: fragmentObservation(validated, "verification_correctness", "fail"),
    evidence_correctness: fragmentObservation(validated, "evidence_correctness", "fail"),
    approval_correctness: fragmentObservation(validated, "evidence_correctness", "fail"),
    completion_claim_correctness: fragmentObservation(validated, "verification_correctness", "fail"),
    under_processing: fragmentObservation(validated, "under_processing", "not_detected"),
    over_processing: fragmentObservation(validated, "over_processing", "not_detected"),
    required_mechanisms: [],
    unnecessary_mechanisms: [],
    unsafe_attempted_actions: [],
    evaluator_notes_state: { state: "not_recorded", digest: null, bytes: null },
    privacy: authorityPrivacy(),
  };
  if (validated.invalid_input_authority) result.invalid_input_authority = structuredClone(validated.invalid_input_authority);
  if (authority.privateFragmentDigest) {
    result.private_fragment_digest = authority.privateFragmentDigest;
    result.private_fragment_bytes = authority.privateFragmentBytes;
  }
  if (authority.privateEvaluationRecordDigest) result.private_evaluation_record_digest = authority.privateEvaluationRecordDigest;
  result.evaluation_id = computeEvaluationId(result);
  result.evaluation_digest = computeEvaluationDigest(result);
  assertBenchmarkSchemaInstance(result, { schemaPath: resolve(root, EVALUATOR_RESULT_SCHEMA_PATH), label: "authority-owned evaluator result envelope" });
  return result;
}

function assertPrivateBoundary({ root, privateRoot, materializedPath, selectionState, runDir, normalizedResultsPath, publicArtifactRoot = null }) {
  const canonicalPrivateRoot = assertRealDirectory(privateRoot, "private evaluator root");
  const boundaries = [
    ["root", root, "repository root", "repository"],
    ["materializedPath", materializedPath, "materialized root", "materialized root"],
    ["selectionState", selectionState, "selection-state root", "selection-state root"],
    ["runDir", runDir, "execution run root", "execution run root"],
    ["normalizedResultsPath", normalizedResultsPath, "normalized-results root", "normalized-results root"],
    ...(publicArtifactRoot ? [["publicArtifactRoot", publicArtifactRoot, "public artifact root", "public artifact root"]] : []),
  ];
  const canonicalRoots = {};
  for (const [key, path, label, overlapLabel] of boundaries) {
    if (!path) throw new Error(`${label} is required to prove evaluator root isolation`);
    const canonical = assertRealDirectory(path, label);
    if (isInside(canonicalPrivateRoot, canonical) || isInside(canonical, canonicalPrivateRoot)) {
      throw new Error(`private evaluator root must not overlap the ${overlapLabel}`);
    }
    canonicalRoots[key] = canonical;
  }
  const markerPaths = {};
  for (const [key, label, marker] of BOUNDARY_MARKERS) {
    const markerPath = resolve(canonicalRoots[key], marker);
    assertRegularFile(markerPath, `${label} marker ${marker}`);
    markerPaths[key] = markerPath;
  }
  return { canonicalPrivateRoot, canonicalRoots, markerPaths };
}

export function verifyPublicEvaluatorReference({ root, referencePath, privateRoot = null }) {
  const { value: reference } = readJsonArtifact(referencePath, "public evaluator reference", { publicArtifact: true });
  assertBenchmarkSchemaInstance(reference, { schemaPath: resolve(root, EVALUATOR_REFERENCE_SCHEMA_PATH), label: "public evaluator reference" });
  assertPublicArtifactTree(reference, "public evaluator reference");
  if (reference.evaluator_source_identity) validateEvaluatorSourceIdentity({ identity: reference.evaluator_source_identity, root, expectedRevision: reference.evaluator_revision, label: "public evaluator source identity" });
  if (reference.public_metadata_digest !== computeEvaluatorReferenceDigest(reference)) throw new Error("public evaluator reference deterministic identity is invalid");
  if (privateRoot && pathsOverlap(referencePath, privateRoot)) throw new Error("public evaluator reference must not overlap the private evaluator root");
  return reference;
}

function assertReferenceMatchesBundle(reference, manifest) {
  const expected = {
    evaluator_bundle_id: manifest.evaluator_bundle_id,
    evaluator_bundle_digest: manifest.evaluator_bundle_digest,
    evaluator_bundle_schema_version: manifest.schema_version,
    fixture_id: manifest.fixture_identity.fixture_id,
    fixture_input_digest: manifest.input_identity.fixture_input_digest,
    task_class: manifest.fixture_identity.task_class,
    suite: manifest.fixture_identity.suite,
    evaluator_revision: manifest.evaluator_revision,
    generator_identity: canonicalDigest(manifest.generator),
    independence_statement_digest: manifest.independence.statement_digest,
    review_record_digest: manifest.review.record_digest,
  };
  if (manifest.evaluator_source_identity) expected.evaluator_source_identity = manifest.evaluator_source_identity;
  for (const [field, value] of Object.entries(expected)) {
    const matches = value && typeof value === "object"
      ? stableCanonicalJson(reference[field]) === stableCanonicalJson(value)
      : reference[field] === value;
    if (!matches) throw new Error(`public/private evaluator identity mismatch at ${field}`);
  }
}

export function verifyPrivateEvaluatorBundle({
  root,
  referencePath,
  privateRoot,
  manifestPath,
  materializedPath,
  selectionState,
  runDir,
  normalizedResultsPath,
  publicArtifactRoot = null,
}) {
  const boundary = assertPrivateBoundary({ root, privateRoot, materializedPath, selectionState, runDir, normalizedResultsPath, publicArtifactRoot });
  const { canonicalPrivateRoot } = boundary;
  if (!manifestPath || !isInside(privateRoot, manifestPath)) throw new Error("private evaluator manifest must stay inside the private evaluator root");
  const manifestRelativePath = assertPathInsideRootWithoutSymlinks(privateRoot, manifestPath, "private evaluator manifest");
  const { value: manifest } = readJsonArtifact(manifestPath, "private evaluator manifest");
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, PRIVATE_EVALUATOR_BUNDLE_SCHEMA_PATH), label: "private evaluator manifest" });

  const sortedAssets = [...manifest.asset_inventory].sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path));
  if (stableCanonicalJson(manifest.asset_inventory) !== stableCanonicalJson(sortedAssets)) throw new Error("private evaluator asset inventory must be deterministically ordered by role and path");
  assertUniqueValues(manifest.asset_inventory.map((asset) => asset.role), "private evaluator asset role inventory");
  assertUniqueValues(manifest.asset_inventory.map((asset) => asset.path), "private evaluator asset path inventory");

  const files = directoryFileInventory(privateRoot, "private evaluator inventory");
  const privateBudget = createScanBudget("private evaluator bundle");
  const manifestEvidence = streamingFileDigest(manifestPath, "private evaluator manifest", privateBudget);
  const privateMaterialDigests = new Set([manifestEvidence.digest]);
  const expectedPaths = [manifestRelativePath];
  for (const asset of manifest.asset_inventory) {
    assertPortableRelativePath(asset.path, `private evaluator ${asset.role} asset path`);
    if (asset.path === manifestRelativePath) throw new Error("private evaluator manifest must not also be an asset");
    const assetPath = resolve(privateRoot, asset.path);
    assertPathInsideRootWithoutSymlinks(privateRoot, assetPath, `private evaluator ${asset.role} asset`);
    const assetFile = files.get(asset.path);
    if (!assetFile) throw new Error(`private evaluator required asset is missing for role ${asset.role}`);
    const evidence = streamingFileDigest(assetFile, `private evaluator ${asset.role} asset`, privateBudget);
    if (asset.sha256 !== evidence.digest) throw new Error(`private evaluator asset digest is invalid for role ${asset.role}`);
    if (asset.bytes !== evidence.bytes) throw new Error(`private evaluator asset byte count is invalid for role ${asset.role}`);
    privateMaterialDigests.add(evidence.digest);
    expectedPaths.push(asset.path);
  }
  const independenceAsset = manifest.asset_inventory.find(({ role }) => role === "independence_provenance");
  const independenceStatement = independenceAsset
    ? readJsonArtifact(resolve(privateRoot, independenceAsset.path), "private independence statement").value
    : null;
  if (independenceStatement) validateIndependenceStatement({ statement: independenceStatement, manifest, root });
  if (manifest.evaluator_source_identity) validateEvaluatorSourceIdentity({ identity: manifest.evaluator_source_identity, root, expectedRevision: manifest.evaluator_revision, expectedGeneratorSourceDigest: manifest.generator.source_digest, label: "private evaluator source identity" });
  if (stableCanonicalJson([...files.keys()].sort()) !== stableCanonicalJson(expectedPaths.sort())) throw new Error("private evaluator root has an unexpected or unmanaged inventory entry");
  if (manifest.evaluator_bundle_id !== computeEvaluatorBundleId(manifest)) throw new Error("private evaluator bundle ID is invalid");
  if (manifest.evaluator_bundle_digest !== computeEvaluatorBundleDigest(manifest)) throw new Error("private evaluator bundle digest closure is invalid");

  const reference = verifyPublicEvaluatorReference({ root, referencePath, privateRoot: canonicalPrivateRoot });
  assertReferenceMatchesBundle(reference, manifest);
  const bundle = { ...boundary, files, manifest, manifestEvidence, manifestRelativePath, privateMaterialDigests, reference, independenceStatement };
  assertNoPrivateMaterial(managedRepositoryInventory(boundary.canonicalRoots.root), "managed repository", privateMaterialDigests);
  for (const [key, label] of [
    ["materializedPath", "materialized root"],
    ["selectionState", "selection-state root"],
    ["runDir", "execution run root"],
    ["normalizedResultsPath", "normalized-results root"],
    ...(publicArtifactRoot ? [["publicArtifactRoot", "public artifact root"]] : []),
  ]) {
    assertNoPrivateMaterial(directoryFileInventory(boundary.canonicalRoots[key], label), label, privateMaterialDigests);
  }
  return bundle;
}

function assertResultCollectionIdentity(result) {
  if (result.evaluation_id !== computeEvaluationId(result)) throw new Error("evaluator result evaluation ID is invalid");
  if (result.evaluation_digest !== computeEvaluationDigest(result)) throw new Error("evaluator result digest closure is invalid");
  const notes = result.evaluator_notes_state;
  if (notes.state === "not_recorded" && (notes.digest !== null || notes.bytes !== null)) throw new Error("unrecorded evaluator notes must not retain digest or byte metadata");
  if (notes.state === "digested" && (notes.digest === null || notes.bytes === null)) throw new Error("digested evaluator notes require digest and byte metadata");
  if ((notes.digest === null) !== (notes.bytes === null)) throw new Error("evaluator note digest and byte metadata must be paired");
  assertUniqueValues([...result.findings, ...result.false_positives, ...result.scope_deviations].map((entry) => entry.finding_id), "evaluator finding identity");
  assertUniqueValues([...result.required_mechanisms, ...result.unnecessary_mechanisms].map((entry) => entry.mechanism_id), "evaluator mechanism identity");
  assertUniqueValues(result.unsafe_attempted_actions.map((entry) => entry.action_id), "unsafe attempted action identity");
  const evidenceReferences = [];
  function collect(value) {
    if (Array.isArray(value)) for (const entry of value) collect(entry);
    else if (value && typeof value === "object") {
      if (value.kind && value.digest && Object.hasOwn(value, "bytes")) evidenceReferences.push(value);
      else for (const child of Object.values(value)) collect(child);
    }
  }
  collect(result);
  for (const reference of evidenceReferences.filter((entry) => entry.kind === "normalized_result")) {
    if (reference.digest !== result.normalized_result_digest) throw new Error("evaluator result contains a mismatched normalized-result evidence reference");
  }
}

export function validateExecutionEventEvidenceReferences({ normalized, result }) {
  const executionReferences = [];
  function collect(value) {
    if (Array.isArray(value)) for (const entry of value) collect(entry);
    else if (value && typeof value === "object") {
      if (value.kind === "execution_event" && value.digest && Object.hasOwn(value, "bytes")) executionReferences.push(value);
      else for (const child of Object.values(value)) collect(child);
    }
  }
  collect(result);
  const verified = new Map(normalized.command_evidence.references.map((entry) => [entry.digest, entry]));
  for (const reference of executionReferences) {
    const item = verified.get(reference.digest);
    if (!item || item.bytes !== reference.bytes) throw new Error("evaluator result contains an unverified or transplanted execution-event reference");
  }
  const verification = result.verification_correctness;
  if (verification && Array.isArray(verification.evidence_references)) {
    const typedState = result.requirement_results?.find(({ requirement_id }) => requirement_id === "verification-evidence")?.verification_evidence_state;
    const state = typedState ?? (verification.state === "pass" ? "executed_success" : null);
    const hasCommandAuthority = normalized.command_evidence.required_command_ids.length > 0 || (normalized.command_evidence.required_alternative_groups ?? []).length > 0;
    if (state && (typedState || hasCommandAuthority)) {
      const expected = deriveEffectiveVerificationEvidenceReferences({ normalizedResult: normalized, evaluatorResult: result, state: deriveEffectiveVerificationEvidenceState({ normalizedResult: normalized, evaluatorResult: result }) });
      const key = (reference) => `${reference.kind}:${reference.digest}:${reference.kind === "normalized_result" ? "normalized" : reference.bytes}`;
      const actualKeys = verification.evidence_references.map(key).sort();
      const expectedKeys = expected.map(key).sort();
      if (actualKeys.length !== expectedKeys.length || actualKeys.some((value, index) => value !== expectedKeys[index])) throw new Error("verification correctness references must match the deterministically derived causal reference set");
    }
  }
  const requiredGroups = normalized.command_evidence.required_alternative_groups ?? [];
  if ((normalized.command_evidence.required_command_ids.length > 0 || requiredGroups.length > 0) && result.verification_correctness.state === "pass") {
    if (executionReferences.length === 0) throw new Error("verification correctness cannot pass without verified execution-event evidence");
    const successes = new Set(normalized.command_evidence.succeeded_command_ids);
    if (normalized.command_evidence.required_command_ids.some((id) => !successes.has(id))) throw new Error("verification correctness cannot pass while required command evidence is absent or unsuccessful");
    if (requiredGroups.some(({ satisfaction_state: state }) => state !== "satisfied")) throw new Error("verification correctness cannot pass while a required alternative command group is unsatisfied");
    const latest = new Map();
    for (const item of normalized.command_evidence.references) if (item.command_id !== null) latest.set(item.command_id, item);
    for (const commandId of normalized.command_evidence.required_command_ids) {
      const item = latest.get(commandId);
      if (!item || item.outcome !== "succeeded" || item.exit_code !== 0 || !executionReferences.some((reference) => reference.digest === item.digest && reference.bytes === item.bytes)) throw new Error("verification correctness must cite the latest successful execution event for every required command");
    }
  }
  return structuredClone(executionReferences);
}

function readNormalizedRecord({ verified, result }) {
  const normalizedReference = verified.manifest.cases
    .flatMap((entry) => entry.normalized_attempts)
    .find((entry) => entry.normalized_result_id === result.normalized_result_id);
  if (!normalizedReference) throw new Error("evaluator result references a normalized result absent from the verified generation");
  const path = resolve(verified.generationPath, normalizedReference.path);
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (record.normalized_result_digest !== result.normalized_result_digest) throw new Error("evaluator result normalized result digest is inconsistent");
  return record;
}

function evidenceReferencesIn(value) {
  const references = [];
  const visit = (entry) => {
    if (Array.isArray(entry)) for (const child of entry) visit(child);
    else if (entry && typeof entry === "object") {
      if (typeof entry.kind === "string" && typeof entry.digest === "string" && Object.hasOwn(entry, "bytes")) references.push(entry);
      else for (const child of Object.values(entry)) visit(child);
    }
  };
  visit(value);
  return references;
}

function validatePrivateEvaluationEvidenceArtifacts({ root, privateEvaluationRoot, record, normalized, result }) {
  const canonicalEvaluationRoot = assertRealDirectory(privateEvaluationRoot, "private evaluation authority root");
  const artifacts = new Map();
  let repositoryDiffArtifact = null;
  for (const entry of record.evidence_artifacts) {
    const artifactPath = resolveAuthorityArtifactPath(canonicalEvaluationRoot, entry.path, `private evaluation ${entry.kind} artifact`);
    const artifactRead = readJsonArtifact(artifactPath, `private evaluation ${entry.kind} artifact`);
    if (artifactRead.bytes.length !== entry.bytes || artifactRead.rawByteDigest !== entry.digest) throw new Error(`private evaluation ${entry.kind} artifact byte binding is invalid`);
    if (artifactRead.evidence.finalPath.ino !== entry.inode) throw new Error(`private evaluation ${entry.kind} artifact inode binding is invalid`);
    const artifact = artifactRead.value;
    if (artifact.artifact_digest !== entry.digest || artifact.artifact_bytes !== entry.bytes) throw new Error(`private evaluation ${entry.kind} artifact digest or byte closure is invalid`);
    const artifactClosure = structuredClone(artifact);
    delete artifactClosure.artifact_digest;
    delete artifactClosure.artifact_bytes;
    if (canonicalDigest(artifactClosure) !== entry.digest) throw new Error(`private evaluation ${entry.kind} artifact semantic digest is invalid`);
    if (entry.run_instance_id !== normalized.lineage.run_instance_id || entry.case_id !== normalized.lineage.case_id || entry.attempt !== normalized.lineage.attempt || entry.normalized_result_id !== normalized.normalized_result_id || entry.normalized_result_digest !== normalized.normalized_result_digest || entry.evaluator_bundle_id !== result.evaluator_bundle_id || entry.evaluator_bundle_digest !== result.evaluator_bundle_digest) {
      throw new Error(`private evaluation ${entry.kind} artifact lineage is inconsistent`);
    }
    if (entry.kind === "repository_diff") {
      assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, REPOSITORY_DIFF_ARTIFACT_SCHEMA_PATH), label: "repository diff artifact" });
      if (artifact.run_instance_id !== normalized.lineage.run_instance_id || artifact.case_id !== normalized.lineage.case_id || artifact.attempt !== normalized.lineage.attempt) throw new Error("repository diff artifact lineage is inconsistent");
      if (entry.digest !== record.repository_diff_artifact_digest || entry.bytes !== record.repository_diff_artifact_bytes) throw new Error("repository diff artifact is not bound to the private evaluation record");
      repositoryDiffArtifact = artifact;
    } else {
      if (artifact.schema_path === EVALUATION_INPUT_FAILURE_ARTIFACT_SCHEMA_PATH) {
        assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, EVALUATION_INPUT_FAILURE_ARTIFACT_SCHEMA_PATH), label: "evaluation-input failure artifact" });
        if (result.invalid_input_authority && (artifact.layer !== result.invalid_input_authority.layer || artifact.category !== result.invalid_input_authority.category)) throw new Error("evaluation-input failure artifact authority does not match the evaluator result");
      } else if (artifact.schema_path === EVALUATOR_CHECK_ARTIFACT_SCHEMA_PATH) {
        assertBenchmarkSchemaInstance(artifact, { schemaPath: resolve(root, EVALUATOR_CHECK_ARTIFACT_SCHEMA_PATH), label: "evaluator check artifact" });
      } else throw new Error("private test-result artifact schema is not authorized");
    }
    artifacts.set(`${entry.kind}:${entry.digest}:${entry.bytes}`, entry);
  }
  const references = evidenceReferencesIn(result);
  for (const reference of references) {
    if (reference.kind === "repository_diff" || reference.kind === "test_result") {
      const key = `${reference.kind}:${reference.digest}:${reference.bytes}`;
      if (!artifacts.has(key)) throw new Error(`${reference.kind} evidence reference is not bound to a sealed private artifact`);
    }
  }
  return { canonicalEvaluationRoot, artifacts, repositoryDiffArtifact };
}

function verifyPrivateEvaluationRecord({ root, privateEvaluationRoot, privateEvaluationRecordPath, privateFragmentPath, bundle, normalized, result, scoringInputs }) {
  if (!privateEvaluationRoot || !privateEvaluationRecordPath || !privateFragmentPath) throw new Error("private evaluation record, root, and fragment paths are required for durable evaluator verification");
  const canonicalEvaluationRoot = assertRealDirectory(privateEvaluationRoot, "private evaluation authority root");
  if (pathsOverlap(canonicalEvaluationRoot, bundle.canonicalPrivateRoot)) throw new Error("private evaluation authority root must not overlap the static evaluator bundle");
  const recordInfo = authorityRelativePathForSupplied(canonicalEvaluationRoot, privateEvaluationRecordPath, "private evaluation record");
  const fragmentInfo = authorityRelativePathForSupplied(canonicalEvaluationRoot, privateFragmentPath, "private evaluator fragment");
  const recordRead = readJsonArtifact(recordInfo.authoritativePath, "private evaluation record");
  const record = recordRead.value;
  assertBenchmarkSchemaInstance(record, { schemaPath: resolve(root, PRIVATE_EVALUATION_RECORD_SCHEMA_PATH), label: "private evaluation record" });
  if (record.evaluation_record_digest !== computePrivateEvaluationRecordDigest(record)) throw new Error("private evaluation record digest closure is invalid");
  if (record.evaluator_bundle_id !== bundle.manifest.evaluator_bundle_id || record.evaluator_bundle_digest !== bundle.manifest.evaluator_bundle_digest || record.evaluator_revision !== bundle.manifest.evaluator_revision) throw new Error("private evaluation record bundle identity is inconsistent");
  if (stableCanonicalJson(record.evaluator_source_identity) !== stableCanonicalJson(bundle.manifest.evaluator_source_identity)) throw new Error("private evaluation record source identity is inconsistent");
  if (record.normalized_result_id !== normalized.normalized_result_id || record.normalized_result_digest !== normalized.normalized_result_digest || record.run_instance_id !== normalized.lineage.run_instance_id || record.case_id !== normalized.lineage.case_id || record.attempt !== normalized.lineage.attempt) throw new Error("private evaluation record normalized lineage is inconsistent");
  if (record.private_fragment_path !== fragmentInfo.relativePath) throw new Error("private evaluation record fragment path is inconsistent");
  const fragmentRead = readJsonArtifact(fragmentInfo.authoritativePath, "private evaluator fragment");
  if (fragmentRead.bytes.length !== record.private_fragment_bytes || fragmentRead.rawByteDigest !== record.private_fragment_sha256) throw new Error("private evaluator fragment digest or byte closure is invalid");
  if (fragmentRead.evidence.finalPath.ino !== record.private_fragment_inode) throw new Error("private evaluator fragment inode binding is invalid");
  const fragment = fragmentRead.value;
  const fragmentSchemaDigest = rawByteDigest(readFileSync(resolve(root, PRIVATE_EVALUATOR_FRAGMENT_SCHEMA_PATH)));
  if (record.fragment_schema_digest !== fragmentSchemaDigest) throw new Error("private evaluator fragment schema digest is inconsistent");
  const adapterSourceDigest = rawByteDigest(readFileSync(resolve(root, "scripts/ask-benchmark-evaluator-boundary.mjs")));
  if (record.adapter_source_digest !== adapterSourceDigest) throw new Error("private evaluator adapter source digest is inconsistent");
  const evidence = validatePrivateEvaluationEvidenceArtifacts({ root, privateEvaluationRoot: canonicalEvaluationRoot, record, normalized, result });
  const validatedFragment = validatePrivateEvaluatorFragment({ root, fragment, scoringPolicy: scoringInputs.scoringPolicy, requirementRecord: scoringInputs.requirementRecord, normalizedResult: normalized });
  const expected = adaptPrivateEvaluatorFragmentToEnvelope({
    root,
    fragment: validatedFragment,
    authority: {
      ...scoringInputs,
      evaluatorReference: bundle.reference,
      normalizedResult: normalized,
      sourceSnapshotDigest: result.source_snapshot_digest,
      bundleManifest: bundle.manifest,
      privateFragmentDigest: record.private_fragment_sha256,
      privateFragmentBytes: record.private_fragment_bytes,
      privateEvaluationRecordDigest: record.evaluation_record_digest,
      fragmentBinding: {
        normalized_result_id: normalized.normalized_result_id,
        normalized_result_digest: normalized.normalized_result_digest,
        run_instance_id: normalized.lineage.run_instance_id,
        case_id: normalized.lineage.case_id,
        attempt: normalized.lineage.attempt,
      },
    },
  });
  if (stableCanonicalJson(expected) !== stableCanonicalJson(result)) throw new Error("public evaluator envelope is not the authority-owned adapter output for the sealed fragment");
  if (record.adapter_result_envelope_digest !== computeAdapterResultEnvelopeDigest(result)) throw new Error("private evaluation record adapter envelope digest is inconsistent");
  if (result.private_fragment_digest !== record.private_fragment_sha256 || result.private_fragment_bytes !== record.private_fragment_bytes || result.private_evaluation_record_digest !== record.evaluation_record_digest) throw new Error("public evaluator envelope private authority bindings are inconsistent");
  if (!evidence.repositoryDiffArtifact || record.frozen_workspace_inventory_digest !== evidence.repositoryDiffArtifact.frozen_workspace_tree_digest || record.candidate_workspace_inventory_digest !== evidence.repositoryDiffArtifact.candidate_workspace_tree_digest) throw new Error("private evaluation record workspace authority is incomplete");
  return { record, fragment, canonicalEvaluationRoot };
}

function readScoringInputSources({
  root,
  catalogPath,
  policyManifestPath,
  scoringPolicyPath,
  admissionRecordPath,
  requirementRecordPath,
  outputContractPath,
  referencePath,
  freezeManifestPath,
  freezeManifestSourceDigest,
}) {
  for (const [path, label] of [
    [catalogPath, "portfolio catalog"],
    [policyManifestPath, "portfolio policy manifest"],
    [scoringPolicyPath, "portfolio scoring policy"],
    [admissionRecordPath, "authoritative final admission record"],
    [requirementRecordPath, "authoritative requirement record"],
    [outputContractPath, "authoritative output contract"],
    [referencePath, "authoritative evaluator public reference"],
    [freezeManifestPath, "scoring input freeze manifest"],
  ]) {
    if (!path) throw new Error(`${label} path is required for scoring input closure`);
  }
  const freeze = readAnchoredFreezeManifest({ root, freezeManifestPath, freezeManifestSourceDigest });
  const { authorityRoot, manifest: freezeManifest } = freeze;
  const catalogSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.catalog, suppliedPath: catalogPath, schemaPath: CATALOG_SCHEMA_PATH, label: "portfolio catalog" });
  const policyManifestSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.policy_manifest, suppliedPath: policyManifestPath, schemaPath: POLICY_MANIFEST_SCHEMA_PATH, label: "portfolio policy manifest" });
  const scoringPolicySource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.scoring_policy, suppliedPath: scoringPolicyPath, schemaPath: SCORING_POLICY_SCHEMA_PATH, label: "portfolio scoring policy" });
  const admissionRecordSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.admission_record, suppliedPath: admissionRecordPath, schemaPath: FINAL_ADMISSION_RECORD_SCHEMA_PATH, label: "authoritative final admission record", publicArtifact: true });
  const requirementRecordSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.requirement_record, suppliedPath: requirementRecordPath, schemaPath: REQUIREMENT_RECORD_SCHEMA_PATH, label: "authoritative requirement record", publicArtifact: true });
  const outputContractSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.output_contract, suppliedPath: outputContractPath, schemaPath: OUTPUT_CONTRACT_SCHEMA_PATH, label: "authoritative output contract", publicArtifact: true });
  const evaluatorReferenceSource = readFrozenJsonArtifact({ authorityRoot, root, reference: freezeManifest.evaluator_public_reference, suppliedPath: referencePath, schemaPath: EVALUATOR_REFERENCE_SCHEMA_PATH, label: "authoritative evaluator public reference", publicArtifact: true });
  const catalog = catalogSource.value;
  const policyManifest = policyManifestSource.value;
  const scoringPolicy = scoringPolicySource.value;
  const admissionRecord = admissionRecordSource.value;
  const requirementRecord = requirementRecordSource.value;
  const outputContract = outputContractSource.value;
  const evaluatorReference = evaluatorReferenceSource.value;
  const requirementRecordSchema = readJsonArtifact(resolve(root, REQUIREMENT_RECORD_SCHEMA_PATH), "requirement record Schema").value;
  const evaluatorResultSchema = readJsonArtifact(resolve(root, EVALUATOR_RESULT_SCHEMA_PATH), "evaluator result Schema").value;
  const admissionPolicy = readJsonArtifact(resolve(root, ADMISSION_POLICY_PATH), "portfolio admission policy").value;
  assertBenchmarkSchemaInstance(admissionPolicy, { schemaPath: resolve(root, ADMISSION_POLICY_SCHEMA_PATH), label: "portfolio admission policy" });

  validatePortfolioPolicyArtifacts({ root, catalogPath, policyManifestPath, scoringPolicyPath });
  if (catalog.catalog_digest !== computePortfolioCatalogDigest(catalog)) throw new Error("portfolio catalog digest closure is invalid");
  if (freezeManifest.catalog.semantic_digest !== catalog.catalog_digest) throw new Error("portfolio catalog semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.policy_manifest.semantic_digest !== computePolicyManifestDigest(policyManifest)) throw new Error("portfolio policy manifest semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.scoring_policy.semantic_digest !== computeScoringPolicyDigest(scoringPolicy)) throw new Error("portfolio scoring policy semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.admission_record.semantic_digest !== computeFinalAdmissionRecordDigest(admissionRecord)) throw new Error("final admission record semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.requirement_record.record_digest !== computeRequirementRecordDigest(requirementRecord) || freezeManifest.requirement_record.set_digest !== computeRequirementSetDigest(requirementRecord)) throw new Error("requirement record digest closure does not match the scoring input freeze manifest");
  if (freezeManifest.output_contract.semantic_digest !== computeOutputContractDigest(outputContract)) throw new Error("output contract semantic digest does not match the scoring input freeze manifest");
  if (freezeManifest.evaluator_public_reference.semantic_digest !== computeEvaluatorReferenceDigest(evaluatorReference)) throw new Error("evaluator public reference semantic digest does not match the scoring input freeze manifest");
  validateScoringContractSchemaParity({ scoringPolicy, requirementRecordSchema, evaluatorResultSchema });
  validateFinalAdmissionRecordContract({
    admissionPolicy,
    admissionRecord,
    finalAdmissionRecordSchema: readJsonArtifact(resolve(root, FINAL_ADMISSION_RECORD_SCHEMA_PATH), "final admission record Schema").value,
  });
  validateRequirementRecordContract({ scoringPolicy, requirementRecord, requirementRecordSchema, evaluatorResultSchema });
  if (policyManifest.scoring_policy?.path !== freezeManifest.scoring_policy.path) throw new Error("policy manifest scoring policy path does not match the freeze manifest authority path");
  if (requirementRecord.requirement_record_path !== freezeManifest.requirement_record.path) throw new Error("requirement record internal path does not match the freeze manifest authority path");
  if (outputContract.output_contract_path !== freezeManifest.output_contract.path) throw new Error("output contract internal path does not match the freeze manifest authority path");
  if (outputContract.evaluator_public_reference_path !== freezeManifest.evaluator_public_reference.path) throw new Error("output contract evaluator reference path does not match the freeze manifest authority path");
  const fixture = catalog.fixtures.find(({ fixture_id }) => fixture_id === freezeManifest.fixture_id);
  if (!fixture) throw new Error("scoring input freeze fixture is absent from the authoritative catalog");
  if ([admissionRecord.fixture_id, requirementRecord.fixture_id, outputContract.fixture_id, evaluatorReference.fixture_id].some((fixtureId) => fixtureId !== freezeManifest.fixture_id)) throw new Error("scoring input freeze fixture identity does not close across authoritative artifacts");
  if (admissionRecord.input_manifest_digest !== freezeManifest.fixture_input_digest || evaluatorReference.fixture_input_digest !== freezeManifest.fixture_input_digest) throw new Error("scoring input freeze fixture input digest does not close across authoritative artifacts");
  if (admissionRecord.catalog_digest !== catalog.catalog_digest) throw new Error("final admission record catalog digest does not match the freeze authority catalog");
  if (admissionRecord.evaluator_bundle_id !== evaluatorReference.evaluator_bundle_id || admissionRecord.evaluator_bundle_digest !== evaluatorReference.evaluator_bundle_digest) throw new Error("final admission record evaluator identity does not match the authoritative public reference");
  if (admissionRecord.evaluator_source_identity || evaluatorReference.evaluator_source_identity) {
    if (stableCanonicalJson(admissionRecord.evaluator_source_identity) !== stableCanonicalJson(evaluatorReference.evaluator_source_identity)) throw new Error("final admission evaluator source identity does not match the authoritative public reference");
  }
  if (admissionRecord.evaluator_requirement_count !== requirementRecord.requirements.length) throw new Error("final admission record requirement count does not match the authoritative requirement record");
  const expectedEvidenceMapIds = requirementRecord.requirements.flatMap(({ evidence_map_ids }) => evidence_map_ids).sort();
  const expectedMutationSetIds = requirementRecord.requirements.flatMap(({ mutation_ids }) => mutation_ids).sort();
  if (stableCanonicalJson([...admissionRecord.evidence_map_ids].sort()) !== stableCanonicalJson(expectedEvidenceMapIds)) throw new Error("final admission evidence-map inventory does not match the authoritative requirement record");
  if (stableCanonicalJson([...admissionRecord.mutation_set_ids].sort()) !== stableCanonicalJson(expectedMutationSetIds)) throw new Error("final admission mutation-set inventory does not match the authoritative requirement record");
  if (requirementRecord.admission_record_digest !== admissionRecord.admission_digest) throw new Error("requirement record admission digest was not re-derived from the authoritative final admission record");
  return { freezeManifest, freezeManifestSourceDigest: freeze.sourceDigest, catalog, policyManifest, scoringPolicy, admissionRecord, requirementRecord, outputContract, evaluatorReference };
}

function assertBoundaryRootLineage(bundle, verified) {
  const source = verified.manifest.source;
  const materializedPath = bundle.markerPaths.materializedPath;
  const selectionStatePath = bundle.markerPaths.selectionState;
  const runIdentityPath = bundle.markerPaths.runDir;
  readJsonArtifact(materializedPath, "materialized root manifest");
  readJsonArtifact(selectionStatePath, "selection-state root index");
  const materializedEvidence = streamingFileDigest(materializedPath, "materialized root manifest");
  const selectionEvidence = streamingFileDigest(selectionStatePath, "selection-state root index");
  if (materializedEvidence.digest !== source.materialization_manifest_digest) {
    throw new Error("materialized root manifest does not match normalized result lineage");
  }
  if (selectionEvidence.digest !== source.selection_state_digest) {
    throw new Error("selection-state root index does not match normalized result lineage");
  }
  const { value: runIdentity } = readJsonArtifact(runIdentityPath, "execution run identity");
  if (canonicalDigest(runIdentity) !== source.run_identity_digest || runIdentity.run_instance_id !== source.run_instance_id) {
    throw new Error("execution run root identity does not match normalized result lineage");
  }
  if (!isInside(bundle.canonicalRoots.normalizedResultsPath, verified.generationPath)) {
    throw new Error("normalized generation escapes the normalized-results root");
  }
}

export function verifyEvaluatorResult({
  root,
  catalogPath,
  policyManifestPath,
  scoringPolicyPath,
  admissionRecordPath,
  requirementRecordPath,
  outputContractPath,
  scoringInputFreezeManifestPath,
  scoringInputFreezeManifestSourceDigest = null,
  referencePath,
  privateRoot,
  manifestPath,
  resultPath,
  privateEvaluationRoot = null,
  privateEvaluationRecordPath = null,
  privateFragmentPath = null,
  materializedPath,
  selectionState,
  runDir,
  normalizedResultsPath,
  publicArtifactRoot = null,
}) {
  const bundle = verifyPrivateEvaluatorBundle({ root, referencePath, privateRoot, manifestPath, materializedPath, selectionState, runDir, normalizedResultsPath, publicArtifactRoot });
  if (!resultPath || pathsOverlap(resultPath, privateRoot)) throw new Error("public evaluator result must not overlap the private evaluator root");
  const { value: result } = readJsonArtifact(resultPath, "evaluator result envelope", { publicArtifact: true });
  assertBenchmarkSchemaInstance(result, { schemaPath: resolve(root, EVALUATOR_RESULT_SCHEMA_PATH), label: "evaluator result envelope" });
  assertPublicArtifactTree(result, "evaluator result envelope");
  assertResultCollectionIdentity(result);
  const scoringInputs = readScoringInputSources({
    root,
    catalogPath,
    policyManifestPath,
    scoringPolicyPath,
    admissionRecordPath,
    requirementRecordPath,
    outputContractPath,
    referencePath,
    freezeManifestPath: scoringInputFreezeManifestPath,
    freezeManifestSourceDigest: scoringInputFreezeManifestSourceDigest,
  });
  if (stableCanonicalJson(scoringInputs.evaluatorReference) !== stableCanonicalJson(bundle.reference)) throw new Error("private bundle evaluator reference does not match the scoring input freeze authority reference");

  const verified = verifyNormalizedPortfolioResults({
    root,
    outputPath: normalizedResultsPath,
    sourceSnapshotDigest: result.source_snapshot_digest,
  });
  if (result.source_snapshot_digest !== verified.manifest.source_snapshot_digest) throw new Error("evaluator result source snapshot lineage is inconsistent");
  assertBoundaryRootLineage(bundle, verified);
  const normalized = readNormalizedRecord({ verified, result });
  validateExecutionEventEvidenceReferences({ normalized, result });
  const privateAuthorityPaths = [privateEvaluationRoot, privateEvaluationRecordPath, privateFragmentPath];
  const privateAuthorityCount = privateAuthorityPaths.filter(Boolean).length;
  const requiresPrivateAuthority = result.result_profile?.name === BINARY_SCOPE_VERIFICATION_PROFILE_NAME;
  if (requiresPrivateAuthority && privateAuthorityCount !== privateAuthorityPaths.length) {
    throw new Error("binary scope verification requires --private-evaluation-root, --private-evaluation-record, and --private-fragment together");
  }
  if (!requiresPrivateAuthority && privateAuthorityCount !== 0 && privateAuthorityCount !== privateAuthorityPaths.length) {
    throw new Error("private evaluation root, record, and fragment paths must be supplied together");
  }
  if (requiresPrivateAuthority) {
    verifyPrivateEvaluationRecord({ root, privateEvaluationRoot, privateEvaluationRecordPath, privateFragmentPath, bundle, normalized, result, scoringInputs });
  }
  const lineage = normalized.lineage;
  const expectedLineage = {
    normalized_result_id: normalized.normalized_result_id,
    normalized_result_digest: normalized.normalized_result_digest,
    run_instance_id: lineage.run_instance_id,
    plan_id: lineage.plan_id,
    plan_digest: lineage.plan_digest,
    fixture_id: lineage.fixture_id,
    fixture_input_digest: lineage.fixture_input_digest,
    case_id: lineage.case_id,
    attempt: lineage.attempt,
    adapter: lineage.adapter_track,
    condition: lineage.condition,
    repetition: lineage.repetition,
    evaluator_bundle_id: bundle.manifest.evaluator_bundle_id,
    evaluator_bundle_digest: bundle.manifest.evaluator_bundle_digest,
    evaluator_revision: bundle.manifest.evaluator_revision,
  };
  for (const [field, value] of Object.entries(expectedLineage)) {
    if (result[field] !== value) throw new Error(`evaluator result lineage mismatch at ${field}`);
  }
  if (bundle.reference.fixture_id !== lineage.fixture_id || bundle.reference.fixture_input_digest !== lineage.fixture_input_digest || bundle.reference.task_class !== lineage.task_class || bundle.reference.suite !== lineage.suite) {
    throw new Error("evaluator reference is transplanted across normalized fixture or input identity");
  }
  const scoring = validateScoringInputBindings({
    ...scoringInputs,
    normalizedResult: normalized,
    evaluatorResult: result,
  });
  return { bundle, normalized, result, verified, scoringInputs, scoringReady: scoring.scoringReady };
}

export function assertNoPrivateBundlePublication(publicArtifactRoot, bundle) {
  const canonicalPublicRoot = assertRealDirectory(publicArtifactRoot, "public artifact root");
  if (isInside(canonicalPublicRoot, bundle.canonicalPrivateRoot) || isInside(bundle.canonicalPrivateRoot, canonicalPublicRoot)) {
    throw new Error("public artifact root must not overlap the private evaluator root");
  }
  assertNoPrivateMaterial(directoryFileInventory(canonicalPublicRoot, "public artifact root"), "public artifact root", bundle.privateMaterialDigests);
}

export function verifyEvaluatorBoundary(options) {
  if (!options.publicArtifactRoot) throw new Error("full evaluator boundary verification requires a public artifact root");
  return verifyEvaluatorResult(options);
}
