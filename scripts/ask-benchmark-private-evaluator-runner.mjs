#!/usr/bin/env node
import { pathToFileURL } from "node:url";

function value(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

try {
  const evaluator = await import(pathToFileURL(value("--hidden-evaluator")).href);
  if (typeof evaluator.evaluateCandidateSafe !== "function") throw new Error("hidden evaluator does not export evaluateCandidateSafe");
  const fragment = await evaluator.evaluateCandidateSafe({
    repositoryRoot: value("--repository-root"),
    frozenWorkspace: value("--frozen-workspace"),
    candidateWorkspace: value("--candidate-workspace"),
    normalizedResult: JSON.parse(Buffer.from(value("--normalized-base64"), "base64url").toString("utf8")),
    evaluationInputEvidenceRoot: value("--evaluation-input-root"),
  });
  process.stdout.write(`${JSON.stringify(fragment)}\n`);
} catch (error) {
  process.stderr.write(`private evaluator runner failed: ${error.message}\n`);
  process.exitCode = 1;
}
