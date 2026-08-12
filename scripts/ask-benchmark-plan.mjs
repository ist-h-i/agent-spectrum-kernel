import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { computePortfolioPlanId } from "./ask-benchmark-schema.mjs";
import {
  computeEffectiveAdmissionAuthorityDigest,
  computeEffectiveAdmissionAuthoritySetDigest,
  resolveEffectiveAdmissionAuthority,
  resolveEffectiveAdmissionAuthorityFromRepositoryOverlayFiles,
  resolveRepositoryAdmissionDecision,
} from "./ask-benchmark-admission-decision.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";
import { readStableJsonFile } from "./ask-benchmark-duplicate-key-json.mjs";

export const PORTFOLIO_CONDITIONS = Object.freeze(["plain", "kernel_only", "adaptive_ask", "full_ask"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function balancedPortfolioConditionOrder(seed, adapterTrack, fixtureId, repetition) {
  const base = [...PORTFOLIO_CONDITIONS].sort((left, right) => sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${left}`).localeCompare(sha256(`${seed}:condition-base:${adapterTrack}:${fixtureId}:${right}`)));
  const shift = (repetition - 1) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

function readJsonArtifact(path, label) {
  return readStableJsonFile(path, label, 1024 * 1024, { allowEmpty: false });
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

const EXTERNAL_ADMISSION_EVIDENCE_FIELDS = Object.freeze([
  "reviewAuthorityPath",
  "reviewAuthoritySourceDigest",
  "reviewArchivePath",
]);

const EXTERNAL_ADMISSION_MANIFEST_FIELDS = Object.freeze([
  "review_authority_path",
  "review_authority_source_digest",
  "review_archive_path",
]);

function normalizeExternalAdmissionEvidence(value, fixtureId) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${fixtureId} execution admission evidence must be a closed object`);
  const keys = Object.keys(value);
  const unknown = keys.filter((key) => !EXTERNAL_ADMISSION_EVIDENCE_FIELDS.includes(key));
  if (unknown.length > 0) throw new Error(`${fixtureId} execution admission evidence has unknown fields: ${unknown.join(", ")}`);
  const missing = EXTERNAL_ADMISSION_EVIDENCE_FIELDS.filter((key) => !Object.hasOwn(value, key) || value[key] === null || value[key] === undefined || value[key] === "");
  if (missing.length > 0) throw new Error(`${fixtureId} execution admission evidence is partial; missing: ${missing.join(", ")}`);
  return Object.freeze(Object.fromEntries(EXTERNAL_ADMISSION_EVIDENCE_FIELDS.map((field) => [field, value[field]])));
}

export function readExecutionAdmissionEvidenceManifest(manifestPath) {
  const source = readStableJsonFile(manifestPath, "execution admission evidence manifest", 1024 * 1024, { allowEmpty: false });
  const manifest = source.value;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("execution admission evidence manifest must be a fixture-keyed object");
  const base = dirname(resolve(manifestPath));
  return Object.freeze(Object.fromEntries(Object.entries(manifest).map(([fixtureId, evidence]) => {
    if (!fixtureId) throw new Error("execution admission evidence manifest contains an empty fixture identity");
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error(`${fixtureId} execution admission manifest entry must be a closed object`);
    const keys = Object.keys(evidence);
    const unknown = keys.filter((key) => !EXTERNAL_ADMISSION_MANIFEST_FIELDS.includes(key));
    const missing = EXTERNAL_ADMISSION_MANIFEST_FIELDS.filter((key) => !Object.hasOwn(evidence, key) || typeof evidence[key] !== "string" || evidence[key].length === 0);
    if (unknown.length > 0) throw new Error(`${fixtureId} execution admission manifest entry has unknown fields: ${unknown.join(", ")}`);
    if (missing.length > 0) throw new Error(`${fixtureId} execution admission manifest entry is partial; missing: ${missing.join(", ")}`);
    if (!/^sha256:[a-f0-9]{64}$/u.test(evidence.review_authority_source_digest)) throw new Error(`${fixtureId} execution admission manifest source digest is invalid`);
    return [fixtureId, Object.freeze({
      reviewAuthorityPath: resolve(base, evidence.review_authority_path),
      reviewAuthoritySourceDigest: evidence.review_authority_source_digest,
      reviewArchivePath: resolve(base, evidence.review_archive_path),
    })];
  })));
}

function frozenAuthoritySources(root, fixtureId, paths) {
  const admissionSource = readJsonArtifact(paths.admission, `${fixtureId} frozen admission record`);
  const requirementSource = readJsonArtifact(paths.requirement, `${fixtureId} frozen requirement record`);
  const referenceSource = readJsonArtifact(paths.reference, `${fixtureId} evaluator public reference`);
  const freezeSource = readJsonArtifact(paths.freeze, `${fixtureId} scoring-input freeze manifest`);
  return {
    root,
    frozenAdmissionRecord: admissionSource.value,
    frozenAdmissionSource: { path: relative(root, paths.admission), bytes: admissionSource.bytes },
    requirementRecord: requirementSource.value,
    requirementRecordSource: { path: relative(root, paths.requirement), bytes: requirementSource.bytes },
    evaluatorReference: referenceSource.value,
    scoringInputFreezeManifest: freezeSource.value,
    scoringInputFreezeManifestSource: { path: relative(root, paths.freeze), bytes: freezeSource.bytes },
  };
}

function readRepositoryRevision(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch (error) {
    throw new Error(`portfolio execution admission requires a Git repository revision: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertResolvedFixtureIdentity(resolved, fixtureId) {
  if (resolved.fixture_id !== fixtureId) throw new Error(`${fixtureId} effective execution authority contains a cross-fixture transplant`);
  return resolved;
}

export function resolvePortfolioExecutionAdmission({ root, fixture, repositoryRevision = readRepositoryRevision(root), externalAdmissionEvidence = null }) {
  if (fixture.suite === "calibration") return Object.freeze({ fixture_id: fixture.id, authority_mode: "calibration", effective_admission_status: "calibration_only", execution_eligible: true });
  const evidence = normalizeExternalAdmissionEvidence(externalAdmissionEvidence, fixture.id);
  const paths = fixtureAuthorityPaths(root, fixture.id);
  if (Object.values(paths).slice(1).some((path) => !existsSync(path))) {
    if (evidence) throw new Error(`${fixture.id} external admission evidence cannot resolve missing frozen production authority`);
    return Object.freeze({ fixture_id: fixture.id, authority_mode: "not_admitted", effective_admission_status: "authority_missing", execution_eligible: false, authority_identity_digest: canonicalDigest({ fixture_id: fixture.id, status: "authority_missing" }) });
  }
  const authoritySources = frozenAuthoritySources(root, fixture.id, paths);
  const repositoryOverlay = resolveRepositoryAdmissionDecision({ root, repositoryRevision, fixtureId: fixture.id });
  if (!repositoryOverlay) {
    if (evidence) throw new Error(`${fixture.id} external review evidence cannot create admission without a repository-managed overlay`);
    const resolved = assertResolvedFixtureIdentity(resolveEffectiveAdmissionAuthority(authoritySources), fixture.id);
    const executionEligible = resolved.authority_mode === "legacy_admitted_record" && resolved.effective_admission_status === "admitted";
    return Object.freeze({
      fixture_id: fixture.id,
      authority_mode: resolved.authority_mode,
      effective_admission_status: resolved.effective_admission_status,
      execution_eligible: executionEligible,
      authority_identity_digest: computeEffectiveAdmissionAuthorityDigest(resolved),
      resolved_authority: resolved,
    });
  }
  if (repositoryOverlay.decision.fixture_id !== fixture.id) throw new Error(`${fixture.id} repository admission overlay contains a cross-fixture transplant`);
  if (repositoryOverlay.decision.decision_status !== "admitted") {
    if (evidence) throw new Error(`${fixture.id} repository admission overlay does not record admitted status`);
    const resolved = assertResolvedFixtureIdentity(resolveEffectiveAdmissionAuthority({ ...authoritySources, decisionOverlay: repositoryOverlay.decision }), fixture.id);
    return Object.freeze({
      fixture_id: fixture.id,
      authority_mode: resolved.authority_mode,
      effective_admission_status: resolved.effective_admission_status,
      execution_eligible: false,
      authority_identity_digest: computeEffectiveAdmissionAuthorityDigest(resolved),
      resolved_authority: resolved,
    });
  }
  if (!evidence) {
    const resolved = assertResolvedFixtureIdentity(resolveEffectiveAdmissionAuthority(authoritySources), fixture.id);
    return Object.freeze({
      fixture_id: fixture.id,
      authority_mode: "not_admitted",
      effective_admission_status: "review_evidence_missing",
      execution_eligible: false,
      authority_identity_digest: canonicalDigest({
        fixture_id: fixture.id,
        repository_overlay_path: repositoryOverlay.path,
        repository_overlay_raw_digest: repositoryOverlay.raw_byte_digest,
        repository_revision: repositoryOverlay.repository_revision,
        frozen_authority_digest: computeEffectiveAdmissionAuthorityDigest(resolved),
        status: "review_evidence_missing",
      }),
      resolved_authority: resolved,
    });
  }
  const resolved = resolveEffectiveAdmissionAuthorityFromRepositoryOverlayFiles({
    ...authoritySources,
    repositoryDecision: repositoryOverlay.decision,
    ...evidence,
  });
  assertResolvedFixtureIdentity(resolved, fixture.id);
  const executionEligible = resolved.authority_mode === "legacy_admitted_record" || resolved.authority_mode === "admitted_overlay"
    ? resolved.effective_admission_status === "admitted"
    : false;
  return Object.freeze({
    fixture_id: fixture.id,
    authority_mode: resolved.authority_mode,
    effective_admission_status: resolved.effective_admission_status,
    execution_eligible: executionEligible,
    authority_identity_digest: computeEffectiveAdmissionAuthorityDigest(resolved),
    resolved_authority: resolved,
  });
}

function validateEvidenceInventory(config, executionAdmissionEvidenceByFixture) {
  if (executionAdmissionEvidenceByFixture === null || executionAdmissionEvidenceByFixture === undefined) return Object.freeze({});
  if (!executionAdmissionEvidenceByFixture || typeof executionAdmissionEvidenceByFixture !== "object" || Array.isArray(executionAdmissionEvidenceByFixture)) throw new Error("execution admission evidence inventory must be a fixture-keyed object");
  const fixtureIds = new Set(config.fixtures.filter(({ suite }) => suite !== "calibration").map(({ id }) => id));
  const unknown = Object.keys(executionAdmissionEvidenceByFixture).filter((fixtureId) => !fixtureIds.has(fixtureId));
  if (unknown.length > 0) throw new Error(`execution admission evidence contains unknown fixture identities: ${unknown.join(", ")}`);
  return executionAdmissionEvidenceByFixture;
}

function resolvePortfolioExecutionContext({ root, config, repositoryRevision, executionAdmissionEvidenceByFixture = null }) {
  const evidenceInventory = validateEvidenceInventory(config, executionAdmissionEvidenceByFixture);
  const admissions = config.fixtures.map((fixture) => resolvePortfolioExecutionAdmission({ root, fixture, repositoryRevision, externalAdmissionEvidence: evidenceInventory[fixture.id] ?? null }));
  const resolvedAuthorities = admissions.map(({ resolved_authority }) => resolved_authority).filter(Boolean);
  const resolvedAuthoritySetDigest = computeEffectiveAdmissionAuthoritySetDigest(resolvedAuthorities);
  const authoritySetDigest = canonicalDigest({
    resolved_authority_set_digest: resolvedAuthoritySetDigest,
    fixtures: admissions.map(({ fixture_id, authority_mode, effective_admission_status, execution_eligible, authority_identity_digest = null }) => ({ fixture_id, authority_mode, effective_admission_status, execution_eligible, authority_identity_digest })),
  });
  return { admissions, authoritySetDigest };
}

export function resolvePortfolioExecutionFixtures({ root, config, repositoryRevision = readRepositoryRevision(root), executionAdmissionEvidenceByFixture = null }) {
  const context = resolvePortfolioExecutionContext({ root, config, repositoryRevision, executionAdmissionEvidenceByFixture });
  const eligibleIds = new Set(context.admissions.filter(({ execution_eligible }) => execution_eligible).map(({ fixture_id }) => fixture_id));
  return config.fixtures.filter(({ id }) => eligibleIds.has(id));
}

export function buildPortfolioPlan({ root, config, repositoryRevision, seed, executionAdmissionEvidenceByFixture = null }) {
  const configSha256 = sha256(readFileSync(config._configPath));
  const protocolSha256 = sha256(readFileSync(config._protocolPath));
  const seedSha256 = sha256(seed);
  const executionContext = resolvePortfolioExecutionContext({ root, config, repositoryRevision, executionAdmissionEvidenceByFixture });
  const executionAdmissionAuthorityDigest = executionContext.authoritySetDigest;
  const planId = computePortfolioPlanId({ configSha256, protocolSha256, repositoryRevision, seed, executionAdmissionAuthorityDigest });
  const planDigest = planId.slice("plan-".length);
  const blocks = [];
  const eligibleIds = new Set(executionContext.admissions.filter(({ execution_eligible }) => execution_eligible).map(({ fixture_id }) => fixture_id));
  const executionFixtures = config.fixtures.filter(({ id }) => eligibleIds.has(id));
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
    execution_admission_authority_digest: executionAdmissionAuthorityDigest,
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
