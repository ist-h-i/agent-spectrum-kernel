import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { computeProfilePathSetDigest } from "./validate-repo.mjs";

test("canonical Skill resources remain confined to entry and references", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "ask-canonical-skill-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), "reference\n"); };
  const valid = "skills/ui-ux-design/references/nested/pattern.md";
  write(valid);
  assert.match(computeProfilePathSetDigest(root, [valid], { canonicalOnly: true }), /^sha256:/);
  for (const path of ["skills/ui-ux-design/private.md", "other/reference.md", "skills/ui-ux-design/references/../private.md", "skills/ui-ux-design/references/./pattern.md", "/tmp/reference.md"]) {
    assert.throws(() => computeProfilePathSetDigest(root, [path], { canonicalOnly: true }), /outside canonical|unsafe/);
  }
  write("outside.md");
  symlinkSync(resolve(root, "outside.md"), resolve(root, "skills/ui-ux-design/references/link.md"));
  assert.throws(() => computeProfilePathSetDigest(root, ["skills/ui-ux-design/references/link.md"], { canonicalOnly: true }), /symlink/);
});
