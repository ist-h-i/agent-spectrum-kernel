#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateSetupDoctorInputs } from "./ask-setup-doctor-inputs.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = ".agent-spectrum-kernel/install-state.json";
const CANARY = "PRIVATE_DOCTOR_INPUT_296";

function write(root, path, content = "{}") {
  const file = resolve(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function audit(root) {
  const entries = [];
  const walk = (path, relative = "") => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) entries.push([relative, "link", readlinkSync(path)]);
    else if (stat.isDirectory()) {
      entries.push([relative, "directory"]);
      for (const name of readdirSync(path).sort()) walk(resolve(path, name), `${relative}/${name}`);
    } else if (stat.isFile()) entries.push([relative, "file", createHash("sha256").update(readFileSync(path)).digest("hex")]);
    else entries.push([relative, "special"]);
  };
  walk(root);
  return entries;
}

export function runSetupDoctorInputTests({ cli = false } = {}) {
  let count = 0;
  const check = (name, prepare, pattern = null) => {
    const root = realpathSync(mkdtempSync(resolve(tmpdir(), "ask-setup-doctor-inputs-")));
    const target = resolve(root, "target");
    const source = resolve(root, "source");
    mkdirSync(target);
    mkdirSync(source);
    const external = write(root, "external.json", `{"hooks":{"destination":"https://example.invalid/${CANARY}"}}`);
    try {
      prepare({ root, target, source, external });
      const before = audit(root);
      if (pattern) assert.throws(() => validateSetupDoctorInputs(target, source), pattern, name);
      else validateSetupDoctorInputs(target, source);
      if (cli && !name.startsWith("source ")) {
        const result = spawnSync(process.execPath, [resolve(REPO_ROOT, "scripts/ask-setup.mjs"), "doctor", "--target", target, "--json"], {
          encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024,
        });
        assert.equal(result.error, undefined, `${name}: doctor must not hang on links or special files`);
        assert.equal(result.status, 1, `${name}: fixture has no valid installation`);
        const output = `${result.stdout}${result.stderr}`;
        assert.equal(output.includes(CANARY), false, name);
        if (pattern) {
          assert.match(result.stderr, pattern, `${name}: reject before doctor starts`);
          assert.equal(result.stdout, "", `${name}: no delegated health report for unsafe input`);
        } else if (!pattern) {
          assert.equal(JSON.parse(result.stdout).status, "fail", name);
        }
      }
      assert.deepEqual(audit(root), before, `${name}: all target/source/external bytes and links preserved`);
      count += 1;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  check("empty repository", () => {});
  check("normal unmanaged settings", ({ target }) => write(target, ".claude/settings.json"));
  check("invalid state remains a health finding", ({ target }) => write(target, STATE, CANARY));
  check("unrelated links are not scanned", ({ target, external }) => symlinkSync(external, resolve(target, "unrelated")));
  const paths = [
    ".claude/settings.json", ".claude/hooks/hooks.json", ".claude/commands/check.md",
    ".agents/project.json", "docs/ai/observability-config.yml", "docs/guide.md",
    "adapters/custom/README.md", ".agent-spectrum-kernel/runtime-health.jsonl",
    ".agent-spectrum-kernel/runtime/runtime-health.jsonl",
  ];
  for (const path of paths) {
    for (const kind of ["external", "dangling", "cycle", "chain"]) {
      check(`${path} ${kind} link`, ({ target, external }) => {
        const file = resolve(target, path);
        mkdirSync(dirname(file), { recursive: true });
        let destination = external;
        if (kind === "dangling") destination = resolve(target, "missing");
        if (kind === "cycle") destination = file;
        if (kind === "chain") {
          destination = resolve(target, "middle-link");
          symlinkSync(external, destination);
        }
        symlinkSync(destination, file);
      }, /Symlink is not supported/);
    }
  }
  check("linked settings ancestor", ({ root, target }) => {
    mkdirSync(resolve(root, "config"));
    symlinkSync(resolve(root, "config"), resolve(target, ".claude"));
  }, /Symlink is not supported/);
  check("Git-owned runtime health link", ({ target, external }) => {
    write(target, ".git/HEAD", "a".repeat(40));
    mkdirSync(resolve(target, ".git/agent-spectrum-kernel"));
    symlinkSync(external, resolve(target, ".git/agent-spectrum-kernel/runtime-health.jsonl"));
  }, /Symlink is not supported/);
  check("worktree-owned runtime health link", ({ root, target, external }) => {
    const gitDir = resolve(root, "metadata");
    write(gitDir, "HEAD", "a".repeat(40));
    write(target, ".git", `gitdir: ${gitDir}\n`);
    mkdirSync(resolve(gitDir, "agent-spectrum-kernel"));
    symlinkSync(external, resolve(gitDir, "agent-spectrum-kernel/runtime-health.jsonl"));
  }, /Symlink is not supported/);
  check("managed path traversal", ({ target }) => write(target, STATE, JSON.stringify({ managed_files: { "../external.json": {} } })), /repository-relative without traversal/);
  check("selected skill traversal", ({ target }) => write(target, STATE, JSON.stringify({ selected_skills: ["../../outside"] })), /repository-relative without traversal/);
  check("source reference traversal", ({ target }) => write(target, STATE, JSON.stringify({ managed_files: { "copy.txt": { kind: "claude_runtime", script: "../../outside" } } })), /repository-relative without traversal/);
  check("source reference symlink", ({ target, source, external }) => {
    write(target, STATE, JSON.stringify({ managed_files: { "copy.txt": { kind: "skill", skill: "review" } } }));
    mkdirSync(resolve(source, "skills/review"), { recursive: true });
    symlinkSync(external, resolve(source, "skills/review/SKILL.md"));
  }, /Symlink is not supported/);
  if (process.platform !== "win32") {
    for (const path of [".claude/settings.json", "docs/ai/observability-config.yml", ".agent-spectrum-kernel/runtime-health.jsonl"]) {
      check(`${path} FIFO`, ({ target }) => {
        const file = resolve(target, path);
        mkdirSync(dirname(file), { recursive: true });
        assert.equal(spawnSync("mkfifo", [file], { timeout: 5000 }).status, 0);
      }, /Unsupported setup file type/);
    }
  }
  console.log(`ASK setup doctor read-boundary tests passed: ${count} cases${cli ? " (target CLI + source helper)" : ""}`);
  return count;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runSetupDoctorInputTests({ cli: !process.argv.includes("--unit-only") });
