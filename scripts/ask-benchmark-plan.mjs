import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { assertBenchmarkSchemaInstance } from "./ask-benchmark-schema.mjs";
import { computePortfolioPlanId } from "./ask-benchmark-schema.mjs";

export const PORTFOLIO_CONDITIONS = Object.freeze(["plain", "kernel_only", "adaptive_ask", "full_ask"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableCanonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalDigest(value) {
  return `sha256:${sha256(stableCanonicalJson(value))}`;
}

function withoutField(value, field) {
  const { [field]: _ignored, ...rest } = value;
  return rest;
}

function finalAdmissionDigest(value) {
  return canonicalDigest(withoutField(value, "admission_digest"));
}

function frozenAdmissionRequirementDigest(value) {
  if (!Object.hasOwn(value, "requirement_authority_digest")) return value.admission_digest;
  const {
    admission_digest: _admissionDigest,
    evaluator_authority_manifest_path: _authorityManifestPath,
    evaluator_authority_manifest_raw_sha256: _authorityManifestRawSha256,
    evaluator_authority_manifest_digest: _authorityManifestDigest,
    requirement_authority_digest: _requirementAuthorityDigest,
    ...authority
  } = value;
  return canonicalDigest(authority);
}

export function balancedPortfolioConditionOrder(seed, adapterTrack, fixtureId, repetition) {
  const base = [...PORTFOLIO_CONDITIONS].sort((left, right) => sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${left}`).localeCompare(sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${right}`)));
  const shift = (repetition - 1) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

function rawDigest(bytes) {
  return `sha256:${sha256(bytes)}`;
}

function readJsonArtifact(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or not a regular file`);
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes); }
  catch { throw new Error(`${label} is invalid JSON`); }
  return { bytes, value };
}

function fixtureAuthorityPaths(root, fixtureId) {
  const fixtureRoot = resolve(root, "benchmarks/fixtures/checkpoint-b2", fixtureId);
  return {
    fixtureRoot,
    admission: resolve(fixtureRoot, "final-admission-record.json"),
    requirement: resolve(fixtureRoot, "requirement-record.json"),
    reference: resolve(fixtureRoot, "evaluator-reference.json"),
    freeze: resolve(fixtureRoot, "scoring-input-freeze-manifest.json"),
  };
}

function findDecisionOverlay(root, fixtureId) {
  const directory = resolve(root, "benchmarks/fixtures/admission-decision");
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) return null;
  const matches = [];
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".json")).sort()) {
    const path = resolve(directory, name);
    const source = readJsonArtifact(path, `admission decision candidate ${name}`);
    if (source.value?.program === "adaptive_ask_portfolio_admission_decision" && source.value.fixture_id === fixtureId) matches.push({ path, ...source });
  }
  if (matches.length > 1) throw new Error(`${fixtureId} has multiple admission decision overlays`);
  return matches[0] ?? null;
}

function assertFrozenArtifact(reference, source, semanticDigest, label) {
  if (reference?.raw_byte_digest !== rawDigest(source.bytes) || reference?.semantic_digest !== semanticDigest) throw new Error(`${label} frozen identity mismatch`);
}

export function resolvePortfolioExecutionAdmission({ root, fixture }) {
  if (fixture.suite === "calibration") return Object.freeze({ fixture_id: fixture.id, authority_mode: "calibration", effective_admission_status: "calibration_only", execution_eligible: true });
  const paths = fixtureAuthorityPaths(root, fixture.id);
  if (Object.values(paths).slice(1).some((path) => !existsSync(path))) return Object.freeze({ fixture_id: fixture.id, authority_mode: "not_admitted", effective_admission_status: "authority_missing", execution_eligible: false });

  const admissionSource = readJsonArtifact(paths.admission, `${fixture.id} final admission record`);
  const requirementSource = readJsonArtifact(paths.requirement, `${fixture.id} requirement record`);
  const referenceSource = readJsonArtifact(paths.reference, `${fixture.id} evaluator reference`);
  const freezeSource = readJsonArtifact(paths.freeze, `${fixture.id} scoring-input freeze manifest`);
  const admission = admissionSource.value;
  const requirement = requirementSource.value;
  const reference = referenceSource.value;
  const freeze = freezeSource.value;

  assertBenchmarkSchemaInstance(admission, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-final-admission-record.schema.json"), label: `${fixture.id} final admission record` });
  assertBenchmarkSchemaInstance(requirement, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-requirement-record.schema.json"), label: `${fixture.id} requirement record` });
  assertBenchmarkSchemaInstance(reference, { schemaPath: resolve(root, "benchmarks/schemas/evaluator-reference.schema.json"), label: `${fixture.id} evaluator reference` });
  assertBenchmarkSchemaInstance(freeze, { schemaPath: resolve(root, "benchmarks/schemas/scoring-input-freeze-manifest.schema.json"), label: `${fixture.id} scoring-input freeze manifest` });
  if (admission.admission_digest !== finalAdmissionDigest(admission)) throw new Error(`${fixture.id} admission digest is invalid`);
  if (admission.requirement_authority_digest !== undefined && admission.requirement_authority_digest !== frozenAdmissionRequirementDigest(admission)) throw new Error(`${fixture.id} admission requirement authority digest is invalid`);
  if (requirement.requirement_record_digest !== canonicalDigest(withoutField(requirement, "requirement_record_digest")) || requirement.requirement_set_digest !== canonicalDigest(requirement.requirements)) throw new Error(`${fixture.id} requirement authority digest is invalid`);
  if (reference.public_metadata_digest !== canonicalDigest(withoutField(reference, "public_metadata_digest"))) throw new Error(`${fixture.id} evaluator reference digest is invalid`);
  if (freeze.manifest_digest !== canonicalDigest(withoutField(freeze, "manifest_digest"))) throw new Error(`${fixture.id} scoring-input freeze digest is invalid`);
  if ([admission.fixture_id, requirement.fixture_id, reference.fixture_id, freeze.fixture_id].some((value) => value !== fixture.id)) throw new Error(`${fixture.id} execution authority contains a cross-fixture transplant`);
  if (requirement.admission_record_digest !== (admission.requirement_authority_digest ?? admission.admission_digest)) throw new Error(`${fixture.id} requirement/admission authority binding is invalid`);
  if (admission.evaluator_bundle_id !== reference.evaluator_bundle_id || admission.evaluator_bundle_digest !== reference.evaluator_bundle_digest || admission.input_manifest_digest !== reference.fixture_input_digest || freeze.fixture_input_digest !== reference.fixture_input_digest) throw new Error(`${fixture.id} evaluator/input authority binding is invalid`);
  assertFrozenArtifact(freeze.admission_record, admissionSource, admission.admission_digest, `${fixture.id} admission record`);
  if (freeze.requirement_record?.raw_byte_digest !== rawDigest(requirementSource.bytes) || freeze.requirement_record?.record_digest !== requirement.requirement_record_digest || freeze.requirement_record?.set_digest !== requirement.requirement_set_digest) throw new Error(`${fixture.id} requirement frozen identity mismatch`);
  assertFrozenArtifact(freeze.evaluator_public_reference, referenceSource, reference.public_metadata_digest, `${fixture.id} evaluator reference`);

  if (admission.admission_status === "admitted") return Object.freeze({ fixture_id: fixture.id, authority_mode: "legacy_admitted_record", effective_admission_status: "admitted", execution_eligible: true });
  const overlaySource = findDecisionOverlay(root, fixture.id);
  if (!overlaySource) return Object.freeze({ fixture_id: fixture.id, authority_mode: "not_admitted", effective_admission_status: admission.admission_status, execution_eligible: false });
  const overlay = overlaySource.value;
  assertBenchmarkSchemaInstance(overlay, { schemaPath: resolve(root, "benchmarks/schemas/portfolio-admission-decision.schema.json"), label: `${fixture.id} admission decision overlay` });
  if (overlay.decision_digest !== canonicalDigest(withoutField(overlay, "decision_digest"))) throw new Error(`${fixture.id} admission decision digest is invalid`);
  if (overlay.decision_status !== "admitted" || overlay.review_status !== "approved" || overlay.author_self_approval !== false || overlay.blocking_finding_count !== 0) throw new Error(`${fixture.id} admission decision is not an approved independent admission`);
  if (overlay.evaluator?.evaluator_revision !== reference.evaluator_revision || overlay.evaluator?.evaluator_bundle_id !== reference.evaluator_bundle_id || overlay.evaluator?.evaluator_bundle_digest !== reference.evaluator_bundle_digest || overlay.evaluator_public_reference_digest !== reference.public_metadata_digest) throw new Error(`${fixture.id} admission decision evaluator authority is transplanted`);
  if (stableCanonicalJson(overlay.frozen_admission_authority) !== stableCanonicalJson({ path: freeze.admission_record.path, raw_byte_digest: rawDigest(admissionSource.bytes), semantic_digest: admission.admission_digest, requirement_authority_digest: admission.requirement_authority_digest ?? admission.admission_digest })) throw new Error(`${fixture.id} admission decision frozen admission authority is transplanted`);
  if (stableCanonicalJson(overlay.frozen_requirement_record) !== stableCanonicalJson({ path: freeze.requirement_record.path, raw_byte_digest: rawDigest(requirementSource.bytes), record_digest: requirement.requirement_record_digest, set_digest: requirement.requirement_set_digest })) throw new Error(`${fixture.id} admission decision frozen requirement authority is transplanted`);
  if (!overlay.frozen_scoring_input_manifest || stableCanonicalJson(overlay.frozen_scoring_input_manifest) !== stableCanonicalJson({ path: relative(root, paths.freeze), raw_byte_digest: rawDigest(freezeSource.bytes), semantic_digest: freeze.manifest_digest })) throw new Error(`${fixture.id} admission decision scoring-input authority is transplanted`);
  return Object.freeze({ fixture_id: fixture.id, authority_mode: "admitted_overlay", effective_admission_status: "admitted", execution_eligible: true });
}

export function resolvePortfolioExecutionFixtures({ root, config }) {
  return config.fixtures.filter((fixture) => resolvePortfolioExecutionAdmission({ root, fixture }).execution_eligible);
}

export function buildPortfolioPlan({ root, config, repositoryRevision, seed }) {
  const configSha256 = sha256(readFileSync(config._configPath));
  const protocolSha256 = sha256(readFileSync(config._protocolPath));
  const seedSha256 = sha256(seed);
  const planId = computePortfolioPlanId({ configSha256, protocolSha256, repositoryRevision, seed });
  const planDigest = planId.slice("plan-".length);
  const blocks = [];
  const executionFixtures = resolvePortfolioExecutionFixtures({ root, config });
  for (const adapter of config.adapter_tracks) {
    for (const fixture of executionFixtures) {
      for (let repetition = 1; repetition <= fixture.repetitions; repetition += 1) {
        const blockId = `block-${planDigest.slice(0, 16)}-${sha256(`${planId}:${adapter.id}:${fixture.id}:${repetition}`).slice(0, 12)}`;
        const orderedConditions = balancedPortfolioConditionOrder(seed, adapter.id, fixture.id, repetition);
        const cases = orderedConditions.map((condition, index) => ({
          case_id: `case-${planDigest.slice(0, 16)}-${sha256(`${planId}:${adapter.id}:${fixture.id}:${repetition}:${condition}`).slice(0, 16)}`,
          block_id: blockId,
          adapter_track: adapter.id,
          fixture_id: fixture.id,
          suite: fixture.suite,
          task_class: fixture.task_class,
          difficulty: fixture.difficulty,
          aggregate_eligible: fixture.aggregate_eligible,
          repetition,
          registered_repetitions: fixture.repetitions,
          condition,
          condition_order_position: index + 1,
          input_manifest_path: fixture.input_manifest_path,
          input_manifest_sha256: fixture.input_manifest_sha256,
          verification_command_contract: fixture.verification_command_contract
            ? {
              path: fixture.verification_command_contract.path,
              file_digest: `sha256:${fixture.verification_command_contract.sha256}`,
              contract_digest: JSON.parse(readFileSync(resolve(root, fixture.verification_command_contract.path), "utf8")).contract_digest,
            }
            : null,
        }));
        blocks.push({ order_key: sha256(`${seed}:block-order:${adapter.id}:${fixture.id}:${repetition}`), cases });
      }
    }
  }
  blocks.sort((left, right) => left.order_key.localeCompare(right.order_key));
  return {
    schema_version: config.execution_plan.schema_version,
    schema_path: config.execution_plan.schema_path,
    program: config.program,
    plan_id: planId,
    protocol_path: relative(root, config._protocolPath),
    protocol_sha256: protocolSha256,
    config_path: relative(root, config._configPath),
    config_sha256: configSha256,
    repository_revision: repositoryRevision,
    randomization_seed: {
      seed_id: `seed-${seedSha256.slice(0, 16)}`,
      value: seed,
      sha256: seedSha256,
    },
    ordering_strategy: config.ordering.strategy,
    conditions: config.conditions.map((entry) => entry.id),
    adapter_tracks: config.adapter_tracks.map((entry) => ({ id: entry.id, runtime_status: entry.runtime_status })),
    pool_adapter_results: config.pool_adapter_results,
    cases: blocks.flatMap((block) => block.cases),
  };
}
