#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "benchmarks/checkpoint-b.config.json");
const OUTPUT_SCHEMA_PATH = resolve(ROOT, "benchmarks/schemas/agent-output.schema.json");
const FIXTURE_ROOT = resolve(ROOT, "benchmarks/fixtures");
const CONDITIONS = ["plain", "kernel_only", "full_ask"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const command = argv.shift();
  const args = { command, output: null, runDir: null, seed: null, agentBin: "codex" };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--output") args.output = resolve(argv.shift());
    else if (flag === "--run-dir") args.runDir = resolve(argv.shift());
    else if (flag === "--seed") args.seed = argv.shift();
    else if (flag === "--agent-bin") args.agentBin = resolve(argv.shift());
    else if (flag === "--help" || flag === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function help() {
  console.log(`Usage: node scripts/ask-benchmark.mjs <command> [options]

Commands:
  validate
  prepare --output <empty-directory> --seed <value>
  run --run-dir <prepared-directory> --agent-bin <codex-path>
  score --run-dir <completed-directory> --output <normalized-result.json>
`);
}

function git(cwd, args, options = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function validateProtocol() {
  const config = readJson(CONFIG_PATH);
  const outputSchema = readJson(OUTPUT_SCHEMA_PATH);
  const errors = [];
  if (config.protocol_status !== "frozen") errors.push("protocol_status must be frozen before execution");
  if (JSON.stringify(config.conditions) !== JSON.stringify(CONDITIONS)) errors.push("conditions must be plain, kernel_only, full_ask");
  if (config.fixtures.length !== 2 || !config.fixtures.some((entry) => entry.task_class === "review") || !config.fixtures.some((entry) => entry.task_class === "implementation")) errors.push("review and implementation fixtures are required");
  if (config.thresholds.allow_expand_with_primary_metrics_unknown !== false) errors.push("expand must be prohibited when primary metrics are unknown");
  if (config.privacy.store_raw_prompts || config.privacy.store_full_outputs || config.privacy.store_full_source || config.privacy.store_secrets_customer_or_personal_data) errors.push("durable raw or sensitive capture must be disabled");
  if (!outputSchema.required?.includes("route") || !outputSchema.required?.includes("verification_commands")) errors.push("agent output schema must require route and verification evidence fields");
  if (JSON.stringify(outputSchema).includes('"oneOf"')) errors.push("agent output schema must avoid response-format-unsupported oneOf");
  for (const fixture of config.fixtures) {
    const root = resolve(FIXTURE_ROOT, fixture.id);
    for (const path of ["task.md", "expected.json", "workspace/package.json"]) {
      if (!existsSync(resolve(root, path))) errors.push(`${fixture.id}/${path} is missing`);
    }
    if (fixture.task_class === "review" && !existsSync(resolve(root, "candidate.patch"))) errors.push(`${fixture.id}/candidate.patch is missing`);
    if (fixture.task_class === "implementation" && !existsSync(resolve(root, "hidden-tests.mjs"))) errors.push(`${fixture.id}/hidden-tests.mjs is missing`);
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return config;
}

function ensureEmptyDirectory(path) {
  if (existsSync(path) && (!statSync(path).isDirectory() || readdirSync(path).length > 0)) throw new Error(`output must be an empty directory: ${path}`);
  mkdirSync(path, { recursive: true });
}

function projectCondition(target, condition) {
  if (condition === "plain") return;
  if (condition === "kernel_only") {
    copyFileSync(resolve(ROOT, "AGENTS.md"), resolve(target, "AGENTS.md"));
    return;
  }
  const result = spawnSync(process.execPath, [resolve(ROOT, "scripts/install-kernel.mjs"), "--target", target, "--merge-agents"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Full ASK projection failed: ${result.stderr || result.stdout}`);
  const adapter = spawnSync(process.execPath, [resolve(ROOT, "scripts/install-codex-adapter.mjs"), "--target", target, "--profile", "full"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (adapter.status !== 0) throw new Error(`Full ASK Codex projection failed: ${adapter.stderr || adapter.stdout}`);
}

function prepare(args) {
  const config = validateProtocol();
  if (!args.output || !args.seed) throw new Error("prepare requires --output and --seed");
  ensureEmptyDirectory(args.output);
  const cases = [];
  for (const fixture of config.fixtures) {
    for (const condition of CONDITIONS) {
      const caseId = `case-${sha256(`${args.seed}:${fixture.id}:${condition}`).slice(0, 12)}`;
      const target = resolve(args.output, caseId);
      cpSync(resolve(FIXTURE_ROOT, fixture.id, "workspace"), target, { recursive: true });
      copyFileSync(resolve(FIXTURE_ROOT, fixture.id, "task.md"), resolve(target, "BENCHMARK_TASK.md"));
      projectCondition(target, condition);
      git(target, ["init", "-q"]);
      git(target, ["config", "user.name", "ASK Benchmark"]);
      git(target, ["config", "user.email", "benchmark.invalid@example.invalid"]);
      git(target, ["add", "-A"]);
      git(target, ["commit", "-q", "-m", "benchmark baseline"]);
      if (fixture.task_class === "review") git(target, ["apply", resolve(FIXTURE_ROOT, fixture.id, "candidate.patch")]);
      cases.push({
        case_id: caseId,
        fixture_id: fixture.id,
        task_class: fixture.task_class,
        sandbox: fixture.sandbox,
        condition,
        order_key: sha256(`${args.seed}:order:${caseId}`),
      });
    }
  }
  cases.sort((left, right) => left.order_key.localeCompare(right.order_key));
  writeJson(resolve(args.output, "run.json"), {
    schema_version: "1.0.0",
    checkpoint: config.checkpoint,
    seed_sha256: sha256(args.seed),
    protocol_sha256: sha256(readFileSync(resolve(ROOT, "benchmarks/protocol.md"))),
    config_sha256: sha256(readFileSync(CONFIG_PATH)),
    repository_revision: git(ROOT, ["rev-parse", "HEAD"]),
    cases,
  });
  console.log(`Prepared ${cases.length} blinded cases in ${args.output}`);
}

function isolatedCodexHome() {
  const sourceHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : resolve(process.env.HOME, ".codex");
  const authPath = resolve(sourceHome, "auth.json");
  if (!existsSync(authPath)) throw new Error(`Codex auth is unavailable: ${authPath}`);
  const home = mkdtempSync(resolve(tmpdir(), "ask-benchmark-codex-home-"));
  chmodSync(home, 0o700);
  symlinkSync(authPath, resolve(home, "auth.json"));
  return home;
}

function tokenUsageFromJsonl(text) {
  let input = null;
  let output = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const queue = [event];
    while (queue.length > 0) {
      const value = queue.pop();
      if (!value || typeof value !== "object") continue;
      for (const [key, item] of Object.entries(value)) {
        if (["input_tokens", "inputTokens"].includes(key) && Number.isFinite(item)) input = Math.max(input ?? 0, item);
        else if (["output_tokens", "outputTokens"].includes(key) && Number.isFinite(item)) output = Math.max(output ?? 0, item);
        else if (typeof item === "object") queue.push(item);
      }
    }
  }
  return { input_tokens: input, output_tokens: output };
}

function executeCases(args) {
  const config = validateProtocol();
  if (!args.runDir || !existsSync(resolve(args.runDir, "run.json"))) throw new Error("run requires a prepared --run-dir");
  if (!existsSync(args.agentBin) || !lstatSync(args.agentBin).isFile()) throw new Error(`agent binary is unavailable: ${args.agentBin}`);
  const manifest = readJson(resolve(args.runDir, "run.json"));
  const codexHome = isolatedCodexHome();
  try {
    for (const entry of manifest.cases) {
      const target = resolve(args.runDir, entry.case_id);
      const finalPath = resolve(target, ".benchmark-final.json");
      const runPath = resolve(target, ".benchmark-run.json");
      if (existsSync(runPath)) continue;
      const prompt = readFileSync(resolve(target, "BENCHMARK_TASK.md"), "utf8");
      const commandArgs = [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--model", config.runtime.model,
        "-c", `model_reasoning_effort=\"${config.runtime.reasoning_effort}\"`,
        "--sandbox", entry.sandbox,
        "--output-schema", OUTPUT_SCHEMA_PATH,
        "--output-last-message", finalPath,
        "--json",
        "-",
      ];
      const started = process.hrtime.bigint();
      const result = spawnSync(args.agentBin, commandArgs, {
        cwd: target,
        encoding: "utf8",
        input: prompt,
        env: { ...process.env, CODEX_HOME: codexHome },
        maxBuffer: 50 * 1024 * 1024,
      });
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const output = existsSync(finalPath) ? readFileSync(finalPath) : Buffer.from("");
      const usage = tokenUsageFromJsonl(result.stdout ?? "");
      writeJson(runPath, {
        exit_code: result.status,
        duration_ms: Math.round(durationMs),
        ...usage,
        output_sha256: output.length > 0 ? sha256(output) : null,
        output_bytes: output.length,
        runtime_error: result.error ? "agent_process_failed" : result.status === 0 ? null : "agent_nonzero_exit",
      });
      writeFileSync(resolve(target, ".benchmark-events.jsonl"), result.stdout ?? "");
      writeFileSync(resolve(target, ".benchmark-stderr.txt"), result.stderr ?? "");
      console.log(`${entry.case_id}: ${result.status === 0 ? "completed" : `failed (${result.status})`}`);
    }
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
}

function parseFinal(path) {
  if (!existsSync(path)) return null;
  try { return readJson(path); } catch { return null; }
}

function reviewMetrics(final, expected) {
  const findings = Array.isArray(final?.findings) ? final.findings.filter((entry) => ["blocking", "major"].includes(entry.severity)) : [];
  const matched = new Set();
  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    const text = `${finding.summary ?? ""} ${finding.evidence ?? ""}`.toLowerCase();
    for (const oracle of expected.major_findings) {
      const termCount = oracle.terms.filter((term) => text.includes(term.toLowerCase())).length;
      if (finding.file === oracle.file && termCount >= 2 && ![...matched].some((value) => value.endsWith(`:${oracle.id}`))) {
        matched.add(`${index}:${oracle.id}`);
        break;
      }
    }
  }
  const validIndexes = new Set([...matched].map((value) => Number(value.split(":")[0])));
  return {
    valid_blocking_or_major_findings: matched.size,
    major_findings_missed: expected.major_findings.length - matched.size,
    unsupported_or_false_positive_findings: findings.filter((_, index) => !validIndexes.has(index)).length,
    requirement_satisfaction_rate: null,
    scope_deviations: 0,
  };
}

function testSummary(result) {
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const pass = text.match(/# pass (\d+)/);
  const fail = text.match(/# fail (\d+)/);
  return { passed: pass ? Number(pass[1]) : null, failed: fail ? Number(fail[1]) : null, exit_code: result.status };
}

function implementationMetrics(caseRoot, expected, fixtureId) {
  const hidden = spawnSync(process.execPath, [resolve(FIXTURE_ROOT, fixtureId, "hidden-tests.mjs"), caseRoot], { cwd: caseRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const summary = testSummary(hidden);
  const changed = git(caseRoot, ["diff", "--name-only", "HEAD", "--"]).split("\n").filter(Boolean).filter((path) => !path.startsWith(".benchmark-"));
  const deviations = changed.filter((path) => !expected.allowed_paths.includes(path));
  const total = expected.requirement_ids.length;
  return {
    valid_blocking_or_major_findings: null,
    major_findings_missed: null,
    unsupported_or_false_positive_findings: null,
    requirement_satisfaction_rate: summary.passed === null ? null : summary.passed / total,
    hidden_tests: { total, ...summary },
    scope_deviations: deviations.length,
    changed_file_count: changed.length,
  };
}

function routeMetrics(final, taskClass) {
  if (!final?.route) return { correct_route: null, under_processing: null, over_processing: null, contracts_reported: false };
  const route = `${final.route.operating_mode} ${final.route.primary_workflow}`.toLowerCase();
  const correct = taskClass === "review" ? route.includes("review") : route.includes("implementation") || route.includes("controlled");
  return { correct_route: correct, under_processing: correct ? false : true, over_processing: null, contracts_reported: true };
}

function percentChange(baseline, candidate) {
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate) || baseline === 0) return null;
  return ((candidate - baseline) / baseline) * 100;
}

function aggregate(runs, fixtureId, condition) {
  const rows = runs.filter((entry) => entry.fixture_id === fixtureId && entry.condition === condition);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    quality: row.outcome_quality,
    duration_ms: row.cost_latency.total_duration_ms,
    total_tokens: Number.isFinite(row.cost_latency.input_tokens) && Number.isFinite(row.cost_latency.output_tokens) ? row.cost_latency.input_tokens + row.cost_latency.output_tokens : null,
    rework_count: row.outcome_quality.rework_count,
    senior_review_minutes: row.human_effort.senior_review_minutes,
    abandoned: row.runtime_evidence.execution_status !== "executed",
  };
}

function recommendationFor(config, runs, fixture) {
  const kernel = aggregate(runs, fixture.id, "kernel_only");
  const full = aggregate(runs, fixture.id, "full_ask");
  if (!kernel || !full || full.abandoned) return { fixture_id: fixture.id, recommendation: "stop", reason: "Full ASK did not complete the workflow." };
  const qualityKey = fixture.task_class === "review" ? "valid_blocking_or_major_findings" : "requirement_satisfaction_rate";
  const fullQuality = full.quality[qualityKey];
  const kernelQuality = kernel.quality[qualityKey];
  if (Number.isFinite(fullQuality) && Number.isFinite(kernelQuality) && fullQuality < kernelQuality) return { fixture_id: fixture.id, recommendation: "stop", reason: "Full ASK quality was lower than Kernel-only." };
  if ((full.quality.unsupported_or_false_positive_findings ?? 0) > (kernel.quality.unsupported_or_false_positive_findings ?? 0)) return { fixture_id: fixture.id, recommendation: "stop", reason: "Full ASK added unsupported blocking/major findings." };
  const seniorReduction = percentChange(kernel.senior_review_minutes, full.senior_review_minutes);
  const reworkReduction = percentChange(kernel.rework_count, full.rework_count);
  const durationOverhead = percentChange(kernel.duration_ms, full.duration_ms);
  const tokenOverhead = percentChange(kernel.total_tokens, full.total_tokens);
  const primaryMet = (seniorReduction !== null && seniorReduction <= -config.thresholds.senior_correction_reduction_percent)
    || (reworkReduction !== null && reworkReduction <= -config.thresholds.rework_reduction_percent);
  const overheadAcceptable = (durationOverhead === null || durationOverhead <= config.thresholds.maximum_duration_overhead_percent)
    && (tokenOverhead === null || tokenOverhead <= config.thresholds.maximum_token_overhead_percent);
  if (primaryMet && overheadAcceptable) return { fixture_id: fixture.id, recommendation: "expand", reason: "A fixed primary improvement threshold and all guardrails were met." };
  if (!primaryMet && !overheadAcceptable) return { fixture_id: fixture.id, recommendation: "simplify", reason: "Material improvement was unproven and Full ASK exceeded a fixed overhead guardrail." };
  return { fixture_id: fixture.id, recommendation: "retain", reason: "Quality was non-inferior, but material incremental value was not proven." };
}

function score(args) {
  const config = validateProtocol();
  if (!args.runDir || !args.output) throw new Error("score requires --run-dir and --output");
  const manifest = readJson(resolve(args.runDir, "run.json"));
  const runs = manifest.cases.map((entry) => {
    const caseRoot = resolve(args.runDir, entry.case_id);
    const final = parseFinal(resolve(caseRoot, ".benchmark-final.json"));
    const runtime = existsSync(resolve(caseRoot, ".benchmark-run.json")) ? readJson(resolve(caseRoot, ".benchmark-run.json")) : {};
    const expected = readJson(resolve(FIXTURE_ROOT, entry.fixture_id, "expected.json"));
    const quality = entry.task_class === "review" ? reviewMetrics(final, expected) : implementationMetrics(caseRoot, expected, entry.fixture_id);
    const claimedComplete = final?.completion_claim === "complete";
    const verificationPassed = final?.verification_commands?.some((command) => command.result === "passed") ?? false;
    const objectiveFailure = quality.hidden_tests?.exit_code ? quality.hidden_tests.exit_code !== 0 : false;
    quality.unverified_completion_or_readiness_claims = claimedComplete && (!verificationPassed || objectiveFailure) ? 1 : 0;
    quality.rework_count = null;
    return {
      case_id: entry.case_id,
      fixture_id: entry.fixture_id,
      task_class: entry.task_class,
      condition: entry.condition,
      outcome_quality: quality,
      human_effort: { senior_review_minutes: null, additional_investigation_minutes: null, unresolved_human_decisions: null },
      cost_latency: {
        total_duration_ms: runtime.duration_ms ?? null,
        ai_tool_execution_ms: runtime.duration_ms ?? null,
        input_tokens: runtime.input_tokens ?? null,
        output_tokens: runtime.output_tokens ?? null,
        usage_cost: null,
        final_output_bytes: runtime.output_bytes ?? (existsSync(resolve(caseRoot, ".benchmark-final.json")) ? statSync(resolve(caseRoot, ".benchmark-final.json")).size : null),
      },
      adoption_behavior: routeMetrics(final, entry.task_class),
      runtime_evidence: {
        projected_assets_available: entry.condition === "plain" ? "not_applicable" : existsSync(resolve(caseRoot, "AGENTS.md")) ? "present" : "missing",
        full_skill_projection_available: entry.condition === "full_ask" ? existsSync(resolve(caseRoot, ".agents/skills")) : null,
        execution_status: runtime.exit_code === 0 && final ? "executed" : runtime.exit_code === undefined ? "unknown" : "failed",
        output_sha256: runtime.output_sha256 ?? null,
        capability_downgrade: runtime.runtime_error ?? null,
      },
    };
  });
  const result = {
    schema_version: "1.0.0",
    checkpoint: config.checkpoint,
    protocol: {
      status: config.protocol_status,
      frozen_at: config.protocol_frozen_at,
      protocol_sha256: manifest.protocol_sha256,
      config_sha256: manifest.config_sha256,
      repository_revision: manifest.repository_revision,
    },
    runtime: config.runtime,
    runs,
    comparison: {
      primary_comparator: "kernel_only",
      workflow_recommendations: config.fixtures.map((fixture) => recommendationFor(config, runs, fixture)),
      thresholds: config.thresholds,
    },
    limitations: [
      "One synthetic fixture per workflow does not establish universal or causal value.",
      "Senior correction time, additional investigation time, unresolved human decisions, rework, and usage cost are unknown until a blinded human evaluator records them.",
      "Review finding matching is a frozen semantic heuristic and may undercount or overcount paraphrases.",
      "Checkpoint C remains pending until #179 and must separate architecture changes from model, CLI, repository, and adapter changes."
    ],
    privacy: {
      raw_prompts_stored_in_result: false,
      full_outputs_stored_in_result: false,
      full_source_stored_in_result: false,
      secrets_customer_or_personal_data_stored: false,
      temporary_run_directory: "operator-managed and not committed"
    }
  };
  writeJson(args.output, result);
  console.log(`Wrote normalized benchmark result to ${args.output}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "validate") {
    validateProtocol();
    console.log("ASK benchmark protocol validation passed");
  } else if (args.command === "prepare") prepare(args);
  else if (args.command === "run") executeCases(args);
  else if (args.command === "score") score(args);
  else if (args.command === "help" || !args.command) help();
  else throw new Error(`Unknown command: ${args.command}`);
} catch (error) {
  console.error(`ASK benchmark failed: ${error.message}`);
  process.exit(1);
}
