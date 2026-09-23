import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  assertSuccessorExecutionConfigObject, assertSuccessorFrozenAdmissionOptions,
  SUCCESSOR_UNPINNED_ADMISSION_FIELDS,
} from "./ask-benchmark-prompt-successor-scoring-inputs.mjs";

// Pure guard tests: no source capability, evaluator, provider or result access.
const root = resolve("synthetic-input-guard-root");
const configPath = resolve(root, "config.json");
const pinned = {
  protocol_path: "benchmarks/protocol-adaptive.md", fixture_root: "fixtures",
  fixtures: [{ id: "cal-session-refresh", repetitions: 3, source_fixture_id: "pr-session-refresh-medium-hard", aggregate_eligible: false }],
  adapter_tracks: [{ id: "codex", runtime_status: "unverified" }],
  conditions: [{ id: "full_ask" }], privacy: { store_raw_prompts: false },
};
const config = () => ({ ...structuredClone(pinned), _kind: "portfolio", _configPath: configPath, _protocolPath: resolve(root, pinned.protocol_path) });
const verify = value => assertSuccessorExecutionConfigObject(value, pinned, { root, configPath });

test("exact pinned public content and loader metadata pass without mutation", () => {
  const value = config(); const before = structuredClone(value);
  verify(value); verify(Object.fromEntries(Object.entries(value).reverse()));
  assert.deepEqual(value, before);
});
for (const [name, mutate] of [
  ["repetitions", c => { c.fixtures[0].repetitions++; }],
  ["fixture identity", c => { c.fixtures[0].id = "cal-other"; }],
  ["source mapping", c => { c.fixtures[0].source_fixture_id = "other-source"; }],
  ["fixture inventory", c => { c.fixtures = []; }],
  ["fixture root", c => { c.fixture_root = "other-fixtures"; }],
  ["adapter", c => { c.adapter_tracks[0].id = "claude"; }],
  ["conditions", c => { c.conditions.push({ id: "plain" }); }],
  ["privacy", c => { c.privacy.store_raw_prompts = true; }],
  ["public protocol", c => { c.protocol_path = "other.md"; }],
  ["loader protocol", c => { c._protocolPath = resolve(root, "other.md"); }],
  ["loader config path", c => { c._configPath = resolve(root, "other.json"); }],
  ["loader kind", c => { c._kind = "other"; }],
  ["unknown public key", c => { c.allow_override = true; }],
  ["unknown underscore key", c => { c._override = true; }],
  ["missing public key", c => { delete c.privacy; }],
  ["missing loader key", c => { delete c._kind; }],
]) test(`config guard rejects changed ${name}`, () => {
  const value = config(); mutate(value);
  assert.throws(() => verify(value), { code: "SUCCESSOR_IDENTITY_MISMATCH" });
});
test("non-object configs and invalid loader paths fail closed", () => {
  for (const value of [null, [], "config"]) assert.throws(() => verify(value), { code: "SUCCESSOR_SHAPE_INVALID" });
  for (const value of [null, undefined, "", 1]) {
    assert.throws(() => verify({ ...config(), _configPath: value }), { code: "SUCCESSOR_SCORING_INPUT_PATH" });
  }
});
test("frozen-only evaluator options require no new admission authority", () => {
  const options = { resultPath: "synthetic-result.json", privateRoot: "synthetic-private" };
  const before = structuredClone(options); assertSuccessorFrozenAdmissionOptions(options); assert.deepEqual(options, before);
});
for (const field of SUCCESSOR_UNPINNED_ADMISSION_FIELDS) test(`admission guard rejects ${field} by presence, including empty placeholders`, () => {
  for (const value of ["never-opened", null, undefined, false, ""]) {
    assert.throws(() => assertSuccessorFrozenAdmissionOptions({ [field]: value }), {
      code: "SUCCESSOR_UNPINNED_ADMISSION_AUTHORITY", path: field,
    });
  }
});
test("complete overlay and malformed per-case options are not accepted", () => {
  const overlay = Object.fromEntries(SUCCESSOR_UNPINNED_ADMISSION_FIELDS.map(field => [field, "unbound"]));
  assert.throws(() => assertSuccessorFrozenAdmissionOptions(overlay), { code: "SUCCESSOR_UNPINNED_ADMISSION_AUTHORITY" });
  for (const value of [null, undefined, [], true]) {
    assert.throws(() => assertSuccessorFrozenAdmissionOptions(value), { code: "SUCCESSOR_SHAPE_INVALID" });
  }
});
