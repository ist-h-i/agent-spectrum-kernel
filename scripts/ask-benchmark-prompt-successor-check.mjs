#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readStableBytes, parseJsonRejectDuplicateKeys, stableCanonicalJson } from "./content-addressed-store.mjs";
import { assertSuccessorLaunchAllowed, successorFail } from "./ask-benchmark-prompt-successor.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const HELP = `Prompt runtime-successor preparation (no runtime/model launch)\n\nUsage:\n  node scripts/ask-benchmark-prompt-successor-check.mjs inspect\n  node scripts/ask-benchmark-prompt-successor-check.mjs prepare --runtime-json <absolute-file> --seed <id> --reason <text>\n  node scripts/ask-benchmark-prompt-successor-check.mjs validate --input <absolute-file>\n\nJSON is written to stdout only. Run from an isolated clean exact-commit checkout\nwith Node 24. Runtime JSON is a proposed non-secret configuration, not a host\nattestation. inspect does not invoke Codex or read credentials. No command in\nthis entry point launches a model or reads measured results.\n`;
function options(argv, allowed) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!allowed.includes(key) || values.has(key) || !argv[index + 1] || argv[index + 1].startsWith("--")) successorFail("SUCCESSOR_CLI_ARGUMENT_INVALID", "arguments");
    values.set(key, argv[index + 1]);
  }
  for (const key of allowed) if (!values.has(key)) successorFail("SUCCESSOR_CLI_ARGUMENT_MISSING", key);
  return values;
}
function readExternalJson(path, label) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\0") || path.split("/").includes("..")) successorFail("SUCCESSOR_PATH_REJECTED", label);
  return parseJsonRejectDuplicateKeys(readStableBytes(path, label, 4 * 1024 * 1024), label);
}
export async function successorCheckMain(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    if (argv.length === 0 || (argv.length === 1 && ["--help", "help"].includes(argv[0]))) {
      stdout.write(HELP);
      return 0;
    }
    const [command, ...rest] = argv;
    // Refuse before version checks, repository imports, credential/config reads,
    // directory creation or any attempted external process/model launch.
    if (!["inspect", "prepare", "validate"].includes(command)) assertSuccessorLaunchAllowed();
    let values;
    if (command === "inspect") values = options(rest, []);
    else if (command === "prepare") values = options(rest, ["--runtime-json", "--seed", "--reason"]);
    else values = options(rest, ["--input"]);
    if (process.versions.node.split(".")[0] !== "24") successorFail("SUCCESSOR_NODE24_REQUIRED", "executing Node runtime");
    const repository = await import("./ask-benchmark-prompt-successor-repository.mjs");
    let output;
    if (command === "inspect") {
      const implementation = repository.readSuccessorImplementationIdentity(ROOT);
      const { parent, legacyPlan } = await repository.readSuccessorParent({ root: ROOT });
      output = { kind: "prompt_successor_repository_inspection", implementation, parent,
        historical_case_count: legacyPlan.cases.length, proposed_successor_case_count: 28,
        node_version: process.version, platform: process.platform, architecture: process.arch,
        host_runtime_verified: false, effective_controls_verified: false,
        successor_selection_authority_created: false, model_calls: 0, measured_result_reads: 0 };
    } else if (command === "prepare") {
      output = await repository.prepareSuccessorFromRepository({ root: ROOT,
        runtime: readExternalJson(values.get("--runtime-json"), "runtime proposal"),
        seed: values.get("--seed"), changeReason: values.get("--reason") });
    } else {
      const preparation = readExternalJson(values.get("--input"), "successor preparation");
      await repository.validateSuccessorFromRepository(preparation, { root: ROOT });
      output = { kind: "prompt_successor_preparation_check", preparation_digest: preparation.preparation_digest,
        valid_preparation: true, readiness: "preparation_only", host_runtime_verified: false, model_calls: 0 };
    }
    stdout.write(`${stableCanonicalJson(output)}\n`);
    return 0;
  } catch (error) {
    // Do not echo arbitrary runtime input, environment, private paths or secrets.
    stderr.write(`${JSON.stringify({ status: "blocked", code: error?.code?.startsWith("SUCCESSOR_") ? error.code : "SUCCESSOR_INPUT_OR_DEPENDENCY_FAILURE", model_calls: 0 })}\n`);
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await successorCheckMain(process.argv.slice(2));
}
