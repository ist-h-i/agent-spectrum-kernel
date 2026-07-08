#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectApprovalRequiredSurfaces,
  findUnsupportedCapabilityClaims,
} from "./ask-shared.mjs";

const IMPLEMENTATION_SECTIONS = ["Changed:", "Verified:", "Not verified:", "Risks / assumptions:", "Next:"];
const REVIEW_SECTIONS = ["Decision:", "Layer summary:"];
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
  if (!["implementation", "review"].includes(args.mode)) {
    throw new Error("--mode must be implementation or review");
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/ask-sensors.mjs [options]

Options:
  --target <path>           Repository root to scan for capability claims. Defaults to cwd.
  --mode <mode>             implementation | review. Defaults to implementation.
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
  if (mode === "implementation") {
    sensors.push(completionContractSensor(text));
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

function completionContractSensor(text) {
  if (!text.trim()) {
    return sensor("completion_contract", "warn", "No implementation output text was provided.");
  }
  const missing = IMPLEMENTATION_SECTIONS.filter((section) => !text.includes(section));
  if (missing.length > 0) {
    return sensor(
      "completion_contract",
      "fail",
      `Implementation output is missing required sections: ${missing.join(", ")}.`,
      "Do not claim implementation completion/readiness until the completion contract is present.",
    );
  }
  return sensor("completion_contract", "pass", "Implementation completion contract sections are present.");
}

function reviewLayerSummarySensor(text) {
  if (!text.trim()) {
    return sensor("review_layer_summary", "warn", "No review output text was provided.");
  }
  const missing = REVIEW_SECTIONS.filter((section) => !text.includes(section));
  if (missing.length > 0) {
    return sensor(
      "review_layer_summary",
      "fail",
      `Review output is missing required sections: ${missing.join(", ")}.`,
      "Do not claim merge approval/readiness until the review decision and layer summary are present.",
    );
  }
  return sensor("review_layer_summary", "pass", "Review decision and layer summary sections are present.");
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
    `Unsupported or partial adapter capability overclaims detected: ${findings.map((finding) => `${finding.adapter}:${finding.capability}:${finding.status}`).join("; ")}.`,
    "Downgrade adapter capability claims to the status in docs/adapter-capability-matrix.md.",
  );
}

function evidencePhraseSensor(text) {
  if (!text.trim()) {
    return sensor("evidence_phrase", "pass", "No output text to inspect for evidence phrases.");
  }
  const claimText = text.replace(/^Verified:\s*$/gim, "").replace(/^Not verified:\s*$/gim, "");
  const hasClaim = CLAIM_PATTERNS.some((pattern) => pattern.test(claimText));
  if (!hasClaim) {
    return sensor("evidence_phrase", "pass", "No high-confidence evidence phrase detected.");
  }
  if (/\b(Verified:|Evidence:|実行コマンド|検証結果|command:|result:)\b/i.test(text)) {
    return sensor("evidence_phrase", "warn", "Evidence phrase detected; evidence section is present, so keep claim language scoped to that evidence.");
  }
  return sensor(
    "evidence_phrase",
    "fail",
    "Evidence phrase detected without an evidence or command section.",
    "Do not claim verified, ready, safe, fixed, no regression, or tests passed without explicit evidence.",
  );
}

function hasExplicitApprovalEvidence(text) {
  return /\b(approval|approved|承認)\b.{0,80}\b(explicit|specific|明示|あり|済み)\b/i.test(text);
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
