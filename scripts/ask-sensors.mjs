#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  CODEX_PROMPT_MODES,
  codexPromptContractForMode,
  detectApprovalRequiredSurfaces,
  findUnsupportedCapabilityClaims,
} from "./ask-shared.mjs";
import { inspectExecutionEnvelope } from "./execution-envelope.mjs";

const KNOWN_OUTPUT_SECTIONS = [
  "Changed:",
  "Verified:",
  "Not verified:",
  "Risks / assumptions:",
  "Next:",
  "Decision:",
  "Change signals:",
  "Required gates:",
  "Skipped heavy gates:",
  "Missing evidence:",
  "Blocking evidence:",
  "Passed required gates:",
  "Insufficient evidence:",
  "Non-blocking follow-ups:",
  "Evidence:",
  "Required fixes:",
  "Suggestions:",
  "Residual risk:",
  "Execution Envelope:",
];
const CLAIM_PATTERNS = [
  /\btests?\s+pass(?:ed|es)?\b/i,
  /\bverified\b/i,
  /\bno regression\b/i,
  /\bready\b/i,
  /\bsafe\b/i,
  /\bproduction-ready\b/i,
  /\bcorrect\b/i,
  /\bfixed\b/i,
];
const READINESS_CLAIM_PATTERNS = [
  /\bready\b/i,
  /\bproduction-ready\b/i,
  /\bsafe\b/i,
  /\bmergeable\b/i,
  /\bmergeability\b/i,
  /\bcorrect\b/i,
  /\bfixed\b/i,
  /\bno regression\b/i,
];
const CONCRETE_EVIDENCE_PATTERNS = [
  /(?:^|[`:\s])(?:node|npm|pnpm|yarn|bun|npx|pytest|python3?|go|cargo|make|just|mvn|gradle|deno|tsc|eslint|prettier|vitest|jest|playwright|rg|grep|git|curl)\s+[\w./:@=-]+/i,
  /\b(?:scripts\/test-[\w.-]+|[\w./-]+(?:\.test|\.spec)\.(?:mjs|cjs|js|ts|tsx|py|go|rs)|tests?\/[\w./-]+)\b/i,
  /\b(?:build|typecheck|lint|test)\b.{0,40}\b(?:command|target|suite|file)\b/i,
  /\b(?:manual verification|manual check|runtime check|dry-run|dry run)\s*[:=-]\s*\S+/i,
  /\b(?:reproduction check|reproduced|before fix|after fix)\b/i,
  /\b(?:benchmark|measurement|measured|p95|p99|ops\/sec|\bms\b)\b/i,
  /\b(?:security check|semgrep|npm audit|cargo audit|trivy|gitleaks)\b/i,
  /\b(?:inspected|reviewed|read)\b.{0,60}\b(?:file|log|output|diff|trace|stack trace)\b/i,
  /\b(?:user-provided|user provided|ユーザー提供)\b/i,
];
const CLAIM_DOWNGRADE = "Weak evidence downgrades readiness/safety/correctness/no-regression claims.";

function parseArgs(argv) {
  const args = {
    target: process.cwd(),
    mode: "implementation",
    input: null,
    changedFiles: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      args.target = resolve(argv[++index]);
    } else if (arg === "--mode") {
      args.mode = argv[++index];
    } else if (arg === "--input") {
      args.input = resolve(argv[++index]);
    } else if (arg === "--changed-files") {
      args.changedFiles = argv[++index].split(",").map((path) => path.trim()).filter(Boolean);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!CODEX_PROMPT_MODES.has(args.mode)) {
    throw new Error(`--mode must be one of ${[...CODEX_PROMPT_MODES].join(", ")}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/ask-sensors.mjs [options]

Options:
  --target <path>           Repository root to scan for capability claims. Defaults to cwd.
  --mode <mode>             Managed Codex prompt contract mode. Defaults to implementation.
  --input <path>            Output text to inspect. If omitted, stdin is used when piped.
  --changed-files <csv>     Optional comma-separated changed file paths for risk-surface checks.

Initial rollout is report-only: warn, fail, and hard_stop findings do not change
the exit code. They restrict unsupported completion/readiness/safety claims.
`);
}

function readInput(args) {
  if (args.input) {
    return readFileSync(args.input, "utf8");
  }
  if (!process.stdin.isTTY) {
    return readFileSync(0, "utf8");
  }
  return "";
}

function runSensors({ target, mode, text, changedFiles }) {
  const sensors = [];
  const contract = codexPromptContractForMode(mode);
  if (contract) {
    sensors.push(completionContractSensor(text, mode, contract.requiredSections));
  }
  sensors.push(executionEnvelopeSensor(text));
  if (["implementation", "investigation"].includes(mode)) {
    sensors.push(evidenceQualitySensor(text));
  }
  if (mode === "review") {
    sensors.push(reviewLayerSummarySensor(text));
  }
  sensors.push(riskSurfaceSensor(text, changedFiles));
  sensors.push(unsupportedCapabilitySensor(target));
  sensors.push(evidencePhraseSensor(text));

  const status = strongestStatus(sensors.map((sensor) => sensor.status));
  return { status, sensors };
}

function executionEnvelopeSensor(text) {
  const result = inspectExecutionEnvelope(text);
  if (result.status === "parsed") {
    return sensor("execution_envelope", "pass", "Execution Envelope is valid JSON and conforms to the shared schema.");
  }
  return sensor(
    "execution_envelope",
    "fail",
    `Execution Envelope is ${result.status}: ${result.errors.join(" ")}.`,
    "Emit exactly one fenced JSON Execution Envelope that conforms to schemas/execution-envelope.schema.json.",
  );
}

function completionContractSensor(text, mode, requiredSections) {
  if (!text.trim()) {
    return sensor("completion_contract", "warn", "No implementation output text was provided.");
  }
  const missing = requiredSections.filter((section) => !text.includes(section));
  if (missing.length > 0) {
    return sensor(
      "completion_contract",
      "fail",
      `${mode} output is missing required sections: ${missing.join(", ")}.`,
      `Do not claim ${mode} completion/readiness until the managed completion contract is present.`,
    );
  }
  return sensor("completion_contract", "pass", `${mode} completion contract sections are present.`);
}

function reviewLayerSummarySensor(text) {
  if (!text.trim()) {
    return sensor("review_layer_summary", "warn", "No review output text was provided.");
  }
  if (hasTopLevelSection(text, "Layer summary:")) {
    return sensor(
      "review_layer_summary",
      "fail",
      "Review output uses the removed fixed layer summary contract.",
      "Use Decision, Blocking evidence, Passed required gates, Insufficient evidence, Non-blocking follow-ups, and Residual risk. Use Diagnostic applicability only when a debug matrix is explicitly requested.",
    );
  }
  const missing = codexPromptContractForMode("review").requiredSections.filter((section) => !hasTopLevelSection(text, section));
  if (missing.length > 0) {
    return sensor(
      "review_layer_summary",
      "fail",
      `Review output is missing required sections: ${missing.join(", ")}.`,
      "Do not claim merge approval/readiness until the signal-first routing and final decision sections are present.",
    );
  }
  return sensor("review_layer_summary", "pass", "Signal-first routing and review decision sections are present.");
}

function hasTopLevelSection(text, section) {
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*(?:>|[-*+]\s)/.test(line)) {
      continue;
    }
    if (line === section) {
      return true;
    }
  }
  return false;
}

function riskSurfaceSensor(text, changedFiles) {
  const surfaces = detectApprovalRequiredSurfaces({ text, paths: changedFiles });
  if (surfaces.length === 0) {
    return sensor("risk_surface", "pass", "No AGENTS approval-required risk surface detected.");
  }
  if (hasExplicitApprovalEvidence(text)) {
    return sensor(
      "risk_surface",
      "warn",
      `Approval-required risk surface detected with approval evidence: ${surfaces.map((surface) => surface.id).join(", ")}.`,
      "Keep the approval evidence attached to the specific action.",
    );
  }
  return sensor(
    "risk_surface",
    "hard_stop",
    `Approval-required risk surface detected without explicit approval: ${surfaces.map((surface) => surface.id).join(", ")}.`,
    "Stop before executing the risky action. Read-only investigation and local verification may continue.",
  );
}

function unsupportedCapabilitySensor(target) {
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    return sensor("unsupported_capability", "warn", `Target is unavailable for capability scan: ${target}`);
  }
  const findings = findUnsupportedCapabilityClaims(target);
  if (findings.length === 0) {
    return sensor("unsupported_capability", "pass", "No unsupported adapter capability overclaim detected.");
  }
  return sensor(
    "unsupported_capability",
    "fail",
    `Adapter capability overclaims detected: ${findings.map((finding) => `${finding.adapter}:${finding.capability}:${finding.status}`).join("; ")}.`,
    "Downgrade adapter capability claims to the evidence level in docs/adapter-capability-matrix.md.",
  );
}

function evidencePhraseSensor(text) {
  if (!text.trim()) {
    return sensor("evidence_phrase", "pass", "No output text to inspect for evidence phrases.");
  }
  const claimText = extractTextUnitsWithSections(text)
    .filter((unit) => !isScopedEvidencePhraseUnit(unit))
    .map((unit) => unit.text)
    .join("\n");
  const hasClaim = CLAIM_PATTERNS.some((pattern) => pattern.test(claimText));
  if (!hasClaim) {
    return sensor("evidence_phrase", "pass", "No high-confidence evidence phrase detected.");
  }
  if (hasEvidenceSectionOrCommandLabel(text)) {
    return sensor("evidence_phrase", "warn", "Evidence phrase detected; evidence section is present, so keep claim language scoped to that evidence.");
  }
  return sensor(
    "evidence_phrase",
    "fail",
    "Evidence phrase detected without an evidence or command section.",
    "Do not claim verified, ready, safe, fixed, no regression, or tests passed without explicit evidence.",
  );
}

function evidenceQualitySensor(text) {
  if (!text.trim()) {
    return sensor("evidence_quality", "pass", "No implementation output text to inspect for evidence quality.");
  }

  const verifiedBody = extractSectionBody(text, "Verified:");
  if (verifiedBody === null) {
    return sensor("evidence_quality", "pass", "Verified section is unavailable; completion_contract handles missing sections.");
  }

  const findings = [];
  const concreteEvidencePresent = hasConcreteEvidence(verifiedBody);

  if (isEmptyEvidenceBody(verifiedBody)) {
    findings.push("Verified section is empty or equivalent to none/n/a.");
  }
  if (containsOnlyVagueEvidence(verifiedBody)) {
    findings.push("Verified section contains only vague phrases without a concrete command or source.");
  }
  if (hasTestsPassWithoutCommand(verifiedBody)) {
    findings.push("Verified section says tests pass without an explicit command or test target.");
  }
  if (hasNoRegressionClaim(text) && !concreteEvidencePresent) {
    findings.push("No-regression claim appears without regression scope or test evidence.");
  }

  const notVerifiedBody = extractSectionBody(text, "Not verified:");
  if (notVerifiedBody !== null && isEmptyEvidenceBody(notVerifiedBody) && !concreteEvidencePresent) {
    findings.push("Not verified is none while no concrete command/source evidence is present.");
  }

  if (hasReadinessClaim(text) && !concreteEvidencePresent) {
    findings.push("Readiness/safety/mergeability/correctness claim appears with weak evidence.");
  }

  if (findings.length > 0) {
    return sensor(
      "evidence_quality",
      "fail",
      findings.join(" "),
      CLAIM_DOWNGRADE,
    );
  }
  if (!concreteEvidencePresent) {
    return sensor(
      "evidence_quality",
      "warn",
      "Verified section does not reference a concrete evidence source type.",
      CLAIM_DOWNGRADE,
    );
  }
  return sensor("evidence_quality", "pass", "Verified section references concrete command/source evidence.");
}

function hasExplicitApprovalEvidence(text) {
  return /\b(approval|approved|承認)\b.{0,80}\b(explicit|specific|明示|あり|済み)\b/i.test(text);
}

function hasEvidenceSectionOrCommandLabel(text) {
  return /(^|\n)\s*(?:Verified:|Evidence:|実行コマンド|検証結果|command:|result:)/im.test(text);
}

function extractSectionBody(text, sectionName) {
  const target = sectionName.toLowerCase();
  let currentSection = null;
  const body = [];

  for (const line of text.split(/\r?\n/)) {
    const section = parseKnownSectionHeader(line);
    if (section) {
      if (currentSection === target) {
        return body.join("\n").trim();
      }
      currentSection = section.name.toLowerCase();
      if (currentSection === target && section.inlineText) {
        body.push(section.inlineText);
      }
      continue;
    }
    if (currentSection === target) {
      body.push(line);
    }
  }

  return currentSection === target ? body.join("\n").trim() : null;
}

function extractTextUnitsWithSections(text) {
  const units = [];
  let currentSection = null;

  for (const line of text.split(/\r?\n/)) {
    const section = parseKnownSectionHeader(line);
    if (section) {
      currentSection = section.name.replace(/:$/u, "");
      if (section.inlineText) {
        units.push({ section: currentSection, text: section.inlineText });
      }
      continue;
    }
    const trimmed = line.trim();
    if (trimmed) {
      units.push({ section: currentSection, text: trimmed });
    }
  }

  return units;
}

function parseKnownSectionHeader(line) {
  const trimmed = line.trim();
  for (const section of KNOWN_OUTPUT_SECTIONS) {
    if (trimmed.toLowerCase() === section.toLowerCase()) {
      return { name: section, inlineText: "" };
    }
    if (trimmed.toLowerCase().startsWith(`${section.toLowerCase()} `)) {
      return { name: section, inlineText: trimmed.slice(section.length).trim() };
    }
  }
  return null;
}

function isScopedEvidencePhraseUnit(unit) {
  const section = (unit.section ?? "").toLowerCase();
  const text = unit.text.trim();
  if (section === "not verified" || section === "risks / assumptions") {
    return true;
  }
  if (/\bnot\b.{0,50}\b(?:confirmed|proven|verified|ready|safe|correct|fixed)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:quoted|quote|issue title|finding)\b/i.test(text) && /"[^"]*\b(?:fixed|safe|correct|ready|verified|tests?\s+pass(?:ed)?)\b[^"]*"/i.test(text)) {
    return true;
  }
  return false;
}

function normalizedEvidenceLines(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/u, "").trim())
    .filter(Boolean);
}

function isEmptyEvidenceBody(body) {
  const lines = normalizedEvidenceLines(body);
  return lines.length === 0 || lines.every((line) => /^(none|n\/a|na|not applicable|nothing|no)[.!]?$/i.test(line));
}

function containsOnlyVagueEvidence(body) {
  const lines = normalizedEvidenceLines(body);
  return lines.length > 0 && lines.every((line) => isVagueEvidenceLine(line) && !hasConcreteEvidence(line));
}

function isVagueEvidenceLine(line) {
  return /^(looks good|checked|checked manually|confirmed|done|works|tests?\s+pass(?:ed|es)?|all good|ok|okay)[.!]?$/i.test(line);
}

function hasTestsPassWithoutCommand(body) {
  return normalizedEvidenceLines(body).some((line) => /\btests?\s+pass(?:ed|es)?\b/i.test(line) && !hasConcreteEvidence(line));
}

function hasConcreteEvidence(text) {
  return CONCRETE_EVIDENCE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasNoRegressionClaim(text) {
  return claimRelevantText(text).some((unit) => /\bno regression\b/i.test(unit));
}

function hasReadinessClaim(text) {
  return claimRelevantText(text).some((unit) => READINESS_CLAIM_PATTERNS.some((pattern) => pattern.test(unit)));
}

function claimRelevantText(text) {
  return extractTextUnitsWithSections(text)
    .filter((unit) => !isScopedEvidencePhraseUnit(unit))
    .map((unit) => unit.text);
}

function sensor(name, status, message, claimRestriction = null) {
  return { name, status, message, claimRestriction };
}

function strongestStatus(statuses) {
  const order = ["pass", "warn", "fail", "hard_stop"];
  return statuses.reduce((strongest, status) => (order.indexOf(status) > order.indexOf(strongest) ? status : strongest), "pass");
}

function printReport({ mode, target, changedFiles, report }) {
  console.log(`ASK sensors: ${report.status}`);
  console.log("Report-only: true");
  console.log(`Mode: ${mode}`);
  console.log(`Target: ${target}`);
  console.log(`Changed files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "not provided"}`);
  console.log("");
  console.log("Sensors:");
  for (const entry of report.sensors) {
    console.log(`- ${entry.name}: ${entry.status} - ${entry.message}`);
    if (entry.claimRestriction) {
      console.log(`  Claim restriction: ${entry.claimRestriction}`);
    }
  }
  console.log("");
  console.log("Next:");
  if (report.status === "hard_stop") {
    console.log("- Stop before the approval-required action unless explicit approval is obtained for that action.");
    console.log("- Continue only read-only investigation or local verification that does not cross the approval-required surface.");
  } else if (report.status === "fail") {
    console.log("- Continue safe investigation or local verification, but do not make unsupported completion/readiness/safety/merge claims.");
  } else if (report.status === "warn") {
    console.log("- Continue with the warning visible and scope claims to available evidence.");
  } else {
    console.log("- No control concern detected by these sensors.");
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const text = readInput(args);
  const report = runSensors({ target: args.target, mode: args.mode, text, changedFiles: args.changedFiles });
  printReport({ mode: args.mode, target: args.target, changedFiles: args.changedFiles, report });
  process.exit(0);
} catch (error) {
  console.error(`ASK sensors failed: ${error.message}`);
  process.exit(1);
}
