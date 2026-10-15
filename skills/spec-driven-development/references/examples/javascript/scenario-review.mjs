import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { cases, spec } from "./reservation.cases.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const sourcePaths = ["reservation.cases.mjs", "reservation.test.mjs", "reservation.mjs", "scenario-observer.mjs", "scenario-review.mjs", "scenario-player.html", "../domain-context.md"];
const sources = () => Object.fromEntries(sourcePaths.map((path) => [path, sha(readFileSync(resolve(directory, path)))]));
const input = (value) => ({ type: typeof value, value: Number.isNaN(value) ? "NaN" : value });

export function makeSnapshot() {
  return {
    format: "reservation-scenario-example/1", spec: { ...spec },
    human_review: "not_recorded", sources: sources(),
    cases: cases.map(({ quantity, ...scenario }) => ({ ...structuredClone(scenario), input: input(quantity) })),
  };
}

// This validator belongs to the bounded example, not to an ASK-wide scenario DSL.
export function validateSnapshot(snapshot) {
  const validResult = (result) => result && typeof result === "object" &&
    (result.ok === true && Number.isSafeInteger(result.reserved) && result.reserved >= 0 ||
     result.ok === false && typeof result.error === "string" && result.error.length > 0);
  if (snapshot?.format !== "reservation-scenario-example/1" || snapshot.spec?.artifact_id !== spec.artifact_id ||
      !Number.isSafeInteger(snapshot.spec.revision) || snapshot.spec.revision < 1 ||
      snapshot.human_review !== "not_recorded" || !Array.isArray(snapshot.cases) || !snapshot.cases.length || snapshot.cases.length > 100) {
    throw new Error("Invalid reservation snapshot; use a generated preview snapshot. Human approval stays in the source review record.");
  }
  for (const path of sourcePaths) {
    if (!/^[a-f0-9]{64}$/.test(snapshot.sources?.[path] ?? "")) throw new Error(`Missing source digest: ${path}`);
  }
  const ids = new Set();
  for (const entry of snapshot.cases) {
    if (typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || typeof entry.item_id !== "string" ||
        typeof entry.title !== "string" || !entry.input || !["number", "string", "boolean"].includes(entry.input.type) ||
        !Number.isSafeInteger(entry.before?.capacity) || entry.before.capacity < 1 || entry.before.capacity > 10 ||
        !Number.isSafeInteger(entry.before.reserved) || entry.before.reserved < 0 || entry.before.reserved > entry.before.capacity ||
        !validResult(entry.expected?.result) || !Number.isSafeInteger(entry.expected.reserved) || entry.expected.reserved < 0) {
      throw new Error(`Invalid or duplicate scenario: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return snapshot;
}

export function compareScenario(scenario, record) {
  return ["result", "reserved"].map((field) => {
    const observed = record?.observed && Object.hasOwn(record.observed, field);
    const assertions = record?.assertions?.filter((item) => item.field === field) ?? [];
    const assertion = assertions.length === 1 ? assertions[0] : null;
    const bound = assertion && observed && isDeepStrictEqual(assertion.actual, record.observed[field]);
    return {
      field, expected: scenario.expected[field],
      test_expected: assertion ? assertion.expected : null,
      actual: observed ? record.observed[field] : null,
      expectation: assertions.length > 1 ? "ambiguous" : !assertion ? "unasserted" : isDeepStrictEqual(assertion.expected, scenario.expected[field]) ? "match" : "different",
      observation: !observed ? "unobserved" : isDeepStrictEqual(record.observed[field], scenario.expected[field]) ? "match" : "different",
      assertion: assertions.length > 1 ? "ambiguous" : !assertion ? "unasserted" : !bound ? "unbound" : assertion.passed ? "passed" : "failed",
    };
  });
}

export function buildReport(snapshot, records = [], execution = null) {
  validateSnapshot(snapshot);
  const current = makeSnapshot();
  const byId = new Map();
  for (const record of records) {
    if (!record || typeof record.id !== "string" || byId.has(record.id) || !Array.isArray(record.assertions)) {
      throw new Error("Duplicate or malformed observation; do not combine runs.");
    }
    byId.set(record.id, record);
  }
  return {
    mode: execution ? "review" : "preview", snapshot,
    snapshot_digest: sha(JSON.stringify(snapshot)), current_sources: current.sources,
    source_drift: sourcePaths.filter((path) => snapshot.sources[path] !== current.sources[path]),
    revision_drift: snapshot.spec.revision !== current.spec.revision,
    execution,
    extra_cases: [...new Set([...current.cases.map((item) => item.id), ...byId.keys()])].filter((id) => !snapshot.cases.some((item) => item.id === id)),
    scenarios: snapshot.cases.map((scenario) => {
      const candidate = current.cases.find((item) => item.id === scenario.id);
      const record = byId.get(scenario.id);
      const context = record?.before ? { before: record.before, input: record.input } : null;
      const inputDrift = execution ? !context || !isDeepStrictEqual([scenario.before, scenario.input], [context.before, context.input]) : false;
      const fields = compareScenario(scenario, record);
      return {
        ...scenario,
        input_drift: inputDrift,
        candidate: context,
        removed: !candidate,
        needs_attention: Boolean(execution && (inputDrift || !candidate || fields.some((field) => field.expectation !== "match" || field.observation !== "match" || field.assertion !== "passed"))),
        fields,
      };
    }),
  };
}

export function runReview(snapshot) {
  const scratch = mkdtempSync(resolve(tmpdir(), "ask-scenario-"));
  const trace = resolve(scratch, "trace.jsonl");
  const before = sources();
  try {
    const env = { ...process.env, ASK_SCENARIO_TRACE: trace };
    // The parent may itself be a node:test worker. Its private runner context
    // would suppress this independent child's normal test execution/reporting.
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--test", resolve(directory, "reservation.test.mjs")], {
      cwd: directory, encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024,
      env,
    });
    if (!isDeepStrictEqual(before, sources())) throw new Error("Sources changed during execution; run again from a stable tree.");
    const records = existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
    return buildReport(snapshot, records, {
      command: "node --test reservation.test.mjs", exit_code: run.status,
      error: run.error?.message ?? (run.signal ? `signal: ${run.signal}` : null),
      stdout: run.stdout ?? "", stderr: run.stderr ?? "",
      scope: "unit / local function / no mocks; no persistence, authorization, concurrency or notifications",
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function renderReport(report) {
  // Data is inert JSON; dynamic labels use textContent. A test title or error
  // containing HTML must never become executable markup in the exported file.
  const data = JSON.stringify(report).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return readFileSync(resolve(directory, "scenario-player.html"), "utf8").replace("/*__SCENARIO_DATA__*/null", () => data);
}

function main(argv) {
  const mode = argv.shift();
  const options = {};
  while (argv.length) {
    const key = argv.shift();
    if (!["--out", "--snapshot", "--baseline"].includes(key) || !argv.length || argv[0].startsWith("--") || options[key]) throw new Error("Invalid or repeated option");
    options[key] = resolve(argv.shift());
  }
  if (!["preview", "review"].includes(mode) || !options["--out"] ||
      (mode === "preview" && (!options["--snapshot"] || options["--baseline"])) ||
      (mode === "review" && (!options["--baseline"] || options["--snapshot"]))) {
    throw new Error("Usage: node scenario-review.mjs preview --out /tmp/preview.html --snapshot /tmp/spec.json\n       node scenario-review.mjs review --baseline /tmp/spec.json --out /tmp/review.html");
  }
  const outputs = [options["--out"], options["--snapshot"]].filter(Boolean);
  if (new Set(outputs).size !== outputs.length) throw new Error("Output paths must differ");
  for (const path of outputs) if (existsSync(path)) throw new Error(`Output already exists: ${path}; choose a new path`);
  const snapshot = mode === "preview" ? makeSnapshot() : validateSnapshot(JSON.parse(readFileSync(options["--baseline"], "utf8")));
  const report = mode === "preview" ? buildReport(snapshot) : runReview(snapshot);
  writeFileSync(options["--out"], renderReport(report), { flag: "wx" });
  if (options["--snapshot"]) writeFileSync(options["--snapshot"], `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
  console.log(`${mode}: ${report.scenarios.length} scenarios -> ${options["--out"]}`);
  if (report.execution && (report.execution.exit_code !== 0 || report.execution.error)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
