import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectTraceabilityScenarioResult } from "./validate-repo.mjs";

const tests = new URL("../skills/spec-driven-development/references/examples/quote-reissue/quote-reissue.test.mjs", import.meta.url);
const source = readFileSync(tests, "utf8");
const repo = new URL("../", import.meta.url);
const spec = JSON.parse(/^\/\/ @spec (.+)$/mu.exec(source)[1]);
const ref = (artifact_id, item_id, observed_revision = 1) => ({ artifact_id, item_id, observed_revision });
const item = (id, kind, ...upstream_refs) => ({ id, kind, upstream_refs });
const artifact = (id, type, items, revision = 1) => ({ id, type, revision, upstream_refs: [], items });
const required = (gap_type, item_ref) => ({ gap_type, item_ref });
const acceptance = (id) => ref(spec.artifact_id, id, spec.revision);
const req = "REQ-QUOTE-REISSUE", plan = "WP-QUOTE-REISSUE", ver = "VER-QUOTE-REISSUE";
const impl = "IMPL-QUOTE-REISSUE", evidence = "EVID-QUOTE-REISSUE", rev = "REV-QUOTE-REISSUE", release = "REL-QUOTE-REISSUE";
const confirmed = "AC-CONFIRMED-TOTAL", legacy = "AC-LEGACY-UNAVAILABLE", draft = "AC-DRAFT-LIVE-PRICE";
const check = new Map([
  [confirmed, ["REOPEN-AFTER-PRICE-CHANGE", "CHECK-STORED-TOTAL-FIRST"]],
  [legacy, ["REFUSE-WITHOUT-TOTAL", "CHECK-MISSING-HISTORY"]],
  [draft, ["SHOW-CURRENT-PRICE", "KEEP-DRAFT-INDEPENDENT"]],
]);

function runAcceptance(id) {
  const [evidenceId] = check.get(id);
  const tag = "[" + id + "]";
  const declarations = [...source.matchAll(/^\s*\/\/ @acceptance (.+)$/gmu)].map(([, row]) => JSON.parse(row));
  assert.equal(declarations.filter(({ item_id }) => item_id === id).length, 1, "An executed ID must identify one current acceptance item");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const args = ["--test", "--test-reporter=tap", "--test-name-pattern", "^" + RegExp.escape(tag) + " ", fileURLToPath(tests)];
  const run = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  assert.equal(run.status, 0, run.error?.message ?? run.stderr + run.stdout);
  const passes = [...run.stdout.matchAll(/^ok \d+ - (.+)$/gmu)].map(([, passed]) => passed);
  assert.equal(passes.length, 1);
  assert.ok(passes[0].startsWith(tag + " "));
  assert.match(run.stdout, /^# skipped 0$/mu); // An unrelated or skipped test does not count as evidence.
  assert.match(run.stdout, /^# pass 1$/mu);
  return item(evidenceId, "evidence", ref(ver, id));
}

const completion = (id, proofs, status = "supported") => {
  const refs = [required("acceptance", acceptance(id)), required("verification", ref(ver, id))];
  return { id: "COMPLETE-" + id, type: "completion", status, subject_refs: [ref(plan, check.get(id)[1])], evidence_refs: proofs, blocker_refs: [], accepted_risk_refs: [],
    applicable_gap_types: refs.map(({ gap_type }) => gap_type), required_refs: refs };
};

function scenario(checked, claims, { syntheticReview = false } = {}) {
  const eligible = item("ELIGIBLE-ONLY", "check", acceptance(confirmed), acceptance(legacy),
    ref(ver, confirmed), ref(ver, legacy), ...(syntheticReview ? [ref(rev, "TECHNICAL-REVIEW")] : []));
  const historic = item("ALL-HISTORY", "check", acceptance(confirmed), ref(ver, confirmed),
    ref(ver, "RECONSTRUCT-HISTORY"), ...(syntheticReview ? [ref(rev, "TECHNICAL-REVIEW")] : []));
  return {
    artifacts: [
      artifact(req, "requirement", [item("REISSUE-WITH-KNOWN-TOTAL", "decision"), item("DRAFT-USES-CURRENT-PRICE", "decision")]),
      artifact(spec.artifact_id, "spec", [
        item(confirmed, "acceptance", ref(req, "REISSUE-WITH-KNOWN-TOTAL")),
        item(legacy, "acceptance", ref(req, "REISSUE-WITH-KNOWN-TOTAL")),
        item(draft, "acceptance", ref(req, "DRAFT-USES-CURRENT-PRICE")),
      ], spec.revision),
      artifact(plan, "work_package", [
        item("CHECK-STORED-TOTAL-FIRST", "task", acceptance(confirmed)),
        item("CHECK-MISSING-HISTORY", "task", acceptance(legacy)),
        item("BUILD-OUTPUT-FORMATS", "task", ref(plan, "CHECK-STORED-TOTAL-FIRST"), ref(plan, "CHECK-MISSING-HISTORY")),
        item("KEEP-DRAFT-INDEPENDENT", "task", acceptance(draft)),
      ]),
      artifact(ver, "verification", [
        item(confirmed, "obligation", acceptance(confirmed), ref(plan, "CHECK-STORED-TOTAL-FIRST")),
        item(legacy, "obligation", acceptance(legacy), ref(plan, "CHECK-MISSING-HISTORY")),
        item(draft, "obligation", acceptance(draft), ref(plan, "KEEP-DRAFT-INDEPENDENT")),
        item("RECONSTRUCT-HISTORY", "obligation"),
      ]),
      artifact(impl, "implementation", [item("SAVE-TOTAL-IN-CONFIRMATION", "change", ref(plan, "CHECK-STORED-TOTAL-FIRST"))]),
      artifact(evidence, "evidence", checked),
      // A represented technical review step, not an actual production approval or proof.
      artifact(rev, "review", syntheticReview ? [item("TECHNICAL-REVIEW", "decision", ref(impl, "SAVE-TOTAL-IN-CONFIRMATION"),
        ref(evidence, check.get(confirmed)[0]), ref(evidence, check.get(legacy)[0]))] : []),
      artifact(release, "release_readiness", [eligible, historic]),
    ],
    claims,
  };
}

function releaseClaim(scope, proofs, { historical = false } = {}) {
  const refs = [
    required("acceptance", acceptance(confirmed)),
    required("verification", ref(ver, confirmed)),
    historical ? required("verification", ref(ver, "RECONSTRUCT-HISTORY")) : required("acceptance", acceptance(legacy)),
    ...(!historical ? [required("verification", ref(ver, legacy))] : []),
    required("review", ref(rev, "TECHNICAL-REVIEW")),
    required("approval", ref(release, "PRODUCTION-APPROVAL")),
    required("rollback", ref(release, "PRODUCTION-ROLLBACK")),
  ];
  return { id: "RELEASE-" + scope, type: "release", status: "insufficient_evidence", subject_refs: [ref(release, scope)], evidence_refs: proofs, blocker_refs: [], accepted_risk_refs: [],
    applicable_gap_types: [...new Set(refs.map(({ gap_type }) => gap_type))], required_refs: refs };
}

const current = (id, revision = 1) => ref(evidence, check.get(id)[0], revision);
const gapsFor = (result, claim) => result.gaps.filter(({ required_by_claim }) => required_by_claim === claim.id);

test("exact observed proofs cover the eligible local contracts without treating a green suite as rollout approval", () => {
  assert.equal(spec.artifact_id, "SPEC-QUOTE-REISSUE");
  const all = [confirmed, legacy, draft];
  const checked = all.map(runAcceptance);
  const local = all.map((id) => completion(id, [current(id)]));
  const candidate = releaseClaim("ELIGIBLE-ONLY", [current(confirmed), current(legacy)]);
  const unrestricted = releaseClaim("ALL-HISTORY", [current(confirmed), current(legacy)], { historical: true });
  const result = inspectTraceabilityScenarioResult(scenario(checked, [...local, candidate, unrestricted], { syntheticReview: true }));
  assert.deepEqual(result.issues, []);
  for (const claim of local) assert.deepEqual(gapsFor(result, claim), []);
  assert.deepEqual(gapsFor(result, candidate).map(({ gap_type }) => gap_type), ["approval", "rollback"]);
  assert.ok(gapsFor(result, unrestricted).some(({ missing_item_ref }) => missing_item_ref.item_id === "RECONSTRUCT-HISTORY"));
  for (const claim of [candidate, unrestricted]) {
    const attempt = { ...claim, status: "supported" };
    const blocked = inspectTraceabilityScenarioResult(scenario(checked, [attempt], { syntheticReview: true }));
    assert.ok(blocked.issues.some((issue) => issue.includes("supported claim has approval gap")));
  }
});

test("one of the two prerequisite tasks is not enough to start output formatting", () => {
  const observed = [runAcceptance(confirmed), runAcceptance(draft)];
  const first = completion(confirmed, [current(confirmed)]);
  const second = completion(legacy, [current(confirmed)], "insufficient_evidence");
  const independent = completion(draft, [current(draft)]);
  const project = scenario(observed, [first, second, independent]);
  // The task dependencies are the work package’s real start condition, not a scheduler.
  const workPackage = project.artifacts.find(({ id }) => id === plan);
  const upstream = workPackage.items.find(({ id }) => id === "BUILD-OUTPUT-FORMATS").upstream_refs;
  const result = inspectTraceabilityScenarioResult(project);
  assert.deepEqual(result.issues, []);
  const prerequisites = project.claims.filter((claim) => upstream.some((dependency) =>
    claim.subject_refs.some(({ artifact_id, item_id, observed_revision }) =>
      artifact_id === dependency.artifact_id && item_id === dependency.item_id && observed_revision === dependency.observed_revision)));
  assert.deepEqual(prerequisites, [first, second]);
  assert.deepEqual(prerequisites.filter((claim) => gapsFor(result, claim).length), [second]);
  assert.deepEqual(gapsFor(result, independent), []);
});

test("without the exact proof, an independent draft stays valid but the confirmed slice and rollout stop", () => {
  const checked = [runAcceptance(draft)];
  const independent = completion(draft, [current(draft)]);
  const missing = completion(confirmed, [current(draft)], "insufficient_evidence");
  const rollout = releaseClaim("ELIGIBLE-ONLY", [current(draft)]);
  const result = inspectTraceabilityScenarioResult(scenario(checked, [independent, missing, rollout]));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(gapsFor(result, independent), []);
  assert.ok(gapsFor(result, missing).some(({ missing_item_ref }) => missing_item_ref.item_id === confirmed));
  assert.ok(gapsFor(result, rollout).some(({ gap_type, missing_item_ref }) => gap_type === "verification" && missing_item_ref.item_id === confirmed));
  const testedConfirmed = runAcceptance(confirmed);
  for (const [proofs, available] of [[[], checked], [[current(draft)], checked],
    [[current(confirmed, 2)], [...checked, testedConfirmed]]]) {
    const attempt = completion(confirmed, proofs);
    const blocked = inspectTraceabilityScenarioResult(scenario(available, [attempt]));
    assert.ok(gapsFor(blocked, attempt).some(({ gap_type }) => gap_type === "verification"));
    assert.ok(blocked.issues.length > 0);
    if (proofs[0]?.observed_revision === 2) assert.ok(blocked.issues.some((issue) => issue.includes("stale EVID-QUOTE-REISSUE@2")));
  }
  const gap = gapsFor(result, rollout).find(({ gap_type, missing_item_ref }) => gap_type === "verification" && missing_item_ref.item_id === confirmed);
  const heldReview = reviewDecisionFromMissingEvidence(gap, "insufficient evidence");
  assert.match(heldReview, /ASK sensors: pass/u);
  const invalidApproval = reviewDecisionFromMissingEvidence(gap, "approve");
  assert.match(invalidApproval, /closed decision matrix requires insufficient_evidence/u);
});

// Validate the proposed review text using ASK’s existing gate. This does not
// perform an independent human review or grant merge/release permission.
function reviewDecisionFromMissingEvidence(gap, decision) {
  const missing = gap.missing_item_ref;
  const label = `${missing.artifact_id}@${missing.observed_revision}#${missing.item_id}`;
  const evidence = {
    gate_id: "review-ai-quality", missing_input: label, affected_judgment: "confirmed quote reissue only",
    next_check: "Run the exact persisted reissue test for preview and CSV after a price change",
  };
  const envelope = {
    schema_version: "1.0.0",
    route: { work_mode: "レビュー", operating_mode: "delivery_quality", user_facing: "確定見積の証拠を確認",
      internal: { primary: "review-final-merge-gate" } },
    evidence_status: { checked: [], missing: [label] },
    stop_reason: { status: "none", details: [], human_decision_required: [], stop_if: [] },
    next_action: evidence.next_check,
  };
  const input = [
    "Baseline review:", "- Gate: review-ai-quality", "- Status: insufficient_evidence", "- Evidence: " + label, "",
    "Additional required gates:", "- none", "", "Missing evidence:", "- " + JSON.stringify(evidence), "",
    "Findings:", "- none", "", "Decision:", "- " + decision, "",
    "Execution Envelope:", "```json", JSON.stringify(envelope), "```", "",
  ].join("\n");
  const run = spawnSync(process.execPath, [
    fileURLToPath(new URL("scripts/ask-sensors.mjs", repo)), "--target", fileURLToPath(repo), "--mode", "review",
    "--required-gate", "review-final-merge-gate",
  ], { input, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}
