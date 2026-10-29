import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAdapterCapabilityClaims } from "./validate-repo.mjs";

export function assertAdapterCapabilityClaims() {
  const root = mkdtempSync(resolve(tmpdir(), "ask-capability-claims-"));
  const docs = ["docs/usage-ja.md", "docs/prompt-recipes-ja.md"];
  let checks = 0;
  const matrix = (codex = "unsupported") => writeFileSync(resolve(root, "docs/adapter-capability-matrix.md"),
    `| Capability | Codex | Cline | Claude Code |\n|---|---|---|---|\n| PR shared review workflow | ${codex} | unknown | projected |\n`);
  const inspect = (path, text) => {
    for (const doc of docs) writeFileSync(resolve(root, doc), doc === path ? text : "# Guide\n");
    const errors = [];
    validateAdapterCapabilityClaims(root, errors);
    checks++;
    return errors;
  };
  try {
    mkdirSync(resolve(root, "docs"));
    matrix();
    for (const path of docs) {
      assert.deepEqual(inspect(path, "# Guide\n"), []);
      for (const [adapter, status] of [["Codex", "unsupported"], ["Cline", "unknown"], ["Claude Code", "projected"]]) {
        const errors = inspect(path, `${adapter} PR shared review workflow is supported.\n`);
        assert.equal(errors.length, 1, `${path}: ${adapter} overclaim must fail`);
        assert.equal(errors[0].section, "adapter capability claims");
        for (const detail of [path, adapter.toLowerCase(), status, "PR shared review workflow"]) {
          assert.ok(errors[0].message.includes(detail), `${path}: missing diagnostic ${detail}`);
        }
      }
      assert.deepEqual(inspect(path, "Codex PR shared review workflow is unsupported.\n"), []);
      assert.deepEqual(inspect(path, "Codex PR shared review workflow is not supported.\n"), []);
    }
    // The target's matrix, not the invoking repository's matrix, owns --root.
    matrix("behavior_verified");
    for (const path of docs) assert.deepEqual(inspect(path, "Codex PR shared review workflow is supported.\n"), []);
    rmSync(resolve(root, "docs/adapter-capability-matrix.md"));
    mkdirSync(resolve(root, "docs/adapter-capability-matrix.md"));
    assert.throws(() => validateAdapterCapabilityClaims(root, []), { code: "EISDIR" });
    checks++;
    return checks;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Adapter capability claim validation passed (${assertAdapterCapabilityClaims()} cases)`);
}
