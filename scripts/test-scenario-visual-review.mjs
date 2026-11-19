import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildReport, makeSnapshot, renderReport, runReview, validateSnapshot } from "../skills/spec-driven-development/references/examples/javascript/scenario-review.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const example = "skills/spec-driven-development/references/examples";
function fixture(t) {
  const temp = mkdtempSync(resolve(tmpdir(), "ask-scenario-test-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  cpSync(resolve(root, example), resolve(temp, "examples"), { recursive: true });
  const directory = resolve(temp, "examples/javascript");
  return { temp, directory,
    write(file, source) { writeFileSync(resolve(directory, file), source); },
    wrap(file, body) {
      // Use the module's public interface: moving or reformatting the real
      // implementation must not invalidate a negative control.
      const original = file.replace(".mjs", ".original.mjs");
      renameSync(resolve(directory, file), resolve(directory, original));
      this.write(file, `import * as original from "./${original}";\nexport * from "./${original}";\n${body}\n`);
    },
  };
}
function caseOf(report, id) {
  const value = report.scenarios.find((item) => item.id === id);
  assert.ok(value, `missing case: ${id}`);
  return value;
}
// Deliberately faulty candidate tests exercise real assertions and the same
// observer. Only the disposable candidate changes; no source-text patching.
function candidateTest(f, { input = "entry.quantity", state = "entry.expected.reserved", omit = false } = {}) {
  f.write("reservation.test.mjs", `
    import test from "node:test";
    import { cases } from "./reservation.cases.mjs";
    import { reserve } from "./reservation.mjs";
    import { observeReservation } from "./scenario-observer.mjs";
    for (const entry of cases) test(entry.id, () => {
      const before = { ...entry.before }, observation = observeReservation(entry.id);
      try {
        const result = observation.call(reserve, before, ${input});
        observation.assert.deepEqual(result, entry.expected.result, "result");
        ${omit ? "" : `observation.assert.equal(before.reserved, ${state}, "reserved");`}
      } finally { observation.flush(); }
    });
  `);
}

function reviewFixture(fixture, snapshot = makeSnapshot()) {
  const baseline = resolve(fixture.temp, "baseline.json");
  writeFileSync(baseline, JSON.stringify(snapshot));
  const run = spawnSync(process.execPath, ["--input-type=module", "-e",
    'import {runReview} from "./scenario-review.mjs"; import {readFileSync} from "node:fs"; console.log(JSON.stringify(runReview(JSON.parse(readFileSync(process.argv[1],"utf8")))));', baseline],
  { cwd: fixture.directory, encoding: "utf8", timeout: 20000 });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("preview is deterministic, typed, unexecuted and never grants human approval", () => {
  const snapshot = makeSnapshot();
  const report = buildReport(snapshot);
  assert.equal(report.mode, "preview");
  assert.equal(report.execution, null);
  assert.equal(snapshot.human_review, "not_recorded");
  assert.ok(report.scenarios.length > 0);
  assert.deepEqual(caseOf(report, "invalid-3").input, { type: "string", value: "3" });
  assert.deepEqual(caseOf(report, "invalid-5").input, { type: "number", value: "NaN" });
  assert.ok(report.scenarios.every((item) => item.fields.every((field) => field.observation === "unobserved")));
  assert.equal(renderReport(report), renderReport(buildReport(makeSnapshot())));
});

test("real node:test execution matches the fixture inputs and both observations", () => {
  const report = runReview(makeSnapshot());
  assert.equal(report.execution.exit_code, 0);
  assert.ok(report.scenarios.length > 0);
  assert.ok(report.scenarios.every((item) => !item.input_drift && item.fields.every((field) =>
    field.expectation === "match" && field.observation === "match" && field.assertion === "passed")));
});

test("wrong test expectation is visible against a retained specification snapshot", (t) => {
  const f = fixture(t);
  candidateTest(f, { state: "8" });
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 1);
  const field = caseOf(report, "at-capacity").fields[1];
  assert.equal(field.expectation, "different");
  assert.equal(field.observation, "match");
  assert.equal(field.assertion, "failed");
  assert.ok(report.source_drift.includes("reservation.test.mjs"));
});

test("an observed correct value with a missing assertion stays unasserted", (t) => {
  const f = fixture(t);
  candidateTest(f, { omit: true });
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 0);
  assert.equal(caseOf(report, "over-capacity").fields[1].observation, "match");
  assert.equal(caseOf(report, "over-capacity").fields[1].assertion, "unasserted");
});

test("a rejected reservation that mutates state is an observable mismatch", (t) => {
  const f = fixture(t);
  f.wrap("reservation.mjs", `export function reserve(state, quantity) {
    const result = original.reserve(state, quantity);
    if (result.error === "CAPACITY_EXCEEDED") state.reserved += 1;
    return result;
  }`);
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 1);
  assert.equal(caseOf(report, "over-capacity").fields[1].actual, 8);
  assert.equal(caseOf(report, "over-capacity").fields[1].observation, "different");
});

test("changed input and assertion on an unrelated value cannot look like valid coverage", (t) => {
  const f = fixture(t);
  candidateTest(f, { input: "1" });
  const report = reviewFixture(f);
  assert.equal(caseOf(report, "at-capacity").input_drift, true);
  assert.equal(caseOf(report, "at-capacity").candidate.input.value, 1);
  const forged = { id: "at-capacity", observed: { result: { ok: true, reserved: 10 }, reserved: 10 }, assertions: [
    { field: "reserved", actual: 7, expected: 7, passed: true },
  ] };
  assert.equal(caseOf(buildReport(makeSnapshot(), [forged], {}), "at-capacity").fields[1].assertion, "unbound");
});

test("runner failure leaves observations missing; rendering does not convert it to success", (t) => {
  const f = fixture(t);
  f.write("reservation.test.mjs", 'import "./missing-runner.mjs";\n');
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 1);
  assert.ok(report.scenarios.every((item) => item.fields.every((field) => field.observation === "unobserved")));
});

test("input drift still requires attention when the result and every assertion match", (t) => {
  const f = fixture(t);
  candidateTest(f, { input: 'entry.id === "over-capacity" ? 5 : entry.quantity' });
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 0);
  const scenario = caseOf(report, "over-capacity");
  assert.ok(scenario.fields.every((field) => field.expectation === "match" && field.observation === "match" && field.assertion === "passed"));
  assert.equal(scenario.input_drift, true);
  assert.equal(scenario.needs_attention, true);
});

test("changed accepted fixtures cannot rewrite a previously retained snapshot", (t) => {
  const f = fixture(t);
  f.wrap("reservation.cases.mjs", `export const cases = original.cases.map(entry =>
    entry.id === "at-capacity" ? { ...entry, expected: { result: { ok: true, reserved: 9 }, reserved: 9 } } : entry);`);
  const report = reviewFixture(f);
  assert.equal(caseOf(report, "at-capacity").fields[0].expected.reserved, 10);
  assert.equal(caseOf(report, "at-capacity").fields[0].test_expected.reserved, 9);
  assert.equal(caseOf(report, "at-capacity").fields[0].expectation, "different");
  assert.ok(report.source_drift.includes("reservation.cases.mjs"));
});

function targetedReservation(f, withTrace = false) {
  const trace = resolve(f.temp, "targeted.jsonl");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  if (withTrace) env.ASK_SCENARIO_TRACE = trace;
  const run = spawnSync(process.execPath, ["--test", "--test-name-pattern", "残数と同じ数量", "reservation.test.mjs"], {
    cwd: f.directory, env, encoding: "utf8",
  });
  const ids = withTrace && run.status === 0
    ? readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).map((row) => JSON.parse(row).id) : [];
  return { status: run.status, ids, output: run.stdout + run.stderr };
}

test("reordering preserves the focused acceptance item; empty or wrongly bound groups cannot pass", (t) => {
  const reordered = fixture(t);
  reordered.wrap("reservation.cases.mjs", "export const cases = [...original.cases].reverse();");
  const focused = targetedReservation(reordered, true);
  assert.equal(focused.status, 0, focused.output);
  assert.deepEqual(focused.ids, ["at-capacity"]);
  const empty = fixture(t);
  empty.wrap("reservation.cases.mjs", 'export const cases = original.cases.filter(c => c.item_id !== "AC-AT-CAPACITY");');
  assert.notEqual(targetedReservation(empty).status, 0);
});

test("a changed item binding needs attention even when inputs and asserted values are the same", (t) => {
  const f = fixture(t);
  const oldSource = fixture(t);
  oldSource.wrap("reservation.cases.mjs", `export const spec = { ...original.spec, revision: 1 };
    export const cases = original.cases.map(entry => entry.id === "at-capacity"
      ? { ...entry, item_id: "AC-FORMER-RESERVATION-RULE" } : entry);`);
  const oldSnapshot = spawnSync(process.execPath, ["--input-type=module", "-e",
    'import {makeSnapshot} from "./scenario-review.mjs"; console.log(JSON.stringify(makeSnapshot()));'
  ], { cwd: oldSource.directory, encoding: "utf8" });
  assert.equal(oldSnapshot.status, 0, oldSnapshot.stderr);
  const previous = JSON.parse(oldSnapshot.stdout);
  const report = reviewFixture(f, previous);
  const at = caseOf(report, "at-capacity");
  assert.equal(report.execution.exit_code, 0);
  assert.equal(at.item_id, "AC-FORMER-RESERVATION-RULE");
  assert.equal(at.current_item_id, "AC-AT-CAPACITY");
  assert.ok(report.source_drift.includes("reservation.cases.mjs") && report.revision_drift);
  assert.equal(at.item_drift, true);
  assert.equal(at.needs_attention, true);
  assert.ok(!at.input_drift && at.fields.every(field => field.observation === "match"));
  assert.equal(caseOf(report, "over-capacity").item_drift, false);
});

test("same behavior through a refactor passes; hard-coding the capacity rejects the candidate", (t) => {
  const same = fixture(t);
  same.wrap("reservation.mjs", "export const reserve = (...args) => original.reserve(...args);");
  const equivalent = reviewFixture(same);
  assert.equal(equivalent.execution.exit_code, 0);
  assert.ok(equivalent.scenarios.every(c => !c.needs_attention));
  const wrong = fixture(t);
  wrong.wrap("reservation.mjs", `export function reserve(state, quantity) {
    const forced = { ...state, capacity: 10 };
    const result = original.reserve(forced, quantity);
    state.reserved = forced.reserved;
    return result;
  }`);
  const rejected = reviewFixture(wrong);
  assert.equal(rejected.execution.exit_code, 1);
  const small = caseOf(rejected, "over-smaller-capacity");
  assert.equal(small.needs_attention, true);
  assert.deepEqual(small.fields.find(field => field.field === "result").actual, { ok: true, reserved: 9 });
});

test("malformed, duplicate and purportedly approved snapshots are rejected", () => {
  for (const change of [
    (s) => { s.human_review = "approved"; },
    (s) => { s.cases.push(s.cases[0]); },
    (s) => { delete s.sources; },
    (s) => { s.cases[0].before.capacity = 1000000; },
  ]) { const snapshot = makeSnapshot(); change(snapshot); assert.throws(() => validateSnapshot(snapshot)); }
});

test("duplicate assertion bindings are ambiguous and cannot be credited as coverage", () => {
  const assertion = { field: "reserved", method: "equal", actual: 10, expected: 10, passed: true };
  const record = { id: "at-capacity", observed: { reserved: 10 }, assertions: [assertion, assertion] };
  const field = caseOf(buildReport(makeSnapshot(), [record], {}), "at-capacity").fields[1];
  assert.equal(field.observation, "match");
  assert.equal(field.assertion, "ambiguous");
  assert.equal(field.expectation, "ambiguous");
});

test("HTML treats source content as data, including closing script tags and replacement tokens", () => {
  const snapshot = makeSnapshot();
  snapshot.cases[0].title = '</script><script>globalThis.injected=true</script> $&';
  const html = renderReport(buildReport(snapshot));
  assert.ok(!html.includes('<script>globalThis.injected'));
  assert.ok(html.includes('\\u003c/script>'));
  assert.ok(html.includes('$&'));
  assert.ok(!html.includes('/*__SCENARIO_DATA__*/null'));
  assert.ok(!/https?:\/\//.test(html.replace('http://www.w3.org/2000/svg', '')));
});

test("documented CLI produces standalone files, preserves skill assets and refuses overwrites", (t) => {
  const f = fixture(t);
  const assets = () => readdirSync(resolve(f.temp, "examples"), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
    const path = resolve(entry.parentPath, entry.name);
    return [path, readFileSync(path)];
  });
  const before = assets();
  const preview = resolve(f.temp, "preview.html"), snapshot = resolve(f.temp, "snapshot.json"), review = resolve(f.temp, "review.html");
  const run = (...args) => spawnSync(process.execPath, ["scenario-review.mjs", ...args], { cwd: f.directory, encoding: "utf8", timeout: 20000 });
  assert.equal(run("preview", "--out", preview, "--snapshot", snapshot).status, 0);
  assert.equal(run("review", "--baseline", snapshot, "--out", review).status, 0);
  assert.match(readFileSync(review, "utf8"), /"mode":"review"/);
  assert.equal(run("preview", "--out", preview, "--snapshot", snapshot).status, 1);
  assert.deepEqual(assets(), before);
});
