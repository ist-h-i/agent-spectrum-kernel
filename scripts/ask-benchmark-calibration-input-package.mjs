#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAtomicOutputAbsent } from "./ask-benchmark-atomic-publication.mjs";
import { readStableJsonFile } from "./ask-benchmark-duplicate-key-json.mjs";
import { assertStableFileEvidence } from "./ask-benchmark-stable-file.mjs";
import { pinSourceSession } from "./ask-benchmark-source-session.mjs";
import {
  assertNoSymlinkPathSegments, stableCanonicalJson, writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";
import {
  CALIBRATION_INPUT_MANIFEST_PATH, CALIBRATION_SOURCE_BINDINGS, assertSuccessorCalibrationConfig,
} from "./ask-benchmark-calibration-source.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_BYTES = 1024 * 1024;
const COMMON = Object.freeze({
  execution_config: "benchmarks/prompt-successor-execution.config.json",
  input_manifest: CALIBRATION_INPUT_MANIFEST_PATH,
  catalog: "benchmarks/portfolio-catalog.json",
  policy_manifest: "benchmarks/portfolio-policy-manifest.json",
  scoring_policy: "benchmarks/portfolio-scoring-policy.json",
  admission_policy: "benchmarks/portfolio-admission-policy.json",
  lineage_policy: "benchmarks/portfolio-lineage-policy.json",
});
const FIXTURE_FILES = Object.freeze({
  admission_record: "final-admission-record.json",
  requirement_record: "requirement-record.json",
  output_contract: "output-contract.json",
  evaluator_public_reference: "evaluator-reference.json",
  freeze_manifest: "scoring-input-freeze-manifest.json",
  metadata: "metadata.json",
  evidence_map: "evidence-map.json",
  verification_command_contract: "verification-command-contract.json",
  evaluator_authority_manifest: "evaluator-authority-manifest.json",
});
export const CALIBRATION_PACKAGE_INPUT_PATHS = Object.freeze([
  ...Object.entries(COMMON).map(([role, path]) => Object.freeze({ fixture_id: null, role, path })),
  ...CALIBRATION_SOURCE_BINDINGS.flatMap(([fixture_id]) => Object.entries(FIXTURE_FILES).map(([role, file]) =>
    Object.freeze({ fixture_id, role, path: `benchmarks/fixtures/checkpoint-b2/${fixture_id}/${file}` }))),
]);
const sourceSession = pinSourceSession(ROOT, [
  "scripts/ask-benchmark-calibration-input-package.mjs",
  "scripts/ask-benchmark-calibration-source.mjs",
  "scripts/ask-benchmark-admitted-fixture-invariance.mjs",
  "scripts/ask-benchmark-atomic-publication.mjs",
  "scripts/ask-benchmark-duplicate-key-json.mjs",
  "scripts/ask-benchmark-stable-file.mjs",
  "scripts/ask-benchmark-source-session.mjs",
  "scripts/content-addressed-store.mjs",
]);

function reject(code, inputs = []) {
  const error = new Error(code);
  error.code = code;
  error.inputs = inputs;
  throw error;
}
function git(root, args, encoding = "utf8") {
  return execFileSync("git", ["--no-replace-objects", "-C", root, ...args], {
    encoding, timeout: 10000, maxBuffer: 4 * MAX_BYTES, stdio: ["ignore", "pipe", "pipe"],
  });
}
function identity(root) {
  try {
    assertNoSymlinkPathSegments(root, "package repository");
    if (realpathSync(root) !== resolve(root)
        || realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== resolve(root)) {
      reject("CALIBRATION_PACKAGE_REPOSITORY_REJECTED");
    }
    const revision = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
    const tree = git(root, ["rev-parse", "--verify", `${revision}^{tree}`]).trim();
    if (!/^[a-f0-9]{40}$/u.test(revision) || !/^[a-f0-9]{40}$/u.test(tree)) reject("CALIBRATION_PACKAGE_REPOSITORY_REJECTED");
    return { revision, tree };
  } catch { reject("CALIBRATION_PACKAGE_REPOSITORY_REJECTED"); }
}
function same(actual, expected, code) {
  if (stableCanonicalJson(actual) !== stableCanonicalJson(expected)) reject(code);
}
function snapshot(root) {
  root = resolve(root);
  const source = identity(root);
  const reads = new Map();
  const inputs = CALIBRATION_PACKAGE_INPUT_PATHS.map(entry => {
    const absolute = resolve(root, entry.path);
    let state;
    try {
      assertNoSymlinkPathSegments(absolute, "package input", { allowMissingLeaf: true });
      let status;
      try { status = lstatSync(absolute); }
      catch (error) { if (error.code === "ENOENT") return { ...entry, state: "missing" }; throw error; }
      if (!status.isFile()) return { ...entry, state: "invalid_file" };
      const read = readStableJsonFile(absolute, "package input", MAX_BYTES, { allowEmpty: false });
      const tracked = git(root, ["ls-tree", source.revision, "--", entry.path]).trim();
      if (!tracked) return { ...entry, state: "not_committed" };
      if (!/^100(?:644|755) blob [a-f0-9]{40}\t/u.test(tracked)) return { ...entry, state: "invalid_file" };
      const committed = git(root, ["show", `${source.revision}:${entry.path}`], null);
      if (!read.bytes.equals(committed)) return { ...entry, state: "worktree_drift" };
      reads.set(entry.path, read);
      state = "present_not_validated";
    } catch {
      // Do not echo JSON keys, file contents, absolute paths or validator errors.
      state = "invalid_or_unreadable";
    }
    return { ...entry, state };
  });
  same(identity(root), source, "CALIBRATION_PACKAGE_SOURCE_CHANGED");
  return { root, source, inputs, reads };
}
function inspection(value) {
  return {
    source: value.source,
    input_availability: value.inputs.every(({ state }) => state === "present_not_validated") ? "present_not_validated" : "incomplete",
    inputs: value.inputs,
    public_content_verified: false,
    private_bundle_verified: false,
    creates_admission: false,
    measured_execution_authorized: false,
  };
}

/** Inventory only. Presence, even at an exact commit, never proves admission. */
export function inspectCalibrationInputPackage({ root = ROOT } = {}) {
  return inspection(snapshot(root));
}

function assertUnchanged(before) {
  const after = snapshot(before.root);
  same(after.source, before.source, "CALIBRATION_PACKAGE_SOURCE_CHANGED");
  same(after.inputs, before.inputs, "CALIBRATION_PACKAGE_INPUT_CHANGED");
  for (const [path, read] of before.reads) {
    try { assertStableFileEvidence(read, after.reads.get(path), "package input"); }
    catch { reject("CALIBRATION_PACKAGE_INPUT_CHANGED"); }
  }
}
function outputDestination(outputPath) {
  if (typeof outputPath !== "string" || !isAbsolute(outputPath)) reject("CALIBRATION_PACKAGE_OUTPUT_REJECTED");
  const absolute = resolve(outputPath);
  try {
    const protectedRoots = [ROOT,
      resolve(ROOT, git(ROOT, ["rev-parse", "--absolute-git-dir"]).trim()),
      resolve(ROOT, git(ROOT, ["rev-parse", "--git-common-dir"]).trim())];
    for (const protectedRoot of protectedRoots) {
      const path = relative(protectedRoot, absolute);
      if (path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))) {
        reject("CALIBRATION_PACKAGE_OUTPUT_REJECTED");
      }
    }
    return assertAtomicOutputAbsent(absolute, "package output");
  } catch { reject("CALIBRATION_PACKAGE_OUTPUT_REJECTED"); }
}

/**
 * Assemble only the existing public scoring-input manifest. Read no private
 * assets and invoke no model/evaluator. Actual private verification is a later,
 * separately evidenced gate, not implied by a matching public reference.
 */
export async function assembleCalibrationInputPackage(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some(key => key !== "outputPath")) reject("CALIBRATION_PACKAGE_ARGUMENTS_REJECTED");
  const output = outputDestination(options.outputPath);
  const before = snapshot(ROOT);
  const missing = before.inputs.filter(({ state }) => state !== "present_not_validated");
  if (missing.length) reject("CALIBRATION_PACKAGE_INPUTS_INCOMPLETE", missing);
  try {
    const implementation = sourceSession.assertCurrent();
    same(implementation, before.source, "CALIBRATION_PACKAGE_SOURCE_CHANGED");
    const { readSuccessorParent, readSuccessorImplementationIdentity } = await import("./ask-benchmark-prompt-successor-repository.mjs");
    same(readSuccessorImplementationIdentity(ROOT), implementation, "CALIBRATION_PACKAGE_SOURCE_CHANGED");
    const { parent } = await readSuccessorParent({ root: ROOT });
    const input = before.reads.get(COMMON.input_manifest);
    const { assertBenchmarkSchemaInstance } = await import("./ask-benchmark-schema.mjs");
    assertBenchmarkSchemaInstance(before.reads.get(COMMON.execution_config).value, {
      schemaPath: resolve(ROOT, "benchmarks/schemas/portfolio-config.schema.json"), label: "calibration execution config",
    });
    assertSuccessorCalibrationConfig(before.reads.get(COMMON.execution_config).value, { inputManifestDigest: input.rawByteDigest.slice(7) });
    for (const role of ["input_manifest", "catalog", "policy_manifest", "scoring_policy"]) {
      if (!before.reads.get(COMMON[role]).bytes.equals(git(ROOT, ["show", `${parent.source_revision}:${COMMON[role]}`], null))) {
        reject("CALIBRATION_PACKAGE_HISTORICAL_INPUT_DRIFT");
      }
    }
    const { verifyPortfolioScoringInputs } = await import("./ask-benchmark-evaluator-boundary.mjs");
    const { resolveRepositoryAdmissionDecision } = await import("./ask-benchmark-admission-decision.mjs");
    const { buildSuccessorScoringInputManifest, SUCCESSOR_SCORING_INPUT_ROLES } = await import("./ask-benchmark-prompt-successor-scoring-inputs.mjs");
    const reference = path => {
      const source = before.reads.get(path);
      return { path, raw_digest: source.rawByteDigest, bytes: source.bytes.length };
    };
    const fixtures = CALIBRATION_SOURCE_BINDINGS.map(([fixture_id, source_fixture_id]) => {
      const directory = `benchmarks/fixtures/checkpoint-b2/${fixture_id}`;
      const paths = Object.fromEntries(SUCCESSOR_SCORING_INPUT_ROLES.map(role => [role, COMMON[role] ?? `${directory}/${FIXTURE_FILES[role]}`]));
      // Preparation 1.1 binds frozen records, not a later decision overlay.
      // Refuse overlays rather than ignoring a conflicting or newer decision.
      if (resolveRepositoryAdmissionDecision({ root: ROOT, repositoryRevision: implementation.revision, fixtureId: fixture_id })) {
        reject("CALIBRATION_PACKAGE_OVERLAY_UNSUPPORTED", [{ fixture_id }]);
      }
      const validated = verifyPortfolioScoringInputs({ root: ROOT,
        catalogPath: resolve(ROOT, paths.catalog), policyManifestPath: resolve(ROOT, paths.policy_manifest), scoringPolicyPath: resolve(ROOT, paths.scoring_policy),
        admissionRecordPath: resolve(ROOT, paths.admission_record), requirementRecordPath: resolve(ROOT, paths.requirement_record),
        outputContractPath: resolve(ROOT, paths.output_contract), referencePath: resolve(ROOT, paths.evaluator_public_reference),
        freezeManifestPath: resolve(ROOT, paths.freeze_manifest), freezeManifestSourceDigest: reference(paths.freeze_manifest).raw_digest,
      });
      if (validated.admissionRecord.fixture_id !== fixture_id || validated.freezeManifest.fixture_id !== fixture_id
          || validated.freezeManifest.fixture_input_digest !== input.rawByteDigest) reject("CALIBRATION_PACKAGE_FIXTURE_MISMATCH", [{ fixture_id }]);
      if (validated.admissionRecord.admission_status !== "admitted") reject("CALIBRATION_PACKAGE_NOT_ADMITTED", [{ fixture_id }]);
      return { fixture_id, source_fixture_id, input_manifest_digest: input.rawByteDigest,
        artifacts: Object.fromEntries(SUCCESSOR_SCORING_INPUT_ROLES.map(role => [role, reference(paths[role])])) };
    });
    const { validatePublicAdmittedFixtureInvariance } = await import("./ask-benchmark-admitted-fixture-invariance.mjs");
    const invariance = validatePublicAdmittedFixtureInvariance({ root: ROOT, repositoryRevision: implementation.revision });
    if (fixtures.some(({ fixture_id }) => !invariance.fixture_ids.includes(fixture_id))) reject("CALIBRATION_PACKAGE_ADMISSION_COVERAGE");
    const manifest = buildSuccessorScoringInputManifest({ parent, executionConfig: reference(COMMON.execution_config), fixtures });
    assertUnchanged(before);
    same(sourceSession.assertCurrent(), implementation, "CALIBRATION_PACKAGE_SOURCE_CHANGED");
    same(readSuccessorImplementationIdentity(ROOT), implementation, "CALIBRATION_PACKAGE_SOURCE_CHANGED");
    // No destination is created on validation failure. Existing files are not
    // replaced, even with equal-looking or conflicting caller-supplied content.
    assertAtomicOutputAbsent(output, "package output");
    const published = writeCanonicalJsonNoReplace({ outputPath: output, artifact: manifest, label: "calibration public input manifest" });
    return { source: implementation, manifest_digest: manifest.manifest_digest,
      public_content_verified: true, private_bundle_verified: false,
      creates_admission: false, measured_execution_authorized: false, created: published.created };
  } catch (error) {
    if (error.code?.startsWith("CALIBRATION_PACKAGE_")) throw error;
    reject("CALIBRATION_PACKAGE_VALIDATION_REJECTED");
  }
}

export function parseCalibrationInputPackageArgs(args) {
  if (args.length === 1 && args[0] === "inspect") return { command: "inspect" };
  if (args.length === 3 && args[0] === "assemble" && args[1] === "--output"
      && isAbsolute(args[2])) return { command: "assemble", outputPath: args[2] };
  reject("CALIBRATION_PACKAGE_ARGUMENTS_REJECTED");
}
async function main() {
  const args = parseCalibrationInputPackageArgs(process.argv.slice(2));
  const result = args.command === "inspect"
    ? inspectCalibrationInputPackage() : await assembleCalibrationInputPackage({ outputPath: args.outputPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (args.command === "inspect" && result.input_availability === "incomplete") process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const known = typeof error.code === "string" && error.code.startsWith("CALIBRATION_PACKAGE_");
    process.stderr.write(`${JSON.stringify({ code: known ? error.code : "CALIBRATION_PACKAGE_REJECTED", inputs: known ? error.inputs : [] })}\n`);
    process.exitCode = 1;
  });
}
