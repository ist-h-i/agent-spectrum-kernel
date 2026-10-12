import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeCommandContractDigest,
  computeVerificationCommandContractDigest,
  logicalCommandDigest,
  renderedEventCommandDigest,
  validateVerificationCommandContract,
} from "./ask-benchmark-command-evidence.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

export const PF_REVIEW_ERROR_FIXTURE_ID = "pf-review-error-contract";
export const PF_REVIEW_ERROR_FIXTURE_ROOT = `benchmarks/fixtures/checkpoint-b2/${PF_REVIEW_ERROR_FIXTURE_ID}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_VISIBLE_PATTERN = /^(?:task\.md|workspace\/.+)$/u;
const PRIVATE_NAME_PATTERN = /(?:^|[._/-])(?:evaluator|hidden|oracle|rubric|private)(?:[._/-]|$)/iu;
const FORBIDDEN_TASK_VOCABULARY = /\b(?:ASK|benchmark|evaluator|routing|scoring|mechanism|hidden tests?|expected findings?|over-processing)\b/iu;
const PLACEHOLDER_FILES = [
  "admission-review.json",
  "evaluator-authority-manifest.json",
  "evaluator-reference.json",
  "evidence-map.json",
  "final-admission-record.json",
  "metadata.json",
  "output-contract.json",
  "requirement-record.json",
  "scoring-input-freeze-manifest.json",
  "source-freeze-candidate.json",
];

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function readJson(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} is missing or not a regular file`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is invalid JSON`); }
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function walkFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = resolve(current, entry.name);
    const path = relative(root, absolute).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new Error(`agent-visible input traverses a symlink: ${path}`);
    if (entry.isDirectory()) files.push(...walkFiles(root, absolute));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`agent-visible input is not a regular file: ${path}`);
  }
  return files;
}

export function agentVisibleFiles(fixtureRoot) {
  for (const [path, directory] of [["task.md", false], ["workspace", true]]) {
    const stat = lstatSync(resolve(fixtureRoot, path));
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error(`agent-visible root is not regular: ${path}`);
  }
  const paths = ["task.md", ...walkFiles(resolve(fixtureRoot, "workspace")).map((path) => `workspace/${path}`)];
  return paths.map((path) => {
    if (!AGENT_VISIBLE_PATTERN.test(path) || PRIVATE_NAME_PATTERN.test(path)) throw new Error(`agent-visible path is prohibited: ${path}`);
    const bytes = readFileSync(resolve(fixtureRoot, path));
    return { path, sha256: sha256(bytes).slice(7), bytes: bytes.length };
  });
}

function closeCommand(command) {
  const withLogical = { ...command, logical_command_digest: logicalCommandDigest(command) };
  const withRendered = { ...withLogical, rendered_event_command_digest: renderedEventCommandDigest(withLogical) };
  return { ...withRendered, command_contract_digest: computeCommandContractDigest(withRendered) };
}

export function buildPfReviewErrorInputArtifacts(root = ROOT) {
  const fixtureRoot = resolve(root, PF_REVIEW_ERROR_FIXTURE_ROOT);
  const files = agentVisibleFiles(fixtureRoot);
  const inputManifest = {
    schema_version: 1,
    hash_algorithm: "sha256",
    scope: "agent-visible task.md + workspace/**",
    fixtures: {
      [PF_REVIEW_ERROR_FIXTURE_ID]: {
        class: "pr_review",
        difficulty: "medium_hard",
        target_minutes: 30,
        files,
      },
    },
  };
  const inputBytes = Buffer.from(`${JSON.stringify(inputManifest, null, 2)}\n`);
  const protectedPaths = files.filter(({path})=>path.startsWith('workspace/')).map(({path})=>path.slice('workspace/'.length));
  const protectedDigests = Object.fromEntries(protectedPaths.map((path) => {
    const entry = files.find((candidate) => candidate.path === `workspace/${path}`);
    if (!entry) throw new Error(`protected verification input is missing: ${path}`);
    return [path, entry.sha256];
  }));
  const anchor = `node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected=${JSON.stringify(protectedDigests)};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}'`;
  const command = closeCommand({
    command_id: "review-error-contract-validation",
    purpose: "test",
    working_directory: { path: ".", evidence_requirement: "not_required" },
    safe_argv: null,
    execution_form: "codex_shell_command",
    shell_family: "posix_bash",
    shell_envelope: { executable: "/bin/bash", arguments: ["-lc"] },
    canonical_script: `${anchor} && npm run validate:review`,
    requirement: "required",
    alternative_group_id: null,
    timeout_ms: 60000,
  });
  const verificationBase = {
    schema_version: "1.2.0",
    schema_path: "benchmarks/schemas/portfolio-verification-command-contract.schema.json",
    program: "adaptive_ask_verification_command_contract",
    fixture_id: PF_REVIEW_ERROR_FIXTURE_ID,
    fixture_input_digest: sha256(inputBytes),
    commands: [command],
  };
  const verification = { ...verificationBase, contract_digest: computeVerificationCommandContractDigest(verificationBase) };
  return { inputManifest, inputBytes, verification };
}

export function writePfReviewErrorInputArtifacts({ root = ROOT } = {}) {
  const fixtureRoot = resolve(root, PF_REVIEW_ERROR_FIXTURE_ROOT);
  const { inputManifest, verification } = buildPfReviewErrorInputArtifacts(root);
  writeJson(resolve(fixtureRoot, "input-manifest.json"), inputManifest);
  writeJson(resolve(fixtureRoot, "verification-command-contract.json"), verification);
  for (const name of PLACEHOLDER_FILES) {
    const path = resolve(fixtureRoot, name);
    if (!existsSync(path)) writeJson(path, { fixture_id: PF_REVIEW_ERROR_FIXTURE_ID, candidate_state: "generation_pending" });
  }
  return {
    fixtureId: PF_REVIEW_ERROR_FIXTURE_ID,
    inputDigest: sha256(readFileSync(resolve(fixtureRoot, "input-manifest.json"))),
    verificationDigest: verification.contract_digest,
  };
}

export function validatePfReviewErrorInputClosure({ root = ROOT } = {}) {
  const fixtureRoot = resolve(root, PF_REVIEW_ERROR_FIXTURE_ROOT);
  const task = readFileSync(resolve(fixtureRoot, "task.md"), "utf8");
  if (FORBIDDEN_TASK_VOCABULARY.test(task)) throw new Error("public task contains benchmark-specific vocabulary");
  const manifest = readJson(resolve(fixtureRoot, "input-manifest.json"), "pf-review-error-contract input manifest");
  const record = manifest.fixtures?.[PF_REVIEW_ERROR_FIXTURE_ID];
  if (manifest.scope !== "agent-visible task.md + workspace/**" || record?.class !== "pr_review" || record?.difficulty !== "medium_hard") throw new Error("pf-review-error-contract input manifest fixture record is invalid");
  const expected = agentVisibleFiles(fixtureRoot);
  if (stableCanonicalJson(record.files) !== stableCanonicalJson(expected)) throw new Error("pf-review-error-contract input manifest does not exactly bind the agent-visible inventory");
  const verification = validateVerificationCommandContract(readJson(resolve(fixtureRoot, "verification-command-contract.json"), "pf-review-error-contract verification contract"), { root });
  if (!verification.commands.every(({ canonical_script }) => task.includes(`\n${canonical_script}\n`))) throw new Error("public task does not expose the verification invocation");
  const inputDigest = sha256(readFileSync(resolve(fixtureRoot, "input-manifest.json")));
  if (verification.fixture_input_digest !== inputDigest) throw new Error("pf-review-error-contract verification/input binding is invalid");
  return { fixtureId: PF_REVIEW_ERROR_FIXTURE_ID, inputDigest, verificationDigest: verification.contract_digest };
}

function parseArgs(argv) {
  const args = { root: ROOT, command: "validate" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "write") args.command = argv[index];
    else if (argv[index] === "--root") args.root = resolve(argv[++index]);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(args.command === "write" ? writePfReviewErrorInputArtifacts(args) : validatePfReviewErrorInputClosure(args)));
}
