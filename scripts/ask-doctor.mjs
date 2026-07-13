#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  REPO_ROOT,
  collectTextFiles,
  findPrivacyStorageConcerns,
  findUnsupportedCapabilityClaims,
  hashFile,
  hashText,
  inspectCodexCompactCanonicalSources,
  parseCodexCompactProfileHeader,
  readJsonIfExists,
} from "./ask-shared.mjs";
import { DEFAULT_RUNTIME_EVENT_STORE, resolveObservabilityPath } from "./observability-paths.mjs";

const CORE_STATE_PATH = ".agent-spectrum-kernel/install-state.json";
const CODEX_STATE_PATH = ".agent-spectrum-kernel/codex-install-state.json";
const CLAUDE_STATE_PATH = ".agent-spectrum-kernel/claude-install-state.json";
const RUNTIME_HEALTH_PATH = "ask-runtime/runtime-health.jsonl";
const LEGACY_RUNTIME_HEALTH_PATH = ".agent-spectrum-kernel/runtime-health.jsonl";

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    runtimeProbe: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = resolve(argv[++index]);
    } else if (arg === "--runtime-probe") {
      args.runtimeProbe = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/ask-doctor.mjs --target /path/to/adopting-repo [--runtime-probe] [--json]

Checks Agent Spectrum Kernel installation health without mutating files.
Doctor is an adoption/update health check, not a per-task execution gate.
Exit code 1 means installation health failed; it does not prohibit normal
read-only investigation or local verification.

Optional --runtime-probe adds local/static/dry-run adapter conformance checks.
Runtime probe findings downgrade runtime conformance/readiness claims only; they
do not prove external Claude/Codex execution or product readiness.
`);
}

function buildDoctorReport(target, { runtimeProbe = false } = {}) {
  const report = {
    installed: [],
    warnings: [],
    failures: [],
    unsupportedClaims: [],
    runtimeProbe: {
      enabled: runtimeProbe,
      checked: [],
      warnings: [],
      failures: [],
      codex_evidence: {
        requested_contracts: [],
        projected_contracts: [],
        runtime_detected_profile: "unavailable",
        runtime_loaded_contracts: "unavailable",
        applied_output_contracts: "unavailable",
        workflow_contract_application: "unavailable",
        risk_approval_contract_application: "unavailable",
        verification_contract_application: "unavailable",
      },
    },
  };

  checkManagedInstallState({
    target,
    statePath: CORE_STATE_PATH,
    label: "core kernel",
    targetSkillsRoot: "skills",
    report,
    installerName: "agent-spectrum-kernel",
  });

  checkManagedInstallState({
    target,
    statePath: CODEX_STATE_PATH,
    label: "Codex adapter",
    targetSkillsRoot: ".agents/skills",
    report,
    installerName: "agent-spectrum-codex-adapter",
    optional: true,
    allowDetached: true,
  });

  checkManagedInstallState({
    target,
    statePath: CLAUDE_STATE_PATH,
    label: "Claude adapter",
    targetSkillsRoot: ".claude/skills",
    report,
    installerName: "agent-spectrum-claude-adapter",
    optional: !existsSync(resolve(target, ".claude")),
    allowDetached: true,
  });

  checkClaudeAdapter(target, report);
  checkUnsupportedClaims(target, report);
  checkPrivacyDefaults(target, report);
  checkRuntimeHealth(target, report);
  if (runtimeProbe) {
    checkRuntimeConformanceProbe(target, report);
  }
  report.layerStatuses = buildLayerStatuses(target, report, { runtimeProbe });
  integrateLayerFindings(report);
  report.deploymentStatus = buildDeploymentStatus(report);

  const runtimeFindings = report.runtimeProbe.warnings.length > 0 || report.runtimeProbe.failures.length > 0;
  const status = report.failures.length > 0 ? "fail" : report.warnings.length > 0 || report.unsupportedClaims.length > 0 || runtimeFindings ? "warn" : "pass";
  return { ...report, status };
}

function integrateLayerFindings(report) {
  report.findings = [
    ...report.failures.map((message) => ({ severity: "fail", source: "doctor", message })),
    ...report.warnings.map((message) => ({ severity: "warn", source: "doctor", message })),
  ];
  for (const [layer, entry] of Object.entries(report.layerStatuses)) {
    if (!["installation_health", "adapter_projection"].includes(layer)) continue;
    if (entry.status === "fail") {
      const message = `${layer}: ${entry.detail}`;
      report.failures.push(message);
      report.findings.push({ severity: "fail", source: "layer", layer, message });
    } else if (entry.status === "warn") {
      const message = `${layer}: ${entry.detail}`;
      report.warnings.push(message);
      report.findings.push({ severity: "warn", source: "layer", layer, message });
    }
  }
}

function buildDeploymentStatus(report) {
  const layerStatuses = [report.layerStatuses.installation_health.status, report.layerStatuses.adapter_projection.status];
  const installedStatus = layerStatuses.includes("fail") ? "fail" : layerStatuses.includes("warn") ? "warn" : "pass";
  const currentHealthBlocker = report.warnings.some((warning) => warning.startsWith("adapter runtime health issue:"));
  return {
    Installed: {
      status: installedStatus,
      detail: installedStatus === "pass" ? "managed installation and projection evidence is healthy" : "managed installation or projection evidence is not healthy",
    },
    Activated: {
      status: "insufficient_evidence",
      detail: "requires an explicit project profile/approval artifact; doctor does not infer human activation",
    },
    Operational: {
      status: currentHealthBlocker ? "blocked" : "insufficient_evidence",
      detail: currentHealthBlocker
        ? "blocked by unresolved current runtime-health issue"
        : "requires bounded task evidence and a governance judgment; projection, smoke, and policy keys alone are insufficient",
    },
  };
}

function checkManagedInstallState({ target, statePath, label, targetSkillsRoot, report, optional = false, installerName, allowDetached = false }) {
  const absoluteStatePath = resolve(target, statePath);
  const inProgressPath = `${absoluteStatePath}.in-progress.json`;
  if (existsSync(inProgressPath)) {
    report.failures.push(`${label} install is in progress or was interrupted: ${relative(target, inProgressPath)}`);
  }
  const stateResult = readJsonIfExists(absoluteStatePath);
  if (!stateResult.ok) {
    const message = `${label} install state is ${stateResult.error === "missing" ? "missing" : `invalid: ${stateResult.error}`}: ${statePath}`;
    if (optional) {
      report.installed.push(`${label}: not installed`);
    } else {
      report.failures.push(message);
    }
    return;
  }

  const state = stateResult.value;
  if (
    !state || typeof state !== "object" || state.schema_version !== 3 || state.installer !== installerName ||
    !state.adapter || state.adapter.name !== installerName || !Array.isArray(state.installed_skills) ||
    !state.managed_files || typeof state.managed_files !== "object" || Array.isArray(state.managed_files) ||
    !state.managed_blocks || typeof state.managed_blocks !== "object" || Array.isArray(state.managed_blocks)
  ) {
    report.failures.push(`${label} install state has invalid shape: ${statePath}`);
    return;
  }
  if (allowDetached && state.install_status === "detached") {
    report.installed.push(`${label}: detached (${statePath})`);
    return;
  }
  if (state.install_status !== "installed") report.failures.push(`${label} install_status must be installed: ${statePath}`);
  report.installed.push(`${label}: install state present (${statePath})`);

  for (const skill of state.selected_skills ?? []) {
    const skillPath = resolve(target, targetSkillsRoot, skill, "SKILL.md");
    if (!existsSync(skillPath)) {
      report.failures.push(`${label} selected skill is missing: ${relative(target, skillPath)}`);
    }
  }

  for (const skill of state.retained_stale_skills ?? []) {
    report.warnings.push(`${label} retained stale managed skill projection: ${skill}`);
  }
  for (const prompt of state.retained_stale_prompts ?? []) {
    report.warnings.push(`${label} retained stale managed prompt projection: ${prompt}`);
  }
  for (const command of state.retained_stale_commands ?? []) {
    report.warnings.push(`${label} retained stale managed command projection: ${command}`);
  }

  for (const [managedPath, record] of Object.entries(state.managed_files)) {
    const destination = resolve(target, managedPath);
    if (!existsSync(destination)) {
      report.failures.push(`${label} managed file is missing: ${managedPath}`);
      continue;
    }
    if (!record || typeof record.sha256 !== "string") {
      report.failures.push(`${label} managed file record is missing sha256: ${managedPath}`);
      continue;
    }
    const currentHash = hashFile(destination);
    if (currentHash !== record.sha256) {
      report.failures.push(`${label} managed file hash mismatch: ${managedPath}`);
      continue;
    }
    const sourcePath = sourcePathForManagedRecord(managedPath, record);
    if (sourcePath && existsSync(sourcePath) && currentHash !== hashFile(sourcePath)) {
      report.warnings.push(`${label} managed file is stale relative to this ASK checkout: ${managedPath}`);
    }
  }
  for (const [blockKey, record] of Object.entries(state.managed_blocks)) {
    const destination = resolve(target, record?.path || "");
    if (!record || typeof record.path !== "string" || typeof record.sha256 !== "string" || !existsSync(destination)) {
      report.failures.push(`${label} managed block is missing: ${blockKey}`);
      continue;
    }
    const text = readFileSync(destination, "utf8");
    const start = text.indexOf("<!-- agent-spectrum-kernel:start -->");
    const endMarker = "<!-- agent-spectrum-kernel:end -->";
    const end = text.indexOf(endMarker, start);
    if (start < 0 || end < start) {
      report.failures.push(`${label} managed block is missing from ${record.path}: ${blockKey}`);
      continue;
    }
    const block = text.slice(start, end + endMarker.length);
    if (hashFileContent(block) !== record.sha256) report.failures.push(`${label} managed block hash mismatch: ${blockKey}`);
  }
  if (installerName === "agent-spectrum-kernel" && !Object.hasOwn(state.managed_blocks, "AGENTS.md#agent-spectrum-kernel")) {
    report.failures.push(`${label} required AGENTS.md managed block record is missing: ${statePath}`);
  }
}

function hashFileContent(content) {
  return hashText(content);
}

function sourcePathForManagedRecord(managedPath, record) {
  if (record.kind === "kernel" && managedPath === "AGENTS.md") {
    return null;
  }
  if (record.kind === "copy_paste_kernel" && managedPath === "CUSTOM_INSTRUCTIONS.md") {
    return resolve(REPO_ROOT, "CUSTOM_INSTRUCTIONS.md");
  }
  if ((record.kind === "skill" || record.kind === "stale_skill") && record.skill) {
    return resolve(REPO_ROOT, "skills", record.skill, "SKILL.md");
  }
  if ((record.kind === "codex_skill" || record.kind === "stale_codex_skill") && record.skill) {
    return resolve(REPO_ROOT, "skills", record.skill, "SKILL.md");
  }
  if ((record.kind === "claude_skill" || record.kind === "stale_claude_skill") && record.skill) {
    return resolve(REPO_ROOT, "skills", record.skill, "SKILL.md");
  }
  if (record.kind === "claude_command" && record.command) {
    return resolve(REPO_ROOT, "adapters/claude-code/project/.claude/commands", record.command);
  }
  if (record.kind === "claude_runtime" && record.script) {
    return resolve(REPO_ROOT, "scripts", record.script);
  }
  if (record.kind === "claude_config" && record.config) {
    return resolve(REPO_ROOT, record.config);
  }
  if (record.kind === "claude_asset" && record.asset) {
    return resolve(REPO_ROOT, record.asset);
  }
  if (record.kind === "codex_prompt" && record.prompt) {
    return resolve(REPO_ROOT, "adapters/codex/prompts", record.prompt);
  }
  if (record.kind === "stale_codex_prompt" && record.prompt) {
    return resolve(REPO_ROOT, "adapters/codex/prompts", record.prompt);
  }
  if ((record.kind === "codex_command" || record.kind === "stale_codex_command") && record.generated === true) {
    return null;
  }
  if (record.kind === "codex_command" && record.command) {
    return resolve(REPO_ROOT, "adapters/codex/commands", record.command);
  }
  if (record.kind === "stale_codex_command" && record.command) {
    return resolve(REPO_ROOT, "adapters/codex/commands", record.command);
  }
  if ((record.kind === "codex_runtime" || record.kind === "stale_codex_runtime") && record.script) {
    return resolve(REPO_ROOT, "scripts", record.script);
  }
  return null;
}

function checkClaudeAdapter(target, report) {
  const stateResult = readJsonIfExists(resolve(target, CLAUDE_STATE_PATH));
  const state = stateResult.ok ? stateResult.value : null;
  const validDetachedState = state && typeof state === "object" && state.schema_version === 3 &&
    state.installer === "agent-spectrum-claude-adapter" && state.adapter?.name === "agent-spectrum-claude-adapter" &&
    Array.isArray(state.installed_skills) && state.managed_files && typeof state.managed_files === "object" && !Array.isArray(state.managed_files) &&
    state.managed_blocks && typeof state.managed_blocks === "object" && !Array.isArray(state.managed_blocks) && state.install_status === "detached";
  if (validDetachedState) {
    report.installed.push("Claude adapter: detached");
    return;
  }
  const claudeRoot = resolve(target, ".claude");
  if (!existsSync(claudeRoot)) {
    report.installed.push("Claude adapter: not installed");
    return;
  }
  report.installed.push("Claude adapter: .claude directory present");

  const commandsDir = resolve(target, ".claude/commands");
  if (!existsSync(commandsDir)) {
    report.failures.push("Claude adapter commands directory is missing: .claude/commands");
  } else if (!statSync(commandsDir).isDirectory()) {
    report.failures.push("Claude adapter commands path is not a directory: .claude/commands");
  } else {
    const commandEntries = readdirSync(commandsDir).filter((entry) => entry.endsWith(".md")).sort();
    if (commandEntries.length === 0) {
      report.failures.push("Claude adapter has no installed commands: .claude/commands");
    }
    for (const entry of commandEntries) {
      const targetPath = resolve(commandsDir, entry);
      try {
        if (!readFileSync(targetPath, "utf8").trim()) {
          report.failures.push(`Claude adapter command is empty: .claude/commands/${entry}`);
        }
      } catch (error) {
        report.failures.push(`Claude adapter command is not readable: .claude/commands/${entry}: ${error.message}`);
      }
    }
  }

  for (const hookConfig of claudeHookConfigPaths(target)) {
    if (!existsSync(hookConfig.path)) {
      continue;
    }
    try {
      const hooks = JSON.parse(readFileSync(hookConfig.path, "utf8"));
      const serialized = JSON.stringify(hooks);
      if (/https?:\/\//i.test(serialized) || /webhook/i.test(serialized)) {
        report.failures.push(`Claude adapter hooks contain an enabled external destination or webhook reference: ${hookConfig.label}`);
      }
    } catch (error) {
      report.failures.push(`Claude adapter hooks are invalid JSON: ${hookConfig.label}: ${error.message}`);
    }
  }
}

function claudeHookConfigPaths(target) {
  return [
    { path: resolve(target, ".claude/settings.json"), label: ".claude/settings.json" },
    { path: resolve(target, ".claude/hooks/hooks.json"), label: ".claude/hooks/hooks.json" },
  ];
}

function checkUnsupportedClaims(target, report) {
  const claims = findUnsupportedCapabilityClaims(target);
  for (const claim of claims) {
    report.unsupportedClaims.push(`${claim.file}: ${claim.adapter} ${claim.capability} evidence level is ${claim.status}, but text claims full support`);
  }
}

function checkPrivacyDefaults(target, report) {
  const concerns = findPrivacyStorageConcerns(target);
  for (const concern of concerns) {
    report.failures.push(`privacy default concern: ${concern.file} contains ${concern.id}`);
  }
}

function checkRuntimeHealth(target, report) {
  const runtimeOwnedPath = resolveObservabilityPath(target, RUNTIME_HEALTH_PATH);
  const legacyPath = resolve(target, LEGACY_RUNTIME_HEALTH_PATH);
  const healthLogs = [
    [runtimeOwnedPath, RUNTIME_HEALTH_PATH],
    [legacyPath, LEGACY_RUNTIME_HEALTH_PATH],
  ].filter(([path], index, entries) => existsSync(path) && entries.findIndex(([candidate]) => candidate === path) === index);
  if (healthLogs.length === 0) {
    return;
  }
  const entries = [];
  let malformed = 0;
  for (const [path] of healthLogs) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry === "object") entries.push(entry);
        else malformed += 1;
      } catch {
        malformed += 1;
      }
    }
  }
  entries.sort((left, right) => runtimeHealthTimestamp(left) - runtimeHealthTimestamp(right));
  const reportedPath = healthLogs.map(([, label]) => label).join(", ");
  if (malformed > 0) report.warnings.push(`adapter runtime health log contains ${malformed} malformed entry/entries: ${reportedPath}`);
  const unresolved = new Map();
  for (const entry of entries) {
    const component = typeof entry.component === "string" && entry.component ? entry.component : "unknown-component";
    const code = typeof entry.error_code === "string" && entry.error_code ? entry.error_code : "runtime_error";
    const key = `${component}:${code}`;
    if (entry.status === "error") unresolved.set(key, entry);
    if (entry.status === "recovered") unresolved.delete(key);
  }
  const freshnessHours = Math.max(1, Number(readObservabilityValue(target, ["runtime_health", "freshness_hours"], "24")) || 24);
  const freshnessMs = freshnessHours * 60 * 60 * 1000;
  for (const entry of unresolved.values()) {
    const component = typeof entry.component === "string" && entry.component ? entry.component : "unknown-component";
    const code = typeof entry.error_code === "string" && entry.error_code ? entry.error_code : "runtime_error";
    const occurredAt = typeof entry.last_seen_at === "string" && entry.last_seen_at
      ? entry.last_seen_at
      : typeof entry.occurred_at === "string" && entry.occurred_at ? entry.occurred_at : "unknown-time";
    const occurredMs = Date.parse(occurredAt);
    if (!Number.isFinite(occurredMs) || Date.now() - occurredMs > freshnessMs) {
      report.installed.push(`historical adapter runtime health issue: ${component} ${code} at ${occurredAt} (${reportedPath})`);
    } else {
      report.warnings.push(`adapter runtime health issue: ${component} ${code} at ${occurredAt} (${reportedPath})`);
    }
  }
}

function runtimeHealthTimestamp(entry) {
  for (const field of ["last_seen_at", "occurred_at", "first_seen_at"]) {
    const timestamp = Date.parse(entry?.[field]);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function checkRuntimeConformanceProbe(target, report) {
  const probe = report.runtimeProbe;
  probe.checked.push("runtime probe is local/static/dry-run only; it does not invoke external adapter runtimes");
  checkAdapterVersionConsistency(target, probe);

  const claudeRoot = resolve(target, ".claude");
  if (existsSync(claudeRoot)) {
    probe.checked.push("Claude adapter runtime surface detected");
    checkReadableDirectory(resolve(target, ".claude/commands"), ".claude/commands", probe);
    checkReadableDirectory(resolve(target, ".claude/skills"), ".claude/skills", probe, { optional: true });
    checkProjectedSkills(resolve(target, ".claude/skills"), ".claude/skills", probe);
    checkClaudeHooksShape(resolve(target, ".claude/settings.json"), ".claude/settings.json", probe);
    checkClaudeHooksShape(resolve(target, ".claude/hooks/hooks.json"), ".claude/hooks/hooks.json", probe);
    checkClaudeHookExecutables(target, probe);
    checkRuntimeEventStore(target, probe);
    checkReportInputs(target, probe);
  }

  const agentsRoot = resolve(target, ".agents");
  const codexState = readJsonIfExists(resolve(target, CODEX_STATE_PATH));
  if (existsSync(agentsRoot) || codexState.ok) {
    probe.checked.push("Codex adapter runtime surface detected");
    checkReadableDirectory(resolve(target, ".agents/skills"), ".agents/skills", probe);
    checkReadableDirectory(resolve(target, ".agents/prompts"), ".agents/prompts", probe, { optional: true });
    checkReadableDirectory(resolve(target, ".agents/commands"), ".agents/commands", probe, { optional: true });
    checkProjectedSkills(resolve(target, ".agents/skills"), ".agents/skills", probe);
    if (codexState.ok) {
      checkCodexRuntimeState(target, codexState.value, probe);
    }
  }

  checkRuntimeCommandReferences(target, probe);
  checkProjectOverlayContradictions(target, probe);

  if (probe.checked.length === 1) {
    probe.checked.push("No projected adapter runtime surfaces detected");
  }
}

function buildLayerStatuses(target, report, { runtimeProbe }) {
  const installationFailures = [];
  const installationWarnings = [];
  const projectionFailures = [];
  const projectionWarnings = [];

  const stateSpecs = [
    [CORE_STATE_PATH, "agent-spectrum-kernel", "skills"],
    [CODEX_STATE_PATH, "agent-spectrum-codex-adapter", ".agents/skills"],
    [CLAUDE_STATE_PATH, "agent-spectrum-claude-adapter", ".claude/skills"],
  ];
  for (const [statePath, installerName, skillsRoot] of stateSpecs) {
    const absoluteStatePath = resolve(target, statePath);
    const stateResult = readJsonIfExists(absoluteStatePath);
    if (!stateResult.ok) {
      if (statePath === CORE_STATE_PATH || existsSync(resolve(target, statePath.includes("codex") ? ".agents" : ".claude"))) {
        installationFailures.push(`${statePath}: ${stateResult.error}`);
      }
      continue;
    }
    const state = stateResult.value;
    if (state.install_status === "detached" && installerName !== "agent-spectrum-kernel") {
      continue;
    }
    if (state.install_status !== "installed") {
      installationFailures.push(`${statePath}: install_status must be installed`);
    }
    if (state.schema_version !== 3 || state.installer !== installerName || state.adapter?.name !== installerName || !state.managed_blocks || typeof state.managed_blocks !== "object") {
      installationFailures.push(`${statePath}: invalid state schema or installer identity`);
    }
    for (const [managedPath, record] of Object.entries(state.managed_files ?? {})) {
      const destination = resolve(target, managedPath);
      if (!existsSync(destination)) {
        projectionFailures.push(`missing managed file: ${managedPath}`);
      } else if (record?.sha256 && hashFile(destination) !== record.sha256) {
        projectionFailures.push(`managed file hash mismatch: ${managedPath}`);
      }
    }
    for (const [blockKey, record] of Object.entries(state.managed_blocks ?? {})) {
      const destination = resolve(target, record?.path || "");
      if (!record || typeof record.path !== "string" || typeof record.sha256 !== "string" || !existsSync(destination)) {
        projectionFailures.push(`missing managed block: ${blockKey}`);
        continue;
      }
      const text = readFileSync(destination, "utf8");
      const start = text.indexOf("<!-- agent-spectrum-kernel:start -->");
      const endMarker = "<!-- agent-spectrum-kernel:end -->";
      const end = text.indexOf(endMarker, start);
      if (start < 0 || end < start || hashText(text.slice(start, end + endMarker.length)) !== record.sha256) {
        projectionFailures.push(`managed block hash mismatch: ${blockKey}`);
      }
    }
    if (installerName === "agent-spectrum-kernel" && !Object.hasOwn(state.managed_blocks ?? {}, "AGENTS.md#agent-spectrum-kernel")) {
      installationFailures.push(`${statePath}: required AGENTS.md managed block record is missing`);
    }
    for (const skill of state.selected_skills ?? []) {
      if (!existsSync(resolve(target, skillsRoot, skill, "SKILL.md"))) {
        projectionFailures.push(`missing selected skill: ${skillsRoot}/${skill}/SKILL.md`);
      }
    }
  }

  if (report.warnings.length > 0) {
    projectionWarnings.push(...report.warnings.filter((warning) => warning.includes("managed file is stale relative to this ASK checkout")));
  }

  const codexInstalled = readJsonIfExists(resolve(target, CODEX_STATE_PATH)).value?.install_status === "installed";
  const runtimeStatus = !runtimeProbe
    ? { status: "unknown", detail: "runtime probe was not requested" }
    : report.runtimeProbe.failures.length > 0 || report.runtimeProbe.warnings.length > 0
      ? statusEntry(report.runtimeProbe.failures, report.runtimeProbe.warnings, "local/static runtime-surface probe completed")
      : codexInstalled
        ? { status: "insufficient_evidence", detail: "Codex projection passed static checks; external execution, contract load, applied output, workflow, risk/approval, and verification application evidence remain unavailable" }
        : { status: "pass", detail: "local/static runtime-surface probe completed; external execution evidence is outside this check" };
  const behavioralFailures = [];
  const behavioralWarnings = [...report.unsupportedClaims];
  const behavioralStatus = behavioralFailures.length > 0
    ? "fail"
    : behavioralWarnings.length > 0
      ? "warn"
      : "insufficient_evidence";

  return {
    installation_health: statusEntry(installationFailures, installationWarnings, "install states are readable"),
    adapter_projection: statusEntry(projectionFailures, projectionWarnings, "managed projections are present"),
    runtime_readiness: runtimeStatus,
    behavioral_evidence: {
      status: behavioralStatus,
      detail: behavioralStatus === "insufficient_evidence"
        ? "no captured adapter execution output was evaluated by ask-sensors"
        : "behavioral evidence claims were checked against adapter capability levels",
    },
  };
}

function statusEntry(failures, warnings, passDetail) {
  if (failures.length > 0) {
    return { status: "fail", detail: failures.join("; ") };
  }
  if (warnings.length > 0) {
    return { status: "warn", detail: warnings.join("; ") };
  }
  return { status: "pass", detail: passDetail };
}

function checkReadableDirectory(path, label, probe, { optional = false } = {}) {
  if (!existsSync(path)) {
    const message = `runtime directory is missing: ${label}`;
    if (optional) {
      probe.warnings.push(message);
    } else {
      probe.failures.push(message);
    }
    return false;
  }
  try {
    if (!statSync(path).isDirectory()) {
      probe.failures.push(`runtime path is not a directory: ${label}`);
      return false;
    }
    readdirSync(path);
    return true;
  } catch (error) {
    probe.failures.push(`runtime directory is not readable: ${label}: ${error.message}`);
    return false;
  }
}

function checkProjectedSkills(skillsRoot, label, probe) {
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) {
    return;
  }
  for (const entry of readdirSync(skillsRoot).sort()) {
    const skillDir = resolve(skillsRoot, entry);
    if (!statSync(skillDir).isDirectory()) {
      continue;
    }
    const skillPath = resolve(skillDir, "SKILL.md");
    const relativeSkillPath = `${label}/${entry}/SKILL.md`;
    if (!existsSync(skillPath)) {
      probe.failures.push(`projected skill is missing readable SKILL.md: ${relativeSkillPath}`);
      continue;
    }
    try {
      const content = readFileSync(skillPath, "utf8");
      if (!content.trim()) {
        probe.failures.push(`projected skill SKILL.md is empty: ${relativeSkillPath}`);
      }
    } catch (error) {
      probe.failures.push(`projected skill SKILL.md is not readable: ${relativeSkillPath}: ${error.message}`);
    }
  }
}

function checkClaudeHooksShape(hooksPath, label, probe) {
  if (!existsSync(hooksPath)) {
    return;
  }
  let hooksConfig;
  try {
    hooksConfig = JSON.parse(readFileSync(hooksPath, "utf8"));
  } catch (error) {
    probe.failures.push(`Claude adapter hooks shape is invalid: ${label}: ${error.message}`);
    return;
  }

  const hooks = hooksConfig?.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
    probe.failures.push(`Claude adapter hooks shape is invalid: ${label}`);
    return;
  }
  for (const [eventName, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      probe.failures.push(`Claude adapter hooks shape is invalid: ${label} (${eventName} must be an array)`);
      continue;
    }
    for (const [groupIndex, group] of groups.entries()) {
      if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) {
        probe.failures.push(`Claude adapter hooks shape is invalid: ${label} (${eventName}[${groupIndex}].hooks must be an array)`);
        continue;
      }
      for (const [hookIndex, hook] of group.hooks.entries()) {
        if (!hook || typeof hook !== "object" || typeof hook.type !== "string") {
          probe.failures.push(`Claude adapter hooks shape is invalid: ${label} (${eventName}[${groupIndex}].hooks[${hookIndex}] must include a string type)`);
          continue;
        }
        if (hook.type === "command" && typeof hook.command !== "string") {
          probe.failures.push(`Claude adapter hooks shape is invalid: ${label} (${eventName}[${groupIndex}].hooks[${hookIndex}] command must be a string)`);
        }
      }
    }
  }
}

function checkCodexRuntimeState(target, state, probe) {
  if (!state || typeof state !== "object") {
    probe.failures.push(`Codex adapter runtime state shape is invalid: ${CODEX_STATE_PATH}`);
    return;
  }
  for (const skill of state.selected_skills ?? []) {
    const skillPath = resolve(target, ".agents/skills", skill, "SKILL.md");
    if (!existsSync(skillPath)) {
      probe.failures.push(`Codex runtime selected skill is not readable: .agents/skills/${skill}/SKILL.md`);
    }
  }
  for (const prompt of state.prompt_templates ?? []) {
    const promptPath = resolve(target, ".agents/prompts", prompt);
    if (!existsSync(promptPath)) {
      probe.failures.push(`Codex runtime prompt template is missing: .agents/prompts/${prompt}`);
    }
  }
  for (const prompt of state.selected_prompts ?? []) {
    const promptPath = resolve(target, ".agents/prompts", prompt);
    const record = state.managed_files?.[`.agents/prompts/${prompt}`];
    if (!existsSync(promptPath) || !record?.compact_profile) {
      probe.failures.push(`Codex compact runtime profile is missing: .agents/prompts/${prompt}`);
      continue;
    }
    const content = readFileSync(promptPath, "utf8");
    const header = parseCodexCompactProfileHeader(content);
    const compact = record.compact_profile;
    if (!header || header.id !== compact.profile_id || header.revision !== compact.canonical_revision || header.digest !== compact.canonical_digest) {
      probe.failures.push(`Codex compact runtime profile provenance mismatch: .agents/prompts/${prompt}`);
      continue;
    }
    if (compact.rendered_sha256 !== `sha256:${hashText(content)}`) {
      probe.failures.push(`Codex compact runtime profile digest mismatch: .agents/prompts/${prompt}`);
      continue;
    }
    const selectedProfile = (state.compact_runtime_profiles ?? []).find((profile) => profile.profile_id === compact.profile_id);
    if (!selectedProfile || selectedProfile.rendered_sha256 !== compact.rendered_sha256) {
      probe.failures.push(`Codex compact runtime profile is not selected in state: ${compact.profile_id}`);
      continue;
    }
    const canonicalFindings = inspectCodexCompactCanonicalSources(target, compact.canonical_sources);
    if (canonicalFindings.length > 0) {
      for (const finding of canonicalFindings) {
        probe.failures.push(`Codex compact-profile canonical source ${finding.status}: ${finding.path}`);
      }
      continue;
    }
    probe.codex_evidence.requested_contracts.push({ prompt, profile_id: compact.profile_id, contracts: compact.requested_contracts });
    probe.codex_evidence.projected_contracts.push({ prompt: `.agents/prompts/${prompt}`, profile_id: compact.profile_id, canonical_revision: compact.canonical_revision, status: "projected" });
  }
  if ((state.selected_prompts ?? []).length > 0) {
    probe.checked.push("Codex compact profiles contain requested-contract, projected-contract, and canonical-source evidence");
    probe.checked.push("Codex runtime Skill-load, applied-output, workflow, risk/approval, and verification application evidence are unavailable to the static doctor probe");
  }
  for (const command of state.command_templates ?? []) {
    const commandPath = resolve(target, ".agents/commands", command);
    if (!existsSync(commandPath)) {
      probe.failures.push(`Codex runtime command template is missing: .agents/commands/${command}`);
    }
  }
}

function checkAdapterVersionConsistency(target, probe) {
  const core = readJsonIfExists(resolve(target, CORE_STATE_PATH));
  const states = [
    ["Codex", readJsonIfExists(resolve(target, CODEX_STATE_PATH))],
    ["Claude", readJsonIfExists(resolve(target, CLAUDE_STATE_PATH))],
  ];
  if (!core.ok) {
    return;
  }
  for (const [label, stateResult] of states) {
    if (!stateResult.ok) {
      continue;
    }
    const sameVersion = core.value?.source?.version === stateResult.value?.source?.version;
    const sameRevision = core.value?.source?.git_revision === stateResult.value?.source?.git_revision;
    if (sameVersion && sameRevision) {
      probe.checked.push(`${label} adapter source matches core install state`);
    } else {
      probe.warnings.push(`${label} adapter source differs from core install state`);
    }
  }
}

function checkClaudeHookExecutables(target, probe) {
  const settingsPath = resolve(target, ".claude/settings.json");
  if (!existsSync(settingsPath)) {
    return;
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return;
  }
  for (const command of collectHookCommands(settings.hooks ?? {})) {
    if (command.includes("scripts/ai-metrics-record.mjs") && !existsSync(resolve(target, "scripts/ai-metrics-record.mjs"))) {
      probe.failures.push("Claude adapter hook executable is missing: scripts/ai-metrics-record.mjs");
    }
    if (command.includes("${CLAUDE_PLUGIN_ROOT}") && !process.env.CLAUDE_PLUGIN_ROOT) {
      probe.failures.push("Claude plugin hook command references CLAUDE_PLUGIN_ROOT, but the environment variable is not set");
    }
  }
}

function collectHookCommands(hooks) {
  const commands = [];
  for (const groups of Object.values(hooks ?? {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        if (hook?.type === "command" && typeof hook.command === "string") {
          commands.push(hook.command);
        }
      }
    }
  }
  return commands;
}

function readObservabilityValue(target, pathParts, fallback) {
  const configPath = resolve(target, "docs/ai/observability-config.yml");
  if (!existsSync(configPath)) {
    return fallback;
  }
  const stack = [];
  for (const rawLine of readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const match = withoutComment.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const level = Math.floor(match[1].length / 2);
    const key = match[2];
    const value = match[3].trim();
    stack.length = level;
    if (!value) {
      stack[level] = key;
      continue;
    }
    if ([...stack.slice(0, level), key].join(".") === pathParts.join(".")) {
      return value.replace(/^["']|["']$/g, "");
    }
  }
  return fallback;
}

function checkRuntimeEventStore(target, probe) {
  const eventStore = readObservabilityValue(target, ["storage", "event_store"], DEFAULT_RUNTIME_EVENT_STORE);
  const eventDir = dirname(resolveObservabilityPath(target, eventStore));
  if (!existsSync(eventDir) && eventStore.startsWith("ask-runtime/")) {
    let existingParent = eventDir;
    while (!existsSync(existingParent)) existingParent = dirname(existingParent);
    if (statSync(existingParent).isDirectory()) {
      probe.checked.push(`runtime-owned event-store location is planned: ${eventStore}`);
      return;
    }
  }
  if (!existsSync(eventDir) || !statSync(eventDir).isDirectory()) {
    probe.failures.push(`runtime event-store directory is missing: ${eventStore}`);
    return;
  }
  probe.checked.push(`runtime event-store directory is present: ${eventStore}`);
}

function checkReportInputs(target, probe) {
  for (const path of ["docs/ai/adoption-report-template.md", "docs/ai/metrics/README.md", "docs/ai/reports"]) {
    const absolutePath = resolve(target, path);
    if (!existsSync(absolutePath)) {
      probe.warnings.push(`report input is missing: ${path}`);
    } else {
      probe.checked.push(`report input is present: ${path}`);
    }
  }
}

function checkRuntimeCommandReferences(target, probe) {
  const files = collectTextFiles(target, ["README.md", "AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "docs", ".claude", ".agents"]);
  const references = new Set();
  for (const file of files) {
    const text = readFileSync(resolve(target, file), "utf8");
    for (const match of text.matchAll(/(?:\.claude|\.agents)\/(?:commands|prompts)\/[A-Za-z0-9._/-]+\.md/g)) {
      references.add(match[0]);
    }
  }
  for (const reference of [...references].sort()) {
    if (!existsSync(resolve(target, reference))) {
      probe.failures.push(`runtime command/template reference is missing: ${reference}`);
    }
  }
}

function checkProjectOverlayContradictions(target, probe) {
  const files = collectTextFiles(target, ["AGENTS.md", "CUSTOM_INSTRUCTIONS.md", "docs"], [".md", ".txt"]);
  for (const file of files) {
    const text = readFileSync(resolve(target, file), "utf8");
    const units = text.split(/\r?\n|(?<=[.!?])\s+/u).map((unit) => unit.trim()).filter(Boolean);
    for (const unit of units) {
      if (hasProjectOverlayContradiction(unit) && !isProhibitiveOverlayStatement(unit)) {
        probe.warnings.push(`possible project-overlay contradiction: ${file}: ${unit}`);
      }
    }
  }
}

function hasProjectOverlayContradiction(unit) {
  return /\b(?:skip|skipping|bypass|bypassing|disable|disabling|ignore|ignoring|not require|no need for)\b.{0,80}\b(?:risk-gate|verification|evidence-ledger|evidence)\b/i.test(unit);
}

function isProhibitiveOverlayStatement(unit) {
  return (
    /\b(?:do not|don't|never|must not|should not|cannot|can't)\s+(?:skip|bypass|disable|ignore)\b.{0,80}\b(?:risk-gate|verification|evidence-ledger|evidence)\b/i.test(unit) ||
    /\b(?:skip|skipping|bypass|bypassing|disable|disabling|ignore|ignoring)\b.{0,80}\b(?:risk-gate|verification|evidence-ledger|evidence)\b.{0,80}\b(?:prohibited|forbidden|unacceptable|not allowed|blocked)\b/i.test(unit) ||
    /\bno need for\b.{0,80}\b(?:risk-gate|verification|evidence-ledger|evidence)\b.{0,80}\b(?:prohibited|forbidden|unacceptable|not allowed|blocked)\b/i.test(unit)
  );
}

function printReport(target, report, { json = false } = {}) {
  if (json) {
    console.log(JSON.stringify({ target, ...report }, null, 2));
    return;
  }
  console.log(`ASK doctor: ${report.status}`);
  console.log("");
  console.log("Installed:");
  printList(report.installed);
  console.log("");
  console.log("Warnings:");
  printList(report.warnings);
  console.log("");
  console.log("Failures:");
  printList(report.failures);
  console.log("");
  console.log("Unsupported claims:");
  printList(report.unsupportedClaims);
  console.log("");
  console.log("Layer statuses:");
  for (const [name, entry] of Object.entries(report.layerStatuses ?? {})) {
    console.log(`- ${name}: ${entry.status} - ${entry.detail}`);
  }
  console.log("Deployment statuses:");
  for (const [name, entry] of Object.entries(report.deploymentStatus ?? {})) {
    console.log(`- ${name}: ${entry.status} - ${entry.detail}`);
  }
  console.log("");
  console.log(`Runtime conformance probe: ${report.runtimeProbe.enabled ? "enabled" : "disabled"}`);
  if (report.runtimeProbe.enabled) {
    console.log("Runtime checked:");
    printList(report.runtimeProbe.checked);
    console.log("Runtime warnings:");
    printList(report.runtimeProbe.warnings);
    console.log("Runtime failures:");
    printList(report.runtimeProbe.failures);
    console.log("Codex evidence stages:");
    console.log(`- requested contracts: ${report.runtimeProbe.codex_evidence.requested_contracts.length}`);
    console.log(`- projected contracts: ${report.runtimeProbe.codex_evidence.projected_contracts.length}`);
    console.log(`- runtime-detected profile: ${report.runtimeProbe.codex_evidence.runtime_detected_profile}`);
    console.log(`- runtime-loaded contracts: ${report.runtimeProbe.codex_evidence.runtime_loaded_contracts}`);
    console.log(`- applied output contracts: ${report.runtimeProbe.codex_evidence.applied_output_contracts}`);
    console.log(`- workflow contract application: ${report.runtimeProbe.codex_evidence.workflow_contract_application}`);
    console.log(`- risk/approval contract application: ${report.runtimeProbe.codex_evidence.risk_approval_contract_application}`);
    console.log(`- verification contract application: ${report.runtimeProbe.codex_evidence.verification_contract_application}`);
    console.log("Runtime boundary:");
    console.log("- Runtime probe is local/static/dry-run only and does not prove external adapter execution or product readiness.");
    console.log("- Runtime probe findings downgrade runtime conformance/readiness claims only.");
    console.log("");
  }
  console.log("Next:");
  if (report.failures.length > 0) {
    console.log("- Downgrade installation/readiness claims until failures are fixed.");
    console.log("- Re-run the relevant ASK installer or restore the missing/modified managed files.");
  } else if (report.warnings.length > 0 || report.unsupportedClaims.length > 0) {
    console.log("- Treat setup as usable with warnings; refresh projections or downgrade claims before reporting readiness.");
  } else {
    console.log("- Installation health check passed for the inspected files.");
  }
  console.log("- Doctor is not a per-task gate; safe read-only investigation and local verification may continue.");
  console.log("- Exit code 1 means installation health failed; it does not prohibit normal read-only investigation or local verification.");
  console.log(`- Target inspected: ${target}`);
}

function printList(items) {
  if (items.length === 0) {
    console.log("- none");
    return;
  }
  for (const item of items) {
    console.log(`- ${item}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.target) || !statSync(args.target).isDirectory()) {
    throw new Error(`Target is not a directory: ${args.target}`);
  }
  const report = buildDoctorReport(args.target, { runtimeProbe: args.runtimeProbe });
  printReport(args.target, report, { json: args.json });
  process.exit(report.status === "fail" ? 1 : 0);
} catch (error) {
  console.error(`ASK doctor failed: ${error.message}`);
  process.exit(1);
}
