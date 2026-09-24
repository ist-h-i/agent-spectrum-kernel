#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { canonicalDigest, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { buildEvidenceTransfer, importEvidenceTransfer, readVerificationEvidence } from "./verification-evidence.mjs";
import { prepareVerificationCompletion, buildFinalVerificationCoverage } from "./verification-reuse-completion.mjs";
import { summarizeVerificationWork } from "./verification-decision-core.mjs";
import { currentRuntimeIdentity } from "./verification-scoped-reuse.mjs";
import { assessReview, compareConditions, digest, observed, summarizeCondition, TOKEN_KEYS, unavailable, validateReview } from "./verification-reuse-measurement-core.mjs";
import { codexIdentity, runCodexReview } from "./verification-review-runtime.mjs";
import { createMeasurementFixture, git, MATERIAL, OBLIGATIONS, REVISIONS, REVIEW_ACTOR } from "./verification-reuse-measurement-fixture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const noUsage = () => Object.fromEntries(TOKEN_KEYS.map((key) => [key, unavailable("no_live_model_telemetry")]));
export function fixtureReview(request) {
  const findings = request.material.filter((entry) => entry.path === "src/limit.mjs" && entry.content.includes("amount < limit"))
    .map((entry) => ({ path: entry.path, obligation_ref: "AC-limit-inclusive", severity: "blocker" }));
  return { request_digest: request.request_digest, target_revision: request.target_revision,
    reviewed_paths: [...request.paths], reviewed_obligations: request.obligations.map((entry) => entry.ref),
    judgment_refs: [...request.judgment_refs], findings, decision: findings.length ? "block" : "pass" };
}
function reviewRequest(fixture, prepared, mode) {
  const full = mode === "full" || prepared.review_request.required_judgment_refs.some((ref) => ref.startsWith("gate:"));
  const paths = full ? OBLIGATIONS.map((entry) => entry.path) : prepared.review_request.affected_paths;
  const obligations = OBLIGATIONS.filter((entry) => paths.includes(entry.path));
  if (prepared.review_request.obligation_refs.some((ref) => !obligations.some((entry) => entry.ref === ref))) throw new Error("selective package would omit a required obligation");
  const body = { schema_version: "1.0.0", repository_id: prepared.repository_id, target_revision: prepared.target_revision,
    target_tree_digest: prepared.target_tree_digest, completion_plan_digest: prepared.artifact_digest,
    selective_request_digest: prepared.review_request.artifact_digest, mode, paths, obligations,
    judgment_refs: prepared.review_request.required_judgment_refs.length ? prepared.review_request.required_judgment_refs : ["baseline:semantic-review"],
    prior_review_refs: prepared.review_request.prior_review_refs, material: fixture.material(paths),
  };
  return { ...body, request_digest: digest(body) };
}
function observationProvider(f, prepared, request, review) {
  // Live in-process review state, scoped to this decision only. No imported receipt/fresh flag API.
  return { "measurement-review-state": (query) => {
    const result = review?.result;
    const bound = query.target_revision === f.head() && query.target_revision === prepared.target_revision
      && query.plan_digest === prepared.artifact_digest && query.request_digest === prepared.review_request.artifact_digest
      && request?.completion_plan_digest === query.plan_digest && result?.request_digest === request.request_digest;
    const satisfied = bound && result.decision === "pass" && result.judgment_refs.includes(query.ref)
      && request.obligations.every((entry) => result.reviewed_obligations.includes(entry.ref) && result.reviewed_paths.includes(entry.path));
    return { query, status: satisfied ? "satisfied" : (result ? "unsatisfied" : "unavailable"),
      actor_id: REVIEW_ACTOR, evidence_digest: result ? canonicalDigest(result) : null };
  } };
}
async function handoff(f, condition, prepared) {
  const ids = [...new Set([...f.sourceEvidenceIds(), ...prepared.dispositions.filter((entry) => entry.execution_evidence_reusable).map((entry) => entry.evidence_id)])];
  const store = resolve(f.parent, `reviewer-${condition}-${prepared.target_revision}`);
  importEvidenceTransfer({ storeRoot: store, transfer: buildEvidenceTransfer({ storeRoot: f.stores[condition], evidenceIds: ids }) });
  const options = { ...f.options(condition), storeRoot: store };
  const reviewerPlan = prepareVerificationCompletion(options);
  assert.equal(reviewerPlan.deterministic_coverage, prepared.deterministic_coverage);
  assert.ok(ids.every((evidenceId) => readVerificationEvidence({ storeRoot: store, evidenceId }).producer.kind === "developer"));
  const withoutJudgment = await buildFinalVerificationCoverage(options);
  if (prepared.review_request.required_judgment_refs.length) assert.equal(withoutJudgment.status, "blocked");
  assert.equal(withoutJudgment.authorizes_action, false);
  return { deterministic_reusable: reviewerPlan.dispositions.filter((entry) => entry.execution_evidence_reusable).length,
    exact_target_reusable: reviewerPlan.dispositions.filter((entry) => entry.reuse_basis === "exact_target").length,
    extra_executions: 0, producer_kind: "developer", approval_promoted: false,
    required_judgments: prepared.review_request.required_judgment_refs.length, without_judgment_status: withoutJudgment.status };
}

export async function runMeasurement({ provider = "unavailable", repetitions = 2, outputDirectory = null,
  binary = null, version = null, model = null, allowLive = false, independent = false, reviewOverride = null } = {}) {
  if (!["unavailable", "fixture", "codex"].includes(provider) || !Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error("invalid run configuration");
  if (provider === "codex" && !allowLive) throw new Error("live review requires explicit --allow-live");
  if (reviewOverride && provider !== "fixture") throw new Error("test provider cannot claim live evidence");
  let runtime = { status: "unavailable", reason: provider === "fixture" ? "synthetic_provider" : "provider_not_installed" };
  if (provider === "codex") {
    if (!binary || !version || !model) throw new Error("live run requires binary, version and model pins");
    runtime = { status: "observed", ...codexIdentity(binary, version), model, reasoning_effort: "medium" };
  }
  const sourceRevision = git(ROOT, ["rev-parse", "HEAD"]);
  const sourceTree = git(ROOT, ["rev-parse", "HEAD^{tree}"]);
  const checkSource = () => {
    if (git(ROOT, ["rev-parse", "HEAD"]) !== sourceRevision || git(ROOT, ["status", "--porcelain=v1", "--untracked-files=all"])) throw new Error("implementation identity drift");
  };
  checkSource();
  const sources = ["verification-reuse-measurement.mjs", "verification-reuse-measurement-core.mjs", "verification-review-runtime.mjs", "verification-reuse-measurement-fixture.mjs"];
  const plan = { schema_version: "1.0.0", program: "ask_verification_reuse_run_plan", provider, runtime,
    source_revision: sourceRevision, source_git_tree: sourceTree, source_worktree_clean: true,
    repetitions, independent_judgment_each_revision: independent,
    condition_orders: Array.from({ length: repetitions }, (_, index) => index % 2 ? ["reuse", "baseline"] : ["baseline", "reuse"]),
    scenario_digest: digest({ material: MATERIAL, revisions: REVISIONS, obligations: OBLIGATIONS }),
    implementation_digest: digest(sources.map((path) => [path, readFileSync(resolve(ROOT, "scripts", path), "utf8")])),
    runtime_identity: currentRuntimeIdentity(), revisions: REVISIONS.map((entry) => entry.name),
    initial_acquisition: "included_in_each_condition", model_retries: 0, maximum_review_invocations: repetitions * 6,
    stop_conditions: ["gate_failure", "provider_failure", "quality_regression", "identity_drift", "unknown_or_unbounded_review"],
    production_mutation: false, raw_payload_persistence: false, upstream_model_request_count: "unavailable_from_codex_jsonl" };
  const planDigest = canonicalDigest(plan);
  const persist = (name, artifact) => {
    if (!outputDirectory) return;
    mkdirSync(resolve(outputDirectory), { recursive: true });
    writeCanonicalJsonNoReplace({ outputPath: resolve(outputDirectory, name), artifact, label: "verification reuse measurement" });
  };
  // Freeze and publish before gate/model execution; reusing an output directory cannot overwrite a run.
  persist("plan.json", { ...plan, plan_digest: planDigest });
  const rows = [];
  let stopped = null;
  for (let repetition = 0; repetition < repetitions && !stopped; repetition += 1) {
    const f = createMeasurementFixture({ independent });
    try {
      const order = plan.condition_orders[repetition];
      const acquisition = {};
      const acquisitionTime = {};
      for (const condition of order) {
        const start = performance.now();
        acquisition[condition] = f.gates.map((gate) => f.execute(gate, f.stores[condition]));
        acquisitionTime[condition] = Math.max(0, Math.round(performance.now() - start));
      }
      f.bindBaseline(order[0], acquisition[order[0]]);
      const baselines = {};
      for (const revision of REVISIONS) {
        f.revise(revision);
        for (const condition of order) {
          const started = performance.now();
          const before = prepareVerificationCompletion(f.options(condition));
          if (before.review_request.status === "blocked_unbounded_or_unknown") throw new Error("unknown_or_unbounded_review");
          const executions = revision.name === "A" ? acquisition[condition] : [];
          if (revision.name !== "A") for (const gate of f.gates) {
            if (condition === "baseline" || !before.dispositions.find((entry) => entry.gate_id === gate.id).execution_evidence_reusable) executions.push(f.execute(gate, f.stores[condition]));
          }
          // Evidence identity changes after a rerun; dispatch only the re-resolved package.
          const prepared = prepareVerificationCompletion(f.options(condition));
          const skip = condition === "reuse" && revision.name !== "A" && before.review_request.status === "not_required" && baselines[condition]?.decision === "pass";
          const mode = skip ? "baseline_reference" : (condition === "baseline" || revision.name === "A" || !baselines[condition] ? "full" : "delta");
          const request = skip ? null : reviewRequest(f, prepared, mode);
          let review = null;
          if (!skip) {
            if (provider === "fixture") {
              try {
                const result = validateReview((reviewOverride ?? fixtureReview)(request), request);
                review = { status: "succeeded", result, usage: noUsage(), model_review_invocations: observed(0, "synthetic_provider_no_ai_call") };
              } catch {
                review = { status: "unavailable", reason: "fixture_provider_failure", result: null, usage: noUsage(), model_review_invocations: observed(0, "synthetic_provider_no_ai_call") };
              }
            } else if (provider === "codex") {
              review = await runCodexReview({ binary, identity: runtime, model, request, apiKey: process.env.CODEX_API_KEY });
            } else review = { status: "unavailable", reason: "provider_not_installed", result: null, usage: noUsage(), model_review_invocations: observed(0, "no_model_dispatched") };
          }
          const coverage = await buildFinalVerificationCoverage({ ...f.options(condition), providers: observationProvider(f, prepared, request, review) });
          const expectedFindings = revision.name === "C" ? [{ path: "src/limit.mjs", obligation_ref: "AC-limit-inclusive", severity: "blocker" }] : [];
          const assessedResult = skip ? baselines[condition] : review.result;
          const assessedRequest = skip ? { ...reviewRequest(f, prepared, "full"), judgment_refs: [] } : request;
          // Baseline establishment is an additional evaluation obligation, never a new approval.
          const evaluatedCoverage = !assessedResult || assessedResult.decision === "block"
            || assessedRequest.obligations.some((entry) => !assessedResult.reviewed_obligations.includes(entry.ref) || !assessedResult.reviewed_paths.includes(entry.path))
            || assessedRequest.judgment_refs.some((ref) => !assessedResult.judgment_refs.includes(ref)) ? "blocked" : coverage.status;
          const quality = assessReview({ request: assessedRequest, result: assessedResult, expectedFindings,
            coverageStatus: evaluatedCoverage, executionCovered: prepared.deterministic_coverage === "covered", qualityViolation: review?.quality_violation });
          if (revision.name === "A" && quality.status === "pass" && assessedResult?.decision === "pass") baselines[condition] = assessedResult;
          const events = executions.map((entry) => entry.event);
          if (!skip) events.push({ kind: "review_request_dispatch" });
          // Native JSONL does not expose individual model HTTP requests. Do not
          // fabricate core ai_request events from completed runner invocations.
          const metrics = summarizeVerificationWork({ dispositions: before.dispositions, events,
            requiredJudgmentRefs: before.review_request.required_judgment_refs });
          const transfer = await handoff(f, condition, prepared);
          checkSource();
          const elapsed = Math.max(0, Math.round(performance.now() - started)) + (revision.name === "A" ? acquisitionTime[condition] : 0);
          const row = {
            repetition: repetition + 1, revision: revision.name, condition, review_mode: mode,
            target_revision: prepared.target_revision, target_tree_digest: prepared.target_tree_digest,
            required_gate_count: metrics.required_gate_count, reuse_exact: metrics.reuse_exact_count, reuse_scoped: metrics.reuse_scoped_count,
            rerun_required: revision.name === "A" ? f.gates.length : metrics.rerun_required_count,
            blocked_uncovered: metrics.uncovered_gate_count, deterministic_gate_executions: metrics.deterministic_execution_count,
            verification_attempts: executions.length, review_dispatches: skip ? 0 : 1,
            ai_review_requests: skip ? observed(0, "no_dispatch") : review.model_review_invocations,
            ...Object.fromEntries(TOKEN_KEYS.map((key) => [key, skip ? observed(0, "no_dispatch") : review.usage[key]])),
            elapsed_time: provider === "codex" && (skip || review.status === "succeeded") ? observed(elapsed, "complete_measurement_step") : unavailable("no_live_end_to_end_run"),
            harness_elapsed_ms: observed(elapsed), deterministic_elapsed_ms: observed(executions.reduce((sum, entry) => sum + entry.duration_ms, 0)),
            independent_judgments: provider === "codex" && (skip || review.status === "succeeded") ? observed(skip ? 0 : 1, "fresh_review_invocations") : unavailable("no_live_independent_judgment"),
            fixture_judgments: provider === "fixture" && !skip && review.status === "succeeded" ? 1 : 0,
            quality, canonical_coverage_status: coverage.status, evaluation_coverage_status: evaluatedCoverage,
            authorizes_action: coverage.authorizes_action, historical_state_is_current: coverage.historical_state_is_current,
            request: request ? { request_digest: request.request_digest, paths: request.paths, obligation_refs: request.obligations.map((entry) => entry.ref), judgment_refs: request.judgment_refs } : null,
            review_result: skip ? null : review.result, prior_baseline_digest: skip ? canonicalDigest(baselines[condition]) : null,
            provider_status: skip ? "not_dispatched" : review.status, provider_reason: skip ? null : (review.reason ?? null),
            upstream_model_requests: unavailable("not_exposed_by_native_runtime"),
            gate_dispositions: before.dispositions,
            execution_receipts: executions.map((entry) => ({ gate_id: entry.event.gate_id, status: entry.event.status,
              evidence_id: entry.evidence.evidence_id, evidence_digest: entry.evidence.evidence_digest, duration_ms: entry.duration_ms })),
            handoff: transfer,
          };
          rows.push(row);
          persist(`row-${repetition + 1}-${revision.name}-${condition}.json`, row);
          if (quality.status === "fail") stopped = "quality_regression";
          if (!stopped && provider !== "unavailable" && review && review.status !== "succeeded") stopped = "provider_failure";
          if (stopped) break;
        }
        if (stopped) break;
      }
    } catch {
      stopped = "gate_or_protocol_failure"; // Sanitized; preserve prior observations, never fabricate remaining cells.
    } finally { f.dispose(); }
  }
  const baseline = summarizeCondition(rows.filter((row) => row.condition === "baseline"));
  const reuse = summarizeCondition(rows.filter((row) => row.condition === "reuse"));
  const complete = !stopped && rows.length === repetitions * 6;
  const delta = compareConditions(baseline, reuse, { live: provider === "codex", complete });
  const result = { schema_version: "1.0.0", program: "ask_verification_reuse_measurement", plan_digest: planDigest,
    provider, complete, stop_reason: stopped, count_scope: "recorded_cells_only", expected_cells: repetitions * 6, observed_cells: rows.length,
    baseline, reuse, delta, issue_decision: "insufficient evidence", issue_close_eligible: false,
    claim_scope: provider === "codex" ? "bounded_public_fixture_native_codex" : "deterministic_fixture_only",
    unmeasured: ["production_GitHub_and_human_providers", "installed_ASK_adapter_acceptance", "production_task_quality", "upstream_model_HTTP_request_count"],
    rows };
  persist("result.json", result);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = {}; const allowed = new Set(["provider", "repetitions", "output", "codex-bin", "codex-version", "model"]);
    for (let index = 2; index < process.argv.length; index += 1) {
      const flag = process.argv[index];
      if (flag === "--allow-live") { if (options.allowLive) throw new Error("duplicate flag"); options.allowLive = true; continue; }
      if (!flag.startsWith("--") || !allowed.has(flag.slice(2)) || Object.hasOwn(options, flag)) throw new Error("invalid option");
      const value = process.argv[++index]; if (!value || value.startsWith("--")) throw new Error("missing option value"); options[flag] = value;
    }
    const result = await runMeasurement({ provider: options["--provider"] ?? "unavailable", repetitions: options["--repetitions"] === undefined ? 2 : Number(options["--repetitions"]),
      outputDirectory: options["--output"] ?? null, binary: options["--codex-bin"] ?? null, version: options["--codex-version"] ?? null,
      model: options["--model"] ?? null, allowLive: options.allowLive ?? false });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.complete || result.delta.quality_guardrail === "fail") process.exitCode = 1;
  } catch { console.error("Verification reuse measurement failed; check pins, options and a fresh output directory."); process.exitCode = 1; }
}
