#!/usr/bin/env node
import { lstatSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function value(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function sealedRegularFile(path, label) {
  const absolute = resolve(path);
  let current = absolute;
  const segments = relative(resolve("/"), absolute).split(sep).filter(Boolean);
  current = resolve("/", segments[0] ?? "");
  for (const segment of segments.slice(1)) {
    current = resolve(current, segment);
    const status = lstatSync(current);
    if (status.isSymbolicLink()) throw new Error(`${label} must not traverse a symlink`);
  }
  const status = lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) throw new Error(`${label} must be a regular sealed file`);
  return absolute;
}

try {
  const hiddenEvaluator = sealedRegularFile(value("--hidden-evaluator"), "hidden evaluator sealed copy");
  const evaluator = await import(pathToFileURL(hiddenEvaluator).href);
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
