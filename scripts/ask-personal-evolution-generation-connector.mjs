// One injected, supervised file-generation call. No transport, CLI, grader,
// optimizer, adoption authority or installation is created by this module.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertNoSymlinkPathSegments, canonicalDigest, putContentAddressedJson, readContentAddressedJson,
  readJsonFileStrict, readStableBytes, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { assertPersonalEvolutionFields, freezePersonalEvolutionValue } from "./ask-personal-evolution-observation.mjs";
import { importPersonalEvolutionGenerationResult, readPersonalEvolutionGenerationRequest } from "./ask-personal-evolution-generation.mjs";
import { inspectPersonalEvolution } from "./ask-personal-evolution.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const PATH = /^(?!(?:.*\/)?\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const TRUST_KEYS = ["trustedAssetAuthorityContexts", "trustedPortfolioAuthorityContexts", "trustedHighImpactApprovalGrants"];
const RESPONSE_KEYS = ["request_digest", "input_digest", "generator", "status", "files", "candidate_descriptor", "privacy"];
const RECEIPT_KEYS = ["schema_version", "object_kind", "request_object_digest", "request_digest", "input_digest",
  "observation_digest", "parent_asset", "requested_version", "generator", "provider_status", "provider_response_object_digest",
  "files", "file_inventory_status", "status", "failure_code", "import_receipt_object_digest", "candidate_asset",
  "preparation_object_digest", "model_execution", "authority_implied", "generation_effectiveness", "receipt_digest"];
const FAILURE_CODES = ["provider_exception", "provider_failed", "provider_partial", "invalid_provider_result", "import_rejected"];
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const publicFiles = files => files.map(({ path, media_type, raw_digest, byte_length, bytes_base64 }) =>
  ({ path, media_type, raw_digest, byte_length, bytes_base64 }));
const hashes = files => files.map(({ path, raw_digest }) => ({ path, raw_digest })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const inventoryOf = content => content.files.map(({ path, raw_digest, byte_length }) => ({ path, raw_digest, byte_length }));
const trustOf = value => freezePersonalEvolutionValue(structuredClone(Object.fromEntries(TRUST_KEYS.map(key => [key, value[key] ?? []]))));
const contains = (root, child) => { const path = relative(root, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)); };
const invocationPath = (storeRoot, digest) => join(storeRoot, "personal-generation-invocations", digest.slice(7));

function identity(value) {
  assertPersonalEvolutionFields(value, ["provider_id", "version", "source_revision", "implementation_digest", "execution_kind"], "generator identity");
  for (const key of ["provider_id", "version"]) assert.ok(typeof value[key] === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/u.test(value[key]), "bounded generator ID/version required");
  assert.match(value.source_revision, /^[a-f0-9]{40}$/u, "generator source revision required");
  assert.match(value.implementation_digest, DIGEST, "generator implementation digest required");
  assert.ok(["fake", "supervised_model"].includes(value.execution_kind), "generator execution kind required");
  return freezePersonalEvolutionValue(structuredClone(value));
}
function inputFor(loaded, requestObjectDigest, generator) {
  return freezePersonalEvolutionValue({ requested_action: "produce_candidate_files_only", request_object_digest: requestObjectDigest,
    request_digest: loaded.request.request_digest, observation: structuredClone(loaded.observation),
    parent_asset: structuredClone(loaded.request.blueprint.parent_asset), requested_version: loaded.request.requested_version,
    parent_files: publicFiles(loaded.parent.content.files), generator });
}
function measure(outputRoot) {
  assertNoSymlinkPathSegments(outputRoot, "generation output");
  assert.ok(lstatSync(outputRoot).isDirectory(), "generation output must be a directory");
  const files = []; let entries = 0, totalBytes = 0;
  function visit(directory, prefix = "") {
    for (const name of readdirSync(directory).sort()) {
      assert.ok(++entries <= 512, "bounded generation output inventory required");
      const path = prefix + name, full = join(directory, name);
      assert.ok(path.length <= 512 && PATH.test(path), "portable generation file path required");
      const stat = lstatSync(full);
      if (stat.isDirectory()) { visit(full, path + "/"); continue; }
      assert.ok(stat.isFile() && !stat.isSymbolicLink(), "generation output requires regular files without symlinks");
      const bytes = readStableBytes(full, "generated candidate file");
      totalBytes += bytes.length; assert.ok(totalBytes <= 512 * 1024 && files.length < 256, "bounded generation file bytes required");
      files.push({ path, raw_digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, byte_length: bytes.length });
    }
  }
  visit(outputRoot);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function validateResponse(response, input, files) {
  assertPersonalEvolutionFields(response, RESPONSE_KEYS, "provider result");
  assert.equal(response.request_digest, input.request_digest, "provider request transplant");
  assert.equal(response.input_digest, canonicalDigest(input), "provider input transplant");
  assert.ok(equal(response.generator, input.generator), "provider identity/version transplant");
  assert.ok(["completed", "failed", "partial"].includes(response.status), "unknown provider status");
  assertPersonalEvolutionFields(response.privacy, ["classification", "private_answers_included", "raw_task_history_included"], "provider privacy");
  assert.ok(response.privacy.classification === "caller_reviewed_asset_source" && response.privacy.private_answers_included === false
    && response.privacy.raw_task_history_included === false, "public asset-only provider result required");
  assert.ok(Array.isArray(response.files) && response.files.length <= 256, "bounded provider inventory required");
  for (const file of response.files) assertPersonalEvolutionFields(file, ["path", "raw_digest"], "provider file");
  assert.ok(equal(hashes(response.files), hashes(files)), "provider file inventory/hash mismatch");
  if (response.status !== "completed") { assert.equal(response.candidate_descriptor, null, "failed/partial provider cannot import a descriptor"); return; }
  assert.ok(files.length > 0 && response.candidate_descriptor, "success needs actual candidate files and descriptor");
  assert.equal(response.candidate_descriptor.source?.revision, input.generator.source_revision, "candidate generator source revision mismatch");
  assert.ok(equal(hashes(response.candidate_descriptor.content.files), hashes(files)), "candidate descriptor file inventory/hash mismatch");
}
const resultFor = (input, response) => ({ request_digest: input.request_digest, observation_digest: input.observation.observation_digest,
  parent_asset: input.parent_asset, candidate_descriptor: response.candidate_descriptor, privacy: response.privacy });

export async function runPersonalEvolutionGeneration(options) {
  const required = ["storeRoot", "requestObjectDigest", "confirmedRequestObjectDigest", "workspaceRoot", "provider"];
  assert.ok(options && required.every(key => Object.hasOwn(options, key))
    && Object.keys(options).every(key => [...required, ...TRUST_KEYS].includes(key)), "unknown or missing generation option");
  const { requestObjectDigest, confirmedRequestObjectDigest } = options;
  assert.match(requestObjectDigest, DIGEST); assert.equal(confirmedRequestObjectDigest, requestObjectDigest, "confirm exact generation request digest");
  assertPersonalEvolutionFields(options.provider, ["identity", "generate"], "generation provider");
  const fields = Object.getOwnPropertyDescriptors(options.provider);
  assert.ok(Object.hasOwn(fields.generate, "value") && Object.hasOwn(fields.identity, "value"), "provider accessors refused");
  const generate = fields.generate.value, generator = identity(fields.identity.value), trust = trustOf(options);
  assert.equal(typeof generate, "function", "explicit provider generate function required");
  const storeRoot = resolve(options.storeRoot), workspaceRoot = resolve(options.workspaceRoot);
  assertNoSymlinkPathSegments(storeRoot, "generation store"); assert.equal(realpathSync(storeRoot), storeRoot);
  assertNoSymlinkPathSegments(workspaceRoot, "generation workspace", { allowMissingLeaf: true });
  assert.ok(!contains(storeRoot, workspaceRoot) && !contains(workspaceRoot, storeRoot), "generation workspace and store must be separate");
  try { lstatSync(workspaceRoot); assert.fail("generation requires a fresh workspace"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  assert.ok(lstatSync(dirname(workspaceRoot)).isDirectory(), "workspace parent must exist");
  const loaded = readPersonalEvolutionGenerationRequest({ storeRoot, requestObjectDigest, ...trust });
  const input = inputFor(loaded, requestObjectDigest, generator), inputDigest = canonicalDigest(input);
  const invocationRoot = dirname(invocationPath(storeRoot, requestObjectDigest));
  assertNoSymlinkPathSegments(invocationRoot, "generation invocations", { allowMissingLeaf: true });
  mkdirSync(invocationRoot, { recursive: true, mode: 0o700 });
  const invocation = invocationPath(storeRoot, requestObjectDigest);
  try { mkdirSync(invocation, { mode: 0o700 }); } catch (error) {
    if (error.code === "EEXIST") throw new Error("generation request already consumed; completed/unknown invocations cannot restart"); throw error;
  }
  writeCanonicalJsonNoReplace({ outputPath: join(invocation, "request.json"),
    artifact: { request_object_digest: requestObjectDigest, input_digest: inputDigest, generator }, label: "generation invocation request" });
  mkdirSync(workspaceRoot, { mode: 0o700 });
  const outputRoot = join(workspaceRoot, "candidate"); mkdirSync(outputRoot, { mode: 0o700 });
  let response, imported = null, failureCode = null, providerStatus = "unknown", responseObjectDigest = null;
  try { response = structuredClone(await generate(Object.freeze({ input, outputRoot }))); }
  catch { failureCode = "provider_exception"; } // Never publish provider error text or raw task logs.
  let files = [], inventoryStatus = "verified";
  try { files = measure(outputRoot); } catch { inventoryStatus = "unverified"; failureCode ??= "invalid_provider_result"; }
  if (!failureCode) {
    try { canonicalDigest(response); validateResponse(response, input, files); providerStatus = response.status; }
    catch { failureCode = "invalid_provider_result"; }
  }
  if (!failureCode && providerStatus === "completed") {
    try {
      imported = importPersonalEvolutionGenerationResult({ storeRoot, sourceRoot: outputRoot, requestObjectDigest,
        result: resultFor(input, response), ...trust });
      assert.ok(equal(files, inventoryOf(readContentAddressedJson({ storeRoot, digest: imported.receipt.candidate_asset.content_digest }).value)),
        "imported candidate bytes differ from measured output");
    } catch { imported = null; failureCode = "import_rejected"; }
  } else if (!failureCode) failureCode = `provider_${providerStatus}`;
  if ([null, "provider_failed", "provider_partial"].includes(failureCode)) {
    responseObjectDigest = putContentAddressedJson({ storeRoot, artifact: response }).digest;
  }
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_generation_execution_receipt",
    request_object_digest: requestObjectDigest, request_digest: input.request_digest, input_digest: inputDigest,
    observation_digest: input.observation.observation_digest, parent_asset: input.parent_asset, requested_version: input.requested_version,
    generator, provider_status: providerStatus, provider_response_object_digest: responseObjectDigest, files,
    file_inventory_status: inventoryStatus, status: imported ? "candidate_ready" : "held", failure_code: failureCode,
    import_receipt_object_digest: imported?.receipt_object_digest ?? null, candidate_asset: imported?.receipt.candidate_asset ?? null,
    preparation_object_digest: imported?.prepared.preparation_object_digest ?? null,
    model_execution: generator.execution_kind === "fake" ? "not_applicable" : "Unknown", authority_implied: false, generation_effectiveness: "Unknown" };
  const receipt = { ...body, receipt_digest: canonicalDigest(body) };
  const saved = putContentAddressedJson({ storeRoot, artifact: receipt });
  writeCanonicalJsonNoReplace({ outputPath: join(invocation, "receipt.json"), artifact: receipt, label: "generation terminal receipt" });
  return freezePersonalEvolutionValue({ status: receipt.status, execution_receipt_object_digest: saved.digest, receipt, imported,
    authority_implied: false, generation_effectiveness: "Unknown" });
}

// Verify the durable execution/bytes relationship. This does not authenticate
// provider authorship or replace independent source, evaluation or human trust.
export function verifyPersonalEvolutionGenerationExecution(options) {
  const allowed = ["storeRoot", "requestObjectDigest", "executionReceiptObjectDigest", ...TRUST_KEYS];
  assert.ok(options && Object.keys(options).every(key => allowed.includes(key)), "unknown execution verification option");
  const { storeRoot, requestObjectDigest, executionReceiptObjectDigest } = options;
  assert.match(requestObjectDigest, DIGEST);
  const receipt = readContentAddressedJson({ storeRoot, digest: executionReceiptObjectDigest }).value;
  assertPersonalEvolutionFields(receipt, RECEIPT_KEYS, "generation execution receipt");
  const { receipt_digest, ...body } = receipt;
  assert.equal(receipt_digest, canonicalDigest(body));
  assert.equal(receipt.schema_version, "1.0.0"); assert.equal(receipt.object_kind, "personal_evolution_generation_execution_receipt");
  assert.equal(receipt.request_object_digest, requestObjectDigest); assert.equal(receipt.authority_implied, false);
  assert.equal(receipt.generation_effectiveness, "Unknown");
  const generator = identity(receipt.generator), trust = trustOf(options);
  const loaded = readPersonalEvolutionGenerationRequest({ storeRoot, requestObjectDigest, ...trust });
  const input = inputFor(loaded, requestObjectDigest, generator);
  assert.equal(receipt.request_digest, input.request_digest); assert.equal(receipt.input_digest, canonicalDigest(input));
  assert.equal(receipt.observation_digest, input.observation.observation_digest);
  assert.ok(equal(receipt.parent_asset, input.parent_asset)); assert.equal(receipt.requested_version, input.requested_version);
  assert.equal(receipt.model_execution, generator.execution_kind === "fake" ? "not_applicable" : "Unknown");
  const invocation = invocationPath(storeRoot, requestObjectDigest);
  assert.ok(equal(readJsonFileStrict(join(invocation, "request.json")),
    { request_object_digest: requestObjectDigest, input_digest: receipt.input_digest, generator }), "generation invocation transplant");
  assert.ok(equal(readJsonFileStrict(join(invocation, "receipt.json")), receipt), "generation terminal receipt drift/transplant");
  let response;
  if (receipt.provider_response_object_digest) {
    assert.equal(receipt.file_inventory_status, "verified");
    response = readContentAddressedJson({ storeRoot, digest: receipt.provider_response_object_digest }).value;
    validateResponse(response, input, receipt.files); assert.equal(receipt.provider_status, response.status);
  }
  if (receipt.status === "candidate_ready") {
    assert.ok(response && response.status === "completed" && receipt.failure_code === null && receipt.files.length > 0);
    const imported = readContentAddressedJson({ storeRoot, digest: receipt.import_receipt_object_digest }).value;
    const { receipt_digest: importedDigest, ...importedBody } = imported;
    assert.equal(importedDigest, canonicalDigest(importedBody));
    assert.equal(imported.object_kind, "personal_evolution_generation_receipt");
    assert.equal(imported.request_object_digest, requestObjectDigest); assert.equal(imported.request_digest, input.request_digest);
    assert.equal(imported.supplied_result_digest, canonicalDigest(resultFor(input, response)));
    assert.ok(equal(imported.candidate_asset, receipt.candidate_asset));
    assert.equal(imported.preparation_object_digest, receipt.preparation_object_digest);
    const checked = inspectPersonalEvolution({ storeRoot, preparationObjectDigest: receipt.preparation_object_digest, ...trust });
    assert.equal(checked.status, "candidate_ready");
    const preparation = readContentAddressedJson({ storeRoot, digest: receipt.preparation_object_digest }).value;
    const candidate = readContentAddressedJson({ storeRoot, digest: preparation.candidate_object_digest }).value;
    assert.equal(checked.candidate_digest, candidate.candidate_digest);
    assert.ok(equal(candidate.candidate_asset, receipt.candidate_asset));
    assert.equal(candidate.registry.snapshot_digest, imported.registry_snapshot_digest);
    assert.equal(receipt.candidate_asset.version, input.requested_version);
    assert.equal(receipt.candidate_asset.asset_type, input.parent_asset.asset_type);
    assert.equal(receipt.candidate_asset.stable_id, input.parent_asset.stable_id);
    assert.ok(equal(receipt.files, inventoryOf(readContentAddressedJson({ storeRoot, digest: receipt.candidate_asset.content_digest }).value)),
      "execution receipt/candidate file hashes drifted");
  } else {
    assert.equal(receipt.status, "held"); assert.ok(FAILURE_CODES.includes(receipt.failure_code));
    for (const key of ["import_receipt_object_digest", "candidate_asset", "preparation_object_digest"]) assert.equal(receipt[key], null);
    if (response) assert.equal(receipt.failure_code, `provider_${response.status}`);
  }
  return freezePersonalEvolutionValue({ status: receipt.status, receipt, authority_implied: false, generation_effectiveness: "Unknown" });
}
