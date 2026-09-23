#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest, parseJsonRejectDuplicateKeys, stableCanonicalJson,
  writeCanonicalJsonNoReplace,
} from "./content-addressed-store.mjs";
import { validateJsonSchema } from "./execution-envelope.mjs";
import {
  buildVerificationRequirements, planExactReuse, readVerificationEvidence,
} from "./verification-evidence.mjs";
import {
  VERIFICATION_SCOPED_REQUIREMENTS_PATH, currentRuntimeIdentity,
  dependencyInventory, gitTreeDigest, planScopedReuse, sealDependencyManifest,
} from "./verification-scoped-reuse.mjs";
import {
  closedObject, refreshDecisionObservations, validateCompletionPolicy,
} from "./verification-decision-core.mjs";

export const VERIFICATION_COMPLETION_POLICY_PATH = ".ask/verification-completion-policy.json";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VERIFICATION_COMPLETION_POLICY_SCHEMA_PATH = resolve(ROOT, "schemas/verification-completion-policy.schema.json");
const MAX_REVIEW_PATHS = 256;
const digestBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const same = (a, b) => stableCanonicalJson(a) === stableCanonicalJson(b);

function git(repositoryRoot, args) {
  const result = spawnSync("git", ["--no-replace-objects", "-C", repositoryRoot, ...args], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error("required Git observation unavailable");
  return result.stdout;
}
function gitJson(repositoryRoot, revision, path) {
  const bytes = git(repositoryRoot, ["show", `${revision}:${path}`]);
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error("Git JSON exceeds its bound");
  return { bytes, value: parseJsonRejectDuplicateKeys(bytes, "verification completion input") };
}
function sealed(program, content) {
  const body = { schema_version: "1.0.0", program, ...content };
  return { ...body, artifact_digest: canonicalDigest(body) };
}
function manifestAt(repositoryRoot, revision, gate) {
  const loaded = gitJson(repositoryRoot, revision, gate.dependency_manifest_path);
  const manifest = loaded.value;
  if (!same(manifest, sealDependencyManifest(manifest)) || manifest.gate_id !== gate.gate_id) throw new Error("invalid manifest identity");
  if (manifest.dependency_completeness !== "complete" || manifest.runtime_observation.mode !== "node_process_v1") throw new Error("unknown dependency or environment");
  const inventory = dependencyInventory({ repositoryRoot, revision, selectors: manifest.selectors });
  if (inventory.entries.some((entry) => entry.path === gate.dependency_manifest_path || entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))) throw new Error("unsupported consumed input");
  return { manifest, inventory, bytes: loaded.bytes };
}

// Current rerun acceptance uses the EXISTING exact planner, including conflicting
// outcomes, producer attestation, CAS identity, coverage and independence rules.
function exactAt({ repositoryRoot, storeRoot, revision, repositoryId, gate, source }) {
  const { manifest, inventory, bytes } = manifestAt(repositoryRoot, revision, gate);
  const runtime = currentRuntimeIdentity();
  const requirements = buildVerificationRequirements({ requiredGates: [{
    gate_id: gate.gate_id,
    reuse_identity: {
      gate: { gate_id: gate.gate_id, contract_digest: manifest.gate_contract_digest, category: source.gate.category },
      target: { repository_id: repositoryId, target_revision: revision, tree_digest: gitTreeDigest({ repositoryRoot, revision }) },
      consumed_inputs: [
        ...inventory.entries.map((entry) => ({ kind: entry.evidence_kind, path: entry.path, digest: entry.content_digest })),
        { kind: "manifest", path: gate.dependency_manifest_path, digest: digestBytes(bytes) },
      ],
      execution: { ...manifest.execution, ...runtime },
    },
    required_obligation_refs: gate.required_obligation_refs,
    authority: gate.authority,
    execution_availability: gate.execution_availability,
  }] });
  return planExactReuse({ storeRoot, requirements }).dispositions[0];
}
function normalizeDisposition(disposition, basis) {
  return {
    gate_id: disposition.gate_id,
    disposition: disposition.disposition,
    reason_code: disposition.reason_code,
    execution_evidence_reusable: disposition.execution_evidence_reusable,
    reuse_basis: disposition.execution_evidence_reusable ? basis : null,
    evidence_id: disposition.execution_evidence_reusable ? (disposition.evidence_id ?? disposition.source_evidence_id) : null,
    evidence_digest: disposition.execution_evidence_reusable ? (disposition.evidence_digest ?? disposition.source_evidence_digest) : null,
    required_obligation_refs: [...disposition.required_obligation_refs],
    uncovered_obligation_refs: disposition.execution_evidence_reusable ? [] : [...disposition.required_obligation_refs],
  };
}
function blockedGate(gate, reason_code) {
  return {
    gate_id: gate.gate_id, disposition: gate.execution_availability === "unavailable" ? "blocked_uncovered" : "rerun_required",
    reason_code, execution_evidence_reusable: false, reuse_basis: null, evidence_id: null, evidence_digest: null,
    required_obligation_refs: [...gate.required_obligation_refs], uncovered_obligation_refs: [...gate.required_obligation_refs],
  };
}
function semanticInventory(repositoryRoot, revision, review) {
  try {
    return dependencyInventory({ repositoryRoot, revision, selectors: review.surface_selectors.map((selector) => ({ ...selector, evidence_kind: "file" })) }).entries;
  } catch (error) {
    // A surface may legitimately be entirely added/deleted across revisions.
    if (error.message === "dependency selectors matched no Git inputs") return [];
    throw error;
  }
}
function changedInventoryPaths(before, after) {
  const left = new Map(before.map((entry) => [entry.path, entry]));
  const right = new Map(after.map((entry) => [entry.path, entry]));
  return [...new Set([...left.keys(), ...right.keys()])].filter((path) => !same(left.get(path) ?? null, right.get(path) ?? null));
}

function selectiveReview({ repositoryRoot, requirements, scoped, dispositions }) {
  const affected = new Set();
  const newlyAffected = new Set();
  const obligations = new Set();
  const priorReviews = new Set();
  const priorFindings = new Set();
  const judgmentRefs = new Set();
  let blocked = scoped.actual_diff.truncated;
  for (const gate of requirements.required_gates) {
    if (gate.authority.independent_judgment_required) judgmentRefs.add(`gate:${gate.gate_id}`);
    const review = gate.delta_review;
    if (!review) continue;
    try {
      const before = semanticInventory(repositoryRoot, scoped.base_revision, review);
      const after = semanticInventory(repositoryRoot, scoped.target_revision, review);
      if ([...before, ...after].some((entry) => entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))) throw new Error("unsupported semantic surface");
      const surfaces = new Set([...before, ...after].map((entry) => entry.path));
      const direct = changedInventoryPaths(before, after);
      const sourceManifest = manifestAt(repositoryRoot, scoped.base_revision, gate);
      const targetManifest = manifestAt(repositoryRoot, scoped.target_revision, gate);
      const dependencyChanges = changedInventoryPaths(sourceManifest.inventory.entries, targetManifest.inventory.entries);
      const upstream = !same(sourceManifest.manifest, targetManifest.manifest)
        || dependencyChanges.some((path) => !surfaces.has(path));
      const paths = upstream ? [...surfaces] : direct;
      for (const path of paths) affected.add(path);
      if (upstream) for (const path of paths) if (!direct.includes(path)) newlyAffected.add(path);
      if (paths.length || upstream) {
        judgmentRefs.add(`delta:${gate.gate_id}`);
        for (const ref of review.obligation_refs) obligations.add(ref);
        if (review.prior_review_ref) priorReviews.add(review.prior_review_ref);
        for (const ref of review.prior_finding_refs) priorFindings.add(ref);
      }
    } catch {
      // Unknown dependency closure is not permission to submit an incomplete review.
      blocked = true;
      judgmentRefs.add(`delta:${gate.gate_id}`);
    }
  }
  if (affected.size > MAX_REVIEW_PATHS || obligations.size > 256 || priorReviews.size > 256 || priorFindings.size > 256 || judgmentRefs.size > 256) blocked = true;
  return sealed("ask_verification_selective_review", {
    repository_id: scoped.repository_id, base_revision: scoped.base_revision,
    target_revision: scoped.target_revision, target_tree_digest: scoped.target_tree_digest,
    requirements_digest: scoped.requirements_digest, scoped_plan_digest: scoped.plan_digest,
    resolved_evidence_digest: canonicalDigest(dispositions),
    status: blocked ? "blocked_unbounded_or_unknown" : (judgmentRefs.size ? "independent_judgment_required" : "not_required"),
    affected_paths: blocked ? [] : [...affected].sort(),
    newly_affected_paths: blocked ? [] : [...newlyAffected].sort(),
    obligation_refs: [...obligations].sort().slice(0, 256),
    required_judgment_refs: [...judgmentRefs].sort().slice(0, 256),
    prior_review_refs: [...priorReviews].sort().slice(0, 256),
    prior_finding_refs: [...priorFindings].sort().slice(0, 256),
    prior_review_authority: "baseline_reference_only",
    verified_evidence_refs: dispositions.filter((entry) => entry.execution_evidence_reusable).map((entry) => ({
      gate_id: entry.gate_id, evidence_id: entry.evidence_id, evidence_digest: entry.evidence_digest,
    })),
    privacy: { bounded_references_only: true, raw_diff_stored: false, raw_prompts_stored: false, transcripts_stored: false, secrets_stored: false, private_evaluators_stored: false },
  });
}

function resolveCompletion({ repositoryRoot, storeRoot, targetRevision }) {
  // No plan or changed-path argument: re-resolve the immutable trees and CAS.
  const scoped = planScopedReuse({ repositoryRoot, storeRoot, targetRevision });
  const requirements = gitJson(repositoryRoot, targetRevision, VERIFICATION_SCOPED_REQUIREMENTS_PATH).value;
  const producerIds = new Set();
  const dispositions = requirements.required_gates.map((gate) => {
    const previous = scoped.dispositions.find((entry) => entry.gate_id === gate.gate_id);
    try {
      const source = readVerificationEvidence({ storeRoot, evidenceId: gate.source_evidence_id });
      if (source.producer.kind === "developer") producerIds.add(source.producer.identity_digest);
      if (source.target.repository_id !== scoped.repository_id || source.target.target_revision !== scoped.base_revision || source.gate.gate_id !== gate.gate_id) throw new Error("source transplant");
      const current = exactAt({ repositoryRoot, storeRoot, revision: targetRevision, repositoryId: scoped.repository_id, gate, source });
      if (current.execution_evidence_reusable) {
        const evidence = readVerificationEvidence({ storeRoot, evidenceId: current.evidence_id });
        if (evidence.producer.kind === "developer") producerIds.add(evidence.producer.identity_digest);
        return normalizeDisposition(current, "exact_target");
      }
      if (!["no_exact_evidence", "execution_unavailable"].includes(current.reason_code)) return normalizeDisposition(current, null);
      if (previous.execution_evidence_reusable) {
        // A selected historical PASS must not hide another accepted conflicting
        // outcome with the same exact material identity in the imported store.
        const sourcePlan = exactAt({ repositoryRoot, storeRoot, revision: scoped.base_revision, repositoryId: scoped.repository_id, gate, source });
        if (!sourcePlan.execution_evidence_reusable) return blockedGate(gate, "source_evidence_conflicting_or_invalid");
      }
      return normalizeDisposition(previous, previous.reuse_basis);
    } catch {
      return blockedGate(gate, "current_evidence_or_dependency_invalid");
    }
  });
  const request = selectiveReview({ repositoryRoot, requirements, scoped, dispositions });
  const artifact = sealed("ask_verification_completion_plan", {
    repository_id: scoped.repository_id, target_revision: targetRevision,
    target_tree_digest: scoped.target_tree_digest, base_revision: scoped.base_revision,
    requirements_digest: scoped.requirements_digest, scoped_plan_digest: scoped.plan_digest,
    dispositions, review_request: request,
    deterministic_coverage: dispositions.every((entry) => entry.execution_evidence_reusable) ? "covered" : "blocked",
    authorizes_action: false,
  });
  return { artifact, requirements, producerIds: [...producerIds] };
}

export function prepareVerificationCompletion(options) {
  closedObject(options, ["repositoryRoot", "storeRoot", "targetRevision"], "completion options");
  return resolveCompletion(options).artifact;
}

function currentTarget(repositoryRoot, targetRevision) {
  const head = git(repositoryRoot, ["rev-parse", "HEAD"]).toString("utf8").trim();
  if (head !== targetRevision) throw new Error("target is not current HEAD");
  if (git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]).length) throw new Error("worktree/index is not clean");
  const flags = git(repositoryRoot, ["ls-files", "-v", "-z"]).toString("utf8").split("\0").filter(Boolean);
  if (flags.some((entry) => /^[a-zS]/u.test(entry))) throw new Error("hidden index flags require explicit validation");
}
function completionPolicy(repositoryRoot, artifact) {
  const source = gitJson(repositoryRoot, artifact.base_revision, VERIFICATION_COMPLETION_POLICY_PATH);
  const target = gitJson(repositoryRoot, artifact.target_revision, VERIFICATION_COMPLETION_POLICY_PATH);
  if (!source.bytes.equals(target.bytes)) throw new Error("completion policy changed; establish a new baseline");
  if (validateJsonSchema(target.value, { schemaPath: VERIFICATION_COMPLETION_POLICY_SCHEMA_PATH }).length) throw new Error("completion policy schema invalid");
  validateCompletionPolicy(target.value);
  if (target.value.repository_id !== artifact.repository_id) throw new Error("completion policy repository mismatch");
  return { policy: target.value, digest: digestBytes(target.bytes) };
}

/** Providers are explicit trusted host functions. No historical observation,
 * evidence bundle, JSON freshness flag or serialized coverage is accepted here. */
export async function buildFinalVerificationCoverage({ repositoryRoot, storeRoot, targetRevision, claim = "completion", providers = {} }) {
  const blockers = [];
  let resolved;
  let control;
  try {
    currentTarget(repositoryRoot, targetRevision);
    resolved = resolveCompletion({ repositoryRoot, storeRoot, targetRevision });
    control = completionPolicy(repositoryRoot, resolved.artifact);
  } catch {
    return sealed("ask_verification_final_coverage", {
      target_revision: /^[a-f0-9]{40}$/u.test(targetRevision ?? "") ? targetRevision : null,
      status: "blocked", blockers: [{ kind: "binding", ref: "current-target", reason_code: "current_target_evidence_or_policy_invalid" }],
      authorizes_action: false, historical_state_is_current: false,
    });
  }
  const prepared = resolved.artifact;
  for (const gate of prepared.dispositions) {
    if (!gate.execution_evidence_reusable) blockers.push({ kind: "gate", ref: gate.gate_id, reason_code: gate.reason_code });
  }
  const review = prepared.review_request;
  if (review.status === "blocked_unbounded_or_unknown") blockers.push({ kind: "independent_judgment", ref: "delta-review", reason_code: "delta_review_input_unbounded_or_unknown" });
  const binding = {
    repository_id: prepared.repository_id, target_revision: targetRevision,
    target_tree_digest: prepared.target_tree_digest, requirements_digest: prepared.requirements_digest,
    plan_digest: prepared.artifact_digest, request_digest: review.artifact_digest,
    policy_digest: control.digest, claim,
  };
  const obligations = [
    ...resolved.requirements.current_obligations.map((entry) => ({ kind: entry.kind, ref: entry.obligation_id })),
    ...review.required_judgment_refs.map((ref) => ({ kind: "independent_judgment", ref })),
  ];
  const started = performance.now();
  const observationResult = await refreshDecisionObservations({ binding, policy: control.policy, obligations, providers, forbiddenActorIds: resolved.producerIds });
  for (const record of observationResult.observations) {
    if (record.status !== "covered") blockers.push({ kind: record.kind, ref: record.ref, reason_code: record.reason_code });
  }
  try {
    currentTarget(repositoryRoot, targetRevision);
    const confirmed = resolveCompletion({ repositoryRoot, storeRoot, targetRevision });
    const confirmedPolicy = completionPolicy(repositoryRoot, confirmed.artifact);
    if (!same(prepared, confirmed.artifact) || confirmedPolicy.digest !== control.digest) throw new Error("decision inputs changed");
    if (performance.now() - started > control.policy.maximum_decision_ms) throw new Error("decision window expired");
  } catch {
    blockers.push({ kind: "binding", ref: "decision-window", reason_code: "decision_inputs_changed_or_expired" });
  }
  return sealed("ask_verification_final_coverage", {
    ...binding, status: blockers.length ? "blocked" : "covered",
    deterministic_gate_count: prepared.dispositions.length,
    deterministic_covered_count: prepared.dispositions.filter((entry) => entry.execution_evidence_reusable).length,
    observations: observationResult.observations,
    blockers: blockers.sort((a, b) => `${a.kind}\0${a.ref}`.localeCompare(`${b.kind}\0${b.ref}`)),
    authorizes_action: false, historical_state_is_current: false,
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!["prepare", "coverage"].includes(command) || args.length % 2) throw new Error("expected prepare|coverage and named options");
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!["--repository", "--store", "--target", "--claim", "--output"].includes(key) || Object.hasOwn(flags, key)) throw new Error("unknown or duplicate option");
    flags[key] = args[i + 1];
  }
  for (const key of ["--repository", "--store", "--target"]) if (!flags[key]) throw new Error("missing required option");
  if (command === "prepare" && flags["--claim"]) throw new Error("prepare does not make a claim");
  const options = { repositoryRoot: resolve(flags["--repository"]), storeRoot: resolve(flags["--store"]), targetRevision: flags["--target"] };
  const result = command === "prepare" ? prepareVerificationCompletion(options)
    : await buildFinalVerificationCoverage({ ...options, claim: flags["--claim"] ?? "completion" });
  if (flags["--output"]) writeCanonicalJsonNoReplace({ outputPath: resolve(flags["--output"]), artifact: result, label: "verification completion output" });
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (command === "coverage" && result.status !== "covered") process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("verification completion failed; inspect bounded inputs and trusted provider availability"); process.exitCode = 1; });
}
