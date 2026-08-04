#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verifyLifecycleNeutralEvaluatorResult } from "./ask-benchmark-portfolio-evaluator-result.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("production scoring uses verifyEvaluatorAuthority as its sole evaluator-authority source", () => {
  const source = readFileSync(resolve(root, "scripts/ask-benchmark-portfolio-score.mjs"), "utf8");
  assert.match(source, /import \{ verifyEvaluatorAuthority \} from "\.\/ask-benchmark-evaluator-boundary\.mjs";/u);
  assert.doesNotMatch(source, /ask-benchmark-portfolio-evaluator-result|ask-benchmark-portfolio-result-profile/u);
  assert.match(source, /const verified = verifyEvaluatorAuthority\(options\);/u);
});

test("the retired downstream verifier is only a compatibility alias", () => {
  assert.equal(typeof verifyLifecycleNeutralEvaluatorResult, "function");
  const source = readFileSync(resolve(root, "scripts/ask-benchmark-portfolio-evaluator-result.mjs"), "utf8");
  assert.match(source, /return verifyEvaluatorAuthority\(options\);/u);
  assert.doesNotMatch(source, /verifyPrivateEvaluatorBundle|validateLifecycleNeutralResultProfile|verifyEvaluatorResult/u);
});

test("profile verification is not duplicated downstream", () => {
  const source = readFileSync(resolve(root, "scripts/ask-benchmark-portfolio-result-profile.mjs"), "utf8");
  assert.doesNotMatch(source, /validateLifecycleNeutralResultProfile|validateBinaryProfile|deriveLifecycleNeutralVerificationEvidenceState/u);
});
