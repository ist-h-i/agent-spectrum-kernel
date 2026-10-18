// Only local preparation runs here. Isolated diagnostic compatibility for an
// immutable older API which reports Git errno but omits its operation label.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { preparationGitOperation } from "./ask-preparation-git-diagnostic.mjs";

export function runPreparationRecoveryWorker(options, env) {
  const result = childProcess.spawnSync(process.execPath, [fileURLToPath(import.meta.url)],
    { input: JSON.stringify(options), env, shell: false, encoding: "utf8", maxBuffer: 1024 * 1024 });
  const outcome = result.stdout ? parseJsonRejectDuplicateKeys(result.stdout) : null;
  if (result.error || result.signal || result.status !== 0 || !outcome?.prepared)
    return { detail: outcome?.detail ?? `preparation_worker_failed:${result.error?.code ?? result.signal ?? result.status}` };
  return outcome;
}

async function main() {
  const original = childProcess.spawnSync;
  let failedOperation = null;
  childProcess.spawnSync = (bin, args, ...rest) => {
    const result = original(bin, args, ...rest);
    if (bin === "git" && (result.error || result.signal || result.status !== 0)) failedOperation = preparationGitOperation(args);
    return result;
  };
  syncBuiltinESMExports();
  try {
  const { preparePersonalEvolutionCliRecovery } = await import("./ask-personal-evolution-cli-recovery.mjs");
  const options = JSON.parse(readFileSync(0, "utf8"));
  const prepared = await preparePersonalEvolutionCliRecovery(options);
  console.log(JSON.stringify({ prepared }));
  } catch (error) {
  const detail = String(error.message).slice(0, 1800);
  console.log(JSON.stringify({ detail: detail + (failedOperation && !detail.includes(":operation=") ? `:operation=${failedOperation}` : "") }));
  process.exitCode = 1;
  } finally {
    childProcess.spawnSync = original; syncBuiltinESMExports();
  }
}
// The core imports this module's transport export. Complete this module before
// asynchronously importing the core, avoiding a top-level-await import cycle.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
