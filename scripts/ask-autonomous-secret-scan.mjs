#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_LINE_BYTES = 20_000;
const TEXT_ENCODER = new TextEncoder();

const SECRET_PATTERNS = Object.freeze([
  ["pem_private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu],
  ["github_token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b/gu],
  ["openai_api_key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,255}\b/gu],
  ["aws_access_key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu],
  ["aws_secret_assignment", /\bAWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?[^\s"']{16,}/giu],
  ["authorization_credential", /\b(?:authorization\s*[:=]\s*)?bearer\s+[A-Za-z0-9._~+/=-]{12,}/giu],
  ["explicit_credential_assignment", /\b(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*["']?[^\s"']{8,}/giu],
  ["credential_url", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@[^\s]+/giu],
]);

function byteOffset(text, codeUnitOffset) {
  return TEXT_ENCODER.encode(text.slice(0, codeUnitOffset)).length;
}

function lineForOffset(text, codeUnitOffset) {
  let line = 1;
  for (let index = 0; index < codeUnitOffset; index += 1) if (text.charCodeAt(index) === 10) line += 1;
  return line;
}

function patchPathAtLine(lines, index) {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const match = lines[cursor].match(/^\+\+\+ b\/(.+)$/u);
    if (match) return match[1];
  }
  return null;
}

function finding(category, artifact, field, path, line, start, end) {
  return { category, artifact, field, path, line, byte_range: [start, end] };
}

export function scanSecretBytes(bytes, { artifact, field = null, path = null } = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const text = buffer.toString("utf8");
  const findings = [];

  for (let index = 0; index < buffer.length; index += 1) {
    const value = buffer[index];
    if (value === 0) findings.push(finding("nul_byte", artifact, field, path, null, index, index + 1));
    else if ((value < 32 && ![9, 10, 13].includes(value)) || value === 127) {
      findings.push(finding("control_character", artifact, field, path, null, index, index + 1));
    }
  }

  const lines = text.split(/\n/u);
  let lineByteStart = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineBytes = Buffer.byteLength(lines[index]);
    const detectedPath = artifact === "patch" ? patchPathAtLine(lines, index) : path;
    if (lineBytes > MAX_LINE_BYTES) {
      findings.push(finding("oversized_line", artifact, field, detectedPath, index + 1, lineByteStart, lineByteStart + lineBytes));
    }
    lineByteStart += lineBytes + 1;
  }

  for (const [category, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = byteOffset(text, match.index);
      const end = start + Buffer.byteLength(match[0]);
      const line = lineForOffset(text, match.index);
      findings.push(finding(category, artifact, field, artifact === "patch" ? patchPathAtLine(lines, line - 1) : path, line, start, end));
    }
  }

  return findings;
}

function resultFields(result) {
  return [
    ["summary", result.summary],
    ["rationale", result.rationale],
    ["pr_title", result.pr_title],
    ["pr_body", result.pr_body],
    ["issue_comment", result.issue_comment],
    ["review_comment", result.review_comment],
    ...((Array.isArray(result.tests_run) ? result.tests_run : []).map((value, index) => [`tests_run[${index}]`, value])),
    ...((Array.isArray(result.risks) ? result.risks : []).map((value, index) => [`risks[${index}]`, value])),
  ];
}

export function scanAutomationSecrets({ patch, result, branch = null, commitMessage = null }) {
  const findings = scanSecretBytes(patch, { artifact: "patch" });
  for (const [field, value] of resultFields(result)) {
    if (typeof value === "string") findings.push(...scanSecretBytes(Buffer.from(value), { artifact: "result", field }));
  }
  if (typeof branch === "string") findings.push(...scanSecretBytes(Buffer.from(branch), { artifact: "publication", field: "branch" }));
  if (typeof commitMessage === "string") findings.push(...scanSecretBytes(Buffer.from(commitMessage), { artifact: "publication", field: "commit_message" }));
  return findings;
}

export function assertNoAutomationSecrets(input) {
  const findings = scanAutomationSecrets(input);
  if (findings.length === 0) return;
  const details = findings.map(({ category, artifact, field, path, line, byte_range: range }) => (
    `${category} artifact=${artifact}${field ? ` field=${field}` : ""}${path ? ` path=${path}` : ""}${line ? ` line=${line}` : ""} bytes=${range[0]}-${range[1]}`
  ));
  throw new Error(`secret scan rejected ${findings.length} finding(s):\n${details.join("\n")}`);
}

function parseArgs(argv) {
  const args = { patch: null, result: null, branch: null, commitMessage: null };
  while (argv.length > 0) {
    const flag = argv.shift();
    if (flag === "--patch") args.patch = resolve(argv.shift());
    else if (flag === "--result") args.result = resolve(argv.shift());
    else if (flag === "--branch") args.branch = argv.shift();
    else if (flag === "--commit-message") args.commitMessage = argv.shift();
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.patch || !args.result) throw new Error("--patch and --result are required");
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    assertNoAutomationSecrets({
      patch: readFileSync(args.patch),
      result: JSON.parse(readFileSync(args.result, "utf8")),
      branch: args.branch,
      commitMessage: args.commitMessage,
    });
    console.log("ASK automation secret scan passed");
  } catch (error) {
    console.error(`ASK automation secret scan failed: ${error.message}`);
    process.exitCode = 1;
  }
}
