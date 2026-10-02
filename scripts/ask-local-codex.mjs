import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { localPreflight, selectLocalRoute } from "./ask-local-eval.mjs";
import { prepareFakePilot, pilotCommand, PILOT_LIMITS, pilotSourceIdentity, assertPilotCurrentSource,
  readPilotPlan, pilotWorkspaceInventory, gradePilotWorkspace, pilotFinalFormat, persistPilotProcess,
  pilotEvidenceInventory, parsePilotNativeSession, NATIVE_CANARY_CODE } from "./ask-synthetic-json-pilot.mjs";
import { executeContainedAgent } from "./ask-benchmark-execution.mjs";
import { captureSuccessorUsage } from "./ask-benchmark-prompt-successor-usage.mjs";
import { canonicalDigest, parseJsonRejectDuplicateKeys, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "scripts/ask-local-codex.mjs", FAKE = "scripts/test-fixtures/local-codex-fake.mjs";
const SOURCES = [SELF, FAKE, "scripts/ask-local-eval.mjs"];
const PLAN = "connection.json", REPORT = "connection-report.json";
export const CODEX_CONNECTION_VERSION = "0.157.1";
export const CONNECTION_SCENARIOS = ["pass", "wrong", "malformed", "unknown", "threshold", "exit", "timeout", "identity", "missing-session", "reused-session", "provider", "interrupt"];
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const bytes = (path, max = 1048576) => readStableFile(path, "connection evidence", max).bytes;
const read = path => parseJsonRejectDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(bytes(path)));
const save = (path, artifact) => writeCanonicalJsonNoReplace({ outputPath: path, artifact });
const raw = (path, value) => writeFileSync(path, value, { mode: 0o600, flag: "wx" });
const same = (a, b) => canonicalDigest(a) === canonicalDigest(b);
const within = (root, path) => path === root || path.startsWith(root + sep);
function directory(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || path === "/" || realpathSync(path) !== path
    || !lstatSync(path).isDirectory()) throw new Error("canonical directory required");
  return path;
}
function ownerDirectory(path) {
  directory(path);
  const stat = lstatSync(path);
  if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw new Error("private owner-only directory required; no permissions changed");
  return path;
}
function source() {
  return { pilot: pilotSourceIdentity(), adapter: Object.fromEntries(SOURCES.map(path => [path, hash(bytes(join(ROOT, path)))])) };
}
function cleanNativeSource() {
  if (execFileSync("git", ["-C", ROOT, "status", "--porcelain"], { encoding: "utf8", timeout: 10000 }).trim()) throw new Error("native source must be committed and clean");
}
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && same(Object.keys(value).sort(), [...keys].sort());
export function assertConnectionPermissionShape(permission) {
  if (!exactKeys(permission, ["kind", "plan_digest", "source_digest", "cli_image_digest", "route", "approval_ref", "actions", "image_reviewed", "admission"])
    || !exactKeys(permission.actions, ["probes", "trials", "retry", "existing_home_cli_read_refresh"])
    || !exactKeys(permission.admission, ["evidence_class", "source_digest", "cli_image_digest", "host", "network_enforcement", "evidence_ref"])) throw new Error("closed nonsecret connection permission required");
}

/** Reuse the pilot command; add only the existing session/auth store deny root. */
export function codexConnectionCommand(plan, base) {
  const command = pilotCommand({ privateRoot: base.private_root, controllerRoot: base.controller_root, workspaceRoot: base.workspace_root });
  const roots = [...command.deny_roots, plan.codex_home];
  const argv = command.argv.map(value => value.startsWith("permissions.ask_synthetic_pilot.filesystem=")
    ? `permissions.ask_synthetic_pilot.filesystem={ ${roots.map(root => `${JSON.stringify(root)} = "deny"`).join(", ")}, ":workspace_roots" = "write" }` : value);
  return { ...command, argv, deny_roots: roots, execution_status: "requires_new_connection_permission" };
}

/** No Codex subprocess, credential file access, link, copy or auth configuration. */
export function prepareCodexConnection(descriptor, { simulation = false, scenarios = ["pass", "pass"], probePass = true, fakeTimeoutMs = null, host = null } = {}) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)
    || Object.keys(descriptor).some(key => !["privateRoot", "workspaceParent", "codexHome", "executable", "imageDigest"].includes(key))) throw new Error("closed connection descriptor required");
  if (process.platform === "win32") throw new Error("use Linux Node inside WSL2");
  if (simulation && (descriptor.executable !== undefined || descriptor.imageDigest !== undefined)) throw new Error("simulation cannot bind a native image");
  if (!simulation && (host !== null || fakeTimeoutMs !== null || !same(scenarios, ["pass", "pass"]) || !probePass)) throw new Error("synthetic options forbidden in live plan");
  if (!Array.isArray(scenarios) || scenarios.length !== 2 || scenarios.some(value => !CONNECTION_SCENARIOS.includes(value))) throw new Error("closed simulation scenarios required");
  if (fakeTimeoutMs !== null && (!Number.isInteger(fakeTimeoutMs) || fakeTimeoutMs < 20 || fakeTimeoutMs > PILOT_LIMITS.timeout_ms)) throw new Error("invalid simulation timeout");
  const observed = localPreflight();
  const routeHost = host ?? observed.host, selected = selectLocalRoute(routeHost);
  if (!observed.selected.fake_ready || !selected.fake_ready) throw new Error("host prerequisites unavailable");
  const codexHome = ownerDirectory(descriptor.codexHome);
  if (simulation && readdirSync(codexHome).length !== 0) throw new Error("simulation requires a new empty owned home, never a user credential/session store");
  const controllerRoot = realpathSync(dirname(ROOT));
  if (within(controllerRoot, codexHome) || within(codexHome, controllerRoot)) throw new Error("existing Codex home must be separate from controller");
  let executable = simulation ? realpathSync(process.execPath) : descriptor.executable;
  if (typeof executable !== "string" || !isAbsolute(executable) || realpathSync(executable) !== executable) throw new Error("canonical executable required");
  const executableStat = lstatSync(executable);
  if (within(codexHome, executable) || !executableStat.isFile() || executableStat.nlink !== 1
    || !(executableStat.mode & 0o111) || (executableStat.mode & 0o022)) throw new Error("safe executable metadata required before reading image bytes");
  const image = readStableFile(executable, "CLI image", 256 * 1024 * 1024, { allowEmpty: false });
  if (!simulation && (image.rawByteDigest !== descriptor.imageDigest || !(image.evidence.finalPath.mode & 0o111)
    || (image.evidence.finalPath.mode & 0o022))) throw new Error("reviewed executable image identity required");
  if (!simulation) cleanNativeSource();
  const prepared = prepareFakePilot({ privateRoot: descriptor.privateRoot, workspaceParent: descriptor.workspaceParent, controllerRoot });
  const base = readPilotPlan(prepared.privateRoot);
  for (const root of [base.private_root, base.workspace_root]) if (within(root, codexHome) || within(codexHome, root)) throw new Error("overlapping session/evidence/workspace roots");
  const plan = { kind: "ask_local_codex_connection_v1", mode: simulation ? "simulation" : "planned_live", base_digest: prepared.planDigest,
    source: source(), host: observed.host, route_host: routeHost, route: selected.route, cli: { version: CODEX_CONNECTION_VERSION, executable, image_digest: image.rawByteDigest },
    codex_home: codexHome, auth: "existing_file_store_cli_only_no_controller_credential_operations",
    constraints: structuredClone(PILOT_LIMITS), scenarios, probe_pass: probePass, fake_timeout_ms: fakeTimeoutMs,
    live_ready: false, admission: "not_exercised", synthetic_host: host !== null };
  plan.command = codexConnectionCommand(plan, base);
  save(join(prepared.privateRoot, PLAN), plan);
  save(join(prepared.privateRoot, "connection-digest.json"), { digest: canonicalDigest(plan) });
  if (simulation) save(join(codexHome, "owned-simulation.json"), { kind: "ask_owned_connection_simulation_v1", root: prepared.privateRoot, plan_digest: canonicalDigest(plan) });
  return { privateRoot: prepared.privateRoot, planDigest: canonicalDigest(plan), mode: plan.mode, live_ready: false };
}

function readConnection(root, current = false) {
  const base = readPilotPlan(root), plan = read(join(root, PLAN));
  if (plan.kind !== "ask_local_codex_connection_v1" || !["simulation", "planned_live"].includes(plan.mode)
    || plan.base_digest !== canonicalDigest(base) || canonicalDigest(plan) !== read(join(root, "connection-digest.json")).digest
    || plan.cli.version !== CODEX_CONNECTION_VERSION || plan.live_ready !== false
    || plan.route !== selectLocalRoute(plan.route_host).route || !selectLocalRoute(plan.route_host).fake_ready
    || !same(plan.constraints, PILOT_LIMITS) || !same(plan.command, codexConnectionCommand(plan, base))
    || plan.scenarios.length !== 2 || plan.scenarios.some(value => !CONNECTION_SCENARIOS.includes(value))
    || (plan.mode === "planned_live" && (plan.synthetic_host || !same(plan.host, plan.route_host)
      || !same(plan.scenarios, ["pass", "pass"]) || !plan.probe_pass || plan.fake_timeout_ms !== null))) throw new Error("connection plan drift");
  if (current) {
    if (plan.mode === "simulation" && plan.cli.executable !== realpathSync(process.execPath)) throw new Error("simulation runtime drift");
    const imageStat = lstatSync(plan.cli.executable);
    if (within(plan.codex_home, plan.cli.executable) || !imageStat.isFile() || imageStat.nlink !== 1
      || !(imageStat.mode & 0o111) || (imageStat.mode & 0o022)) throw new Error("unsafe executable metadata");
    assertPilotCurrentSource(base);
    if (!same(plan.source, source()) || !same(plan.host, localPreflight().host)
      || hash(bytes(plan.cli.executable, 256 * 1024 * 1024)) !== plan.cli.image_digest) throw new Error("connection source/host/image drift");
    ownerDirectory(plan.codex_home);
    if (plan.mode === "simulation" && (!same(read(join(plan.codex_home, "owned-simulation.json")),
      { kind: "ask_owned_connection_simulation_v1", root, plan_digest: canonicalDigest(plan) })
      || readdirSync(plan.codex_home).some(name => !["owned-simulation.json", "sessions"].includes(name)))) throw new Error("owned simulation home drift");
  }
  return { base, plan };
}

/** Fresh HOME; existing CODEX_HOME is used only for an approved future trial. */
export function codexTrialLaunch(plan, base, condition) {
  if (!["plain", "kernel_only"].includes(condition)) throw new Error("closed trial condition required");
  const evidence = join(base.private_root, condition), workspace = join(base.workspace_root, condition);
  const argv = plan.command.argv.map(value => value === "{output_schema}" ? join(evidence, "output-schema.json") : value === "{output}" ? join(evidence, "final.json") : value);
  argv.splice(argv.length - 1, 0, "-C", workspace);
  return { executable: plan.cli.executable, argv, cwd: workspace,
    env: { HOME: join(evidence, "home"), CODEX_HOME: plan.codex_home, LANG: "C", LC_ALL: "C", TZ: "UTC",
      PATH: `${dirname(base.node.executable)}:/usr/bin:/bin:/usr/sbin:/sbin` },
    timeout: PILOT_LIMITS.timeout_ms, killSignal: "SIGKILL", maxBuffer: PILOT_LIMITS.max_buffer_bytes };
}

/** CLI picks Seatbelt on Darwin and Landlock on Linux, including WSL2. */
export function codexProbeLaunches(plan, base, canaries) {
  const home = join(base.private_root, "connection-probe", "home"), cwd = join(base.workspace_root, "connection-probe");
  const settings = [];
  for (let i = 0; i < plan.command.argv.length; i++) if (plan.command.argv[i] === "-c") settings.push(plan.command.argv[++i]);
  const options = { executable: plan.cli.executable, cwd, env: { HOME: home, CODEX_HOME: home, LANG: "C", LC_ALL: "C", TZ: "UTC",
    PATH: `${dirname(base.node.executable)}:/usr/bin:/bin:/usr/sbin:/sbin` }, timeout: 10000, killSignal: "SIGKILL", maxBuffer: PILOT_LIMITS.max_buffer_bytes };
  return [["--version"], ["exec", "--help"], ["sandbox", "--help"],
    ["sandbox", "-P", "ask_synthetic_pilot", "--include-managed-config", ...settings.flatMap(value => ["-c", value]),
      "-C", cwd, "--", base.node.executable, "-e", NATIVE_CANARY_CODE, ...canaries]].map(argv => ({ ...options, argv }));
}

function invoke(plan, launch, stage, scenario, condition, root, command) {
  const { executable, argv, ...options } = launch;
  if (plan.mode === "planned_live") return executeContainedAgent(executable, argv, { ...options, recordCleanupFailure: true });
  return executeContainedAgent(realpathSync(process.execPath), [join(ROOT, FAKE), stage, scenario, condition, ...argv],
    { ...options, timeout: stage === "exec" ? plan.fake_timeout_ms ?? options.timeout : options.timeout,
      env: { ...options.env, CONNECTION_EVIDENCE: root, CONNECTION_DENIES: JSON.stringify(command.deny_roots) }, recordCleanupFailure: true });
}

function checks(plan, base) {
  const root = join(base.private_root, "connection-probe"), workspace = join(base.workspace_root, "connection-probe");
  mkdirSync(root, { mode: 0o700 }); mkdirSync(join(root, "home"), { mode: 0o700 }); mkdirSync(workspace, { mode: 0o700 });
  const publicFile = join(workspace, "public.txt"), privateFile = join(root, "private.txt");
  raw(publicFile, "ASK_PUBLIC_CANARY\n"); raw(privateFile, "ASK_PRIVATE_CANARY\n");
  const other = join(base.workspace_root, "other-trial-canary"); mkdirSync(other, { mode: 0o700 }); raw(join(other, "private.txt"), "ASK_OTHER_CANARY\n");
  const launches = codexProbeLaunches(plan, base, [publicFile, privateFile, join(ROOT, "benchmarks/fixtures/pilot-json-aggregate-001/input.json"), join(other, "private.txt"), plan.codex_home]);
  const outcomes = [];
  for (let index = 0; index < launches.length; index++) {
    const slot = join(root, `check-${index}`); mkdirSync(slot, { mode: 0o700 });
    save(join(slot, "claim.json"), { state: "spent", launch: canonicalDigest(launches[index]) });
    const started = new Date().toISOString(), proc = invoke(plan, launches[index], "probe", plan.probe_pass ? "pass" : "control-fail", `${index}`, slot, plan.command);
    const process = persistPilotProcess(slot, proc, started, launches[index].timeout);
    const out = Buffer.from(proc.stdout ?? "").toString("utf8");
    const match = index === 0 ? out.trim() === `codex-cli ${CODEX_CONNECTION_VERSION}`
      : index === 1 ? ["--ignore-user-config", "--ignore-rules", "--json", "--output-schema", "--output-last-message", "--strict-config"].every(flag => out.includes(flag))
      : index === 2 ? ["--include-managed-config", "-P", "-C"].every(flag => out.includes(flag)) : out === "ASK_PILOT_CANARY_PASS\n";
    const pass = proc.status === 0 && !proc.error && !proc.signal && !proc.workspace_descendants_detected && match && Buffer.from(proc.stderr ?? "").length === 0;
    outcomes.push({ index, status: pass ? "pass" : "fail", process });
    if (!pass) break;
  }
  return { status: outcomes.length === 4 && outcomes.every(x => x.status === "pass") ? "pass" : "fail", outcomes,
    evidence_class: plan.mode === "simulation" ? "synthetic_only" : "observed_host_control",
    network_enforcement: "not_probed", authentication: "not_checked", model_calls: 0 };
}

function sessionBytes(home, stdout, started) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(stdout);
  const threads = text.trimEnd().split("\n").map(row => parseJsonRejectDuplicateKeys(row)).filter(row => row.type === "thread.started");
  const id = threads[0]?.thread_id;
  if (threads.length !== 1 || typeof id !== "string" || !/^[A-Za-z0-9-]{10,128}$/u.test(id)) throw new Error("ambiguous thread identity");
  const found = []; let visited = 0;
  function walk(path, depth = 0) {
    if (depth > 5) throw new Error("session nesting limit");
    for (const name of readdirSync(path)) {
      if (++visited > 4096) throw new Error("session inventory limit");
      const file = join(path, name), info = lstatSync(file);
      if (info.isSymbolicLink()) throw new Error("session link refused");
      if (info.isDirectory()) walk(file, depth + 1);
      else if (name.endsWith(`-${id}.jsonl`)) {
        if (!info.isFile() || info.nlink !== 1 || info.mtimeMs < Date.parse(started)) throw new Error("stale/unsafe session");
        found.push(file);
      }
    }
  }
  directory(join(home, "sessions")); walk(join(home, "sessions"));
  if (found.length !== 1) throw new Error("one matching new session required");
  return bytes(found[0], PILOT_LIMITS.session_bytes);
}

/** Reuses strict session/usage/grading; no semantic LLM judge. */
function trial(plan, base, condition) {
  const root = join(base.private_root, condition), workspace = join(base.workspace_root, condition);
  mkdirSync(root, { mode: 0o700 }); mkdirSync(join(root, "home"), { mode: 0o700 }); mkdirSync(workspace, { mode: 0o700 });
  for (const file of ["input.json", "task.md"]) raw(join(workspace, file), bytes(join(ROOT, "benchmarks/fixtures/pilot-json-aggregate-001", file)));
  const seeded = pilotWorkspaceInventory(workspace); save(join(root, "seeded.json"), seeded);
  const task = bytes(join(workspace, "task.md"));
  const stdin = condition === "plain" ? task : Buffer.concat([bytes(join(ROOT, "AGENTS.md")), Buffer.from("\n"), task, Buffer.from("\n")]);
  raw(join(root, "stdin.txt"), stdin); raw(join(root, "output-schema.json"), bytes(join(ROOT, "benchmarks/schemas/agent-output.schema.json")));
  const launch = codexTrialLaunch(plan, base, condition);
  save(join(root, "launch.json"), launch); save(join(root, "claim.json"), { state: "spent", plan_digest: canonicalDigest(plan), launch_digest: canonicalDigest(launch) });
  const started = new Date().toISOString(), index = condition === "plain" ? 0 : 1;
  const proc = invoke(plan, { ...launch, input: stdin }, "exec", plan.scenarios[index], condition, root, plan.command);
  const process = persistPilotProcess(root, proc, started, plan.mode === "simulation" ? plan.fake_timeout_ms ?? launch.timeout : launch.timeout);
  const usage = captureSuccessorUsage(proc), grade = gradePilotWorkspace({ workspace, seeded });
  save(join(root, "usage.json"), usage); save(join(root, "grade.json"), grade);
  let identity = null, identityError = null;
  try {
    const session = sessionBytes(plan.codex_home, Buffer.from(proc.stdout ?? ""), started);
    raw(join(root, "session.jsonl"), session);
    identity = parsePilotNativeSession({ stdout: Buffer.from(proc.stdout ?? ""), session,
      plan: { ...base, command: plan.command }, workspace, sessionHome: plan.codex_home });
  } catch (error) { identityError = error.message; }
  save(join(root, "session-check.json"), { status: identity ? "match" : "mismatch", identity, reason: identityError });
  const total = usage.metrics.total_tokens;
  const stop = proc.error || proc.status !== 0 || proc.signal || proc.workspace_descendants_detected || process.output_limited ? "process_failure"
    : !identity ? "session_identity_failure" : grade.status === "boundary_fault" ? "workspace_boundary_fault"
    : usage.provider_stop.status === "detected" ? "provider_stop" : total.status !== "known" ? "usage_unknown"
    : total.value >= PILOT_LIMITS.trial_tokens ? "trial_token_threshold" : null;
  return { condition, state: "completed", process, grade, final_format: pilotFinalFormat(join(root, "final.json")), usage: total,
    session_id: identity?.session_id ?? null, stop };
}

/** Future live API. No CLI binding command or permission writer is supplied. */
export function runCodexConnection(root, permission = null) {
  const { base, plan } = readConnection(root, true);
  if (plan.mode === "planned_live" && (!permission || permission.kind !== "ask_local_codex_permission_v1"
    || permission.plan_digest !== canonicalDigest(plan) || permission.source_digest !== canonicalDigest(plan.source)
    || permission.cli_image_digest !== plan.cli.image_digest || permission.route !== plan.route
    || typeof permission.approval_ref !== "string" || permission.approval_ref.length < 10
    || !same(permission.actions, { probes: 4, trials: 2, retry: 0, existing_home_cli_read_refresh: true })
    || permission.image_reviewed !== true || !permission.admission || permission.admission.evidence_class !== "observed_real_host"
    || permission.admission.source_digest !== canonicalDigest(plan.source) || permission.admission.cli_image_digest !== plan.cli.image_digest
    || !same(permission.admission.host, plan.host) || permission.admission.network_enforcement !== "verified"
    || typeof permission.admission.evidence_ref !== "string" || permission.admission.evidence_ref.length < 10)) throw new Error("fresh exact connection execution permission and network/image admission required");
  if (plan.mode === "simulation" && permission !== null) throw new Error("live permission cannot bind simulation");
  if (permission) { assertConnectionPermissionShape(permission); cleanNativeSource(); save(join(root, "connection-permission.json"), permission); }
  save(join(root, "connection-run-claim.json"), { state: "spent", plan_digest: canonicalDigest(plan), permission_digest: permission ? canonicalDigest(permission) : null });
  const report = { kind: "ask_local_codex_report_v1", mode: plan.mode, plan_digest: canonicalDigest(plan), route: plan.route,
    execution_status: "incomplete", retry: 0, model_calls: plan.mode === "simulation" ? 0 : "unobserved",
    credential_operations: plan.mode === "simulation" ? 0 : "cli_read_refresh_unobserved", total_known_tokens: 0, stop: null,
    slots: ["plain", "kernel_only"].map(condition => ({ condition, state: "not_started" })) };
  save(join(root, "connection-checkpoint-initial.json"), report);
  report.preflight = checks(plan, base);
  report.stop = report.preflight.status === "pass" ? null : "model_free_preflight_failed";
  for (const [index, slot] of report.slots.entries()) {
    if (report.stop) break;
    try {
      readConnection(root, true);
      report.slots[index] = trial(plan, base, slot.condition);
      const outcome = report.slots[index];
      if (outcome.session_id && report.slots.slice(0, index).some(prior => prior.session_id === outcome.session_id)) outcome.stop = "session_reused";
      report.total_known_tokens += outcome.usage.status === "known" ? outcome.usage.value : 0;
      report.stop = outcome.stop ?? (report.total_known_tokens >= PILOT_LIMITS.cumulative_tokens ? "cumulative_token_threshold" : null);
    } catch {
      report.slots[index] = { condition: slot.condition, state: existsSync(join(root, slot.condition, "claim.json")) ? "spent_incomplete" : "not_started", stop: "evidence_or_source_fault" };
      report.stop = "evidence_or_source_fault";
    }
    save(join(root, `connection-checkpoint-${index}.json`), report);
  }
  report.execution_status = "terminal";
  report.summary = [plan.mode === "simulation" ? "Owned simulation; no Codex/model/auth calls." : "Approved live connection; inspect observed identity and usage.",
    ...report.slots.map(slot => `${slot.condition}: ${slot.state}; grade=${slot.grade?.status ?? "unavailable"}; usage=${slot.usage?.value ?? "unknown"}`),
    `Stop: ${report.stop ?? "none"}; retries: 0. Known tokens are a partial sum when usage is unknown.`].join("\n");
  save(join(root, REPORT), report);
  save(join(root, "evidence-seal.json"), { plan_digest: canonicalDigest(plan), files: pilotEvidenceInventory(root) });
  return report;
}

export function reopenCodexConnection(root) {
  const { plan } = readConnection(root);
  if (!existsSync(join(root, "evidence-seal.json"))) return { kind: "ask_local_codex_incomplete_v1", mode: plan.mode,
    execution_status: "incomplete", verification: "unsealed_not_verified", model_calls: "unknown", retry: 0,
    summary: "Unsealed/incomplete evidence. Preserve claims and checkpoints; do not restart this directory." };
  const seal = read(join(root, "evidence-seal.json"));
  if (seal.plan_digest !== canonicalDigest(plan) || !same(seal.files, pilotEvidenceInventory(root))) throw new Error("connection evidence digest mismatch");
  const report = read(join(root, REPORT));
  if (report.kind !== "ask_local_codex_report_v1" || report.mode !== plan.mode || report.plan_digest !== canonicalDigest(plan)) throw new Error("connection report binding mismatch");
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, file, ...extra] = process.argv.slice(2);
    if (extra.length || !file) throw new Error("closed command required");
    const result = command === "prepare" ? prepareCodexConnection(read(file))
      : command === "prepare-simulation" ? prepareCodexConnection(read(file), { simulation: true })
      : command === "simulate" && readConnection(file).plan.mode === "simulation" ? runCodexConnection(file)
      : command === "reopen" ? reopenCodexConnection(file) : (() => { throw new Error("live CLI execution unavailable"); })();
    if (command === "simulate" && result.mode !== "simulation") throw new Error("simulation plan required");
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch { process.stderr.write("Codex connection refused or incomplete; evidence preserved.\n"); process.exitCode = 1; }
}
