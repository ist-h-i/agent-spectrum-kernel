// Fast tests of composer authorization, independent of the expensive original
// saved-result verifier. The adjacent CLI integration tests own real receipts.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalDigest, putContentAddressedJson } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { runUnattendedPersonalEvolution } from "./ask-personal-evolution-unattended.mjs";
import { CANONICAL_PRIMARY_FIXTURE_IDS } from "./ask-primary-fixture-recipe.mjs";

const save = (path, value) => writeFileSync(path, JSON.stringify({ value, digest: canonicalDigest(value) }));
function fixture(t, { phase = "needs_evaluation_confirmation", review = "approved", actions = ["insufficient_evidence"],
  allowExistingApproval = false, maxCycles = 1, fixtureSet = "legacy9", fixtureIds, maxDurationMs = 604800000, maxComparisonTokens = 90000000 } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "personal-unattended-policy-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, "run"), cycle = join(output, "cycle-1"), profileRoot = join(root, "profile"), storeRoot = join(root, "store");
  mkdirSync(cycle, { recursive: true }); mkdirSync(profileRoot); mkdirSync(storeRoot);
  const sourcePath = join(root, "reviewer.mjs"); writeFileSync(sourcePath, "throw new Error('this policy test must never dispatch a reviewer');\n");
  const asset = { stable_id: "synthetic-prompt", content_digest: canonicalDigest("candidate"), record_digest: canonicalDigest("record") };
  const source = { candidate_asset: asset, inherited_scope: { included: ["configuration"] },
    inherited_permissions_and_effects: { status: "supported" }, inherited_maintenance: { stale_status: "fresh" },
    files: [{ path: "prompt.md", before: "old", after: "new" }] };
  const policy = { allowedPaths: ["prompt.md"], sourceReview: { command: [process.execPath, sourcePath], timeoutMs: 1000,
    source: { path: sourcePath, digest: comparisonHash(readFileSync(sourcePath)) }, allowExistingApproval },
    decisionActions: actions, maxCycles, maxDurationMs, maxComparisonTokens };
  const profile = { storeRoot, blueprint: { parent_asset: asset, evaluation_scope: {
    fixture_ids: fixtureIds ?? (fixtureSet === "catalog24" ? CANONICAL_PRIMARY_FIXTURE_IDS : ["mn-build-option-update"]) } },
    ...(fixtureSet !== "legacy9" ? { evaluation: { fixtureSet } } : {}),
    trust: {}, generation: { timeoutMs: 1000 }, unattended: policy };
  save(join(profileRoot, "profile.json"), profile);
  save(join(output, "run-input.json"), { profileRoot, profileDigest: canonicalDigest(profile), policyDigest: canonicalDigest(policy),
    target: asset.stable_id, problem: "public synthetic problem", startedAtMs: Date.now() });
  writeFileSync(join(output, "problem.txt"), "public synthetic problem");
  save(join(cycle, "input.json"), { profile, blueprint: profile.blueprint, observationInput: { correction: "public synthetic problem" }, predecessorReceiptObjectDigest: null });
  const experiment = putContentAddressedJson({ storeRoot, artifact: {
    action_mapping: [{ recommendation: "insufficient_evidence", actions: ["insufficient_evidence"] }] } });
  save(join(cycle, "pair.json"), { input: { experimentObjectDigest: experiment.digest } });
  const fact = putContentAddressedJson({ storeRoot, artifact: { kind: "personal_explicit_source_review_v1", candidate_asset: asset,
    inherited_parent: asset, content_digest: asset.content_digest, fresh_for_fixed_comparison: true, authority_implied: false,
    reviewed_scope: source.inherited_scope, reviewed_permissions_and_effects: source.inherited_permissions_and_effects,
    reviewed_maintenance: source.inherited_maintenance } });
  save(join(cycle, "source-review.json"), { reviewObjectDigest: fact.digest });
  const input = { policy_digest: canonicalDigest(policy), source, files: source.files.map(file => ({ path: file.path,
    before_digest: comparisonHash(Buffer.from(file.before)), raw_digest: comparisonHash(Buffer.from(file.after)) })) };
  if (review !== "existing") {
    save(join(cycle, "source-review-request.json"), { input_digest: canonicalDigest(input), policy_digest: canonicalDigest(policy) });
    if (review !== "missing") save(join(cycle, "source-review-result.json"), { input, review: {
      input_digest: canonicalDigest(review === "malformed" ? "different input" : input), candidate_asset: asset,
      verdict: review === "declined" ? "declined" : "approved", reason: "Synthetic independent review result.",
      file_reviews: input.files.map(file => ({ path: file.path, raw_digest: file.raw_digest, verdict: "approved", reason: "Exact bytes reviewed." })) } });
  }
  if (phase === "completed") save(join(cycle, "completion.json"), { receipt_object_digest: canonicalDigest("fake policy callback receipt") });
  const calls = [], state = () => ({ status: phase, generation: { status: "candidate_ready", invocation_consumed: true, candidate_asset: asset },
    recommendation: { recommendation: "insufficient_evidence" }, receipt_object_digest: canonicalDigest("fake policy callback receipt") });
  const command = async args => {
    calls.push(args[0]);
    if (args[0] === "review-source") { assert.equal(args.includes("--approve"), false, "existing approval needs no mutation"); return { ...state(), source }; }
    if (args[0] === "confirm-evaluation") { phase = "needs_decision"; return state(); }
    if (args[0] === "decide") { phase = "completed"; return state(); }
    assert.equal(args[0], "status", "no new generation/comparison/next dispatch may happen"); return state();
  };
  return { run: () => runUnattendedPersonalEvolution({ output }, command), calls, cycle, output };
}

for (const phase of ["needs_evaluation_confirmation", "needs_decision", "completed"]) {
  for (const review of ["declined", "malformed", "missing"]) test(`${phase}: ${review} review cannot be bypassed by a later manual source approval`, async t => {
    const f = fixture(t, { phase, review, allowExistingApproval: true, maxCycles: 2 });
    const result = await f.run(); assert.equal(result.status, "needs_action", JSON.stringify(result));
    assert.equal(f.calls.filter(command => ["confirm-evaluation", "decide", "next", "start"].includes(command)).length, 0);
    assert.equal(existsSync(join(f.output, "cycle-2")), false);
  });
  test(`${phase}: an action outside fixed run policy cannot authorize decisions or automatic next`, async t => {
    const f = fixture(t, { phase, review: "existing", allowExistingApproval: true, actions: ["retain_current"], maxCycles: 2 });
    const result = await f.run(); assert.equal(result.status, "needs_action"); assert.match(result.detail, /separate application authority/);
    assert.equal(f.calls.filter(command => ["confirm-evaluation", "decide", "next", "start"].includes(command)).length, 0);
  });
}
test("an applicable existing approval needs explicit policy opt-in", async t => {
  const denied = fixture(t, { review: "existing" }); assert.equal((await denied.run()).status, "needs_action");
  assert.equal(denied.calls.includes("confirm-evaluation"), false);
  const allowed = fixture(t, { review: "existing", allowExistingApproval: true });
  assert.equal((await allowed.run()).status, "completed"); assert.equal(allowed.calls.filter(command => command === "decide").length, 1);
});
test("a completed authorized cycle remains readable without execution after the deadline", async t => {
  const f = fixture(t, { phase: "completed" });
  const file = join(f.output, "run-input.json"), fixed = JSON.parse(readFileSync(file)).value;
  fixed.startedAtMs = 1; save(file, fixed);
  assert.equal((await f.run()).status, "completed"); assert.deepEqual(f.calls, ["status", "review-source"]);
});
test("catalog24 unattended admission reserves the same complete two-role limits as its pair", async t => {
  for (const budget of [
    { maxComparisonTokens: 90000000, maxDurationMs: 1224060000, reason: /comparison admission budget/ },
    { maxComparisonTokens: 240000000, maxDurationMs: 604800000, reason: /reserve full comparison/ },
  ]) {
    const f = fixture(t, { fixtureSet: "catalog24", ...budget });
    const result = await f.run(); assert.equal(result.status, "needs_action"); assert.match(result.detail, budget.reason);
    assert.deepEqual(f.calls, [], "insufficient budget must stop before generation/review/comparison callbacks");
  }
  const complete = fixture(t, { fixtureSet: "catalog24", maxComparisonTokens: 240000000, maxDurationMs: 1224060000 });
  assert.equal((await complete.run()).status, "completed");
});
test("invalid explicit fixture selection leaves no unattended lock and starts nothing", async t => {
  for (const selection of [{ fixtureSet: "unknown" }, { fixtureSet: null },
    { fixtureSet: "catalog24", fixtureIds: CANONICAL_PRIMARY_FIXTURE_IDS.slice(1) }]) {
    const f = fixture(t, selection);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await f.run(); assert.equal(result.status, "needs_action");
      assert.notEqual(result.reason, "run_in_progress_or_interrupted");
      assert.equal(existsSync(join(f.output, ".command-lock")), false);
      assert.deepEqual(f.calls, []);
    }
  }
});
