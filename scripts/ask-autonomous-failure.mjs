#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function requireTarget(value, name) {
  if (value === null || Number.isInteger(value)) return value;
  throw new Error(`${name} must be an integer or null`);
}

function workflowRunUrl(env) {
  for (const name of ["GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_RUN_ID"]) {
    if (!env[name]) throw new Error(`${name} is required`);
  }
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

export function buildFailureArtifacts(context, { jobResult = "failed", runUrl } = {}) {
  if (!context || typeof context !== "object") throw new Error("context must be an object");
  if (typeof context.mode !== "string" || context.mode.length === 0) throw new Error("context.mode is required");
  const targetIssueNumber = requireTarget(context.target_issue_number, "context.target_issue_number");
  const targetPullNumber = requireTarget(context.target_pr_number, "context.target_pr_number");
  if (typeof runUrl !== "string" || runUrl.length === 0) throw new Error("runUrl is required");

  const reviewingPull = targetPullNumber !== null;
  return {
    result: {
      action: "blocked",
      target_issue_number: targetIssueNumber,
      target_pr_number: targetPullNumber,
      summary: `Codex or bounded validation job ${jobResult}.`,
      rationale: `No patch was published. Inspect the recorded workflow run: ${runUrl}`,
      pr_title: null,
      pr_body: null,
      issue_comment: `Automation stopped without GitHub mutation. Workflow evidence: ${runUrl}`,
      review_verdict: reviewingPull ? "comment" : "not_applicable",
      review_comment: reviewingPull ? `Automation could not complete the requested review or fix. No branch update or merge occurred. Evidence: ${runUrl}` : null,
      tests_run: [],
      risks: ["The selected work remains incomplete until the workflow failure is diagnosed."],
      changed_files_expected: [],
    },
    guard: {
      schema_version: "1.0.0",
      mode: context.mode,
      action: "blocked",
      target_issue_number: targetIssueNumber,
      target_pr_number: targetPullNumber,
      changed_files: [],
      changed_lines: 0,
    },
    patch: "",
  };
}

function parseArgs(argv) {
  const args = { context: null, result: null, guard: null, patch: null };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--context") args.context = resolve(argv.shift());
    else if (flag === "--result") args.result = resolve(argv.shift());
    else if (flag === "--guard") args.guard = resolve(argv.shift());
    else if (flag === "--patch") args.patch = resolve(argv.shift());
    else throw new Error(`Unknown argument: ${flag}`);
  }
  for (const field of Object.keys(args)) if (!args[field]) throw new Error(`--${field} is required`);
  return args;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs([...argv]);
  const context = JSON.parse(readFileSync(args.context, "utf8"));
  const artifacts = buildFailureArtifacts(context, {
    jobResult: env.CODEX_JOB_RESULT ?? "failed",
    runUrl: workflowRunUrl(env),
  });
  writeFileSync(args.result, `${JSON.stringify(artifacts.result, null, 2)}\n`);
  writeFileSync(args.guard, `${JSON.stringify(artifacts.guard, null, 2)}\n`);
  writeFileSync(args.patch, artifacts.patch);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
