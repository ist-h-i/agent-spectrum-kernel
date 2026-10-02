// Owned simulation only. No native CLI, credential or network operations.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const [stage, scenario, condition, ...argv] = process.argv.slice(2);
const root = process.env.CONNECTION_EVIDENCE;
writeFileSync(join(root, "received.json"), JSON.stringify({ argv, env: process.env }), { mode: 0o600, flag: "wx" });
if (stage === "probe") {
  if (condition === "0") process.stdout.write("codex-cli 0.157.1\n");
  else if (condition === "1") process.stdout.write("--ignore-user-config --ignore-rules --json --output-schema --output-last-message --strict-config\n");
  else if (condition === "2") process.stdout.write("--include-managed-config -P -C\n");
  else if (scenario === "control-fail") { process.stderr.write("synthetic control mismatch\n"); process.exitCode = 5; }
  else {
    const result={kind:"ask_codex_canary_v1", filesystem:{read:"pass",write:scenario==="write-open"?"fail":"pass"}, network:[{host:"127.0.0.1",positive:scenario==="positive-unknown"?"unknown":"pass",denied:scenario==="network-open"?"fail":scenario==="network-unknown"?"unknown":"pass"},{host:"::1",positive:"pass",denied:"pass"}]};
    if (scenario==="extra-keys") result.unobserved="must-refuse";
    process.stdout.write(JSON.stringify(result)+"\n");
  }
} else {
  if (argv[0] !== "exec" || argv.at(-1) !== "-" || argv.includes("resume") || argv.includes("--ephemeral")
    || process.env.HOME === process.env.CODEX_HOME || !argv.includes("--ignore-user-config")) process.exit(9);
  const stdin = readFileSync(0, "utf8");
  if (!stdin.includes("pilot-json-aggregate-001") || (condition === "kernel_only") !== stdin.includes("Agent Spectrum Kernel")) process.exit(10);
  if (scenario === "timeout") setInterval(() => {}, 1000);
  else if (scenario === "interrupt") process.kill(process.pid, "SIGINT");
  else {
    const totals = new Map();
    for (const { sku, quantity } of JSON.parse(readFileSync("input.json", "utf8")).rows) {
      if (typeof sku === "string" && /^[\x00-\x7f]+$/u.test(sku) && Number.isSafeInteger(quantity) && quantity >= 0) totals.set(sku, (totals.get(sku) ?? 0) + quantity);
    }
    const answer = { totals: [...totals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([sku, total]) => ({ sku, total })) };
    if (scenario === "wrong") answer.totals[0].total++;
    writeFileSync("answer.json", scenario === "malformed" ? "{bad" : JSON.stringify(answer), { mode: 0o600 });
    const final = { task_type: "implementation", decision: "not_applicable", findings: [], requirement_status: [], verification_commands: [], completion_claim: "complete", route: null, summary: "Owned simulation." };
    writeFileSync(argv[argv.indexOf("--output-last-message") + 1], JSON.stringify(final), { mode: 0o600 });
    const id = scenario === "reused-session" ? "synthetic-session-plain" : `synthetic-session-${condition.replaceAll("_", "-")}`;
    if (scenario !== "missing-session") {
      const sessions = join(process.env.CODEX_HOME, "sessions"); mkdirSync(sessions, { recursive: true, mode: 0o700 });
      const entries = [...JSON.parse(process.env.CONNECTION_DENIES).map(path => ({ path: { type: "path", path }, access: "deny" })),
        ...JSON.parse(process.env.CONNECTION_READS).map(path => ({path:{type:"path",path},access:"read"})),
        { path: { type: "path", path: process.cwd() }, access: "write" },
        { path: { type: "path", path: join(process.env.CODEX_HOME, "tmp/arg0/codex-arg0Ab12Cd") }, access: "read" }];
      if (scenario==="scope-leak") entries.push({path:{type:"path",path:"/personal-unadmitted"},access:"read"});
      const rows = [{ type: "session_meta", payload: { id, cli_version: "0.157.1", model_provider: "ask_pilot_openai", cwd: process.cwd() } },
        { type: "turn_context", payload: { turn_id: `turn-${id}`, cwd: process.cwd(), model: scenario === "identity" ? "wrong-model" : "gpt-6.1-sol", effort: "medium", approval_policy: "never",
          sandbox_policy: { type: "workspace-write", network_access: false }, permission_profile: { type: "managed", network: "restricted", file_system: { type: "restricted", entries } },
          active_permission_profile: { id: "ask_synthetic_pilot" } } }];
      writeFileSync(join(sessions, `rollout-${condition}-${id}.jsonl`), rows.map(row => JSON.stringify(row)).join("\n") + "\n", { mode: 0o600, flag: "wx" });
    }
    const events = [{ type: "thread.started", thread_id: id }, { type: "turn.started" }];
    if (scenario === "provider") events.push({ type: "error", code: "usage_limit_exceeded" });
    else if (scenario !== "unknown") events.push({ type: "turn.completed", usage: { input_tokens: scenario === "threshold" ? 30000 : 100, output_tokens: 20 } });
    process.stdout.write(events.map(event => JSON.stringify(event)).join("\n") + "\n");
    if (scenario === "exit") { process.stderr.write("synthetic failure\n"); process.exitCode = 7; }
    if (scenario === "descendant") spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  }
}
