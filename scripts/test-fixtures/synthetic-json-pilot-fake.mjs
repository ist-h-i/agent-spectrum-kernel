// Owned model-free subprocess. Never imports or launches a Codex binary.
import { readFileSync, writeFileSync, symlinkSync, linkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const raw = process.argv.slice(2), nativeMode = raw[0]?.startsWith("--native-");
const [scenario, condition] = nativeMode ? raw.slice(1, 3) : raw;
const argv = nativeMode ? raw.slice(3) : [];
if (nativeMode) {
  const env = { ...process.env }; delete env.PILOT_FINAL; delete env.PILOT_SESSION; delete env.PILOT_PROFILE_DIGEST; delete env.PILOT_SESSION_ID; delete env.PILOT_DENY_ROOTS; delete env.PILOT_LAUNCH_RECORD;
  writeFileSync(process.env.PILOT_LAUNCH_RECORD, JSON.stringify({ argv, env }), { mode: 0o600 });
  if (!argv.includes('forced_login_method="chatgpt"') || !argv.includes('cli_auth_credentials_store="file"')
    || !argv.includes("permissions.ask_synthetic_pilot.network.enabled=false") || env.CODEX_HOME !== env.HOME) process.exit(13);
  if (raw[0] === "--native-control") {
    if (argv[0] !== "sandbox" || !argv.includes("--include-managed-config") || argv.includes("exec")) process.exit(14);
    if (scenario === "timeout") setInterval(() => {}, 1000);
    else if (scenario === "pass") process.stdout.write("ASK_PILOT_CANARY_PASS\n");
    else { process.stderr.write("synthetic canary failure\n"); process.exitCode = scenario === "exit" ? 7 : 5; }
    // No model or native executable is invoked by this branch.
    if (scenario !== "timeout") process.exit(process.exitCode ?? 0);
  } else if (argv[0] !== "exec" || argv.at(-1) !== "-" || argv.includes("--ephemeral") || argv.includes("resume")) process.exit(15);
}
process.stdout.on("error", () => { process.exitCode = 1; });
process.stderr.on("error", () => { process.exitCode = 1; });
const stdin = readFileSync(0, "utf8");
if (condition === "control") { /* the timeout case remains alive */ }
else if (!stdin.includes("pilot-json-aggregate-001") || !["plain", "kernel_only"].includes(condition)
  || (condition === "kernel_only") !== stdin.includes("Agent Spectrum Kernel")) process.exit(9);
if (scenario === "timeout") { setInterval(() => {}, 1000); }
else {
  const rows = JSON.parse(readFileSync("input.json", "utf8")).rows, totals = new Map();
  for (const { sku, quantity } of rows) if (typeof sku === "string" && /^[\x00-\x7f]+$/u.test(sku) && Number.isSafeInteger(quantity) && quantity >= 0) totals.set(sku, (totals.get(sku) ?? 0) + quantity);
  let answer = { totals: [...totals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([sku, total]) => ({ sku, total })) };
  if (scenario === "wrong") answer.totals[0].total++;
  if (scenario === "extra-key") answer.extra = true;
  if (scenario === "unsorted") answer.totals.reverse();
  if (scenario === "symlink") symlinkSync(join(process.cwd(), "input.json"), "answer.json");
  else if (scenario === "hardlink") linkSync("input.json", "answer.json");
  else if (scenario !== "missing") writeFileSync("answer.json", scenario === "invalid" ? "{broken" : scenario === "duplicate" ? '{"totals":[],"totals":[]}'
    : scenario === "utf8" ? Buffer.from([0xff]) : scenario === "oversize-answer" ? "x".repeat(65537) : JSON.stringify(answer), { mode: 0o600 });
  if (scenario === "seed-change") writeFileSync("input.json", "{}");
  if (scenario === "extra-file") writeFileSync("extra.txt", "synthetic");
  // Deliberately collide with one controller artifact to test no-overwrite and
  // partial failure accounting. This is an owned synthetic fault only.
  if (scenario === "evidence-fault") writeFileSync(join(dirname(process.env.PILOT_FINAL), "grade.json"), "{}");
  const final = { task_type: "implementation", decision: "not_applicable", findings: [], requirement_status: [], verification_commands: [], completion_claim: "complete", route: null, summary: "synthetic-only output" };
  writeFileSync(process.env.PILOT_FINAL, scenario === "bad-final" ? "{}" : JSON.stringify(final), { mode: 0o600 });
  if (nativeMode) {
    mkdirSync(dirname(process.env.PILOT_SESSION), { recursive: true });
    const profile = { type: "managed", network: "restricted", file_system: { type: "restricted", entries: [
      ...JSON.parse(process.env.PILOT_DENY_ROOTS).map(path => ({ path: { type: "path", path }, access: "deny" })),
      { path: { type: "path", path: process.cwd() }, access: "write" }] } };
    const rows = [{ type: "session_meta", payload: { id: process.env.PILOT_SESSION_ID, cli_version: "0.157.1", model_provider: "ask_pilot_openai", cwd: process.cwd() } },
      { type: "turn_context", payload: { turn_id: `turn-${process.env.PILOT_SESSION_ID}`, cwd: process.cwd(), model: scenario === "identity-drift" ? "wrong-model" : "gpt-6.1-sol",
        effort: "medium", approval_policy: "never", sandbox_policy: { type: "workspace-write", network_access: false }, permission_profile: profile, active_permission_profile: { id: "ask_synthetic_pilot" } } },
      { type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: "synthetic tool event allowed" } }];
    writeFileSync(process.env.PILOT_SESSION, rows.map(row => JSON.stringify(row)).join("\n") + "\n", { mode: 0o600 });
  } else writeFileSync(process.env.PILOT_SESSION, JSON.stringify({ id: process.env.PILOT_SESSION_ID, model: scenario === "identity-drift" ? "wrong-model" : "gpt-6.1-sol",
    reasoning: "medium", profile_digest: process.env.PILOT_PROFILE_DIGEST, network: false, synthetic: true, pid: process.pid }), { mode: 0o600 });
  if (scenario === "descendant") spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  const input = scenario === "threshold" ? 30000 : scenario === "cumulative-threshold" ? (condition === "plain" ? 29979 : 29981) : 100;
  const events = [{ type: "thread.started", thread_id: process.env.PILOT_SESSION_ID }, { type: "turn.started" }];
  if (scenario === "provider-stop") events.push({ type: "error", message: "usage limit reached" });
  if (!["unknown-usage", "provider-stop"].includes(scenario)) events.push({ type: "turn.completed", usage: { input_tokens: input, output_tokens: 20, cached_input_tokens: 0 } });
  if (scenario === "output-limit") process.stdout.write("x".repeat(2 * 1048576));
  else process.stdout.write(events.map(event => JSON.stringify(event)).join("\n") + "\n");
  if (scenario === "exit") { process.stderr.write("synthetic startup failure\n"); process.exitCode = 7; }
  if (scenario === "descendant") process.exit(0);
}
