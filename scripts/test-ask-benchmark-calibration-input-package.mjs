import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CALIBRATION_SOURCE_BINDINGS } from "./ask-benchmark-calibration-source.mjs";
import { computeAdmissionDecisionDigest, computeAdmissionDecisionId } from "./ask-benchmark-admission-decision.mjs";
import { createSuccessorSyntheticAdmittedCalibrationPackages } from "./test-prompt-successor-scoring-fixtures.mjs";
import {
  CALIBRATION_PACKAGE_INPUT_PATHS, inspectCalibrationInputPackage, parseCalibrationInputPackageArgs,
} from "./ask-benchmark-calibration-input-package.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const byteDigest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const read = path => JSON.parse(readFileSync(path, "utf8"));
const ENTRY = "scripts/ask-benchmark-calibration-input-package.mjs";
const SOURCE_FILES = [ENTRY, "scripts/ask-benchmark-calibration-source.mjs",
  "scripts/ask-benchmark-atomic-publication.mjs", "scripts/ask-benchmark-duplicate-key-json.mjs",
  "scripts/ask-benchmark-stable-file.mjs", "scripts/ask-benchmark-source-session.mjs", "scripts/content-addressed-store.mjs"];
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], {
  encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
}).trim();
function write(root, path, bytes = '{"synthetic_inventory_only":true}\n') {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), bytes);
}
function commit(root) { git(root, "add", "."); git(root, "-c", "commit.gpgsign=false", "commit", "-qm", "synthetic public input inventory"); }
async function repository(callback, { sources = false } = {}) {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-calibration-package-test-"));
  const root = resolve(parent, "repository"); mkdirSync(root);
  try {
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.name", "Calibration Package Test");
    git(root, "config", "user.email", "synthetic@example.invalid");
    git(root, "config", "core.hooksPath", "/dev/null");
    write(root, "README.md", "Synthetic inventory tests only; not an evaluator or admission.\n");
    if (sources) for (const path of SOURCE_FILES) {
      mkdirSync(dirname(resolve(root, path)), { recursive: true });
      copyFileSync(resolve(ROOT, path), resolve(root, path));
    }
    commit(root);
    return await callback(root, parent);
  } finally { rmSync(parent, { recursive: true, force: true }); }
}
const first = CALIBRATION_PACKAGE_INPUT_PATHS.find(e => e.fixture_id !== null);
const entryFor = (value, path = first.path) => value.inputs.find(e => e.path === path);
function completeInventory(root) {
  // Deliberately NOT valid scoring records. Inventory presence must never grant
  // public-content verification, admission, or private-evaluator authority.
  for (const { path } of CALIBRATION_PACKAGE_INPUT_PATHS) write(root, path);
  commit(root);
}
function cli(root, ...args) {
  return spawnSync(process.execPath, [resolve(root, ENTRY), ...args], {
    cwd: root, encoding: "utf8", timeout: 120000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  });
}
function pinPublicImplementationInClone(clone) {
  const paths = ["scripts/ask-benchmark-calibration-input-package.mjs",
    "scripts/ask-benchmark-prompt-successor-scoring-inputs.mjs", "scripts/ask-benchmark-prompt-successor-repository.mjs"];
  for (const path of paths) copyFileSync(resolve(ROOT, path), resolve(clone, path));
  git(clone, "add", "--", ...paths);
  if (git(clone, "status", "--porcelain")) git(clone, "-c", "commit.gpgsign=false", "commit", "-qm", "test-only current public overlay implementation");
  return git(clone, "rev-parse", "HEAD");
}
function assertNoAuthority(report) {
  assert.equal(report.public_content_verified, false);
  assert.equal(report.private_bundle_verified, false);
  assert.equal(report.creates_admission, false);
  assert.equal(report.measured_execution_authorized, false);
  assert.equal(Object.hasOwn(report, "manifest_digest"), false);
}

test("the input inventory is closed to canonical public paths and all four source mappings", () => {
  assert.equal(CALIBRATION_PACKAGE_INPUT_PATHS.length, 43);
  assert.equal(new Set(CALIBRATION_PACKAGE_INPUT_PATHS.map(e => e.path)).size, 43);
  assert.ok(Object.isFrozen(CALIBRATION_PACKAGE_INPUT_PATHS));
  assert.ok(CALIBRATION_PACKAGE_INPUT_PATHS.every(Object.isFrozen));
  assert.deepEqual([...new Set(CALIBRATION_PACKAGE_INPUT_PATHS.map(e => e.fixture_id).filter(Boolean))], CALIBRATION_SOURCE_BINDINGS.map(([id]) => id));
  assert.ok(CALIBRATION_PACKAGE_INPUT_PATHS.every(e => !e.path.includes("/evaluator/") && !e.path.includes("private-evaluator-bundle")));
});
test("one inspection reports the complete missing inventory without writes", () => repository(root => {
  const before = git(root, "status", "--porcelain");
  const result = inspectCalibrationInputPackage({ root });
  assert.equal(result.inputs.length, 43);
  assert.ok(result.inputs.every(e => e.state === "missing"));
  assert.equal(result.input_availability, "incomplete");
  assert.equal(result.source.revision, git(root, "rev-parse", "HEAD"));
  assert.equal(result.source.tree, git(root, "rev-parse", "HEAD^{tree}"));
  assert.equal(git(root, "status", "--porcelain"), before);
  assertNoAuthority(result);
}));
test("all committed files present is explicitly not semantic validation or admission", () => repository(root => {
  completeInventory(root);
  const result = inspectCalibrationInputPackage({ root });
  assert.equal(result.input_availability, "present_not_validated");
  assert.ok(result.inputs.every(e => e.state === "present_not_validated"));
  assertNoAuthority(result);
  const text = JSON.stringify(result);
  assert.ok(!text.includes("synthetic_inventory_only") && !text.includes(root));
}));
test("uncommitted files do not become pinned input references", () => repository(root => {
  write(root, first.path);
  assert.equal(entryFor(inspectCalibrationInputPackage({ root })).state, "not_committed");
}));
test("worktree byte drift is detected against the immutable Git object", () => repository(root => {
  write(root, first.path); commit(root); write(root, first.path, '{"changed":true}\n');
  assert.equal(entryFor(inspectCalibrationInputPackage({ root })).state, "worktree_drift");
}));
test("assume-unchanged cannot hide an input byte substitution", () => repository(root => {
  write(root, first.path); commit(root); git(root, "update-index", "--assume-unchanged", first.path);
  write(root, first.path, '{"changed":true}\n');
  assert.equal(git(root, "status", "--porcelain"), "");
  assert.equal(entryFor(inspectCalibrationInputPackage({ root })).state, "worktree_drift");
}));
for (const [label, bytes] of [
  ["empty", ""], ["malformed", "{"],
  ["duplicate key", '{"secret-token":1,"secret-token":2}'],
  ["escaped duplicate key", '{"name":1,"n\\u0061me":2}'],
  ["invalid UTF-8", Buffer.from([0xff, 0xfe])],
  ["oversized", Buffer.alloc(1024 * 1024 + 1, 0x20)],
]) test(`invalid public ${label} is rejected without echoing bytes`, () => repository(root => {
  write(root, first.path, bytes); commit(root);
  const result = inspectCalibrationInputPackage({ root });
  assert.equal(entryFor(result).state, "invalid_or_unreadable");
  assert.ok(!JSON.stringify(result).includes("secret-token"));
  assertNoAuthority(result);
}));
test("a directory is not a JSON artifact", () => repository(root => {
  mkdirSync(resolve(root, first.path), { recursive: true });
  assert.equal(entryFor(inspectCalibrationInputPackage({ root })).state, "invalid_file");
}));
for (const label of ["leaf", "ancestor", "dangling"]) test(`a ${label} symlink cannot redirect an input read`, () => repository((root, parent) => {
  const outside = resolve(parent, "outside"); mkdirSync(outside);
  const target = resolve(outside, "input.json"); writeFileSync(target, '{"secret-token":"not public"}\n');
  if (label === "ancestor") symlinkSync(outside, resolve(root, "benchmarks"), "dir");
  else {
    mkdirSync(dirname(resolve(root, first.path)), { recursive: true });
    symlinkSync(label === "dangling" ? resolve(outside, "missing") : target, resolve(root, first.path));
  }
  commit(root);
  const report = inspectCalibrationInputPackage({ root });
  assert.equal(entryFor(report).state, "invalid_or_unreadable");
  assert.ok(!JSON.stringify(report).includes("secret-token"));
}));
test("multiple fixture failures are reported together", () => repository(root => {
  const second = CALIBRATION_PACKAGE_INPUT_PATHS.find(e => e.fixture_id && e.fixture_id !== first.fixture_id);
  write(root, first.path, "{"); write(root, second.path, "{"); commit(root);
  const report = inspectCalibrationInputPackage({ root });
  assert.equal(entryFor(report).state, "invalid_or_unreadable");
  assert.equal(entryFor(report, second.path).state, "invalid_or_unreadable");
  assert.equal(report.inputs.length, 43);
}));
test("Git replacement refs cannot change the reported input authority", () => repository(root => {
  write(root, first.path); commit(root); const original = git(root, "rev-parse", "HEAD");
  const originalTree = git(root, "rev-parse", "HEAD^{tree}");
  write(root, first.path, '{"replacement":true}\n'); commit(root); const replacement = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "--detach", original); git(root, "replace", original, replacement);
  const report = inspectCalibrationInputPackage({ root });
  assert.equal(report.source.tree, originalTree);
  assert.equal(entryFor(report).state, "present_not_validated");
}));
test("an inspection result cannot mutate future inspections or manufacture a manifest", () => repository(root => {
  const firstRead = inspectCalibrationInputPackage({ root });
  firstRead.inputs[0].state = "admitted"; firstRead.public_content_verified = true;
  const secondRead = inspectCalibrationInputPackage({ root });
  assert.equal(secondRead.inputs[0].state, "missing"); assertNoAuthority(secondRead);
}));
test("non-repositories and symlink roots are rejected", () => repository((root, parent) => {
  assert.throws(() => inspectCalibrationInputPackage({ root: parent }), { code: "CALIBRATION_PACKAGE_REPOSITORY_REJECTED" });
  symlinkSync(root, resolve(parent, "alias"), "dir");
  assert.throws(() => inspectCalibrationInputPackage({ root: resolve(parent, "alias") }), { code: "CALIBRATION_PACKAGE_REPOSITORY_REJECTED" });
}));
test("unrelated paths are not searched for private material", () => repository((root, parent) => {
  symlinkSync(resolve(parent, "private-not-supplied"), resolve(root, "private-evaluator"));
  const report = inspectCalibrationInputPackage({ root });
  assert.equal(report.inputs.length, 43); assertNoAuthority(report);
}));
test("CLI accepts only inspect and an explicit absolute assembly destination", () => {
  assert.deepEqual(parseCalibrationInputPackageArgs(["inspect"]), { command: "inspect" });
  const outputPath = resolve(realpathSync(tmpdir()), "public-manifest.json");
  assert.deepEqual(parseCalibrationInputPackageArgs(["assemble", "--output", outputPath]), { command: "assemble", outputPath });
  for (const args of [[], ["inspect", "--output", outputPath], ["assemble"], ["assemble", "--output", "relative.json"],
    ["assemble", "--output", outputPath, "--allow-pending"], ["assemble", "--private-root", outputPath],
    ["assemble", "--output", outputPath, "--output", outputPath], ["run"], ["inspect", "--root", outputPath]]) {
    assert.throws(() => parseCalibrationInputPackageArgs(args), { code: "CALIBRATION_PACKAGE_ARGUMENTS_REJECTED" });
  }
});
test("incomplete CLI inspection has a nonzero exit and no approval claim", () => repository(root => {
  const result = cli(root, "inspect"); assert.equal(result.error, undefined); assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout); assert.equal(report.inputs.length, 43); assertNoAuthority(report);
}, { sources: true }));
test("assembly refuses all missing inputs before loading scoring code and creates no output", () => repository((root, parent) => {
  const output = resolve(parent, "manifest.json");
  const result = cli(root, "assemble", "--output", output);
  assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.stdout, "");
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.code, "CALIBRATION_PACKAGE_INPUTS_INCOMPLETE"); assert.equal(failure.inputs.length, 43);
  assert.equal(existsSync(output), false); assert.equal(git(root, "status", "--porcelain"), "");
}, { sources: true }));
for (const kind of ["repository", "existing", "missing-parent", "symlink-parent"]) {
  test(`assembly rejects ${kind} output without changing any file`, () => repository((root, parent) => {
    let output;
    if (kind === "repository") output = resolve(root, "manifest.json");
    if (kind === "existing") { output = resolve(parent, "manifest.json"); writeFileSync(output, "keep-existing"); }
    if (kind === "missing-parent") output = resolve(parent, "missing", "manifest.json");
    if (kind === "symlink-parent") { symlinkSync(root, resolve(parent, "alias"), "dir"); output = resolve(parent, "alias", "manifest.json"); }
    const result = cli(root, "assemble", "--output", output);
    assert.equal(result.error, undefined); assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).code, "CALIBRATION_PACKAGE_OUTPUT_REJECTED");
    if (kind === "existing") assert.equal(readFileSync(output, "utf8"), "keep-existing");
    else assert.equal(existsSync(output), false);
    assert.equal(git(root, "status", "--porcelain"), "");
  }, { sources: true }));
}
test("linked worktrees cannot publish into external shared Git metadata", () => repository((root, parent) => {
  const worktree = resolve(parent, "linked"); git(root, "worktree", "add", "-q", "-b", "test-linked", worktree);
  const output = resolve(root, ".git", "package-output.json");
  const result = cli(worktree, "assemble", "--output", output);
  assert.equal(result.error, undefined); assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, "CALIBRATION_PACKAGE_OUTPUT_REJECTED"); assert.equal(existsSync(output), false);
}, { sources: true }));
test("unknown CLI arguments do not echo the caller's private path", () => repository((root, parent) => {
  const secretPath = resolve(parent, "private-secret-token");
  const result = cli(root, "inspect", "--private-root", secretPath);
  assert.equal(result.status, 1); assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).code, "CALIBRATION_PACKAGE_ARGUMENTS_REJECTED");
  assert.ok(!result.stderr.includes(secretPath));
}, { sources: true }));

for (const direction of ["linked-to-primary", "primary-to-linked", "linked-to-sibling"]) {
  test(`assembly rejects ${direction} worktree output before inspecting inputs`, () => repository((root, parent) => {
    const linked = resolve(parent, "linked");
    const sibling = resolve(parent, "sibling with spaces\nand newline");
    git(root, "worktree", "add", "-q", "-b", "test-linked", linked);
    git(root, "worktree", "add", "-q", "-b", "test-sibling", sibling);
    const source = direction === "primary-to-linked" ? root : linked;
    const target = direction === "linked-to-primary" ? root : direction === "primary-to-linked" ? linked : sibling;
    const output = resolve(target, "package-output.json");
    const result = cli(source, "assemble", "--output", output);
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).code, "CALIBRATION_PACKAGE_OUTPUT_REJECTED");
    assert.equal(existsSync(output), false);
    assert.ok(!result.stderr.includes(target));
    for (const checkout of [root, linked, sibling]) assert.equal(git(checkout, "status", "--porcelain"), "");
  }, { sources: true }));
}
test("a similarly prefixed external directory remains a valid output boundary", () => repository((root, parent) => {
  const linked = resolve(parent, "linked");
  git(root, "worktree", "add", "-q", "-b", "test-linked", linked);
  const evidence = resolve(parent, "linked-evidence"); mkdirSync(evidence);
  const output = resolve(evidence, "manifest.json");
  const result = cli(linked, "assemble", "--output", output);
  assert.equal(result.error, undefined); assert.equal(result.status, 1);
  // Passing the output guard is not positive scoring-chain validation.
  assert.equal(JSON.parse(result.stderr).code, "CALIBRATION_PACKAGE_INPUTS_INCOMPLETE");
  assert.equal(existsSync(output), false);
  for (const checkout of [root, linked]) assert.equal(git(checkout, "status", "--porcelain"), "");
}, { sources: true }));
test("case aliases cannot bypass a registered worktree boundary", t => repository((root, parent) => {
  const linked = resolve(parent, "linked");
  git(root, "worktree", "add", "-q", "-b", "test-linked", linked);
  const alias = resolve(parent, "REPOSITORY");
  if (!existsSync(alias)) { t.skip("requires a case-insensitive filesystem"); return; }
  const actual = lstatSync(root, { bigint: true });
  const aliased = lstatSync(alias, { bigint: true });
  assert.deepEqual([aliased.dev, aliased.ino], [actual.dev, actual.ino]);
  const output = resolve(alias, "package-output.json");
  const result = cli(linked, "assemble", "--output", output);
  assert.equal(result.error, undefined); assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, "CALIBRATION_PACKAGE_OUTPUT_REJECTED");
  assert.equal(existsSync(output), false);
  for (const checkout of [root, linked]) assert.equal(git(checkout, "status", "--porcelain"), "");
}, { sources: true }));

test("synthetic admitted public packages assemble and reopen through the real successor consumer", () => {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-calibration-positive-integration-"));
  const clone = resolve(parent, "checkout");
  try {
    const baseRevision = git(ROOT, "rev-parse", "HEAD");
    git(ROOT, "clone", "--no-hardlinks", "--no-checkout", ROOT, clone);
    git(clone, "checkout", "--detach", baseRevision);
    git(clone, "config", "user.name", "Calibration Positive Integration");
    git(clone, "config", "user.email", "synthetic@example.invalid");
    git(clone, "config", "core.hooksPath", "/dev/null");
    const sourceRevision = pinPublicImplementationInClone(clone);

    const generated = createSuccessorSyntheticAdmittedCalibrationPackages({ root: clone, revision: sourceRevision });
    assert.deepEqual(generated.fixtures.map(({ fixture_id, source_fixture_id }) => [fixture_id, source_fixture_id]),
      CALIBRATION_SOURCE_BINDINGS.map(([fixtureId, sourceId]) => [fixtureId, sourceId]));
    const fixturePaths = CALIBRATION_SOURCE_BINDINGS.map(([fixtureId]) => `benchmarks/fixtures/checkpoint-b2/${fixtureId}`);
    git(clone, "add", "--", ...fixturePaths);
    git(clone, "-c", "commit.gpgsign=false", "commit", "-qm", "test-only admitted calibration public authority");
    const packageRevision = git(clone, "rev-parse", "HEAD");
    assert.equal(git(clone, "rev-parse", "HEAD^"), sourceRevision);
    assert.equal(git(clone, "status", "--porcelain"), "");

    const output = resolve(parent, "assembled-scoring-input-manifest.json");
    const assembled = cli(clone, "assemble", "--output", output);
    assert.equal(assembled.error, undefined);
    assert.equal(assembled.status, 0, assembled.stderr || assembled.stdout);
    assert.equal(assembled.stderr, "");
    assert.equal(existsSync(output), true);
    const report = JSON.parse(assembled.stdout);
    assert.equal(report.source.revision, packageRevision);
    assert.equal(report.public_content_verified, true);
    assert.equal(report.private_bundle_verified, false);
    assert.equal(report.creates_admission, false);
    assert.equal(report.measured_execution_authorized, false);
    assert.equal(report.created, true);

    const worker = `
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.ASK_SYNTHETIC_CALIBRATION_ROOT;
const manifestPath = process.env.ASK_SYNTHETIC_CALIBRATION_MANIFEST;
const load = path => import(pathToFileURL(resolve(root, path)).href);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const { prepareSuccessorFromRepository } = await load("scripts/ask-benchmark-prompt-successor-repository.mjs");
const { syntheticRuntime } = await load("scripts/test-prompt-successor-fixtures.mjs");
const { openSuccessorScoringInputs, inspectSuccessorScoringInputs } = await load("scripts/ask-benchmark-prompt-successor-scoring-inputs.mjs");
const preparation = await prepareSuccessorFromRepository({
  root,
  runtime: syntheticRuntime(),
  seed: "synthetic-admitted-calibration-package",
  changeReason: "Synthetic public assembly and reopen regression only; no measured execution authority.",
  scoringInputManifestDigest: manifest.manifest_digest,
});

const handle = await openSuccessorScoringInputs({ preparation, manifestPath, root });
process.stdout.write(JSON.stringify({
  preparation_implementation: preparation.implementation,
  inspection: inspectSuccessorScoringInputs(handle, preparation),
}));
`;
    const reopened = spawnSync(process.execPath, ["--input-type=module", "--eval", worker], {
      cwd: clone, encoding: "utf8", timeout: 240000, maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
        ASK_SYNTHETIC_CALIBRATION_ROOT: clone, ASK_SYNTHETIC_CALIBRATION_MANIFEST: output,
      },
    });
    assert.equal(reopened.error, undefined, reopened.error?.message);
    assert.equal(reopened.status, 0, reopened.stderr || reopened.stdout);
    assert.equal(reopened.stderr, "");
    const reopenedEvidence = JSON.parse(reopened.stdout);
    assert.equal(reopenedEvidence.preparation_implementation.revision, packageRevision);
    assert.equal(reopenedEvidence.inspection.manifest_digest, report.manifest_digest);
    assert.deepEqual(reopenedEvidence.inspection.fixtures.map(({ fixture_id, source_fixture_id, admission_status }) => [fixture_id, source_fixture_id, admission_status]),
      CALIBRATION_SOURCE_BINDINGS.map(([fixtureId, sourceId]) => [fixtureId, sourceId, "admitted"]));
    assert.equal(reopenedEvidence.inspection.private_bundle_verified, false);
    assert.equal(reopenedEvidence.inspection.creates_admission, false);
    assert.equal(reopenedEvidence.inspection.measured_execution_authorized, false);
    assert.equal(git(clone, "status", "--porcelain"), "");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
test("synthetic pending public packages pin repository overlays before reopening without private review access", () => {
  const parent = mkdtempSync(resolve(realpathSync(tmpdir()), "ask-calibration-overlay-integration-"));
  const clone = resolve(parent, "checkout");
  try {
    const baseRevision = git(ROOT, "rev-parse", "HEAD");
    git(ROOT, "clone", "--no-hardlinks", "--no-checkout", ROOT, clone);
    git(clone, "checkout", "--detach", baseRevision);
    git(clone, "config", "user.name", "Calibration Overlay Integration");
    git(clone, "config", "user.email", "synthetic@example.invalid");
    git(clone, "config", "core.hooksPath", "/dev/null");
    const sourceRevision = pinPublicImplementationInClone(clone);
    createSuccessorSyntheticAdmittedCalibrationPackages({ root: clone, revision: sourceRevision, admissionStatus: "admission_pending" });
    const fixturePaths = CALIBRATION_SOURCE_BINDINGS.map(([fixtureId]) => `benchmarks/fixtures/checkpoint-b2/${fixtureId}`);
    git(clone, "add", "--", ...fixturePaths);
    git(clone, "-c", "commit.gpgsign=false", "commit", "-qm", "test-only pending calibration public authority");
    const reviewedRevision = git(clone, "rev-parse", "HEAD");
    for (const [fixtureId] of CALIBRATION_SOURCE_BINDINGS) {
      const directory = `benchmarks/fixtures/checkpoint-b2/${fixtureId}`;
      const artifact = file => {
        const path = `${directory}/${file}`;
        return { path, value: read(resolve(clone, path)), raw_byte_digest: byteDigest(readFileSync(resolve(clone, path))) };
      };
      const admission = artifact("final-admission-record.json");
      const requirement = artifact("requirement-record.json");
      const freeze = artifact("scoring-input-freeze-manifest.json");
      const reference = artifact("evaluator-reference.json");
      const reviewBytes = Buffer.from(`synthetic review archive for ${fixtureId}\n`);
      const base = {
        schema_version: "1.0.0", schema_path: "benchmarks/schemas/portfolio-admission-decision.schema.json",
        program: "adaptive_ask_portfolio_admission_decision", decision_revision: 1,
        fixture_id: fixtureId, decision_status: "admitted", review_status: "approved",
        author_self_approval: false, reviewer_type: "independent_agent",
        reviewer_record_id: `synthetic-test-${fixtureId}`, reviewer_count: 1,
        reviewed_at: "2026-01-01T00:00:00.000Z", reviewed_repository: "ist-h-i/agent-spectrum-kernel",
        reviewed_pull_request: 999999, reviewed_head_revision: reviewedRevision,
        blocking_finding_count: 0,
        review_evidence: { archive_sha256: byteDigest(reviewBytes), archive_bytes: reviewBytes.length },
        evaluator: {
          evaluator_revision: reference.value.evaluator_revision,
          evaluator_bundle_id: reference.value.evaluator_bundle_id,
          evaluator_bundle_digest: reference.value.evaluator_bundle_digest,
          evaluator_bundle_bytes: admission.value.evaluator_byte_count,
        },
        evaluator_public_reference_digest: reference.value.public_metadata_digest,
        frozen_admission_authority: {
          path: admission.path, raw_byte_digest: admission.raw_byte_digest,
          semantic_digest: admission.value.admission_digest,
          requirement_authority_digest: admission.value.requirement_authority_digest,
        },
        frozen_requirement_record: {
          path: requirement.path, raw_byte_digest: requirement.raw_byte_digest,
          record_digest: requirement.value.requirement_record_digest,
          set_digest: requirement.value.requirement_set_digest,
        },
        frozen_scoring_input_manifest: {
          path: freeze.path, raw_byte_digest: freeze.raw_byte_digest,
          semantic_digest: freeze.value.manifest_digest,
        },
      };
      const decisionWithId = { ...base, decision_id: computeAdmissionDecisionId(base) };
      const decision = { ...decisionWithId, decision_digest: computeAdmissionDecisionDigest(decisionWithId) };
      write(clone, `benchmarks/fixtures/admission-decision/${fixtureId}-synthetic-decision.json`, `${JSON.stringify(decision)}\n`);
    }
    git(clone, "add", "--", "benchmarks/fixtures/admission-decision");
    git(clone, "-c", "commit.gpgsign=false", "commit", "-qm", "test-only admission decision overlays");
    const packageRevision = git(clone, "rev-parse", "HEAD");
    const output = resolve(parent, "scoring-input-manifest.json");
    const assembled = cli(clone, "assemble", "--output", output);
    assert.equal(assembled.error, undefined);
    assert.equal(assembled.status, 0, assembled.stderr || assembled.stdout);
    const manifest = read(output);
    assert.ok(manifest.fixtures.every(entry => entry.admission_overlay?.decision_revision === 1));
    const worker = `
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.ASK_SYNTHETIC_CALIBRATION_ROOT;
const manifestPath = process.env.ASK_SYNTHETIC_CALIBRATION_MANIFEST;
const load = path => import(pathToFileURL(resolve(root, path)).href);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const { prepareSuccessorFromRepository } = await load("scripts/ask-benchmark-prompt-successor-repository.mjs");
const { syntheticRuntime } = await load("scripts/test-prompt-successor-fixtures.mjs");
const { openSuccessorScoringInputs, inspectSuccessorScoringInputs } = await load("scripts/ask-benchmark-prompt-successor-scoring-inputs.mjs");
const preparation = await prepareSuccessorFromRepository({ root, runtime: syntheticRuntime(), seed: "synthetic-overlay-calibration-package",
  changeReason: "Synthetic public overlay binding only; no external review, private evaluator or execution.",
  scoringInputManifestDigest: manifest.manifest_digest });
const handle = await openSuccessorScoringInputs({ preparation, manifestPath, root });
const inspection = inspectSuccessorScoringInputs(handle, preparation);
const overlayPath = resolve(root, manifest.fixtures[0].admission_overlay.path);
const original = readFileSync(overlayPath);
writeFileSync(overlayPath, Buffer.concat([original, Buffer.from(" ")]));
let driftRejected = false;
try { inspectSuccessorScoringInputs(handle, preparation); } catch { driftRejected = true; }
writeFileSync(overlayPath, original);
if (!driftRejected) throw new Error("post-open admission overlay drift was accepted");
process.stdout.write(JSON.stringify({ ...inspection, post_open_overlay_drift_rejected: driftRejected }));
`;
    const reopened = spawnSync(process.execPath, ["--input-type=module", "--eval", worker], {
      cwd: clone, encoding: "utf8", timeout: 240000, maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
        ASK_SYNTHETIC_CALIBRATION_ROOT: clone, ASK_SYNTHETIC_CALIBRATION_MANIFEST: output },
    });
    assert.equal(reopened.error, undefined, reopened.error?.message);
    assert.equal(reopened.status, 0, reopened.stderr || reopened.stdout);
    const inspection = JSON.parse(reopened.stdout);
    assert.equal(inspection.manifest_digest, manifest.manifest_digest);
    assert.deepEqual(inspection.fixtures.map(entry => [entry.admission_status, entry.effective_admission_status, entry.overlay_decision_status]),
      CALIBRATION_SOURCE_BINDINGS.map(() => ["admission_pending", "review_evidence_missing", "admitted"]));
    assert.equal(inspection.private_bundle_verified, false);
    assert.equal(inspection.measured_execution_authorized, false);
    assert.equal(inspection.post_open_overlay_drift_rejected, true);
    assert.equal(git(clone, "rev-parse", "HEAD"), packageRevision);
    assert.equal(git(clone, "status", "--porcelain"), "");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
