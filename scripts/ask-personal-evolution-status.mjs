// Read-only personal-loop entry point. This command has no execution mode.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonRejectDuplicateKeys, readStableBytes } from "./content-addressed-store.mjs";
import { inspectPersonalEvolutionGenerationStatus } from "./ask-personal-evolution-generation-connector.mjs";

export function inspectPersonalEvolutionGenerationStatusFile(path, digest) {
  assert.match(digest, /^sha256:[a-f0-9]{64}$/u, "exact status context digest required");
  const bytes = readStableBytes(path, "personal generation status context");
  assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, digest, "status context drift");
  return inspectPersonalEvolutionGenerationStatus(parseJsonRejectDuplicateKeys(bytes));
}

export function runPersonalEvolutionStatusCommand(argv) {
  try {
    assert.equal(argv[0], "generation", "only read-only generation status is supported");
    assert.equal(argv.length, 5, "exact context path and digest required");
    const options = {};
    for (let i = 1; i < argv.length; i += 2) {
      assert.ok(["--context", "--context-digest"].includes(argv[i]) && !Object.hasOwn(options, argv[i]), "unknown or duplicate status flag");
      options[argv[i]] = argv[i + 1];
    }
    const report = inspectPersonalEvolutionGenerationStatusFile(options["--context"], options["--context-digest"]);
    console.log(JSON.stringify(report, null, 2));
    return report.status === "invalid_evidence" ? 10 : 0;
  } catch {
    // Never echo paths, raw context bytes, provider exceptions or assertion objects.
    console.error("Personal generation status refused: invalid command or context.");
    return 10;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runPersonalEvolutionStatusCommand(process.argv.slice(2));
}
