import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, parse, posix, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { buildPortfolioPlan } from "./ask-benchmark-plan.mjs";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { buildClaudeProjectionPlan } from "./install-claude-adapter.mjs";

export const MATERIALIZER_VERSION = "1.0.0";
export const MATERIALIZATION_SCHEMA_PATH = "benchmarks/schemas/materialization-manifest.schema.json";
export const MATERIALIZATION_MANIFEST_NAME = "materialization-manifest.json";

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const PROHIBITED_SEGMENTS = new Set(["evaluator", "evaluators", "hidden-test", "hidden-tests", "hidden_test", "hidden_tests", "oracle", "oracles", "rubric", "rubrics", "scoring", "condition-results", "condition_results"]);
const PROHIBITED_BASENAMES = new Set(["expected.json", "reference.patch", "reference.diff", "oracle.json", "oracle.md", "rubric.json", "rubric.md", "score.json", "scoring-output.json"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function canonicalDigest(value) {
  return `sha256:${sha256(stableCanonicalJson(value))}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertInside(root, target, label) {
  const resolved = resolve(target);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new Error(`${label} escapes its allowed root`);
  return resolved;
}

function assertPortableRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value) || value.includes("\\") || value.split("/").includes("..") || posix.normalize(value) !== value || value.startsWith("./")) {
    throw new Error(`${label} must be a normalized relative path without escape segments`);
  }
  return value;
}

function assertNoSymlinkSegments(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symlink: ${current}`);
  }
}

function fileInventory(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`materialized path is a symlink: ${path}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const bytes = readFileSync(absolute);
        files.push({ path, sha256: sha256(bytes), bytes: bytes.length, mode: `0${(statSync(absolute).mode & 0o777).toString(8).padStart(3, "0")}` });
      } else throw new Error(`materialized path is not a regular file or directory: ${path}`);
    }
  }
  walk(root);
  return files;
}

function normalizeProjectionModes(root) {
  chmodSync(root, 0o755);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = resolve(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`projection template must not contain a symlink: ${absolute}`);
    if (entry.isDirectory()) normalizeProjectionModes(absolute);
    else if (entry.isFile()) chmodSync(absolute, 0o644);
    else throw new Error(`projection template contains an unsupported filesystem entry: ${absolute}`);
  }
}

function digestInventory(inventory) {
  return canonicalDigest(inventory);
}

function validateAgentVisibleRecord(record, fixtureId) {
  const path = assertPortableRelativePath(record?.path, `${fixtureId} manifest path`);
  if (record.visibility && record.visibility !== "agent_visible") throw new Error(`${fixtureId}/${path} is explicitly non-agent-visible`);
  if (path !== "task.md" && !path.startsWith("workspace/")) throw new Error(`${fixtureId}/${path} is outside the agent-visible task/workspace allowlist`);
  const lowerSegments = path.toLowerCase().split("/");
  const lowerBase = lowerSegments.at(-1);
  if (lowerSegments.some((segment) => PROHIBITED_SEGMENTS.has(segment) || /(?:^|[._-])hidden[-_]?tests?(?:[._-]|$)/u.test(segment)) || PROHIBITED_BASENAMES.has(lowerBase)) {
    throw new Error(`${fixtureId}/${path} is prohibited evaluator material`);
  }
  if (!DIGEST_PATTERN.test(record.sha256 ?? "") || !Number.isInteger(record.bytes) || record.bytes < 0) throw new Error(`${fixtureId}/${path} has an invalid manifest digest or byte count`);
  return path;
}

function validateFixtureInputs({ root, config, plan }) {
  const validated = new Map();
  assertPortableRelativePath(config.fixture_root, "fixture_root");
  for (const fixture of config.fixtures) {
    assertPortableRelativePath(fixture.input_manifest_path, `${fixture.id} input manifest`);
    const manifestPath = assertInside(root, resolve(root, fixture.input_manifest_path), `${fixture.id} input manifest`);
    assertNoSymlinkSegments(manifestPath, `${fixture.id} input manifest`);
    const manifestBytes = readFileSync(manifestPath);
    const manifestDigest = sha256(manifestBytes);
    if (manifestDigest !== fixture.input_manifest_sha256) throw new Error(`${fixture.id} fixture manifest digest mismatch`);
    const manifest = JSON.parse(manifestBytes);
    if (manifest.scope !== "agent-visible task.md + workspace/**") throw new Error(`${fixture.id} fixture manifest must explicitly scope agent-visible task and workspace files`);
    const fixtureRecord = manifest.fixtures?.[fixture.id];
    if (!fixtureRecord || !Array.isArray(fixtureRecord.files)) throw new Error(`${fixture.id} is missing from its fixture manifest`);
    const seen = new Set();
    const records = fixtureRecord.files.map((record) => {
      const path = validateAgentVisibleRecord(record, fixture.id);
      if (seen.has(path)) throw new Error(`${fixture.id} fixture manifest contains duplicate path: ${path}`);
      seen.add(path);
      const fixtureRoot = assertInside(root, resolve(root, config.fixture_root, fixture.id), `${fixture.id} fixture root`);
      const source = assertInside(fixtureRoot, resolve(fixtureRoot, path), `${fixture.id}/${path}`);
      assertNoSymlinkSegments(source, `${fixture.id}/${path}`);
      if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error(`${fixture.id}/${path} is missing or not a regular file`);
      const bytes = readFileSync(source);
      if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`${fixture.id}/${path} fixture manifest mismatch`);
      return { ...record, path, source, mode: statSync(source).mode & 0o777 };
    });
    if (!seen.has("task.md") || !records.some((record) => record.path.startsWith("workspace/"))) throw new Error(`${fixture.id} fixture manifest must contain task.md and workspace files`);
    validated.set(fixture.id, { records, manifestDigest });
  }
  for (const entry of plan.cases) {
    const fixture = config.fixtures.find((candidate) => candidate.id === entry.fixture_id);
    if (!fixture || entry.input_manifest_path !== fixture.input_manifest_path || entry.input_manifest_sha256 !== fixture.input_manifest_sha256 || validated.get(entry.fixture_id)?.manifestDigest !== entry.input_manifest_sha256) {
      throw new Error(`${entry.case_id} fixture-manifest identity mismatch`);
    }
  }
  return validated;
}

export function assertExactPlanIdentity({ root, config, plan, repositoryRevision }) {
  const schemaPath = assertInside(root, resolve(root, config.execution_plan.schema_path), "execution plan schema");
  assertNoSymlinkSegments(config._configPath, "portfolio config");
  assertNoSymlinkSegments(config._protocolPath, "portfolio protocol");
  assertNoSymlinkSegments(schemaPath, "execution plan schema");
  assertBenchmarkSchemaInstance(plan, { schemaPath, label: "execution plan" });
  const configDigest = sha256(readFileSync(config._configPath));
  const protocolDigest = sha256(readFileSync(config._protocolPath));
  if (plan.config_sha256 !== configDigest) throw new Error("execution plan config digest mismatch");
  if (plan.protocol_sha256 !== protocolDigest) throw new Error("execution plan protocol digest mismatch");
  if (plan.repository_revision !== repositoryRevision) throw new Error("execution plan repository revision mismatch");
  const seedDigest = sha256(plan.randomization_seed.value);
  if (plan.randomization_seed.sha256 !== seedDigest || plan.randomization_seed.seed_id !== `seed-${seedDigest.slice(0, 16)}`) throw new Error("execution plan seed digest mismatch");
  const expected = buildPortfolioPlan({ root, config, repositoryRevision, seed: plan.randomization_seed.value });
  for (const field of Object.keys(expected).filter((field) => field !== "cases")) {
    if (stableCanonicalJson(plan[field]) !== stableCanonicalJson(expected[field])) throw new Error(`execution plan identity mismatch: ${field}`);
  }
  if (plan.cases.length !== expected.cases.length) throw new Error("execution plan case count mismatch");
  for (let index = 0; index < expected.cases.length; index += 1) {
    for (const field of Object.keys(expected.cases[index])) {
      if (stableCanonicalJson(plan.cases[index][field]) !== stableCanonicalJson(expected.cases[index][field])) throw new Error(`execution plan case identity mismatch: cases[${index}].${field}`);
    }
  }
  return expected;
}

function validateOutputBoundary(outputPath) {
  const parent = dirname(outputPath);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw new Error(`output parent must be an existing directory: ${parent}`);
  assertNoSymlinkSegments(parent, "output path");
  if (!existsSync(outputPath)) return { existed: false };
  const outputStat = lstatSync(outputPath);
  if (outputStat.isSymbolicLink()) throw new Error(`output path must not be a symlink: ${outputPath}`);
  if (!outputStat.isDirectory()) throw new Error(`output must be an absent or empty directory, not a regular file: ${outputPath}`);
  if (readdirSync(outputPath).length > 0) throw new Error(`output must be an absent or empty directory: ${outputPath}`);
  return { existed: true };
}

export function assertTrackedRepositoryMatchesHead(root) {
  for (const args of [
    ["diff", "--quiet", "HEAD", "--"],
    ["diff", "--cached", "--quiet", "HEAD", "--"],
  ]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status === 1) throw new Error("tracked working tree and index must match HEAD before materialization");
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed before materialization: ${result.stderr || result.stdout}`);
  }
}

function runInstaller(root, args, label) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
}

function copyCanonicalKernel(root, target) {
  mkdirSync(target, { recursive: true });
  const source = resolve(root, "AGENTS.md");
  const destination = resolve(target, "AGENTS.md");
  copyFileSync(source, destination);
  chmodSync(destination, statSync(source).mode & 0o777);
}

function adaptiveBoundary(adapter) {
  return {
    schema_version: "1.0.0",
    adapter,
    projection_status: "boundary_available",
    mechanism_selection_status: "not_selected",
    selection_seal_status: "not_produced",
    runtime_execution_status: "not_attempted",
  };
}

function canonicalSourcesFromProjectionPlan(plan) {
  return Object.values(plan.renderer_inputs).flat().map((entry) => ({ path: entry.path, sha256: entry.digest })).sort((left, right) => left.path.localeCompare(right.path));
}

function buildProjectionEvidence({ root, adapter, condition, inventory, projectionPlan = null }) {
  const adaptive = condition === "adaptive_ask";
  const profiles = { plain: "plain", kernel_only: "kernel", adaptive_ask: "adaptive-boundary", full_ask: "full" };
  const canonicalSources = projectionPlan
    ? canonicalSourcesFromProjectionPlan(projectionPlan)
    : condition === "plain" ? [] : [{ path: "AGENTS.md", sha256: `sha256:${sha256(readFileSync(resolve(root, "AGENTS.md")))}` }];
  return {
    adapter_id: adapter,
    selected_profile: profiles[condition],
    renderer_id: projectionPlan?.renderer_id ?? "ask-benchmark-materializer",
    renderer_version: projectionPlan?.renderer_version ?? MATERIALIZER_VERSION,
    projection_fingerprint: projectionPlan?.fingerprint ?? canonicalDigest({ adapter, condition, inventory }),
    canonical_source_digests: canonicalSources,
    evidence_level: condition === "plain" ? "fixture_only" : adaptive ? "projection_boundary" : "repository_projection",
    capability_status: adaptive ? "boundary_only" : "available",
    capability_downgrade: "runtime_execution_not_attempted",
    unavailable_reason: null,
    adaptive_projection: {
      boundary_status: adaptive ? "available_pre_selection" : "not_applicable",
      mechanisms_selected: false,
      selection_seal_produced: false,
      runtime_execution_attempted: false,
    },
  };
}

export function validateMaterializationProjectionInventory({ adapter, condition, inventory, fullProjectionDigest = null }) {
  const paths = inventory.map((entry) => entry.path);
  const oppositePrefix = adapter === "codex" ? ".claude/" : ".agents/";
  if (paths.some((path) => path === oppositePrefix.slice(0, -1) || path.startsWith(oppositePrefix))) throw new Error(`${adapter} projection contains assets owned by the other adapter`);
  if (condition === "plain" && paths.length > 0) throw new Error("Plain projection must not contain ASK assets");
  if (condition === "kernel_only" && stableCanonicalJson(paths) !== stableCanonicalJson(["AGENTS.md"])) throw new Error("Kernel-only projection must contain only canonical AGENTS.md");
  if (condition === "adaptive_ask") {
    const boundaryPath = adapter === "codex" ? ".agents/adaptive/projection-boundary.json" : ".claude/adaptive/projection-boundary.json";
    if (!paths.includes("AGENTS.md") || !paths.includes(boundaryPath)) throw new Error("Adaptive projection boundary is incomplete");
    if (paths.some((path) => path.startsWith("skills/") || path.includes("/skills/") || path.includes("/prompts/") || path.includes("/commands/") || path.startsWith(".agent-spectrum-kernel/") || path === "CUSTOM_INSTRUCTIONS.md")) throw new Error("Adaptive projection must not contain Full ASK assets before selection");
    if (fullProjectionDigest && digestInventory(inventory) === fullProjectionDigest) throw new Error("Adaptive projection must not be identical to Full ASK");
  }
  if (condition === "full_ask") {
    const adapterPrefix = adapter === "codex" ? ".agents/" : ".claude/";
    if (!paths.includes("AGENTS.md") || !paths.some((path) => path.startsWith(adapterPrefix))) throw new Error(`Full ASK ${adapter} projection is missing its adapter-owned assets`);
  }
}

function buildProjectionTemplates({ root, templateRoot }) {
  const templates = new Map();
  for (const adapter of ["codex", "claude"]) {
    const plain = resolve(templateRoot, adapter, "plain");
    mkdirSync(plain, { recursive: true });
    normalizeProjectionModes(plain);
    templates.set(`${adapter}:plain`, { root: plain, inventory: [], projectionPlan: null });

    const kernel = resolve(templateRoot, adapter, "kernel_only");
    copyCanonicalKernel(root, kernel);
    normalizeProjectionModes(kernel);
    templates.set(`${adapter}:kernel_only`, { root: kernel, inventory: fileInventory(kernel), projectionPlan: null });

    const adaptive = resolve(templateRoot, adapter, "adaptive_ask");
    copyCanonicalKernel(root, adaptive);
    const boundaryPath = resolve(adaptive, adapter === "codex" ? ".agents/adaptive/projection-boundary.json" : ".claude/adaptive/projection-boundary.json");
    mkdirSync(dirname(boundaryPath), { recursive: true });
    writeJson(boundaryPath, adaptiveBoundary(adapter));
    normalizeProjectionModes(adaptive);
    templates.set(`${adapter}:adaptive_ask`, { root: adaptive, inventory: fileInventory(adaptive), projectionPlan: null });

    const full = resolve(templateRoot, adapter, "full_ask");
    mkdirSync(full, { recursive: true });
    runInstaller(root, [resolve(root, "scripts/install-kernel.mjs"), "--target", full, "--merge-agents"], "Kernel projection");
    if (adapter === "codex") runInstaller(root, [resolve(root, "scripts/install-codex-adapter.mjs"), "--target", full, "--profile", "full"], "Full ASK Codex projection");
    else runInstaller(root, [resolve(root, "scripts/install-claude-adapter.mjs"), "--target", full, "--profile", "full"], "Full ASK Claude projection");
    normalizeProjectionModes(full);
    const projectionPlan = adapter === "codex" ? buildCodexProjectionPlan({ profileName: "full" }) : buildClaudeProjectionPlan({ profileName: "full" });
    templates.set(`${adapter}:full_ask`, { root: full, inventory: fileInventory(full), projectionPlan });
  }
  for (const adapter of ["codex", "claude"]) {
    const fullDigest = digestInventory(templates.get(`${adapter}:full_ask`).inventory);
    for (const condition of ["plain", "kernel_only", "adaptive_ask", "full_ask"]) {
      validateMaterializationProjectionInventory({ adapter, condition, inventory: templates.get(`${adapter}:${condition}`).inventory, fullProjectionDigest: fullDigest });
    }
  }
  return templates;
}

function copyDirectoryContents(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    cpSync(resolve(source, entry.name), resolve(target, entry.name), { recursive: true, dereference: false, force: false, errorOnExist: true });
  }
}

function copyFixtureCaseInputs(caseRoot, fixture) {
  for (const record of fixture.records) {
    const targetRelative = record.path === "task.md" ? "BENCHMARK_TASK.md" : record.path;
    const target = assertInside(caseRoot, resolve(caseRoot, targetRelative), `${targetRelative} target`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(record.source, target);
    chmodSync(target, record.mode);
  }
  const inventory = fileInventory(caseRoot);
  return inventory.filter((entry) => entry.path === "BENCHMARK_TASK.md" || entry.path.startsWith("workspace/"));
}

function assertBlockInputEquality(cases) {
  const byBlock = new Map();
  for (const entry of cases) byBlock.set(entry.block_id, [...(byBlock.get(entry.block_id) ?? []), entry]);
  for (const [blockId, block] of byBlock) {
    if (block.length !== 4 || new Set(block.map((entry) => entry.frozen_input_digest)).size !== 1) throw new Error(`${blockId} conditions do not share byte-identical frozen inputs`);
  }
}

function sameInventory(actual, expected) {
  const sort = (inventory) => [...inventory].sort((left, right) => left.path.localeCompare(right.path));
  return stableCanonicalJson(sort(actual)) === stableCanonicalJson(sort(expected));
}

function assertMaterializedAgentVisibleInventory(record) {
  const paths = new Set();
  if (!Array.isArray(record.agent_visible_files) || record.agent_visible_files.length === 0) throw new Error(`${record.case_id} agent-visible inventory is missing`);
  for (const file of record.agent_visible_files) {
    const path = assertPortableRelativePath(file?.path, `${record.case_id} agent-visible inventory path`);
    if (path !== "BENCHMARK_TASK.md" && !path.startsWith("workspace/")) throw new Error(`${record.case_id} agent-visible inventory contains an undeclared path`);
    if (paths.has(path)) throw new Error(`${record.case_id} agent-visible inventory contains duplicate path: ${path}`);
    paths.add(path);
    const lowerSegments = path.toLowerCase().split("/");
    const lowerBase = lowerSegments.at(-1);
    if (lowerSegments.some((segment) => PROHIBITED_SEGMENTS.has(segment) || /(?:^|[._-])hidden[-_]?tests?(?:[._-]|$)/u.test(segment)) || PROHIBITED_BASENAMES.has(lowerBase)) {
      throw new Error(`${record.case_id} agent-visible inventory reintroduces evaluator material`);
    }
  }
  if (!paths.has("BENCHMARK_TASK.md") || ![...paths].some((path) => path.startsWith("workspace/"))) throw new Error(`${record.case_id} agent-visible inventory must contain task and workspace files`);
}

function assertAdaptiveProjectionBoundary({ caseRoot, record, projectedInventory }) {
  if (record.condition !== "adaptive_ask") return;
  const expectedFingerprint = canonicalDigest({ adapter: record.adapter, condition: record.condition, inventory: projectedInventory });
  if (record.projection_evidence?.projection_fingerprint !== expectedFingerprint) throw new Error(`${record.case_id} Adaptive projection fingerprint mismatch`);
  const boundaryRelativePath = record.adapter === "codex" ? ".agents/adaptive/projection-boundary.json" : ".claude/adaptive/projection-boundary.json";
  const boundaryPath = assertInside(caseRoot, resolve(caseRoot, boundaryRelativePath), `${record.case_id} Adaptive projection boundary`);
  if (!existsSync(boundaryPath) || !lstatSync(boundaryPath).isFile()) throw new Error(`${record.case_id} Adaptive projection boundary is missing`);
  if (stableCanonicalJson(readJson(boundaryPath)) !== stableCanonicalJson(adaptiveBoundary(record.adapter))) throw new Error(`${record.case_id} Adaptive projection boundary drifted`);
  const adaptive = record.projection_evidence.adaptive_projection;
  if (adaptive?.boundary_status !== "available_pre_selection" || adaptive.mechanisms_selected !== false || adaptive.selection_seal_produced !== false || adaptive.runtime_execution_attempted !== false) {
    throw new Error(`${record.case_id} Adaptive projection is no longer at the pre-selection boundary`);
  }
}

export function validateMaterializedPortfolio({ root, config, plan, materializedRoot, repositoryRevision }) {
  const materialized = resolve(materializedRoot);
  if (!existsSync(materialized) || !lstatSync(materialized).isDirectory()) throw new Error(`materialized root must be an existing directory: ${materialized}`);
  assertNoSymlinkSegments(materialized, "materialized root");
  assertExactPlanIdentity({ root, config, plan, repositoryRevision });

  const manifestPath = assertInside(materialized, resolve(materialized, MATERIALIZATION_MANIFEST_NAME), "materialization manifest");
  assertNoSymlinkSegments(manifestPath, "materialization manifest");
  if (!existsSync(manifestPath) || !lstatSync(manifestPath).isFile()) throw new Error("materialization manifest is missing or not a regular file");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, MATERIALIZATION_SCHEMA_PATH), label: "materialization manifest" });
  const manifestDigest = `sha256:${sha256(manifestBytes)}`;
  if (manifest.case_count !== manifest.cases.length) throw new Error("materialization manifest case_count does not match cases length");
  if (manifest.plan.plan_id !== plan.plan_id || manifest.plan.digest !== canonicalDigest(plan)) throw new Error("materialization manifest plan identity mismatch");
  if (manifest.materializer.version !== MATERIALIZER_VERSION || manifest.materializer.source_revision !== repositoryRevision) throw new Error("materialization manifest materializer identity mismatch");
  if (manifest.source_identity.config_path !== relative(root, config._configPath).split(sep).join("/") || manifest.source_identity.config_sha256 !== plan.config_sha256 || manifest.source_identity.protocol_path !== relative(root, config._protocolPath).split(sep).join("/") || manifest.source_identity.protocol_sha256 !== plan.protocol_sha256 || manifest.source_identity.repository_revision !== repositoryRevision) {
    throw new Error("materialization manifest source identity mismatch");
  }
  if (manifest.output_root_identity !== canonicalDigest({ plan_id: plan.plan_id, materializer_version: MATERIALIZER_VERSION })) throw new Error("materialization manifest output root identity mismatch");

  const plannedCases = new Map(plan.cases.map((entry) => [entry.case_id, entry]));
  const manifestCaseIds = new Set();
  const conditionIdentities = new Set();
  const blockCases = new Map();
  for (const record of manifest.cases) {
    if (manifestCaseIds.has(record.case_id)) throw new Error(`materialization manifest contains duplicate case id: ${record.case_id}`);
    manifestCaseIds.add(record.case_id);
    const planned = plannedCases.get(record.case_id);
    if (!planned) throw new Error(`materialization manifest case is absent from the execution plan: ${record.case_id}`);
    const bindingFields = [
      ["block_id", record.block_id, planned.block_id],
      ["adapter", record.adapter, planned.adapter_track],
      ["condition", record.condition, planned.condition],
      ["fixture", record.fixture, planned.fixture_id],
      ["repetition", record.repetition, planned.repetition],
      ["registered_repetitions", record.registered_repetitions, planned.registered_repetitions],
      ["condition_order_position", record.condition_order_position, planned.condition_order_position],
    ];
    for (const [field, actual, expected] of bindingFields) {
      if (actual !== expected) throw new Error(`${record.case_id} materialization ${field} does not match execution plan`);
    }
    const conditionIdentity = `${record.adapter}\u0000${record.fixture}\u0000${record.repetition}\u0000${record.condition}`;
    if (conditionIdentities.has(conditionIdentity)) throw new Error(`materialization manifest contains duplicate adapter/fixture/repetition/condition identity: ${record.case_id}`);
    conditionIdentities.add(conditionIdentity);
    if (record.projection_evidence?.adapter_id !== record.adapter) throw new Error(`${record.case_id} projection adapter does not match case adapter`);
    const expectedProfile = { plain: "plain", kernel_only: "kernel", adaptive_ask: "adaptive-boundary", full_ask: "full" }[record.condition];
    if (record.projection_evidence?.selected_profile !== expectedProfile) throw new Error(`${record.case_id} condition does not map to the expected projection profile`);
    assertMaterializedAgentVisibleInventory(record);

    const caseRoot = assertInside(materialized, resolve(materialized, record.case_id), `${record.case_id} root`);
    assertNoSymlinkSegments(caseRoot, `${record.case_id} root`);
    if (!existsSync(caseRoot) || !lstatSync(caseRoot).isDirectory()) throw new Error(`${record.case_id} root is missing or not a directory`);
    const actualInventory = fileInventory(caseRoot);
    if (actualInventory.some((entry) => {
      const segments = entry.path.toLowerCase().split("/");
      const base = segments.at(-1);
      return segments.some((segment) => PROHIBITED_SEGMENTS.has(segment) || /(?:^|[._-])hidden[-_]?tests?(?:[._-]|$)/u.test(segment)) || PROHIBITED_BASENAMES.has(base);
    })) throw new Error(`${record.case_id} actual case bytes reintroduce evaluator material`);
    const projectedInventory = actualInventory.filter((entry) => entry.path !== "BENCHMARK_TASK.md" && !entry.path.startsWith("workspace/"));
    const frozenInventory = actualInventory.filter((entry) => entry.path === "BENCHMARK_TASK.md" || entry.path.startsWith("workspace/"));
    if (!sameInventory(actualInventory, [...record.agent_visible_files, ...record.projected_asset_inventory])) throw new Error(`${record.case_id} actual case files do not match the declared inventory`);
    if (!sameInventory(frozenInventory, record.agent_visible_files) || !sameInventory(projectedInventory, record.projected_asset_inventory)) throw new Error(`${record.case_id} case inventory partition drifted`);
    validateMaterializationProjectionInventory({ adapter: record.adapter, condition: record.condition, inventory: projectedInventory });
    const task = frozenInventory.find((entry) => entry.path === "BENCHMARK_TASK.md");
    const workspaceInventory = frozenInventory.filter((entry) => entry.path.startsWith("workspace/"));
    if (!task || record.frozen_input_digest !== digestInventory(frozenInventory) || record.task_digest !== `sha256:${task.sha256}` || record.workspace_digest !== digestInventory(workspaceInventory) || record.condition_projection_digest !== digestInventory(projectedInventory)) {
      throw new Error(`${record.case_id} actual case digest mismatch`);
    }
    assertAdaptiveProjectionBoundary({ caseRoot, record, projectedInventory });
    blockCases.set(record.block_id, [...(blockCases.get(record.block_id) ?? []), record]);
  }
  if (manifestCaseIds.size !== plannedCases.size || [...plannedCases.keys()].some((caseId) => !manifestCaseIds.has(caseId))) throw new Error("materialization manifest case ids do not exactly match execution plan cases");
  for (const [blockId, cases] of blockCases) {
    if (cases.length !== 4 || new Set(cases.map((entry) => entry.condition)).size !== 4 || new Set(cases.map((entry) => entry.frozen_input_digest)).size !== 1 || new Set(cases.map((entry) => entry.task_digest)).size !== 1 || new Set(cases.map((entry) => entry.workspace_digest)).size !== 1) {
      throw new Error(`${blockId} does not contain one byte-identical case for every condition`);
    }
  }
  return { manifest, manifestDigest, manifestPath, casesById: new Map(manifest.cases.map((entry) => [entry.case_id, entry])) };
}

export function materializePortfolio({ root, config, planPath, outputPath, repositoryRevision }) {
  if (!planPath || !outputPath) throw new Error("materialize requires --plan and --output");
  assertTrackedRepositoryMatchesHead(root);
  const plan = readJson(planPath);
  assertExactPlanIdentity({ root, config, plan, repositoryRevision });
  const fixtures = validateFixtureInputs({ root, config, plan });
  const outputBoundary = validateOutputBoundary(outputPath);
  const parent = dirname(outputPath);
  const staging = mkdtempSync(resolve(parent, `.${basename(outputPath)}.staging-`));
  try {
    const templateRoot = resolve(staging, ".projection-templates");
    const templates = buildProjectionTemplates({ root, templateRoot });
    const cases = [];
    for (const planned of plan.cases) {
      const caseRoot = assertInside(staging, resolve(staging, planned.case_id), `${planned.case_id} output`);
      mkdirSync(caseRoot, { recursive: false });
      const frozenInventory = copyFixtureCaseInputs(caseRoot, fixtures.get(planned.fixture_id));
      const template = templates.get(`${planned.adapter_track}:${planned.condition}`);
      copyDirectoryContents(template.root, caseRoot);
      const completeInventory = fileInventory(caseRoot);
      const projectedInventory = completeInventory.filter((entry) => entry.path !== "BENCHMARK_TASK.md" && !entry.path.startsWith("workspace/"));
      if (stableCanonicalJson(projectedInventory) !== stableCanonicalJson(template.inventory)) throw new Error(`${planned.case_id} projected asset inventory drifted while copying`);
      validateMaterializationProjectionInventory({
        adapter: planned.adapter_track,
        condition: planned.condition,
        inventory: projectedInventory,
        fullProjectionDigest: digestInventory(templates.get(`${planned.adapter_track}:full_ask`).inventory),
      });
      const task = frozenInventory.find((entry) => entry.path === "BENCHMARK_TASK.md");
      const workspaceInventory = frozenInventory.filter((entry) => entry.path.startsWith("workspace/"));
      cases.push({
        case_id: planned.case_id,
        block_id: planned.block_id,
        adapter: planned.adapter_track,
        condition: planned.condition,
        fixture: planned.fixture_id,
        repetition: planned.repetition,
        registered_repetitions: planned.registered_repetitions,
        condition_order_position: planned.condition_order_position,
        frozen_input_digest: digestInventory(frozenInventory),
        task_digest: `sha256:${task.sha256}`,
        workspace_digest: digestInventory(workspaceInventory),
        condition_projection_digest: digestInventory(projectedInventory),
        agent_visible_files: frozenInventory,
        projected_asset_inventory: projectedInventory,
        projection_evidence: buildProjectionEvidence({ root, adapter: planned.adapter_track, condition: planned.condition, inventory: projectedInventory, projectionPlan: template.projectionPlan }),
        evaluator_leakage_status: "passed",
        path_validation_status: "passed",
        symlink_validation_status: "passed",
        materialization_status: "complete",
      });
    }
    assertBlockInputEquality(cases);
    rmSync(templateRoot, { recursive: true, force: true });
    const manifest = {
      schema_version: "1.0.0",
      schema_path: MATERIALIZATION_SCHEMA_PATH,
      program: "adaptive_ask_portfolio_materialization",
      materializer: { version: MATERIALIZER_VERSION, source_revision: repositoryRevision },
      plan: { plan_id: plan.plan_id, digest: canonicalDigest(plan) },
      source_identity: {
        config_path: relative(root, config._configPath).split(sep).join("/"),
        config_sha256: plan.config_sha256,
        protocol_path: relative(root, config._protocolPath).split(sep).join("/"),
        protocol_sha256: plan.protocol_sha256,
        repository_revision: repositoryRevision,
      },
      output_root_identity: canonicalDigest({ plan_id: plan.plan_id, materializer_version: MATERIALIZER_VERSION }),
      creation_status: "complete",
      case_count: cases.length,
      cases,
    };
    assertBenchmarkSchemaInstance(manifest, { schemaPath: resolve(root, MATERIALIZATION_SCHEMA_PATH), label: "materialization manifest" });
    writeJson(resolve(staging, MATERIALIZATION_MANIFEST_NAME), manifest);
    validateOutputBoundary(outputPath);
    if (outputBoundary.existed) rmdirSync(outputPath);
    renameSync(staging, outputPath);
    return manifest;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
