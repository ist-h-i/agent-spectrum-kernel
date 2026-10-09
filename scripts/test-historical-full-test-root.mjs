import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, realpathSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareHistoricalFullTestRoot, historicalSourceEntries } from "./prepare-historical-full-test-root.mjs";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scratch = t => { const path = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-historical-test-"))); t.after(() => rmSync(path, { recursive: true, force: true })); return path; };
test("isolated sealed assets preserve current helpers/tests and the source checkout", t => {
  const target = resolve(scratch(t), "checkout");
  const original = readFileSync(resolve(ROOT, "skills/ui-ux-design/references/ui-capability-contract.md"));
  assert.equal(prepareHistoricalFullTestRoot(ROOT, target), target);
  for (const path of ["scripts/ask-local-full-package.mjs", "scripts/test-ask-local-full-package.mjs", "scripts/ask-local-three-arm.mjs", "scripts/test-ask-local-three-arm.mjs"]) {
    assert.deepEqual(readFileSync(resolve(target, path)), readFileSync(resolve(ROOT, path)), path);
  }
  assert.equal(existsSync(resolve(target, "skills/ui-ux-design/references/ui-capability-contract.md")), false);
  assert.deepEqual(readFileSync(resolve(ROOT, "skills/ui-ux-design/references/ui-capability-contract.md")), original);
  assert.throws(() => prepareHistoricalFullTestRoot(ROOT, target), /must be new/);
});
test("historical manifest drift fails before creating a checkout", t => {
  const root = scratch(t); mkdirSync(resolve(root, "docs"));
  writeFileSync(resolve(root, "docs/mac-ask-full-static-inventory.json"), "{}\n");
  assert.throws(() => historicalSourceEntries(root), /manifest drift/);
  assert.equal(existsSync(resolve(root, "checkout")), false);
});
