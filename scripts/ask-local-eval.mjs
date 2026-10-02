import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareFakePilot, runFakePilot, reopenFakePilot } from "./ask-synthetic-json-pilot.mjs";
import { parseJsonRejectDuplicateKeys, writeCanonicalJsonNoReplace } from "./content-addressed-store.mjs";
import { readStableFile } from "./ask-benchmark-stable-file.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = "scripts/ask-local-eval.mjs";
const IDENTITY = "local-eval.json";

/** Selection is a prerequisite decision, never evidence of host isolation. */
export function selectLocalRoute(host) {
  const reasons = [];
  if (!/^v24\./u.test(host.node)) reasons.push("requires_node_24");
  if (!["arm64", "x64"].includes(host.arch)) reasons.push("unsupported_cpu");
  let route = "unsupported";
  if (host.platform === "darwin") {
    route = "macos-posix";
    if (!/^\d+\./u.test(host.release) || Number(host.release.split(".")[0]) < 23) reasons.push("requires_macos_14_or_newer");
  } else if (host.platform === "linux") {
    route = /microsoft-standard/iu.test(host.release) ? "windows-wsl2" : "linux-posix";
    if (/microsoft/iu.test(host.release) && route !== "windows-wsl2") reasons.push("wsl1_or_unknown_wsl_unsupported");
    if (host.distro.id !== "ubuntu" || !["22.04", "24.04"].includes(host.distro.version)) reasons.push("requires_ubuntu_22_04_or_24_04");
    const kernel = /^(\d+)\.(\d+)/u.exec(host.release);
    if (!kernel || Number(kernel[1]) < 5 || (Number(kernel[1]) === 5 && Number(kernel[2]) < 15)) reasons.push("requires_kernel_5_15_or_newer");
    const libc = /^(\d+)\.(\d+)/u.exec(host.glibc ?? "");
    if (!libc || Number(libc[1]) < 2 || (Number(libc[1]) === 2 && Number(libc[2]) < 35)) reasons.push("requires_glibc_2_35_or_newer");
  } else reasons.push(host.platform === "win32" ? "use_linux_node_inside_wsl2" : "unsupported_os");
  return { route, fake_ready: reasons.length === 0, reasons,
    live_ready: false, live_reason: "distribution_live_adapter_not_admitted", docker: "unnecessary_for_this_slice" };
}

export function localPreflight() {
  let distro = { id: null, version: null };
  if (process.platform === "linux") {
    try {
      const text = readFileSync("/etc/os-release", "utf8");
      const field = name => new RegExp(`^${name}="?([a-zA-Z0-9.]+)"?$`, "mu").exec(text)?.[1] ?? null;
      distro = { id: field("ID"), version: field("VERSION_ID") };
    } catch { /* Unknown distro fails closed. */ }
  }
  const host = { platform: process.platform, arch: process.arch, release: release(), node: process.version,
    distro, glibc: process.platform === "linux" ? process.report.getReport().header.glibcVersionRuntime ?? null : null };
  const selected = selectLocalRoute(host);
  let git_available = false;
  try { git_available = /^git version /u.test(execFileSync("git", ["--version"], { encoding: "utf8", timeout: 10000 })); } catch { /* No installation or auth. */ }
  if (!git_available) { selected.fake_ready = false; selected.reasons.push("requires_git"); }
  return { kind: "ask_local_eval_preflight_v1", host, selected, git_available,
    checks_not_performed: ["codex_startup", "authentication", "sandbox_enforcement", "model_call"] };
}

export function summarizeLocalEval(report) {
  const lines = ["Synthetic comparison only; no model was called."];
  for (const slot of report.slots) lines.push(`${slot.condition}: ${slot.state}; grade=${slot.grade?.status ?? "unavailable"}; usage=${slot.usage?.total_tokens ?? "unknown"}`);
  lines.push(`Stop: ${report.stop ?? "none"}; retries: ${report.retry}.`);
  lines.push("This result measures wiring, not ASK superiority or formal #291 acceptance.");
  return lines.join("\n");
}

export function runLocalFake(privateRoot) {
  const preflight = localPreflight();
  if (!preflight.selected.fake_ready) throw new Error("local fake route unavailable; run preflight");
  const prepared = prepareFakePilot({ privateRoot, controllerRoot: realpathSync(dirname(ROOT)) });
  // Written before execution: the existing pilot seal includes this sidecar.
  // No new writer, result format or scorer is introduced into the pilot.
  const identity = { kind: "ask_local_eval_identity_v1", mode: "fake_only", preflight,
    entry_sha256: createHash("sha256").update(readFileSync(join(ROOT, ENTRY))).digest("hex") };
  writeCanonicalJsonNoReplace({ outputPath: join(prepared.privateRoot, IDENTITY), artifact: identity });
  const report = runFakePilot(prepared.privateRoot);
  return { privateRoot: prepared.privateRoot, identity, report, summary: summarizeLocalEval(report) };
}

export function reopenLocalEval(root) {
  // Verify all sealed evidence before displaying any of it. No preparation,
  // source/runtime check, CLI launch, credential access or writes on this path.
  const report = reopenFakePilot(root);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(readStableFile(join(root, IDENTITY), "local eval identity", 65536).bytes);
  const identity = parseJsonRejectDuplicateKeys(text);
  if (identity.kind !== "ask_local_eval_identity_v1" || identity.mode !== "fake_only" || report.mode !== "fake_only") throw new Error("unsupported local eval identity");
  return { privateRoot: root, identity, report, summary: summarizeLocalEval(report) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, root, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error("unexpected arguments");
    const result = command === "preflight" && root === undefined ? localPreflight()
      : command === "fake" && root ? runLocalFake(root)
      : command === "reopen" && root ? reopenLocalEval(root)
      : (() => { throw new Error("usage: ask-local-eval.mjs preflight | fake NEW_ABSOLUTE_ROOT | reopen ROOT"); })();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.selected?.fake_ready === false) process.exitCode = 2;
  } catch {
    process.stderr.write("Local eval refused or incomplete; existing evidence preserved. See docs/local-eval-distribution.md.\n");
    process.exitCode = 1;
  }
}
