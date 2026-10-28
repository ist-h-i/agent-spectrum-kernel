import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { verifyBuildOptionBaseline } from "./test-helpers-build-option-baseline.mjs";

export function assertBuildOptionBaselineChecks() {
  let checks = 0;
  for (const ready of [true, false]) {
    const events = [], result = { scoringReady: ready, result: { fixture: "artificial" } };
    const value = verifyBuildOptionBaseline(
      () => { events.push("boundary"); return result; },
      () => { events.push("authority"); return { evaluationReady: ready }; },
      "artificial",
    );
    assert.strictEqual(value, result);
    assert.deepEqual(events, ["boundary", "authority"]);
    assert.deepEqual(result, { scoringReady: ready, result: { fixture: "artificial" } });
    checks++;
  }
  const boundaryError = new Error("artificial boundary rejection");
  let authorityCalls = 0;
  assert.throws(() => verifyBuildOptionBaseline(() => { throw boundaryError; }, () => { authorityCalls++; }, "invalid"), e => e === boundaryError);
  assert.equal(authorityCalls, 0);
  checks++;
  const authorityError = new Error("artificial authority rejection");
  assert.throws(() => verifyBuildOptionBaseline(() => ({ scoringReady: true }), () => { throw authorityError; }, "invalid"), e => e === authorityError);
  checks++;
  assert.throws(() => verifyBuildOptionBaseline(() => ({ scoringReady: true }), () => ({ evaluationReady: false }), "invalid"), /binary evaluation completeness/);
  checks++;
  assert.throws(() => verifyBuildOptionBaseline(() => ({ scoringReady: false }), () => ({ evaluationReady: false, scoringReady: false }), "invalid"), /must not expose scoring readiness/);
  checks++;
  let boundaryCalls = 0;
  authorityCalls = 0;
  const boundary = () => ({ scoringReady: Boolean(++boundaryCalls % 2) });
  const authority = () => { authorityCalls++; return { evaluationReady: Boolean(boundaryCalls % 2) }; };
  assert.equal(verifyBuildOptionBaseline(boundary, authority, "first").scoringReady, true);
  assert.equal(verifyBuildOptionBaseline(boundary, authority, "second").scoringReady, false);
  assert.equal(boundaryCalls, 2);
  assert.equal(authorityCalls, 2);
  checks++;
  return checks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Build-option baseline checks passed (${assertBuildOptionBaselineChecks()} cases)`);
}
