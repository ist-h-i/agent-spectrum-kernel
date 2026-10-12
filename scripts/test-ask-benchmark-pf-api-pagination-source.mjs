import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCodexCommandEvents, renderCommandEvent } from "./ask-benchmark-command-evidence.mjs";
import { PF_API_PAGINATION_FIXTURE_ID, PF_API_PAGINATION_FIXTURE_ROOT, validatePfApiPaginationInputClosure } from "./ask-benchmark-pf-api-pagination-source.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = resolve(root, PF_API_PAGINATION_FIXTURE_ROOT);

test("pagination source closes its complete agent-visible inventory", () => {
  assert.equal(validatePfApiPaginationInputClosure({ root }).fixtureId, PF_API_PAGINATION_FIXTURE_ID);
  const manifest = JSON.parse(readFileSync(resolve(fixture, "input-manifest.json"), "utf8"));
  assert.equal(manifest.fixtures[PF_API_PAGINATION_FIXTURE_ID].files.length, 7);
});

test("source retains the frozen practice-frequency role and metadata", () => {
  const catalog = JSON.parse(readFileSync(resolve(root, "benchmarks/portfolio-catalog.json"), "utf8"));
  const item = catalog.fixtures.find(({ fixture_id }) => fixture_id === PF_API_PAGINATION_FIXTURE_ID);
  assert.equal(item.fixture_role, "primary");
  assert.equal(item.suite, "practice_frequency");
  assert.equal(item.task_class, "implementation_verification");
  assert.equal(item.domain, "backend_api");
  assert.equal(item.difficulty, "medium");
  assert.equal(item.lineage_required, true);
});

test("seed reproduces four pagination regressions with four retained behaviors", () => {
  const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "test/pagination.test.mjs"], { cwd: resolve(fixture, "workspace"), encoding: "utf8", env: environment });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
  for (const number of [1, 2, 3, 4]) assert.match(result.stdout, new RegExp(`not ok ${number} -`, "u"));
  assert.match(result.stdout, /# pass 4/u); assert.match(result.stdout, /# fail 4/u);
});

test("source input drift rejects changed protected decoder", () => {
  const scratch = mkdtempSync(resolve(tmpdir(), "pf-pagination-source-"));
  try {
    const copied = resolve(scratch, PF_API_PAGINATION_FIXTURE_ROOT); cpSync(fixture, copied, { recursive: true });
    writeFileSync(resolve(copied, "workspace/src/api-pages.mjs"), "export const changed = true;\n");
    assert.throws(() => validatePfApiPaginationInputClosure({ root: scratch }), /inventory/u);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("published anchored invocation matches the existing command parser", () => {
  const contract = JSON.parse(readFileSync(resolve(fixture, "verification-command-contract.json"), "utf8"));
  const task = readFileSync(resolve(fixture, "task.md"), "utf8");
  const script = task.match(/```bash\n([^]*?)\n```/u)?.[1];
  assert.equal(script, contract.commands[0].canonical_script);
  const command = renderCommandEvent(contract.commands[0]);
  const stream = Buffer.from([
    { type: "item.started", item: { id: "public-test", type: "command_execution", command, status: "in_progress" } },
    { type: "item.completed", item: { id: "public-test", type: "command_execution", command, status: "completed", exit_code: 0, aggregated_output: "synthetic parser event" } },
    { type: "turn.completed" },
  ].map(value => JSON.stringify(value)).join("\n") + "\n");
  assert.equal(parseCodexCommandEvents({ stream, identity: { purpose: "public command parity" }, contract }).commands[0].match_state, "matched");
});

test("source stage does not self-approve evaluator or lineage admission", () => {
  const record = JSON.parse(readFileSync(resolve(fixture, "final-admission-record.json"), "utf8"));
  assert.equal(record.fixture_id, PF_API_PAGINATION_FIXTURE_ID);
  assert.equal(record.candidate_state, "generation_pending");
  const lineage = readFileSync(resolve(fixture, "lineage.md"), "utf8");
  assert.match(lineage, /Frequency band: `unknown`/u);
  assert.match(lineage, /Impact band: `unknown`/u);
});
