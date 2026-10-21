import { lstatSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonRejectDuplicateKeys, readStableBytes } from "./content-addressed-store.mjs";
import { comparisonHash } from "./ask-user-comparison-prepare.mjs";
import { pathInside } from "./ask-setup-inputs.mjs";
import { planPersonalPromptTargetApply, applyPersonalPromptTargetPlan, planPersonalPromptTargetRestore,
  restorePersonalPromptTargetPlan, inspectPersonalPromptTarget } from "./ask-personal-prompt-target.mjs";
const commands = { "plan-apply": planPersonalPromptTargetApply, apply: applyPersonalPromptTargetPlan,
  "plan-restore": planPersonalPromptTargetRestore, restore: restorePersonalPromptTargetPlan, status: inspectPersonalPromptTarget };
export function runPersonalPromptTargetCli(argv) {
  try {
    const [command, ...args] = argv, options = {};
    if (!Object.hasOwn(commands, command)) throw new Error();
    while (args.length) {
      const flag = args.shift(); if (!["--request", "--request-digest", "--confirm", "--authorized"].includes(flag) || Object.hasOwn(options, flag)) throw new Error();
      options[flag] = flag === "--authorized" ? true : args.shift();
    }
    const mutation = ["apply", "restore"].includes(command);
    if (mutation !== (options["--authorized"] === true) || mutation !== (typeof options["--confirm"] === "string")) throw new Error();
    const path = resolve(options["--request"]);
    for (let cursor = path; ; cursor = dirname(cursor)) {
      const stat = lstatSync(cursor); if (stat.isSymbolicLink() || (cursor === path ? !stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 : !stat.isDirectory())) throw new Error();
      if (dirname(cursor) === cursor) break;
    }
    const bytes = readStableBytes(path, "private trusted physical request", 32 * 1024 * 1024);
    if (comparisonHash(bytes) !== options["--request-digest"]) throw new Error();
    const request = parseJsonRejectDuplicateKeys(bytes), target = request.targetRoot ?? request.prepared?.plan?.target_root;
    if (typeof target !== "string" || pathInside(realpathSync(target), path) || pathInside(resolve(import.meta.dirname, ".."), path)) throw new Error();
    if (mutation && (Object.keys(request).sort().join(",") !== "closure,prepared")) throw new Error();
    const input = mutation ? { ...request, authorized: true, confirmedDigest: options["--confirm"] } : request;
    return { exitCode: 0, result: commands[command](input) };
  } catch (error) {
    const code = error?.code === "personal_target_recovery_required" ? error.code : "personal_target_refused";
    return { exitCode: 1, result: { status: "refused", reason_code: code, models_started: false } };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outcome = runPersonalPromptTargetCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(outcome.result)}\n`); process.exitCode = outcome.exitCode;
}
