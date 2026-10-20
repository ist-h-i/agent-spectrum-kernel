#!/usr/bin/env node
// Model-free connector: fixed public fixtures -> existing single-task preparation.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";
import { buildPrimaryFixtureRecipe, PRIMARY_FIXTURE_IDS, primaryFixtureIdsForSet, validatePrimaryFixtureRecipe } from "./ask-primary-fixture-recipe.mjs";
import { comparisonHash, inventoryUserTree, prepareGitBaseline, prepareUserComparison } from "./ask-user-comparison-prepare.mjs";
import { createPrimaryEvaluationGradingAdapter, preflightPrimaryEvaluationGrading, PRIMARY_GRADING_PROFILE_ID } from "./ask-primary-evaluation-grading.mjs";
import { readPrimaryScoringVersion } from "./ask-primary-scoring-version.mjs";
import { validateVerificationCommandContract } from "./ask-benchmark-command-evidence.mjs";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { computeOutputContractDigest, computeRequirementDigest, computeRequirementRecordDigest, computeRequirementSetDigest } from "./ask-benchmark-scoring-contract.mjs";
import { PRIMARY_FIXTURE_REGISTRY } from "./ask-benchmark-portfolio-catalog.mjs";
import { primaryProfileForKernel } from "./ask-primary-evaluation-profile.mjs";
import { preparePrimaryEvaluationBatch, PRIMARY_GRADING_RESERVATION_MS, primaryBatchLimitsForSet } from "./ask-primary-evaluation-batch.mjs";

const SOURCE = fileURLToPath(new URL("../", import.meta.url));
const read = path => readStableFile(path, "fixed public primary input", 32 * 1024 * 1024).bytes;
const json = path => parseJsonRejectDuplicateKeys(read(path).toString("utf8"));
const closedOptions = ["output", "cliBin", "cliVersion", "model", "reasoning", "globalAskPresence", "evidenceKind", "gradingResourcesPath", "gradingResourcesDigest", "kernelCondition", "scoringVersionPath", "scoringVersionDigest", "fixtureSet"];
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });

export function preparePrimaryEvaluation(publicParent, options) {
  assert.ok(options && typeof options === "object" && !Array.isArray(options));
  assert.ok(Object.keys(options).every(key => closedOptions.includes(key)), "primary preparation options are closed");
  assert.equal(options.scoringVersionPath == null, options.scoringVersionDigest == null, "scoring version path and digest supplied together");
  const scoringVersion = options.scoringVersionPath == null ? null : { path: options.scoringVersionPath, digest: options.scoringVersionDigest };
  const fixtureSet = options.fixtureSet ?? "legacy9", fixtureIds = primaryFixtureIdsForSet(fixtureSet);
  // Validate every selected fixture before creating any preparation output.
  if (scoringVersion) for (const fixtureId of fixtureIds) readPrimaryScoringVersion(scoringVersion, fixtureId);
  const profile = primaryProfileForKernel(options.kernelCondition ?? "kernel_principles_v2");
  const gradingAdapter = createPrimaryEvaluationGradingAdapter({ resourcesPath: options.gradingResourcesPath ?? null,
    resourcesDigest: options.gradingResourcesDigest ?? null });
  assert.ok(isAbsolute(publicParent) && realpathSync(publicParent) === publicParent);
  const output = options.output;
  assert.ok(isAbsolute(output) && resolve(output) === output && realpathSync(dirname(output)) === dirname(output));
  assert.ok(!output.startsWith(`${publicParent}/`) && !publicParent.startsWith(`${output}/`) && output !== publicParent, "output/input overlap");
  mkdirSync(output, { mode: 0o700 }); // Create once; never reopen or repair.
  for (const path of ["seeds", "blocks", "recipes"]) mkdirSync(join(output, path), { mode: 0o700 });
  const blocks = [];
  for (const fixtureId of fixtureIds) {
    const publicRoot = join(publicParent, fixtureId), original = inventoryUserTree(publicRoot);
    const recipe = buildPrimaryFixtureRecipe(fixtureId);
    const tree = new Map(Object.keys(original).map(path => [path, { bytes: read(join(publicRoot, path)), mode: "100644" }]));
    validatePrimaryFixtureRecipe(recipe, tree, { taskBytes: tree.get("task.md").bytes,
      mutablePaths: recipe.mutable_paths, taskClass: recipe.runner_task_class });
    const seed = join(output, "seeds", fixtureId); mkdirSync(seed, { mode: 0o700 });
    for (const [path, entry] of tree) {
      mkdirSync(dirname(join(seed, path)), { recursive: true, mode: 0o700 });
      writeFileSync(join(seed, path), entry.bytes, { flag: "wx", mode: 0o644 });
    }
    const seedCommit = prepareGitBaseline(seed);
    const recipePath = join(output, "recipes", `${fixtureId}.json`); save(recipePath, recipe);
    const prepared = prepareUserComparison({ repo: seed, commit: seedCommit, taskFile: join(publicRoot, "task.md"),
      verificationFile: recipePath, output: join(output, "blocks", fixtureId), mutablePaths: recipe.mutable_paths,
      taskClass: recipe.runner_task_class, kernelCondition: profile.kernel_condition, executionContract: "single_shot_v1",
      cliBin: options.cliBin ?? "codex", cliVersion: options.cliVersion ?? null, model: options.model ?? "gpt-6.1-sol",
      reasoning: options.reasoning ?? "high", globalAskPresence: options.globalAskPresence ?? "unknown",
      evidenceKind: options.evidenceKind ?? "observed", timeoutMs: 3600000, verificationTimeoutMs: 300000,
      overallTimeoutMs: 14400000, tokenBudget: 5000000 });
    const base = join(SOURCE, "benchmarks/fixtures/checkpoint-b2", fixtureId);
    const scoringBase = scoringVersion ? join(readPrimaryScoringVersion(scoringVersion, fixtureId).root, "benchmarks/fixtures/checkpoint-b2", fixtureId) : base;
    const reference = json(join(scoringBase, "evaluator-reference.json"));
    const binding = { fixture_id: fixtureId, input_manifest_digest: recipe.input_manifest_digest,
      evaluator_bundle_digest: reference.evaluator_bundle_digest,
      scoring_input_freeze_digest: comparisonHash(read(join(scoringBase, "scoring-input-freeze-manifest.json"))),
      profile_id: profile.id };
    const block = { fixture_id: fixtureId, root: prepared.root, public_input_root: publicRoot,
      run_id: prepared.plan.run_id, plan_digest: prepared.plan_digest,
      source_digest: prepared.plan.source.digest, task_digest: prepared.plan.task.digest, verification_digest: prepared.plan.verification.digest,
      input_manifest: { path: join(base, "input-manifest.json"), digest: recipe.input_manifest_digest },
      grading: { status: "blocked", blockers: [], timeout_ms: PRIMARY_GRADING_RESERVATION_MS, binding,
        ...(scoringVersion ? { scoring_version: structuredClone(scoringVersion) } : {}),
        ...(options.gradingResourcesPath ? { resources: { path: options.gradingResourcesPath, digest: options.gradingResourcesDigest } } : {}) } };
    const gradingPreflight = gradingAdapter.preflight(block);
    block.grading.status = gradingPreflight.status;
    block.grading.blockers = gradingPreflight.blockers;
    blocks.push(block);
  }
  const manifest = { kind: "ask_primary_evaluation_batch_manifest_v1", batch_id: fixtureSet === "legacy9" ? "primary-nine-prepared-v4" : "primary-catalog24-prepared-v1",
    ...(fixtureSet === "catalog24" ? { fixture_set: fixtureSet } : {}),
    root: join(output, "batch"), conditions: [...profile.conditions],
    limits: { ...primaryBatchLimitsForSet(fixtureSet) }, blocks };
  const manifestPath = join(output, "batch-manifest.json"); save(manifestPath, manifest);
  const result = preparePrimaryEvaluationBatch(manifestPath, { gradingAdapter });
  save(join(output, "preparation-result.json"), result);
  return { ...result, manifest_path: manifestPath, model_calls: 0, old_ownership_diagnostics: 0,
    kernel_candidate_decision: `${profile.kernel_condition} selected for this practical evaluation; old v1 and candidate preserved; not product adoption` };
}
// Public source preparation is deliberately separate from private grading admission.
// It consumes the canonical 24-ID catalog. Comparison/scoring authority still
// requires its separately selected version and independently admitted resources.
const PUBLIC_KIND = "ask_primary_public_inputs_v1";
const publicContracts = ["input-manifest.json", "verification-command-contract.json", "output-contract.json", "requirement-record.json", "evidence-map.json"];
const canonicalDirectory = path => {
  assert.ok(isAbsolute(path) && resolve(path) === path && realpathSync(path) === path, "canonical directory required");
  return path;
};
const safePublicPath = path => typeof path === "string" && !/[\\\0]/u.test(path) && !path.startsWith("/")
  && path.split("/").every(part => part && part !== "." && part !== "..")
  && (path === "task.md" || path.startsWith("workspace/"));
const publicSlots = (id, requirements, failures) => primaryProfileForKernel("kernel_principles_v2").conditions.map(condition => ({
  fixture_id: id, condition, state: failures.length ? "blocked" : "not_started", quality: null, failure_reasons: [...failures],
  requirements: requirements.map(requirement => ({ requirement_id: requirement.requirement_id, status: "not_evaluated", points: null })),
}));
function publicCatalog(root) {
  const raw = read(join(root, "benchmarks/portfolio-catalog.json")), catalog = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
  const rows = catalog.fixtures.filter(row => row.fixture_role === "primary");
  assert.deepEqual(rows.map(row => [row.fixture_id, row.suite, row.task_class, row.domain, row.difficulty, row.repetitions]), PRIMARY_FIXTURE_REGISTRY,
    "canonical primary catalog differs");
  return { raw, rows };
}
function checkPublicInput(id, inputRoot, contractRoot, expectedDigests = null, schemaRoot = SOURCE) {
  const failures = [], contracts = {}, contractDigests = {};
  for (const name of publicContracts) try {
    const raw = read(join(contractRoot, name));
    if (expectedDigests) assert.equal(comparisonHash(raw), expectedDigests[name], `contract changed: ${name}`);
    contracts[name] = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
    contractDigests[name] = comparisonHash(raw);
  } catch (error) { failures.push(`${name}: ${error.message}`); }
  const input = contracts["input-manifest.json"], commands = contracts["verification-command-contract.json"],
    output = contracts["output-contract.json"], requirementRecord = contracts["requirement-record.json"], evidence = contracts["evidence-map.json"];
  let files = [], requirements = [];
  try {
    assert.equal(input?.scope, "agent-visible task.md + workspace/**");
    assert.deepEqual(Object.keys(input.fixtures), [id]);
    files = input.fixtures[id].files;
    assert.ok(Array.isArray(files) && files.length > 1 && files.every(file => safePublicPath(file.path)), "unsafe public input path");
    assert.equal(new Set(files.map(file => file.path)).size, files.length, "duplicate public input path");
    assert.ok(files.some(file => file.path === "task.md"), "task.md missing");
    const inventory = inventoryUserTree(inputRoot);
    // Fixture roots also carry public control contracts; only task.md/workspace
    // belong in the model's source. Prepared roots must contain precisely these.
    const actual = Object.keys(inventory).filter(path => safePublicPath(path));
    assert.deepEqual(actual.sort(), files.map(file => file.path).sort(), "public input inventory changed");
    if (inputRoot !== contractRoot) assert.deepEqual(Object.keys(inventory).sort(), actual.sort(), "extra prepared input");
    for (const file of files) {
      const raw = read(join(inputRoot, file.path));
      assert.equal(raw.length, file.bytes, `input changed: ${file.path}`);
      assert.equal(comparisonHash(raw), `sha256:${file.sha256}`, `input changed: ${file.path}`);
    }
  } catch (error) { failures.push(`public input: ${error.message}`); }
  try {
    const validated = validateVerificationCommandContract(commands, { root: schemaRoot });
    assert.equal(validated.fixture_id, id);
    assert.equal(validated.fixture_input_digest, contractDigests["input-manifest.json"], "command/input binding changed");
    assertBenchmarkSchemaInstance(output, { schemaPath: join(schemaRoot, "benchmarks/schemas/portfolio-output-contract.schema.json"), label: "public output contract" });
    assertBenchmarkSchemaInstance(requirementRecord, { schemaPath: join(schemaRoot, "benchmarks/schemas/portfolio-requirement-record.schema.json"), label: "public requirement record" });
    assert.equal(output.fixture_id, id); assert.equal(requirementRecord.fixture_id, id); assert.equal(evidence?.fixture_id, id);
    const base = `benchmarks/fixtures/checkpoint-b2/${id}`;
    assert.equal(output.output_contract_path, `${base}/output-contract.json`);
    assert.equal(requirementRecord.requirement_record_path, `${base}/requirement-record.json`);
    assert.equal(output.verification_command_contract_path, `${base}/verification-command-contract.json`);
    assert.equal(output.scope_boundary_authority_path, `${base}/evidence-map.json`);
    assert.equal(output.output_contract_digest, computeOutputContractDigest(output), "output contract digest changed");
    assert.equal(requirementRecord.requirement_record_digest, computeRequirementRecordDigest(requirementRecord), "requirement record digest changed");
    assert.equal(requirementRecord.requirement_set_digest, computeRequirementSetDigest(requirementRecord), "requirement set digest changed");
    assert.equal(output.verification_command_contract_digest, validated.contract_digest, "output/command binding changed");
    const checkedRequirements = requirementRecord.requirements;
    assert.ok(checkedRequirements.length, "requirements missing");
    assert.equal(new Set(checkedRequirements.map(row => row.requirement_id)).size, checkedRequirements.length, "duplicate requirement ID");
    for (const requirement of checkedRequirements) assert.equal(requirement.requirement_digest, computeRequirementDigest(requirement), "requirement digest changed");
    const scope = evidence.scope_boundary_authority;
    assert.ok(scope?.allowed_candidate_paths?.length, "candidate scope missing");
    const { authority_digest: scopeDigest, ...scopeBody } = scope;
    assert.equal(scopeDigest, canonicalDigest(scopeBody), "scope digest changed");
    assert.equal(output.scope_boundary_authority_digest, scopeDigest, "output/scope binding changed");
    for (const key of ["allowed_candidate_paths", "required_candidate_paths", "protected_candidate_paths"]) {
      assert.ok(Array.isArray(scope[key]) && scope[key].every(path => typeof path === "string" && path.startsWith("workspace/") && safePublicPath(path.split("#")[0])), "unsafe candidate scope");
      assert.equal(new Set(scope[key]).size, scope[key].length, "duplicate candidate scope");
    }
    assert.ok(scope.required_candidate_paths.every(path => scope.allowed_candidate_paths.some(allowed => allowed.split("#")[0] === path.split("#")[0])), "required scope is not allowed");
    assert.equal(scope.unmanaged_additions, "forbidden"); assert.equal(scope.unmanaged_deletions, "forbidden");
    const maps = new Map(evidence.maps.map(map => [map.evidence_map_id, map]));
    assert.equal(maps.size, evidence.maps.length, "duplicate evidence map");
    for (const requirement of checkedRequirements) for (const mapId of requirement.evidence_map_ids) {
      const map = maps.get(mapId);
      assert.ok(map && Array.isArray(map.agent_visible_paths) && map.agent_visible_paths.every(path => files.some(file => file.path === path)), "requirement evidence is not in the public input");
    }
    requirements = checkedRequirements;
  } catch (error) { failures.push(`contracts: ${error.message}`); }
  if (!Array.isArray(requirements)) requirements = [];
  return { public_input_status: failures.length ? "invalid" : "valid", failures, contract_digests: contractDigests,
    public_files: files, requirements, output_contract: output ?? null,
    candidate_scope: evidence?.scope_boundary_authority ?? null, verification_commands: commands?.commands ?? [],
    semantic_controls: { status: "not_run", declared_mutations: evidence?.mutation_contracts?.length ?? 0,
      limitation: "Declared mutation/equivalence IDs are not execution evidence. Normal and defective semantic controls require the fixed private evaluator and independent review." },
    quality: null, comparison_start_allowed: false };
}
function publicSummary(fixtures) {
  return { kind: PUBLIC_KIND, scope: "public_inputs_only", comparison_start_allowed: false, model_calls: 0,
    suite_counts: Object.fromEntries([...new Set(fixtures.map(row => row.suite))].map(suite => [suite, fixtures.filter(row => row.suite === suite).length])),
    public_input_status: fixtures.every(row => ["valid", "prepared"].includes(row.public_input_status)) ? "complete" : "partial",
    semantic_grading_status: "not_evaluated", fixtures, limitations: ["Public closure validation does not establish semantic quality, private evaluator admission, or ASK effectiveness.",
      "The existing primary comparison/grading authority is still the closed nine-task set. Missing or ungraded tasks retain null quality."] };
}
export function inspectPrimaryPublicInputs({ root = resolve(SOURCE) } = {}) {
  canonicalDirectory(root);
  const { raw, rows } = publicCatalog(root), configured = json(join(root, "benchmarks/adaptive-portfolio.config.json")).fixtures;
  const report = publicSummary(rows.map(row => {
    const base = join(root, "benchmarks/fixtures/checkpoint-b2", row.fixture_id);
    const checked = checkPublicInput(row.fixture_id, base, base, null, root);
    return { fixture_id: row.fixture_id, suite: row.suite, task_class: row.task_class, public_intent: row.public_intent,
      primary_comparison_registered: PRIMARY_FIXTURE_IDS.includes(row.fixture_id), portfolio_registered: configured.some(entry => entry.id === row.fixture_id),
      ...checked, comparison_blockers: [PRIMARY_FIXTURE_IDS.includes(row.fixture_id) ? "private_grading_resources_not_checked" : "primary_comparison_not_registered", "semantic_controls_not_run"],
      slots: publicSlots(row.fixture_id, checked.requirements, checked.failures) };
  }));
  return { ...report, catalog_digest: comparisonHash(raw) };
}
export function preparePrimaryPublicInputs(output, { root = resolve(SOURCE) } = {}) {
  canonicalDirectory(root); canonicalDirectory(dirname(output));
  assert.ok(isAbsolute(output) && resolve(output) === output, "canonical output required");
  assert.ok(!output.startsWith(`${root}/`) && !root.startsWith(`${output}/`) && output !== root, "output/source overlap");
  assert.ok(!existsSync(output), "public preparation output exists; never reuse");
  const report = inspectPrimaryPublicInputs({ root });
  mkdirSync(output, { mode: 0o700 });
  for (const name of ["inputs", "records"]) mkdirSync(join(output, name), { mode: 0o700 });
  const catalog = publicCatalog(root); assert.equal(comparisonHash(catalog.raw), report.catalog_digest, "catalog changed during preparation");
  writeFileSync(join(output, "catalog.json"), catalog.raw, { flag: "wx", mode: 0o600 });
  for (const row of report.fixtures) {
    const records = join(output, "records", row.fixture_id); mkdirSync(records, { mode: 0o700 });
    if (row.public_input_status === "valid") try {
      const source = join(root, "benchmarks/fixtures/checkpoint-b2", row.fixture_id);
      for (const name of publicContracts) {
        const raw = read(join(source, name)); assert.equal(comparisonHash(raw), row.contract_digests[name], "source contract changed during preparation");
        writeFileSync(join(records, name), raw, { flag: "wx", mode: 0o600 });
      }
      const input = join(output, "inputs", row.fixture_id); mkdirSync(input, { mode: 0o700 });
      for (const file of row.public_files) {
        const raw = read(join(source, file.path)); assert.equal(comparisonHash(raw), `sha256:${file.sha256}`, `input changed during preparation: ${file.path}`);
        mkdirSync(dirname(join(input, file.path)), { recursive: true, mode: 0o700 });
        writeFileSync(join(input, file.path), raw, { flag: "wx", mode: 0o644 });
      }
      row.public_input_status = "prepared";
    } catch (error) { row.public_input_status = "invalid"; row.failures.push(`preparation: ${error.message}`); }
    row.slots = publicSlots(row.fixture_id, row.requirements, row.failures);
    save(join(records, "status.json"), row);
  }
  const prepared = { ...publicSummary(report.fixtures), catalog_digest: comparisonHash(catalog.raw) };
  save(join(output, "preparation.json"), prepared);
  writeFileSync(join(output, "preparation.digest"), comparisonHash(read(join(output, "preparation.json"))), { flag: "wx", mode: 0o600 });
  return prepared;
}
export function verifyPrimaryPublicInputs(output) {
  canonicalDirectory(output);
  const raw = read(join(output, "preparation.json"));
  assert.equal(comparisonHash(raw), read(join(output, "preparation.digest")).toString(), "preparation changed");
  const prepared = parseJsonRejectDuplicateKeys(raw.toString("utf8"));
  assert.equal(prepared.kind, PUBLIC_KIND);
  assert.equal(comparisonHash(read(join(output, "catalog.json"))), prepared.catalog_digest, "prepared catalog changed");
  assert.deepEqual(prepared.fixtures.map(row => row.fixture_id), PRIMARY_FIXTURE_REGISTRY.map(row => row[0]));
  return publicSummary(prepared.fixtures.map(row => {
    const records = join(output, "records", row.fixture_id);
    const checked = row.public_input_status === "prepared"
      ? checkPublicInput(row.fixture_id, join(output, "inputs", row.fixture_id), records, row.contract_digests) : row;
    const failures = [...checked.failures];
    try { assert.deepEqual(json(join(records, "status.json")), row, "saved task record changed"); }
    catch (error) { failures.push(error.message); }
    return { ...row, ...checked, public_input_status: failures.length ? "invalid" : checked.public_input_status,
      failures, slots: publicSlots(row.fixture_id, checked.requirements, failures) };
  }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, optionPath, ...extra] = process.argv.slice(2);
  assert.ok(input && optionPath && extra.length === 0, "Usage: node scripts/ask-primary-evaluation-prepare.mjs /absolute/public-inputs /absolute/options.json");
  console.log(JSON.stringify(preparePrimaryEvaluation(input, json(optionPath)), null, 2));
}
