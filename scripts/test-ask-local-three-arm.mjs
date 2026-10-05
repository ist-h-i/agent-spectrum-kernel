import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareThreeArm, runSyntheticThreeArm, replayThreeArm, buildNativeThreeArmCandidate, THREE_ARM_ORDERS } from "./ask-local-three-arm.mjs";
function fresh(t) { const p = mkdtempSync(join(realpathSync(tmpdir()), "ask-three-arm-test-")); t.after(() => rmSync(p, { recursive: true, force: true })); return join(p, "comparison"); }
function copyNewPrivateTree(source, target) {
  mkdirSync(target, { mode: 0o700 });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) copyNewPrivateTree(from, to);
    else { assert.ok(entry.isFile()); writeFileSync(to, readFileSync(from), { flag: "wx", mode: 0o600 }); }
  }
}
test("three arms use actual package and equal public inputs; no measured comparison from synthetic success", t => {
  const root = fresh(t), protocol = prepareThreeArm(root);
  assert.equal(protocol.preparation.static_package_eligible, true);
  assert.equal(protocol.preparation.supplement.assets, 40);
  assert.equal(protocol.task_qualification.public_inputs.status, "verified");
  assert.equal(protocol.task_qualification.private_evaluator, "unknown");
  assert.equal(protocol.task_qualification.public_evaluator_reference.status, "blocked");
  assert.equal(protocol.live_ready, false);
  const candidate = buildNativeThreeArmCandidate(root, protocol.protocol_digest, "/unexecuted/codex");
  assert.equal(candidate.status, "unadmitted_command_candidate");
  assert.equal(candidate.launches.length, 3);
  assert.equal(candidate.model_calls, 0);
  assert.ok(candidate.launches.every(x => x.input === candidate.launches[0].input));
  const result = runSyntheticThreeArm(root, protocol.protocol_digest);
  assert.equal(result.status, "synthetic_protocol_complete");
  assert.deepEqual(result.slots.map(x => x.condition), THREE_ARM_ORDERS[0]);
  assert.ok(result.slots.every(x => x.attempts === 1 && x.usage.provenance === "synthetic"));
  assert.equal(result.model_calls, 0);
  assert.equal(result.measured_comparison_valid, false);
  assert.equal(result.semantic_scores, "unknown");
  assert.deepEqual(replayThreeArm(root, protocol.protocol_digest, result.result_digest), result);
  assert.throws(() => runSyntheticThreeArm(root, protocol.protocol_digest), /protocol_already_claimed/);
  writeFileSync(join(root, "control/slots/plain.json"), "{}");
  assert.equal(replayThreeArm(root, protocol.protocol_digest, result.result_digest).status, "blocked");
});
test("all six balanced orders are closed and native execution cannot be requested", t => {
  assert.equal(new Set(THREE_ARM_ORDERS.map(x => x.join(","))).size, 6);
  for (const order of THREE_ARM_ORDERS) assert.deepEqual([...order].sort(), ["full_ask", "kernel_only", "plain"]);
  const root = fresh(t);
  assert.throws(() => prepareThreeArm(root, { mode: "native" }), /native_execution_not_admitted/);
  assert.throws(() => prepareThreeArm(root, { orderIndex: 6 }), /invalid_protocol_options/);
});
test("unknown/failure/usage/timeout/identity stop before the next slot with no retry", t => {
  const root = fresh(t), protocol = prepareThreeArm(root, { scenarios: ["unknown-usage", "pass", "pass"] });
  const result = runSyntheticThreeArm(root, protocol.protocol_digest);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "usage_unknown");
  assert.equal(result.slots.length, 1);
  assert.equal(result.slots[0].attempts, 1);
  assert.equal(result.planned_slots.length, 3);
  assert.deepEqual(result.planned_slots.slice(1), [{ condition: "kernel_only", status: "not_started", attempts: 0 }, { condition: "full_ask", status: "not_started", attempts: 0 }]);
  assert.deepEqual(replayThreeArm(root, protocol.protocol_digest, result.result_digest), result);
});
test("caller-retained digests are mandatory and changes block before claims", t => {
  const root = fresh(t), protocol = prepareThreeArm(root);
  assert.throws(() => runSyntheticThreeArm(root), /external_protocol_digest_required/);
  const path = join(root, "control/protocol.json"), bytes = readFileSync(path);
  const unbound = JSON.parse(bytes); delete unbound.implementation_digests["scripts/ask-benchmark-evaluator-boundary.mjs"];
  const changed = `${JSON.stringify(unbound, null, 2)}\n`; writeFileSync(path, changed);
  const changedDigest = `sha256:${createHash("sha256").update(changed).digest("hex")}`;
  assert.throws(() => runSyntheticThreeArm(root, changedDigest), /invalid_protocol/);
  writeFileSync(path, bytes);
  writeFileSync(path, bytes.toString().replace('"mode": "synthetic"', '"mode": "native"'));
  assert.throws(() => runSyntheticThreeArm(root, protocol.protocol_digest), /protocol_digest_changed/);
});

test("all transport failure boundaries stop once and preserve replayable evidence", t => {
  const base = fresh(t), protocol = prepareThreeArm(base);
  const expected = { failure: "transport_failure", unknown: "transport_unknown", interrupt: "transport_interrupt",
    identity: "identity_mismatch", timeout: "timeout", "token-at": "trial_token_threshold", "token-over": "trial_token_threshold" };
  for (const [scenario, reason] of Object.entries(expected)) {
    const root = `${base}-${scenario}`; copyNewPrivateTree(base, root);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const plan = JSON.parse(readFileSync(join(root, "control/protocol.json"))); plan.scenarios = [scenario, "pass", "pass"];
    const bytes = `${JSON.stringify(plan, null, 2)}\n`; writeFileSync(join(root, "control/protocol.json"), bytes);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const result = runSyntheticThreeArm(root, digest);
    assert.equal(result.reason, reason); assert.equal(result.slots.length, 1);
    assert.deepEqual(replayThreeArm(root, digest, result.result_digest), result);
  }
  const root = `${base}-duplicate`; copyNewPrivateTree(base, root); t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = JSON.parse(readFileSync(join(root, "control/protocol.json"))); plan.scenarios = ["pass", "duplicate-session", "pass"];
  const bytes = `${JSON.stringify(plan, null, 2)}\n`; writeFileSync(join(root, "control/protocol.json"), bytes);
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const result = runSyntheticThreeArm(root, digest); assert.equal(result.reason, "session_reused"); assert.equal(result.slots.length, 2);
});
