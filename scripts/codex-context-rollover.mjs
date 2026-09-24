// First pilot adapter. A discovered CLI is not evidence of a successful restart.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, readJsonFileStrict, stableCanonicalJson } from "./content-addressed-store.mjs";
import { assertRolloverArtifact, emptyRuntimeObservation, observedCounter, runtimeIdentity } from "./context-runtime-observation.mjs";
import { runtimePreflight, executeContextRollover, validateContextRolloverResume } from "./context-rollover.mjs";
// CLI-only path loading; the unchanged Slice 2 validator owns all authority.
function loadPlanBundlePaths(paths) {
  const required = ["policy", "decision", "context", "plan"];
  const optional = ["previousPlan", "previousContext", "previousPolicy", "previousDecision"];
  if (!paths || typeof paths !== "object" || Object.keys(paths).some(key => ![...required, ...optional].includes(key))) throw new Error("PLAN_PATHS_INVALID");
  return Object.fromEntries([...required, ...optional.filter(key => paths[key])].map(key => {
    if (typeof paths[key] !== "string" || !paths[key]) throw new Error("PLAN_PATHS_INVALID");
    return [key, readJsonFileStrict(paths[key], "plan bundle")];
  }));
}

/** No model call, authentication probe, environment dump or raw CLI output. */
export function detectCodexRuntime({ executable = "codex" } = {}) {
  const probe = (args) => {
    const result = spawnSync(executable, args, { encoding: "utf8", timeout: 5000, maxBuffer: 65536, shell: false, stdio: ["ignore", "pipe", "ignore"] });
    return !result.error && result.status === 0 ? result.stdout : null;
  };
  const version = probe(["--version"]);
  const execHelp = version === null ? null : probe(["exec", "--help"]);
  const serverHelp = version === null ? null : probe(["app-server", "--help"]);
  return {
    adapter_id: "codex", executable: version === null ? "unavailable" : "runtime_detected",
    version_output_digest: version === null ? null : canonicalDigest({ version }),
    exec_json: execHelp?.includes("--json") ? "runtime_detected" : "unavailable",
    app_server: serverHelp === null ? "unavailable" : "runtime_detected",
    fresh_context: "unavailable", fresh_context_evidence: "requires_live_thread_start_and_empty_thread_read",
    process_identity: runtimeIdentity(), session_identity: runtimeIdentity(),
    claude: { status: "unavailable", evidence: "unverified" },
  };
}

/** Streaming projection of native `codex exec --json`, never a transcript store.
 * The host supplies a monotonic clock and a complete-capture assertion; unknown
 * protocol events are discarded. A terminal turn is NOT a model processing step.
 */
export function createCodexCounterObserver({ runtimePolicyDigest, processIdentity, fromStart = false, startedAtMs = null }) {
  const output = emptyRuntimeObservation({ adapterId: "codex", runtimePolicyDigest, processIdentity });
  let start = startedAtMs, previous = null, active = false, started = false, invalid = false, turns = 0, gaps = 0;
  let usageComplete = true, input = 0, cached = 0, generated = 0;
  const safe = (value) => Number.isSafeInteger(value) && value >= 0;
  return {
    ingest(event, nowMs) {
      if (!safe(nowMs) || (previous !== null && nowMs < previous)) { invalid = true; return; }
      if (start !== null && (!safe(start) || start > nowMs)) { invalid = true; return; }
      if (previous !== null && nowMs - previous > 60000) gaps++;
      previous = nowMs;
      if (event?.type === "thread.started") {
        if (started || turns || active) { invalid = true; return; }
        try { output.session_identity = runtimeIdentity(event.thread_id); started = true; }
        catch { invalid = true; }
      } else if (event?.type === "turn.started") {
        if (active || !started) invalid = true;
        active = true;
      } else if (event?.type === "turn.completed") {
        if (!active) invalid = true;
        active = false; turns++;
        const u = event.usage;
        if (!u || !safe(u.input_tokens) || !safe(u.cached_input_tokens) || !safe(u.output_tokens) || u.cached_input_tokens > u.input_tokens) usageComplete = false;
        else {
          input += u.input_tokens; cached += u.cached_input_tokens; generated += u.output_tokens;
          if (![input, cached, generated].every(safe)) usageComplete = false;
        }
      } else if (["turn.failed", "error"].includes(event?.type)) { invalid = true; }
      // No item text, source, command arguments, message or stderr retained.
    },
    finish({ nowMs, completeCapture = false }) {
      if (!safe(nowMs) || previous === null || nowMs < previous) invalid = true;
      if (!invalid && previous !== null) {
        const coverage = fromStart && started && completeCapture && !active ? "complete" : "partial";
        if (start !== null) output.counters.wall_time_ms = observedCounter(nowMs - start, "ms", "runner", coverage);
        output.counters.runtime_steps = observedCounter(turns, "count", "runtime", coverage);
        output.counters.silent_gap_count_over_60s = observedCounter(gaps + (nowMs - previous > 60000 ? 1 : 0), "count", "runner", coverage);
        if (usageComplete && turns > 0) {
          output.counters.cached_input_tokens = observedCounter(cached, "tokens", "runtime", coverage);
          output.counters.uncached_input_tokens = observedCounter(input - cached, "tokens", "runtime", coverage);
          output.counters.output_tokens = observedCounter(generated, "tokens", "runtime", coverage);
        }
      }
      // Compaction, true model steps, tool wait and verification classification
      // are not guaranteed by this exec protocol. Missing is not observed zero.
      return assertRolloverArtifact(structuredClone(output), "ask_runtime_observation");
    },
  };
}

/** App Server compaction events are separate from exec usage. Only a host
 * that verified a complete event subscription may assert compaction zero. */
export function createCodexCompactionObserver({ runtimePolicyDigest, processIdentity, threadId, sessionId, completeSubscriptionVerified = false }) {
  const output = emptyRuntimeObservation({ adapterId: "codex", runtimePolicyDigest, processIdentity, sessionIdentity: runtimeIdentity(sessionId) });
  const completed = new Set();
  let invalid = typeof threadId !== "string" || !threadId;
  return {
    ingest(event) {
      if (event?.method !== "item/completed" || event.params?.threadId !== threadId || event.params.item?.type !== "contextCompaction") return;
      const id = event.params.item.id;
      if (typeof id !== "string" || !id || id.length > 256 || completed.has(id) || completed.size >= 10000) { invalid = true; return; }
      completed.add(id);
    },
    finish() {
      if (!invalid && (completed.size > 0 || completeSubscriptionVerified)) output.counters.context_compactions = observedCounter(completed.size, "count", "runtime", completeSubscriptionVerified ? "complete" : "partial");
      return assertRolloverArtifact(structuredClone(output), "ask_runtime_observation");
    },
  };
}

/** Live App Server transport is owned/authenticated by the calling runner.
 * rpc(method, params) resolves the actual result or rejects; notify sends a real
 * notification. Never attach a fabricated capability JSON as this transport.
 * The existing runner remains owner of approval/sandbox/Execution Envelope.
 */
export function createCodexAppServerAdapter({ rpc, notify, processIdentity, runtimePolicyDigest, repositoryRoot, model, sandbox = "readOnly" }) {
  if (typeof rpc !== "function" || typeof notify !== "function" || !["readOnly", "workspaceWrite"].includes(sandbox) ||
      typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(model) || processIdentity?.status !== "observed") throw new Error("CODEX_TRANSPORT_UNVERIFIED");
  const config = { cwd: resolve(repositoryRoot), model, approvalPolicy: "never", sandbox };
  if (canonicalDigest(config) !== runtimePolicyDigest) throw new Error("CODEX_RUNTIME_POLICY_MISMATCH");
  let threadId = null, freshSession = null;
  return {
    adapterId: "codex", runtimePolicyDigest,
    async createFreshContext() {
      if (threadId) throw new Error("CODEX_ADAPTER_ALREADY_USED");
      await rpc("initialize", { clientInfo: { name: "ask_context_rollover", version: "1.0.0" } });
      await notify("initialized", {});
      const result = await rpc("thread/start", config);
      threadId = result?.thread?.id;
      if (typeof threadId !== "string" || !threadId || result.cwd !== config.cwd || result.model !== config.model || result.approvalPolicy !== config.approvalPolicy) throw new Error("CODEX_THREAD_POLICY_UNVERIFIED");
      const expectedSandbox = sandbox === "readOnly" ? "readOnly" : "workspaceWrite";
      if (result.sandbox?.type !== expectedSandbox) throw new Error("CODEX_SANDBOX_UNVERIFIED");
      const read = await rpc("thread/read", { threadId, includeTurns: true });
      if (read?.thread?.id !== threadId || !Array.isArray(read.thread.turns) || read.thread.turns.length !== 0 || read.thread.forkedFromId) throw new Error("CODEX_CONTEXT_NOT_FRESH");
      // Read the actual sessionId; it must not be inferred from thread identity.
      // A fork family is explicitly rejected, not called fresh.
      if (typeof result.thread.sessionId !== "string" || read.thread.sessionId !== result.thread.sessionId) throw new Error("CODEX_SESSION_UNVERIFIED");
      freshSession = runtimeIdentity(result.thread.sessionId);
      return { processIdentity, sessionIdentity: freshSession, runtimePolicyDigest };
    },
    async continueFromCheckpoint({ target, authorization, authorizationDigest, restartPackage, continuation, inputDigest }) {
      if (!threadId || canonicalDigest(target.sessionIdentity) !== canonicalDigest(freshSession) ||
          canonicalDigest(continuation) !== authorization.continuation_digest || canonicalDigest(authorization) !== authorizationDigest || authorization.restart_package_digest !== canonicalDigest(restartPackage) ||
          inputDigest !== canonicalDigest({ authorization_digest: authorizationDigest, restart_package_digest: canonicalDigest(restartPackage) })) throw new Error("CODEX_CONTINUATION_BINDING_MISMATCH");
      const text = stableCanonicalJson({ instruction: "Continue only the validated next action. Preserve all controls and evidence references. This is not completion or merge approval.", authorization, restart_package: restartPackage, continuation });
      const response = await rpc("turn/start", { threadId, input: [{ type: "text", text }] });
      if (typeof response?.turn?.id !== "string" || !response.turn.id || response.turn.status !== "inProgress") throw new Error("CODEX_CONTINUATION_UNCONFIRMED");
      return { inputDigest, sessionIdentity: freshSession, turnIdentity: runtimeIdentity(response.turn.id).digest };
    },
  };
}

// Read-only/prepare CLI deliberately has no implicit model execution switch.
// Automatic continuation is called by an already authorized live host via API.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, flag, requestPath, bindingFlag, bindingDigest] = process.argv.slice(2);
    if (command === "detect" && !flag) console.log(JSON.stringify(detectCodexRuntime()));
    else {
      if (flag !== "--request" || !requestPath || (bindingFlag && bindingFlag !== "--binding") || process.argv.length > 7) throw new Error("ARGUMENTS_INVALID");
      const request = readJsonFileStrict(requestPath, "rollover request", 65536);
      if (command === "preflight") console.log(JSON.stringify(runtimePreflight(request)));
      else {
        const allowed = ["repository_root", "store_root", "plan_bundle_paths", "policy_path", "observation_path", "runtime_policy_digest", "active_package_id", "completed_package_ids", "operator_request", "previous_receipt_digest", "target_paths", "contract_paths", "verification_store_root", "evidence_ids"];
        if (Object.keys(request).some((key) => !allowed.includes(key))) throw new Error("REQUEST_FIELDS_INVALID");
        const options = {
          repositoryRoot: request.repository_root, storeRoot: request.store_root, planBundle: loadPlanBundlePaths(request.plan_bundle_paths),
          policy: readJsonFileStrict(request.policy_path, "rollover policy", 65536),
          observation: readJsonFileStrict(request.observation_path, "runtime observation", 65536),
          runtimePolicyDigest: request.runtime_policy_digest, activePackageId: request.active_package_id,
          completedPackageIds: request.completed_package_ids ?? [], operatorRequest: request.operator_request ?? false,
          previousReceiptDigest: request.previous_receipt_digest ?? null, targetPaths: request.target_paths ?? [], contractPaths: request.contract_paths ?? [],
          verificationStoreRoot: request.verification_store_root ?? null, evidenceIds: request.evidence_ids ?? [],
        };
        const result = command === "boundary" ? await executeContextRollover(options) : command === "resume" && bindingDigest ? validateContextRolloverResume({ ...options, bindingDigest }) : null;
        if (!result) throw new Error("COMMAND_INVALID");
        if (result.binding_digest && result.status === "context_rollover_required") result.next_executable_action = {
          kind: "command", argv: [process.execPath, fileURLToPath(import.meta.url), "resume", "--request", resolve(requestPath), "--binding", result.binding_digest],
          then: "follow_validated_restart_package_next_action",
        };
        console.log(JSON.stringify(result));
        process.exitCode = result.status === "blocked" ? 2 : result.status === "context_rollover_required" ? 3 : 0;
      }
    }
  } catch { console.error(JSON.stringify({ status: "blocked", reasons: ["ROLLOVER_REQUEST_INVALID"], source_context_may_be_discarded: false })); process.exitCode = 2; }
}
