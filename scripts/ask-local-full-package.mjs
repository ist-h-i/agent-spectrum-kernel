import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodexProjectionPlan } from "./install-codex-adapter.mjs";
import { readGitRevision } from "./installer-lifecycle.mjs";
import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CASE = "mp-ci-evidence-gap";
const FIXTURE = `benchmarks/fixtures/checkpoint-b2/${CASE}`;
const CANDIDATE = "docs/mac-ask-full-static-inventory.json";
const CANDIDATE_DIGEST = "sha256:3634c9ef3801067636d990a63f1793c268390ccb4012a1e2f1c4ac2e5b566bed";
const RECORD = "controller/static-preparation.json";
const CONDITIONS = ["plain", "kernel_only", "full_ask"];
const HELPER_INPUTS = ["scripts/ask-local-full-package.mjs", "scripts/content-addressed-store.mjs", "scripts/ask-benchmark-stable-file.mjs", "scripts/ask-benchmark-atomic-publication.mjs"];
const LIMIT = 1048576;
const digest = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safePath = p => typeof p === "string" && p.length < 512 && p !== "." && !isAbsolute(p)
  && !p.includes("\\") && !p.includes("\0") && p.split("/").every(x => x && x !== "." && x !== "..");
function refuse(reason) { throw new Error(reason); }
function bytes(root, p) {
  if (!safePath(p)) refuse("invalid_relative_path");
  return readStableFile(join(root, p), "static package file", LIMIT).bytes;
}
const json = (root, p) => parseJsonRejectDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(bytes(root, p)));
const fileRecord = value => ({ bytes: value.length, digest: digest(value) });
const helperDigests = () => Object.fromEntries(HELPER_INPUTS.map(p => [p, digest(bytes(SOURCE, p))]));
function privateLayout(root) {
  const shape = [["", ["conditions", "controller"]], ["conditions", [...CONDITIONS].sort()],
    ["controller", ["static-preparation.json"]], ...CONDITIONS.map(n => [`conditions/${n}`, null])];
  for (const [p, names] of shape) {
    const path = p ? join(root, p) : root, s = lstatSync(path);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid()) refuse("unsafe_private_directory");
    if ((s.mode & 0o777) !== 0o700) refuse("private_directory_mode");
    if (names && !equal(readdirSync(path).sort(), names)) refuse("preparation_shape_changed");
  }
  const s = lstatSync(join(root, RECORD));
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o600) refuse("private_record_boundary");
}

// Enumerate names before reading content. Extra paths or links are never followed.
function inventory(root, expected = null) {
  const files = [], directories = [];
  const walk = (path = "") => {
    for (const name of readdirSync(join(root, path)).sort()) {
      const p = path ? `${path}/${name}` : name;
      if (!safePath(p)) refuse("invalid_relative_path");
      const s = lstatSync(join(root, p));
      if (s.isSymbolicLink() || s.uid !== process.getuid()) refuse("unsafe_inventory_entry");
      if (s.isDirectory()) { directories.push(p); walk(p); }
      else if (s.isFile() && s.nlink === 1 && s.size <= LIMIT) files.push(p);
      else refuse("unsafe_inventory_entry");
      if (files.length + directories.length > 2000) refuse("inventory_limit");
    }
  };
  const s = lstatSync(root);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid()) refuse("unsafe_root");
  walk(); files.sort(); directories.sort();
  if (expected && (!equal(files, Object.keys(expected.files).sort()) || !equal(directories, expected.directories))) refuse("inventory_paths_changed");
  return { files: Object.fromEntries(files.map(p => [p, fileRecord(bytes(root, p))])), directories };
}

function distribution() {
  if (digest(bytes(SOURCE, CANDIDATE)) !== CANDIDATE_DIGEST) refuse("source_candidate_drift");
  const candidate = json(SOURCE, CANDIDATE), plan = buildCodexProjectionPlan({ profileName: "full" });
  const paths = [...candidate.core_sources, ...candidate.renderer_inputs.canonical,
    ...candidate.renderer_inputs.adapter_owned, candidate.kernel_renderer_source];
  for (const item of paths) if (digest(bytes(SOURCE, item.path)) !== item.digest) refuse("source_candidate_drift");
  if (plan.fingerprint !== candidate.fingerprint || !equal(plan.skills, candidate.selected_skills)
    || !equal(plan.prompts, candidate.prompts) || !equal(plan.commands, candidate.commands)) refuse("distribution_selection_drift");
  return { candidate, plan, identity: {
    source_candidate_commit: candidate.source_commit, candidate_digest: digest(bytes(SOURCE, CANDIDATE)),
    package_version: candidate.package_version, renderer: candidate.renderer,
    fingerprint: candidate.fingerprint, verified_source_paths: new Set(paths.map(x => x.path)).size,
    counts: { skills: plan.skills.length, prompts: plan.prompts.length, commands: plan.commands.length },
  } };
}
function publicInputs() {
  const manifest = json(SOURCE, `${FIXTURE}/input-manifest.json`), fixture = manifest.fixtures?.[CASE];
  if (!fixture || manifest.scope !== "agent-visible task.md + workspace/**" || !Array.isArray(fixture.files)) refuse("invalid_input_manifest");
  const inputs = new Map();
  for (const f of fixture.files) {
    if (!safePath(f.path) || !(f.path === "task.md" || f.path.startsWith("workspace/")) || inputs.has(f.path)) refuse("input_scope_violation");
    const value = bytes(SOURCE, `${FIXTURE}/${f.path}`);
    if (digest(value) !== `sha256:${f.sha256}` || value.length !== f.bytes) refuse("input_digest_mismatch");
    inputs.set(f.path, value);
  }
  if (!inputs.has("task.md") || inputs.size !== 13) refuse("input_inventory_changed");
  return inputs;
}
function writeNew(root, p, value) {
  if (!safePath(p)) refuse("invalid_relative_path");
  mkdirSync(dirname(join(root, p)), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, p), value, { flag: "wx", mode: 0o600 });
}

/** Bounded textual closure, never a runtime capability or JavaScript execution. */
export function inspectPackageClosure(root, requiredPaths = []) {
  const inv = inventory(root), present = new Set(Object.keys(inv.files)), violations = [], references = [];
  for (const path of requiredPaths) if (!safePath(path) || !present.has(path)) violations.push({ path, reason: "required_asset_missing" });
  for (const path of present) {
    if (path === "task.md" || path.startsWith("workspace/")) continue;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes(root, path));
    if (path.endsWith(".mjs")) {
      if (/\b(?:import\s*\(|require\s*\()|\b(?:from|import)\s*\/[*\/]/u.test(text)) violations.push({ path, reason: "unsupported_import" });
      for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/gu)) {
        const spec = m[1];
        if (isBuiltin(spec)) continue;
        if (!spec.startsWith(".")) { violations.push({ path, reference: spec, reason: "import_external" }); continue; }
        const target = posix.normalize(posix.join(posix.dirname(path), spec));
        references.push({ path, reference: target, kind: "literal_esm_import" });
        if (!safePath(target)) violations.push({ path, reference: spec, reason: "import_escape" });
        else if (!present.has(target)) violations.push({ path, reference: target, reason: "import_missing" });
      }
    }
    if (path.endsWith(".md")) {
      for (const m of text.matchAll(/`((?:docs|schemas|scripts|skills)\/[a-zA-Z0-9_./-]+\.(?:md|mjs|json))`/gu)) {
        references.push({ path, reference: m[1], kind: "literal_instruction_path" });
        if (!safePath(m[1])) violations.push({ path, reference: m[1], reason: "reference_escape" });
        else if (!present.has(m[1])) violations.push({ path, reference: m[1], reason: "instruction_reference_unresolved" });
      }
      for (const m of text.matchAll(/\]\(([^\s)]+)\)/gu)) {
        const ref = m[1].split("#")[0];
        if (!ref || /^[a-z][a-z0-9+.-]*:/iu.test(ref)) continue;
        const target = posix.normalize(posix.join(posix.dirname(path), ref));
        references.push({ path, reference: target, kind: "local_markdown_link" });
        if (!safePath(target)) violations.push({ path, reference: ref, reason: "reference_escape" });
        else if (!present.has(target)) violations.push({ path, reference: target, reason: "instruction_reference_unresolved" });
      }
    }
  }
  return { status: violations.length ? "blocked" : "bounded_literal_closure_verified", references, violations,
    unverified: ["computed_imports_and_runtime_io", "semantic_instruction_completeness", "native_cli_discovery", "sandbox_enforcement", "workflow_use"] };
}

/** New private roots only. No rollback/deletion or retry after partial failure. */
export function prepareStaticFullComparison(root) {
  if (typeof process.getuid !== "function" || !/^v24\./u.test(process.version)) refuse("unsupported_static_runtime");
  if (typeof root !== "string" || !isAbsolute(root) || resolve(root) !== root || root === "/") refuse("invalid_new_root");
  if (existsSync(root)) refuse("root_exists");
  if (realpathSync(dirname(root)) !== dirname(root) || root.startsWith(`${SOURCE}/`) || SOURCE.startsWith(`${root}/`)) refuse("unsafe_new_root");
  const { candidate, plan, identity } = distribution(), inputs = publicInputs();
  const catalog = json(SOURCE, "benchmarks/portfolio-catalog.json");
  // Catalog metadata only; evaluator/oracle/admission artifacts are not read.
  const item = catalog.fixtures.find(f => f.fixture_id === CASE);
  if (!item || item.task_class !== "review_verification") refuse("task_metadata_changed");
  mkdirSync(root, { mode: 0o700 });
  const conditions = {};
  for (const name of CONDITIONS) {
    const target = join(root, "conditions", name);
    mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const [path, value] of inputs) writeNew(target, path, value);
    if (name === "kernel_only") writeNew(target, "AGENTS.md", bytes(SOURCE, "AGENTS.md"));
    if (name === "full_ask") {
      for (const [script, extra] of [["install-kernel.mjs", []], ["install-codex-adapter.mjs", ["--profile", "full"]]]) {
        const result = spawnSync(process.execPath, [join(SOURCE, "scripts", script), "--target", target, ...extra],
          { cwd: SOURCE, env: { PATH: "" }, timeout: 10000, maxBuffer: LIMIT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        if (result.error || result.status !== 0 || result.signal) refuse("installer_failed_evidence_preserved");
      }
      const allowed = new Set([...inputs.keys(), ...candidate.core_sources.map(x => x.path),
        ...plan.projectedManagedAssets.map(x => x.path), ".agent-spectrum-kernel/install-state.json", ".agent-spectrum-kernel/codex-install-state.json"]);
      // Compare names against the selected source/renderer boundary before hashing.
      const names = readdirSync(target, { recursive: true, withFileTypes: true }).filter(x => x.isFile())
        .map(x => posix.join(posix.relative(target, x.parentPath), x.name));
      if (names.some(p => !allowed.has(p)) || [...allowed].some(p => !names.includes(p))) refuse("generated_inventory_changed");
    }
    conditions[name] = inventory(target);
  }
  const closure = inspectPackageClosure(join(root, "conditions/full_ask"), plan.requiredAssets);
  const report = { kind: "ask_full_static_preparation_v1", status: closure.violations.length ? "blocked" : "static_prepared",
    static_package_eligible: closure.violations.length === 0, live_ready: false, native_cli_starts: 0, model_calls: 0,
    distribution: identity, preparation_source: { head: readGitRevision(SOURCE), implementation_digests: helperDigests(), checkout_clean: "not_checked" },
    task: CASE, task_source: { input_manifest_digest: digest(bytes(SOURCE, `${FIXTURE}/input-manifest.json`)),
      catalog_digest: digest(bytes(SOURCE, "benchmarks/portfolio-catalog.json")) },
    task_inputs: Object.fromEntries([...inputs].map(([p, b]) => [p, fileRecord(b)])),
    task_admission: { static_inputs: "verified", catalog_state: item.admission_state, evaluator_binding: "unknown", kernel_zero_skill_workflow: "unknown", actual_capability_use: "unknown", measured_ready: false },
    separation: { input_roots: CONDITIONS.map(n => `conditions/${n}`), protected_evidence_root: "controller", grader_bytes_copied: false,
      posix_owner_only_modes: "observed", acl_enforcement: "unknown", actual_process_denies: "unknown" },
    conditions, closure };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  writeNew(root, RECORD, serialized);
  privateLayout(root);
  return { ...report, record_digest: digest(serialized) };
}

/** Integrity audit only: no installers, git commands, grants or model calls. */
export function auditStaticFullComparison(root, expectedDigest) {
  try {
    if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) refuse("unsafe_root");
    privateLayout(root);
    if (!/^sha256:[a-f0-9]{64}$/u.test(expectedDigest ?? "")) refuse("external_record_digest_required");
    const raw = bytes(root, RECORD);
    if (digest(raw) !== expectedDigest) refuse("static_record_digest_changed");
    const report = parseJsonRejectDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (report.kind !== "ask_full_static_preparation_v1" || report.live_ready !== false || report.model_calls !== 0 || report.native_cli_starts !== 0) refuse("invalid_static_record");
    const { identity, plan } = distribution();
    if (!equal(report.distribution, identity) || !equal(report.preparation_source.implementation_digests, helperDigests())) refuse("preparation_source_drift");
    const inputs = publicInputs();
    if (!equal(report.task_source, { input_manifest_digest: digest(bytes(SOURCE, `${FIXTURE}/input-manifest.json`)),
      catalog_digest: digest(bytes(SOURCE, "benchmarks/portfolio-catalog.json")) })) refuse("task_source_drift");
    if (!equal(report.task_inputs, Object.fromEntries([...inputs].map(([p, b]) => [p, fileRecord(b)])))) refuse("task_input_record_changed");
    for (const name of CONDITIONS) {
      if (!equal(inventory(join(root, "conditions", name), report.conditions[name]), report.conditions[name])) refuse("inventory_digest_changed");
    }
    const closure = inspectPackageClosure(join(root, "conditions/full_ask"), plan.requiredAssets);
    if (!equal(closure, report.closure) || report.static_package_eligible !== (closure.violations.length === 0)
      || report.status !== (closure.violations.length ? "blocked" : "static_prepared")) refuse("closure_record_changed");
    return { ...report, record_digest: expectedDigest };
  } catch (error) {
    return { kind: "ask_full_static_audit_v1", status: "blocked", static_package_eligible: false, live_ready: false,
      reason: /^[a-z_]+$/u.test(error.message) ? error.message : "static_audit_refused" };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, root, expectedDigest, ...extra] = process.argv.slice(2);
    if (extra.length || !root || !["prepare", "audit"].includes(command) || (command === "prepare" && expectedDigest)) refuse("invalid_arguments");
    const result = command === "prepare" ? prepareStaticFullComparison(root) : auditStaticFullComparison(root, expectedDigest);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "blocked") process.exitCode = 2;
  } catch {
    process.stderr.write("Static preparation refused; existing evidence preserved. No Codex/model execution.\n");
    process.exitCode = 1;
  }
}
