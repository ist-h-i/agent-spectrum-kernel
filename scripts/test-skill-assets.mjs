import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { skillAssets } from "./skill-assets.mjs";

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), "ask-skill-assets-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content = "reference\n") => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), content);
  };
  write("skills/example/SKILL.md", "# Example\n");
  return { root, write };
}

test("entry and nested references share a sorted, deduplicated inventory", (t) => {
  const { root, write } = fixture(t);
  write("skills/example/references/z.md");
  write("skills/example/references/nested/a.md");
  write("skills/example/private-notes.md");
  assert.deepEqual(skillAssets(root, ["example", "example"]), [
    { skill: "example", relativePath: "SKILL.md", sourcePath: "skills/example/SKILL.md" },
    { skill: "example", relativePath: "references/nested/a.md", sourcePath: "skills/example/references/nested/a.md" },
    { skill: "example", relativePath: "references/z.md", sourcePath: "skills/example/references/z.md" },
  ]);
});

test("skills without references retain their single-entry projection", (t) => {
  const { root } = fixture(t);
  assert.equal(skillAssets(root, ["example"]).length, 1);
  assert.deepEqual(skillAssets(root, []), []);
});

test("resource additions and removals are reflected without an inventory cache", (t) => {
  const { root, write } = fixture(t);
  write("skills/example/references/one.md", "first\n");
  const first = skillAssets(root, ["example"]);
  write("skills/example/references/one.md", "updated\n");
  assert.equal(readFileSync(resolve(root, first[1].sourcePath), "utf8"), "updated\n");
  rmSync(resolve(root, first[1].sourcePath));
  assert.equal(skillAssets(root, ["example"]).length, 1);
});

for (const invalid of ["../example", "example/../../outside", "example\\outside", "Example", ""]) {
  test(`rejects invalid skill name ${JSON.stringify(invalid)}`, (t) => {
    const { root } = fixture(t);
    assert.throws(() => skillAssets(root, [invalid]), /Invalid skill name/);
  });
}

test("missing entries fail rather than silently omitting a selected skill", (t) => {
  const { root } = fixture(t);
  rmSync(resolve(root, "skills/example/SKILL.md"));
  assert.throws(() => skillAssets(root, ["example"]), /ENOENT/);
});

for (const target of ["SKILL.md", "references", "references/nested", "references/link.md"]) {
  test(`rejects source symlink at ${target}`, (t) => {
    const { root, write } = fixture(t);
    write("outside.md", "not a skill asset\n");
    const path = resolve(root, "skills/example", target);
    rmSync(path, { force: true, recursive: true });
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(resolve(root, "outside.md"), path);
    assert.throws(() => skillAssets(root, ["example"]), /regular file|real directory|symlinks/);
  });
}

test("rejects invalid UTF-8 before the installer can write replacement characters", (t) => {
  const { root, write } = fixture(t);
  write("skills/example/references/bad.md", Buffer.from([0xc3, 0x28]));
  assert.throws(() => skillAssets(root, ["example"]), /encoded data/);
});
