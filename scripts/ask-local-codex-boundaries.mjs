import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { canonicalDigest } from "./content-addressed-store.mjs";

const uid = () => process.getuid();
export function assertNoAclListing(out) {
  if (/^[d-][rwxStTs-]{9}\+/mu.test(out) || /^\s*\d+:.*(?:allow|deny)/mu.test(out)) throw new Error("ACL confidentiality unknown; no permissions changed");
}
export function noAcl(paths) {
  const args = process.platform === "darwin" ? ["-lde", ...paths] : ["-ld", "--", ...paths];
  const out = execFileSync("/bin/ls", args, { encoding: "utf8", env: { LANG: "C", PATH: "/usr/bin:/bin" }, timeout: 10000, maxBuffer: 1048576 });
  assertNoAclListing(out);
}
function meta(path, privateFile = false) {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw new Error("canonical owned metadata path required");
  const s = lstatSync(path);
  if (s.isSymbolicLink() || s.uid !== uid() || (s.mode & 0o022) || (s.isDirectory() && (s.mode & 0o700)!==0o700)
    || (!s.isDirectory() && (!s.isFile() || s.nlink !== 1))
    || (privateFile && (!s.isFile() || (s.mode & 0o777)!==0o600))) throw new Error(`unsafe private metadata: ${path}`);
  return { dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode & 0o777 };
}
/** Metadata only: never opens auth/log bytes or changes permissions. */
export function inspectExistingCodexHome(home) {
  const root = meta(home); if (!lstatSync(home).isDirectory()) throw new Error("existing home directory required");
  const paths = [home, join(home, "auth.json")]; meta(paths[1], true);
  // SQLite/log/history are command-scoped to new private storage (history=none).
  // The native rollout index remains home-scoped and must be private if present.
  const privateNames = name => name === "session_index.jsonl";
  for (const name of readdirSync(home)) if (privateNames(name)) { const path = join(home, name); meta(path, true); paths.push(path); }
  // Only directories for new rollout writes are admitted. Historical files are
  // not read, copied, rewritten or required to change mode. New selected logs
  // are checked separately after creation under umask 077.
  function walk(path) {
    if (paths.length > 4096) throw new Error("home metadata inventory limit");
    const s = lstatSync(path);
    if (s.isSymbolicLink()) throw new Error("session directory link refused");
    if (s.isDirectory()) { meta(path); paths.push(path); for (const name of readdirSync(path)) walk(join(path,name)); }
  }
  for (const name of ["sessions"]) { const path = join(home, name); try { lstatSync(path); } catch (e) { if (e.code === "ENOENT") continue; throw e; } walk(path); }
  noAcl(paths);
  return { kind: "ask_codex_home_metadata_v1", root, credential: "owned_regular_single_link_0600_no_acl", logs: "private_output_redirects_and_owned_session_directories",
    credential_contents: "not_read", chmod: false };
}
export function inspectSelectedSession(path) { meta(path, true); noAcl([path]); }

export function closedReadRoots(platform, node, cli) {
  const roots = platform === "darwin"
    ? ["/System/Library", "/usr/lib", "/usr/share", "/dev/null", "/dev/urandom"]
    : ["/usr/lib", "/usr/share", "/lib", "/lib64", "/etc/ld.so.cache", "/dev/null", "/dev/urandom"];
  roots.push("/bin/bash", "/bin/sh", "/bin/zsh", "/usr/bin/env", "/bin/cat", "/bin/ls", "/bin/pwd", "/usr/bin/printf");
  // Resolve host aliases before sealing; no $HOME, /etc, /tmp or /proc broad grant.
  return [...new Set([...roots.filter(path => { try { lstatSync(path); return true; } catch { return false; } }).map(path => realpathSync(path)), node, cli])].sort();
}
export function closedSessionEntries({ entries, workspace, readRoots, denyRoots, runtimeParent }) {
  const expected = denyRoots.map(path => ({ path: { type: "path", path }, access: "deny" })).concat([
    ...readRoots.map(path => ({ path: { type: "path", path }, access: "read" })),
    { path: { type: "path", path: workspace }, access: "write" }]);
  const runtime = entries.filter(e => e.access === "read" && e.path?.type === "path" && typeof e.path.path === "string"
    && dirname(e.path.path) === runtimeParent && /^codex-arg0[A-Za-z0-9]{6}$/u.test(e.path.path.split("/").at(-1)));
  if (runtime.length > 1 || entries.length !== expected.length + runtime.length
    || canonicalDigest(entries.filter(e => !runtime.includes(e)).sort((a,b) => a.path.path.localeCompare(b.path.path))) !== canonicalDigest(expected.sort((a,b) => a.path.path.localeCompare(b.path.path)))) throw new Error("closed read/write session boundary mismatch");
}
/** Exact candidate boundary; no temporary write or undeclared policy entries. */
export function declaredSessionEntries({entries,workspace,denyRoots,runtimeParent}) {
  const expected=denyRoots.map(path=>({path:{type:"path",path},access:"deny"})).concat([
    {path:{type:"special",value:{kind:"root"}},access:"read"},
    {path:{type:"path",path:workspace},access:"write"}]);
  const runtime=entries.filter(e=>e.access==="read" && e.path?.type==="path" && typeof e.path.path==="string"
    && dirname(e.path.path)===runtimeParent && /^codex-arg0[A-Za-z0-9]{6}$/u.test(e.path.path.split("/").at(-1)));
  const sorted=items=>items.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(runtime.length>1 || entries.length!==expected.length+runtime.length
    || canonicalDigest(sorted(entries.filter(e=>!runtime.includes(e))))!==canonicalDigest(sorted(expected))) throw new Error("declared read/write session boundary mismatch");
}
export function classifyDenial(code) { return ["EPERM", "EACCES"].includes(code) ? "pass" : code === "CONNECTED" ? "fail" : "unknown"; }
export function assertCanaryResult(result, {declaredRead = false} = {}) {
  const keys = (obj, names) => obj && typeof obj === "object" && !Array.isArray(obj) && canonicalDigest(Object.keys(obj).sort())===canonicalDigest(names.sort());
  if (!keys(result,["kind","filesystem","network"]) || !keys(result.filesystem,declaredRead ? ["read","write","unrelated_read","unrelated_write"] : ["read","write"])
    || result?.kind !== (declaredRead ? "ask_codex_canary_v2" : "ask_codex_canary_v1") || result.filesystem?.read !== "pass" || result.filesystem?.write !== "pass"
    || (declaredRead && (result.filesystem.unrelated_read!=="pass" || result.filesystem.unrelated_write!=="pass"))
    || !Array.isArray(result.network) || result.network.length !== 2 || result.network.some(x => !keys(x,["host","positive","denied"]) || !["127.0.0.1", "::1"].includes(x.host) || x.positive !== "pass" || x.denied !== "pass")
    || new Set(result.network.map(x => x.host)).size !== 2) throw new Error("canary failure/unknown; no real admission");
}
/** Trusted runtime parent, distinct from the nested model-tool policy.
 * General host reads permit OS loader startup; only the declared existing
 * CODEX_HOME is denied here. This is not personal-file isolation for the CLI.
 * Writes stay private; loopback enables positive controls in the parent. */
export function probeSeatbelt({ codexHome, home, workspace, canaries }) {
  const paths = [codexHome, home, workspace, ...canaries];
  if (paths.some(path => typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || path === "/")
    || [home, workspace, ...canaries].some(path => path === codexHome || path.startsWith(codexHome + "/"))) throw new Error("separate existing-home parent deny required");
  const literal = path => `(literal ${JSON.stringify(path)})`;
  const subpath = path => `(subpath ${JSON.stringify(path)})`;
  return `(version 1)(deny default)(allow process*)(allow sysctl-read)(allow mach-lookup)(allow file-read-metadata)`
    + `(allow file-read*)(deny file-read* ${subpath(codexHome)})`
    + `(allow file-write* ${subpath(home)} ${subpath(workspace)} ${canaries.map(literal).join(" ")} ${literal("/dev/null")})`
    + `(deny file-write* ${subpath(codexHome)})`
    + `(allow network* (local ip "localhost:*") (remote ip "localhost:*"))`
    + `(deny mach-lookup (global-name "com.apple.securityd") (global-name "com.apple.security.agent"))`;
}
/** Trusted controller supplies the expected, source-bound filesystem string.
 * Refuse malformed/missing policy before worker file/socket/CLI operations. */
export function assertProbeSandboxArgs(argv, { filesystem, declaredRead = false } = {}) {
  const refuse = () => { throw new Error("model-tool policy refused"); };
  if (!Array.isArray(argv) || argv.some(x => typeof x !== "string") || argv[0] !== "sandbox" || argv[1] !== "-P"
    || argv[2] !== "ask_synthetic_pilot" || argv[3] !== "--include-managed-config" || argv.at(-1) !== "--"
    || typeof filesystem !== "string" || !filesystem.startsWith(declaredRead ? 'permissions.ask_synthetic_pilot.filesystem={ ' : 'permissions.ask_synthetic_pilot.filesystem={ "/" = "deny", ')
    || (declaredRead && filesystem.includes('"/" = "deny"'))
    || !filesystem.endsWith('":workspace_roots" = "write" }')) refuse();
  const settings = new Map(); let index = 4;
  while (argv[index] === "-c") {
    const value = argv[index + 1]; if (typeof value !== "string" || !value.includes("=")) refuse();
    const key = value.slice(0, value.indexOf("="));
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/u.test(key) || settings.has(key)) refuse();
    settings.set(key, value); index += 2;
  }
  if (argv[index] !== "-C" || typeof argv[index + 1] !== "string" || !isAbsolute(argv[index + 1]) || index + 2 !== argv.length - 1
    || settings.get("permissions.ask_synthetic_pilot.filesystem") !== filesystem
    || settings.get("permissions.ask_synthetic_pilot.network.enabled") !== "permissions.ask_synthetic_pilot.network.enabled=false"
    || settings.get("default_permissions") !== 'default_permissions="ask_synthetic_pilot"'
    || (declaredRead && settings.get("permissions.ask_synthetic_pilot.extends") !== 'permissions.ask_synthetic_pilot.extends=":read-only"')
    || [...settings.keys()].some(key => key.startsWith("permissions.") && !["permissions.ask_synthetic_pilot.filesystem", "permissions.ask_synthetic_pilot.network.enabled", ...(declaredRead ? ["permissions.ask_synthetic_pilot.extends"] : [])].includes(key))) refuse();
}
