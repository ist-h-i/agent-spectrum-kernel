#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUDE_PLUGIN_FIXED_ENTRY_MAP, renderClaudePluginFixedEntryProfiles } from "./claude-fixed-entry-profile.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT_ROOT = "adapters/claude-code/plugin/skills";

function expectedOutputs() {
  const known = new Set(Object.values(CLAUDE_PLUGIN_FIXED_ENTRY_MAP));
  const artifacts = renderClaudePluginFixedEntryProfiles();
  assert.equal(artifacts.length, known.size, "Claude plugin fixed-entry renderer must produce every configured entry exactly once");
  return artifacts.map((artifact) => {
    const name = artifact.metadata.prompt_name;
    assert.equal(known.has(name), true, `Claude plugin fixed-entry renderer produced an unknown entry: ${name}`);
    return { artifact, path: resolve(ROOT, OUTPUT_ROOT, name, "SKILL.md") };
  });
}

function writeOutputs(outputs) {
  for (const { artifact, path } of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, artifact.content);
  }
}

function checkOutputs(outputs) {
  for (const { artifact, path } of outputs) {
    if (!existsSync(path)) throw new Error(`Claude plugin fixed-entry output is missing: ${path}`);
    assert.equal(readFileSync(path, "utf8"), artifact.content, `Claude plugin fixed-entry output is stale: ${path}`);
  }
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--write") return "write";
  if (argv.length === 1 && argv[0] === "--check") return "check";
  throw new Error("Usage: node scripts/claude-plugin-fixed-entries.mjs --write | --check");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const mode = parseArgs(process.argv.slice(2));
    const outputs = expectedOutputs();
    if (mode === "write") writeOutputs(outputs);
    checkOutputs(outputs);
    console.log(`Claude plugin fixed entries ${mode === "write" ? "written" : "are current"}: ${outputs.length}`);
  } catch (error) {
    console.error(`claude-plugin-fixed-entries failed: ${error.message}`);
    process.exitCode = 1;
  }
}
