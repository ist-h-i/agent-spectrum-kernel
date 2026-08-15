#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepositoryAdmissionDecision } from "./ask-benchmark-admission-decision.mjs";
import { discoverAdmittedFixtureIds } from "./ask-benchmark-admitted-fixture-invariance.mjs";
import { canonicalDigest } from "./ask-benchmark-materialize.mjs";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURE_ROOT = "benchmarks/fixtures/checkpoint-b2";

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function git(root, args, options = {}) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function resolveCommit(root, revision, label) {
  try {
    return git(root, ["rev-parse", "--verify", `${revision}^{commit}`]).trim();
  } catch {
    throw new Error(`${label} is not an available commit: ${revision}`);
  }
}

function readBytesAtRevision(root, revision, path, label) {
  let bytes;
  try {
    bytes = git(root, ["show", `${revision}:${path}`], { encoding: "buffer" });
  } catch {
    throw new Error(`${label} is unavailable at ${revision}: ${path}`);
  }
  return bytes;
}

function readJsonAtRevision(root, revision, path, label) {
  const bytes = readBytesAtRevision(root, revision, path, label);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON at ${revision}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function changedPathsBetween(root, baseRevision, candidateRevision) {
  const output = git(root, ["diff", "--name-only", "-z", "--find-renames", "--find-copies", baseRevision, candidateRevision, "--"]);
  return [...new Set(output.split("\0").filter(Boolean))].sort(compareAscii);
}

function validateSourceIdentity(reference, fixtureId) {
  const identity = reference?.evaluator_source_identity;
  if (
    !identity
    || identity.base_git_revision !== reference.evaluator_revision
    || !Array.isArray(identity.source_files)
    || identity.source_files.length === 0
    || !identity.dependency_graph
  ) throw new Error(`${fixtureId} active frozen evaluator source identity is incomplete`);
  const paths = identity.source_files.map(({ path }) => path);
  if (paths.some((path) => typeof path !== "string" || path.length === 0) || new Set(paths).size !== paths.length) throw new Error(`${fixtureId} active frozen evaluator source inventory is ambiguous`);
  const sorted = [...paths].sort(compareAscii);
  if (JSON.stringify(paths) !== JSON.stringify(sorted)) throw new Error(`${fixtureId} active frozen evaluator source inventory is not canonical`);
  if (identity.source_tree_digest !== canonicalDigest(identity.source_files)) throw new Error(`${fixtureId} active frozen evaluator source inventory identity is invalid`);
  return { identity, paths };
}

export function computeEvaluatorSourceImpact({ changedRepositoryPaths, authorities }) {
  if (!Array.isArray(changedRepositoryPaths) || !Array.isArray(authorities) || authorities.length === 0) throw new Error("evaluator source impact requires changed paths and admitted authorities");
  const changed = [...new Set(changedRepositoryPaths)].sort(compareAscii);
  if (changed.some((path) => typeof path !== "string" || path.length === 0)) throw new Error("evaluator source impact changed paths are invalid");
  const fixtureIds = authorities.map(({ fixture_id: fixtureId }) => fixtureId);
  if (fixtureIds.some((fixtureId) => typeof fixtureId !== "string" || fixtureId.length === 0) || new Set(fixtureIds).size !== fixtureIds.length) throw new Error("evaluator source impact admitted authority inventory is ambiguous");
  const changedSet = new Set(changed);
  const fixtures = [...authorities].sort((left, right) => compareAscii(left.fixture_id, right.fixture_id)).map((authority) => {
    const sourcePaths = authority.source_paths;
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0 || new Set(sourcePaths).size !== sourcePaths.length) throw new Error(`${authority.fixture_id} evaluator source inventory is ambiguous`);
    const intersection = [...sourcePaths].filter((path) => changedSet.has(path)).sort(compareAscii);
    const { source_paths: _sourcePaths, ...publicAuthority } = authority;
    return Object.freeze({ ...publicAuthority, intersecting_changed_paths: intersection, affected: intersection.length > 0 });
  });
  const changedEvaluatorSourcePaths = [...new Set(fixtures.flatMap(({ intersecting_changed_paths: paths }) => paths))].sort(compareAscii);
  return Object.freeze({
    changed_repository_paths: changed,
    changed_evaluator_source_paths: changedEvaluatorSourcePaths,
    fixtures,
  });
}

export function discoverAffectedAdmittedEvaluatorSources({ root = DEFAULT_ROOT, baseRevision = "origin/main", repositoryRevision = "HEAD" } = {}) {
  const base = resolveCommit(root, baseRevision, "impact discovery base revision");
  const candidate = resolveCommit(root, repositoryRevision, "impact discovery candidate revision");
  try {
    execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", base, candidate], { stdio: "ignore" });
  } catch {
    throw new Error("impact discovery base revision is not an ancestor of the candidate revision");
  }
  const changedRepositoryPaths = changedPathsBetween(root, base, candidate);
  const fixtureIds = discoverAdmittedFixtureIds({ root, repositoryRevision: candidate });
  if (fixtureIds.length === 0) throw new Error("impact discovery found no admitted fixtures");
  const authorities = fixtureIds.map((fixtureId) => {
    const fixtureRoot = `${FIXTURE_ROOT}/${fixtureId}`;
    const resolved = resolveRepositoryAdmissionDecision({ root, repositoryRevision: candidate, fixtureId });
    if (!resolved || resolved.decision.decision_status !== "admitted") throw new Error(`${fixtureId} canonical authority does not uniquely identify an active admitted evaluator decision`);
    const reviewedRevision = resolveCommit(root, resolved.decision.reviewed_head_revision, `${fixtureId} admitted reviewed revision`);
    const referencePath = `${fixtureRoot}/evaluator-reference.json`;
    const admissionPath = resolved.decision.frozen_admission_authority?.path;
    if (admissionPath !== `${fixtureRoot}/final-admission-record.json`) throw new Error(`${fixtureId} admitted frozen authority path is ambiguous`);
    const reference = readJsonAtRevision(root, reviewedRevision, referencePath, `${fixtureId} admitted evaluator reference`);
    const admissionBytes = readBytesAtRevision(root, reviewedRevision, admissionPath, `${fixtureId} admitted final admission record`);
    const admission = readJsonAtRevision(root, reviewedRevision, admissionPath, `${fixtureId} admitted final admission record`);
    if (
      resolved.decision.evaluator?.evaluator_revision !== reference.evaluator_revision
      || resolved.decision.evaluator?.evaluator_bundle_id !== reference.evaluator_bundle_id
      || resolved.decision.evaluator?.evaluator_bundle_digest !== reference.evaluator_bundle_digest
      || resolved.decision.evaluator_public_reference_digest !== reference.public_metadata_digest
      || resolved.decision.frozen_admission_authority.raw_byte_digest !== `sha256:${createHash("sha256").update(admissionBytes).digest("hex")}`
      || resolved.decision.frozen_admission_authority.semantic_digest !== admission.admission_digest
      || admission.evaluator_source_identity?.source_tree_digest !== reference.evaluator_source_identity?.source_tree_digest
    ) throw new Error(`${fixtureId} active admission decision and frozen evaluator source authority are ambiguous`);
    const { identity, paths } = validateSourceIdentity(reference, fixtureId);
    return Object.freeze({
      fixture_id: fixtureId,
      decision_id: resolved.decision.decision_id,
      decision_revision: resolved.decision.decision_revision,
      decision_path: resolved.path,
      reviewed_head_revision: reviewedRevision,
      evaluator_revision: reference.evaluator_revision,
      source_inventory_identity: Object.freeze({
        source_tree_digest: identity.source_tree_digest,
        dependency_graph_digest: identity.dependency_graph.graph_digest,
        source_file_count: identity.source_files.length,
      }),
      source_paths: paths,
    });
  });
  const impact = computeEvaluatorSourceImpact({ changedRepositoryPaths, authorities });
  const result = {
    schema_version: "1.0.0",
    base_revision: base,
    candidate_revision: candidate,
    ...impact,
  };
  return Object.freeze({ ...result, impact_digest: canonicalDigest(result) });
}

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, baseRevision: "origin/main", repositoryRevision: "HEAD" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--base-revision", "--repository-revision"].includes(flag) || !value) throw new Error(`unknown or incomplete argument: ${flag}`);
    if (flag === "--root") args.root = resolve(value);
    else if (flag === "--base-revision") args.baseRevision = value;
    else args.repositoryRevision = value;
    index += 1;
  }
  return args;
}

function main() {
  process.stdout.write(`${JSON.stringify(discoverAffectedAdmittedEvaluatorSources(parseArgs(process.argv.slice(2))))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
