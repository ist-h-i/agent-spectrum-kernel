#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVerificationCommandContract } from "./ask-benchmark-command-evidence.mjs";
import { assertNoSymlinkPathSegments } from "./ask-benchmark-atomic-publication.mjs";
import { assertStableFileEvidence, readStableFile } from "./ask-benchmark-stable-file.mjs";
import { validatePortfolioFoundation } from "./ask-benchmark.mjs";
import { validateSchemaValue } from "./json-schema-validation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONFIG_PATH = "benchmarks/adaptive-portfolio.config.json";
const CONFIG_SCHEMA_PATH = "benchmarks/schemas/portfolio-config.schema.json";
const VERIFICATION_SCHEMA_PATH = "benchmarks/schemas/portfolio-verification-command-contract.schema.json";
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
}

function resolveRepositoryFile(root, path, label) {
  if (
    typeof path !== "string"
    || path.length === 0
    || posix.isAbsolute(path)
    || win32.isAbsolute(path)
    || path.includes("\\")
    || posix.normalize(path) !== path
    || path === ".."
    || path.startsWith("../")
  ) throw new Error(`${label} must be a portable repository-relative path`);
  const absolute = resolve(root, path);
  const repositoryRelative = relative(root, absolute);
  if (repositoryRelative === "" || repositoryRelative === ".." || repositoryRelative.startsWith(`..${sep}`)) throw new Error(`${label} escapes the repository`);
  return absolute;
}

function readArtifact(root, path, label) {
  return readStableFile(resolveRepositoryFile(root, path, label), label, MAX_ARTIFACT_BYTES, { allowEmpty: false });
}

function serialized(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

export function buildPortfolioRuntimeRegistrationProjection({ root = ROOT, configPath = DEFAULT_CONFIG_PATH } = {}) {
  const repositoryRoot = resolve(root);
  const configAbsolute = resolveRepositoryFile(repositoryRoot, configPath, "adaptive portfolio config path");
  const configSnapshot = readStableFile(configAbsolute, "adaptive portfolio config", MAX_CONFIG_BYTES, { allowEmpty: false });
  const current = parseJson(configSnapshot.bytes, "adaptive portfolio config");
  const configSchemaSnapshot = readArtifact(repositoryRoot, CONFIG_SCHEMA_PATH, "portfolio config Schema");
  const configSchema = parseJson(configSchemaSnapshot.bytes, "portfolio config Schema");
  const configSchemaErrors = validateSchemaValue(current, configSchema, { baseDir: dirname(configSchemaSnapshot.path), rootSchema: configSchema });
  if (configSchemaErrors.length > 0) throw new Error(`adaptive portfolio config failed JSON Schema validation:\n${configSchemaErrors.join("\n")}`);
  const verificationSchemaSnapshot = readArtifact(repositoryRoot, VERIFICATION_SCHEMA_PATH, "verification command contract Schema");
  const verificationSchema = parseJson(verificationSchemaSnapshot.bytes, "verification command contract Schema");
  const fixtureIds = current.fixtures.map(({ id }) => id);
  if (new Set(fixtureIds).size !== fixtureIds.length) throw new Error("adaptive portfolio config contains duplicate fixture IDs");

  const projected = structuredClone(current);
  const changes = [];
  const artifactSnapshots = [
    { snapshot: configSchemaSnapshot, label: "portfolio config Schema" },
    { snapshot: verificationSchemaSnapshot, label: "verification command contract Schema" },
  ];
  for (const fixture of projected.fixtures) {
    const input = readArtifact(repositoryRoot, fixture.input_manifest_path, `${fixture.id} input manifest`);
    artifactSnapshots.push({ snapshot: input, label: `${fixture.id} input manifest` });
    const inputManifest = parseJson(input.bytes, `${fixture.id} input manifest`);
    if (!Object.hasOwn(inputManifest.fixtures ?? {}, fixture.id)) throw new Error(`${fixture.id} is absent from its input manifest`);
    const inputDigest = sha256(input.bytes);
    const before = {
      input_manifest_sha256: fixture.input_manifest_sha256,
      verification_command_contract_sha256: fixture.verification_command_contract?.sha256 ?? null,
    };
    fixture.input_manifest_sha256 = inputDigest;

    if (fixture.verification_command_contract) {
      const contractSnapshot = readArtifact(repositoryRoot, fixture.verification_command_contract.path, `${fixture.id} verification command contract`);
      artifactSnapshots.push({ snapshot: contractSnapshot, label: `${fixture.id} verification command contract` });
      const contract = validateVerificationCommandContract(
        parseJson(contractSnapshot.bytes, `${fixture.id} verification command contract`),
        { root: repositoryRoot, schema: verificationSchema },
      );
      if (contract.fixture_id !== fixture.id || contract.fixture_input_digest !== `sha256:${inputDigest}`) throw new Error(`${fixture.id} verification command contract is bound to another fixture input`);
      fixture.verification_command_contract.sha256 = sha256(contractSnapshot.bytes);
    }

    const after = {
      input_manifest_sha256: fixture.input_manifest_sha256,
      verification_command_contract_sha256: fixture.verification_command_contract?.sha256 ?? null,
    };
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ fixture_id: fixture.id, before, after });
  }

  validatePortfolioFoundation(projected, configAbsolute, {
    root: repositoryRoot,
    schema: configSchema,
    verificationCommandSchema: verificationSchema,
  });

  const bytes = serialized(projected);

  return {
    configPath: configAbsolute,
    configSnapshot,
    config: projected,
    bytes,
    byteDrift: !configSnapshot.bytes.equals(bytes),
    changes,
    artifactSnapshots,
  };
}

function replaceStableConfig(projection, { beforePublish = null } = {}) {
  const parent = dirname(projection.configPath);
  assertNoSymlinkPathSegments(parent, "adaptive portfolio config parent");
  const current = readStableFile(projection.configPath, "adaptive portfolio config", MAX_CONFIG_BYTES, { allowEmpty: false });
  assertStableFileEvidence(projection.configSnapshot, current, "adaptive portfolio config");
  const mode = lstatSync(projection.configPath).mode & 0o777;
  const staging = resolve(parent, `.${basename(projection.configPath)}.runtime-registration-${randomUUID()}`);
  let descriptor;
  try {
    descriptor = openSync(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    writeFileSync(descriptor, projection.bytes);
    fchmodSync(descriptor, mode);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (beforePublish !== null) beforePublish();
    const immediatelyBeforePublish = readStableFile(projection.configPath, "adaptive portfolio config", MAX_CONFIG_BYTES, { allowEmpty: false });
    assertStableFileEvidence(projection.configSnapshot, immediatelyBeforePublish, "adaptive portfolio config");
    for (const { snapshot, label } of projection.artifactSnapshots) {
      const currentArtifact = readStableFile(snapshot.path, label, MAX_ARTIFACT_BYTES, { allowEmpty: false });
      assertStableFileEvidence(snapshot, currentArtifact, label);
    }
    renameSync(staging, projection.configPath);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(staging)) rmSync(staging, { force: true });
  }
}

export function writePortfolioRuntimeRegistrationProjection(options = {}) {
  const { beforePublish = null, ...projectionOptions } = options;
  const projection = buildPortfolioRuntimeRegistrationProjection(projectionOptions);
  if (projection.byteDrift) replaceStableConfig(projection, { beforePublish });
  const verified = buildPortfolioRuntimeRegistrationProjection(projectionOptions);
  if (verified.changes.length > 0 || !verified.configSnapshot.bytes.equals(projection.bytes)) throw new Error("adaptive portfolio runtime registration publication is not deterministic");
  return {
    status: projection.byteDrift ? "written" : "current",
    fixture_ids: projection.changes.map(({ fixture_id: fixtureId }) => fixtureId),
    config_sha256: sha256(verified.configSnapshot.bytes),
    bytes: verified.configSnapshot.bytes.length,
  };
}

export function checkPortfolioRuntimeRegistrationProjection(options = {}) {
  const projection = buildPortfolioRuntimeRegistrationProjection(options);
  return {
    status: projection.byteDrift ? "stale" : "current",
    fixture_ids: projection.changes.map(({ fixture_id: fixtureId }) => fixtureId),
    expected_config_sha256: sha256(projection.bytes),
    current_config_sha256: sha256(projection.configSnapshot.bytes),
    bytes: projection.bytes.length,
  };
}

function parseArgs(argv) {
  const args = { root: ROOT, configPath: DEFAULT_CONFIG_PATH, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--write") args.write = true;
    else if (argv[index] === "--check") args.write = false;
    else if (argv[index] === "--root") args.root = resolve(argv[++index]);
    else if (argv[index] === "--config") args.configPath = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") {
      console.log("Usage: node scripts/ask-benchmark-runtime-registration.mjs [--check | --write] [--root <repository>] [--config <repository-relative-path>]");
      process.exit(0);
    } else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = args.write
      ? writePortfolioRuntimeRegistrationProjection(args)
      : checkPortfolioRuntimeRegistrationProjection(args);
    console.log(JSON.stringify(result));
    if (!args.write && result.status !== "current") process.exitCode = 1;
  } catch (error) {
    console.error(`ask-benchmark-runtime-registration failed: ${error.message}`);
    process.exitCode = 1;
  }
}
