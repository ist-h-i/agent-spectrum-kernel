import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  return { temp, directory, mutate(file, from, to) {
    const path = resolve(directory, file);
    const source = readFileSync(path, "utf8");
    assert.ok(source.includes(from), `mutation anchor missing: ${file}`);
    writeFileSync(path, source.replace(from, to));
  } };
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
  assert.equal(report.scenarios.length, 8);
  assert.deepEqual(snapshot.cases[5].input, { type: "string", value: "3" });
  assert.deepEqual(snapshot.cases[7].input, { type: "number", value: "NaN" });
  assert.ok(report.scenarios.every((item) => item.fields.every((field) => field.observation === "unobserved")));
  assert.equal(renderReport(report), renderReport(buildReport(makeSnapshot())));
});

test("real node:test execution matches all eight fixture cases and both assertions", () => {
  const report = runReview(makeSnapshot());
  assert.equal(report.execution.exit_code, 0);
  assert.match(report.execution.stdout, /tests 3/);
  assert.ok(report.scenarios.every((item) => !item.input_drift && item.fields.every((field) =>
    field.expectation === "match" && field.observation === "match" && field.assertion === "passed")));
});

test("wrong test expectation is visible against a retained specification snapshot", (t) => {
  const f = fixture(t);
  f.mutate("reservation.test.mjs", 'assert.equal(state.reserved, scenario.expected.reserved, "reserved");', 'assert.equal(state.reserved, 8, "reserved");');
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 1);
  const field = report.scenarios[0].fields[1];
  assert.equal(field.expectation, "different");
  assert.equal(field.observation, "match");
  assert.equal(field.assertion, "failed");
  assert.ok(report.source_drift.includes("reservation.test.mjs"));
});

test("an observed correct value with a missing assertion stays unasserted", (t) => {
  const f = fixture(t);
  f.mutate("reservation.test.mjs", 'assert.equal(state.reserved, scenario.expected.reserved, "reserved");', "// Intentionally no state assertion in this candidate.");
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 0);
  assert.equal(report.scenarios[1].fields[1].observation, "match");
  assert.equal(report.scenarios[1].fields[1].assertion, "unasserted");
});

test("a rejected reservation that mutates state is an observable mismatch", (t) => {
  const f = fixture(t);
  f.mutate("reservation.mjs", 'return { ok: false, error: "CAPACITY_EXCEEDED" };', 'state.reserved += 1; return { ok: false, error: "CAPACITY_EXCEEDED" };');
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 1);
  assert.equal(report.scenarios[1].fields[1].actual, 8);
  assert.equal(report.scenarios[1].fields[1].observation, "different");
});

test("changed input and assertion on an unrelated value cannot look like valid coverage", (t) => {
  const f = fixture(t);
  f.mutate("reservation.test.mjs", 'observation.call(reserve, state, scenario.quantity)', 'observation.call(reserve, state, 1)');
  const report = reviewFixture(f);
  assert.equal(report.scenarios[0].input_drift, true);
  assert.equal(report.scenarios[0].candidate.input.value, 1);
  const forged = { id: "at-capacity", observed: { result: { ok: true, reserved: 10 }, reserved: 10 }, assertions: [
    { field: "reserved", actual: 7, expected: 7, passed: true },
  ] };
  assert.equal(buildReport(makeSnapshot(), [forged], {}).scenarios[0].fields[1].assertion, "unbound");
});

test("runner failure leaves observations missing; rendering does not convert it to success", (t) => {
  const f = fixture(t);
  f.mutate("reservation.test.mjs", 'import test from "node:test";', 'import test from "./missing-runner.mjs";');
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 1);
  assert.ok(report.scenarios.every((item) => item.fields.every((field) => field.observation === "unobserved")));
});

test("input drift still requires attention when the result and every assertion match", (t) => {
  const f = fixture(t);
  f.mutate("reservation.test.mjs", 'observation.call(reserve, state, scenario.quantity)', 'observation.call(reserve, state, scenario.id === "over-capacity" ? 5 : scenario.quantity)');
  const report = reviewFixture(f);
  assert.equal(report.execution.exit_code, 0);
  const scenario = report.scenarios[1];
  assert.ok(scenario.fields.every((field) => field.expectation === "match" && field.observation === "match" && field.assertion === "passed"));
  assert.equal(scenario.input_drift, true);
  assert.equal(scenario.needs_attention, true);
});

test("changed accepted fixtures cannot rewrite a previously retained snapshot", (t) => {
  const f = fixture(t);
  f.mutate("reservation.cases.mjs", 'ok: true, reserved: 10 }, reserved: 10', 'ok: true, reserved: 9 }, reserved: 9');
  const report = reviewFixture(f);
  assert.equal(report.scenarios[0].fields[0].expected.reserved, 10);
  assert.equal(report.scenarios[0].fields[0].test_expected.reserved, 9);
  assert.equal(report.scenarios[0].fields[0].expectation, "different");
  assert.ok(report.source_drift.includes("reservation.cases.mjs"));
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
  const field = buildReport(makeSnapshot(), [record], {}).scenarios[0].fields[1];
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
