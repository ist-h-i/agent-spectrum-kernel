// Ordinary trusted worker launches one model-tool sandbox. Never reads credentials.
import { openSync, closeSync, readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { createServer, createConnection } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDenial, assertProbeSandboxArgs } from "./ask-local-codex-boundaries.mjs";

const connect = ({host, port}) => new Promise(resolve => {
  const socket = createConnection({host, port});
  const done = code => { socket.destroy(); resolve(code); };
  socket.once("connect", () => done("CONNECTED")); socket.once("error", e => done(e.code));
  socket.setTimeout(1500, () => done("TIMEOUT"));
});
// Message recognition only, not proof of an OS denial or a root cause.
// Match a single complete C-locale message, never persist captures or raw text.
export function classifyShellStderr(value) {
  if (value === "") return "empty";
  if (typeof value !== "string" || value.length > 256 * 1024) return "unknown";
  if (/^zsh:(?:[0-9]+:)? can't create temp file for here document: (?:permission denied|operation not permitted)\n?(?![\s\S])/u.test(value)) return "temporary_file_denial_message";
  if (/^zsh:(?:[0-9]+:)? command not found: cat\n?(?![\s\S])/u.test(value)) return "command_not_found_message";
  return "unknown";
}
async function canary(spec) {
  let read = "pass", write = "pass";
  if (readFileSync(spec.publicFile, "utf8") !== "ASK_PUBLIC_CANARY\n") read = "fail";
  writeFileSync(spec.allowedWrite, "ASK_WRITE_CANARY\n", { flag: "wx", mode: 0o600 });
  for (const path of spec.deniedReads) {
    try { const fd = openSync(path, "r"); closeSync(fd); read = "fail"; }
    catch (e) { if (classifyDenial(e.code) !== "pass") read = "unknown"; }
  }
  try { const fd = openSync(spec.deniedWrite, "r+"); closeSync(fd); write = "fail"; }
  catch (e) { write = classifyDenial(e.code); }
  const network = [];
  for (const endpoint of spec.endpoints) network.push({host: endpoint.host, positive: "pass", denied: classifyDenial(await connect(endpoint))});
  const filesystem={read,write};
  let temporaryDiagnostics;
  if (spec.temporaryDirectory) {
    // Closed metadata only: never persist raw shell output, messages or paths.
    const codes=["EPERM","EACCES","ENOENT","EINVAL","EIO","ENOSPC","ENOMEM","E2BIG","ETIMEDOUT","ENOBUFS","EAGAIN","EMFILE","ENFILE","ENOTDIR","EEXIST","ENOTEMPTY"];
    const signals=["SIGTERM","SIGKILL","SIGABRT","SIGSEGV","SIGBUS","SIGINT","SIGHUP","SIGPIPE","SIGQUIT","SIGILL","SIGTRAP","SIGALRM","SIGXCPU","SIGXFSZ"];
    const code = error => error == null ? null : codes.includes(error.code) ? error.code : "OTHER";
    const stream = value => typeof value === "string" ? {bytes:Buffer.byteLength(value,"utf8"),digest:"sha256:"+createHash("sha256").update(value,"utf8").digest("hex")} : {bytes:null,digest:null};
    const stages=Object.fromEntries(["environment","directory","write","read","shell","cleanup"].map(stage=>[stage,"not_started"]));
    temporaryDiagnostics={stages,failure_stage:null,error_code:null,cleanup_error_code:null,shell:null};
    filesystem.temporary="unknown";
    let directory = null, file = null, stage="environment";
    try {
      if (!["TMPDIR","TMP","TEMP"].every(key=>process.env[key]===spec.temporaryDirectory)) throw new Error("temporary environment mismatch");
      stages.environment="pass";stage="directory";
      directory=mkdtempSync(spec.temporaryDirectory+"/canary-");stages.directory="pass";
      file=directory+"/roundtrip.txt";stage="write";
      writeFileSync(file,"ASK_TEMP_CANARY\n",{flag:"wx",mode:0o600});stages.write="pass";stage="read";
      if (readFileSync(file,"utf8")!=="ASK_TEMP_CANARY\n") throw new Error("temporary roundtrip mismatch");
      stages.read="pass";stage="shell";
      const body="ASK_TEMP_CANARY".repeat(8192)+"\n";
      const heredoc=`cat <<'ASK_TEMP_END'\n${body}ASK_TEMP_END\n`;
      // zsh uses TMPPREFIX for heredocs. Keep paths as argv data, after startup files.
      const shellArgs=spec.shell==="/bin/zsh"
        ? ["-c",`TMPPREFIX="$1" || exit 1\n${heredoc}`,"ask-canary",directory+"/zsh"]
        : ["-c",heredoc];
      const shell=spawnSync(spec.shell,shellArgs,
        {env:process.env,encoding:"utf8",timeout:2000,maxBuffer:256*1024});
      const checks={exit_zero:shell.status===0,no_error:!shell.error,no_signal:!shell.signal,stdout_matches:shell.stdout===body,stderr_empty:shell.stderr===""};
      temporaryDiagnostics.shell={status:Number.isInteger(shell.status)&&shell.status>=0&&shell.status<=255?shell.status:null,
        error_code:code(shell.error),signal:shell.signal==null?null:signals.includes(shell.signal)?shell.signal:"OTHER",
        stdout:stream(shell.stdout),stderr:stream(shell.stderr),stderr_classification:classifyShellStderr(shell.stderr),checks};
      filesystem.temporary=Object.values(checks).every(Boolean) ? "pass" : "fail";
      stages.shell=filesystem.temporary;
      if(filesystem.temporary!=="pass")temporaryDiagnostics.failure_stage="shell";
    } catch(error) {
      filesystem.temporary="unknown";stages[stage]="unknown";
      temporaryDiagnostics.failure_stage=stage;temporaryDiagnostics.error_code=code(error);
    } finally {
      try {
        if(file)unlinkSync(file);if(directory)rmdirSync(directory);
        if(file||directory)stages.cleanup="pass";
      } catch(error) {
        filesystem.temporary="unknown";stages.cleanup="unknown";
        temporaryDiagnostics.failure_stage??="cleanup";temporaryDiagnostics.cleanup_error_code=code(error);
      }
    }
  }
  if(spec.unrelatedFile) {
    try { filesystem.unrelated_read=readFileSync(spec.unrelatedFile,"utf8")==="ASK_UNRELATED_CANARY\n" ? "pass" : "fail"; }
    catch { filesystem.unrelated_read="unknown"; }
    try { const fd=openSync(spec.unrelatedFile,"r+"); closeSync(fd); filesystem.unrelated_write="fail"; }
    catch(e) { filesystem.unrelated_write=classifyDenial(e.code); }
  }
  return {kind:spec.temporaryDirectory ? "ask_codex_canary_v5" : spec.unrelatedFile ? "ask_codex_canary_v2" : "ask_codex_canary_v1",filesystem,network,...(temporaryDiagnostics ? {temporary_diagnostics:temporaryDiagnostics} : {})};
}
// Node resolves script entry points through their ancestors before reading the
// file. An explicit helper-file read cannot traverse a denied controller root.
// Inline ESM uses only builtins, retaining every deny without a helper exception.
export const INLINE_CANARY_MODULE_SOURCE = [
  'import { openSync, closeSync, readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";',
  'import { createHash } from "node:crypto";',
  'import { Buffer } from "node:buffer";',
  'import { spawnSync } from "node:child_process";',
  'import { createConnection } from "node:net";',
  classifyDenial.toString(), classifyShellStderr.toString().replace("export ",""), `const connect = ${connect.toString()};`, canary.toString(),
  'process.stdout.write(JSON.stringify(await canary(JSON.parse(process.argv[1])))+"\\n");',
].join("\n");
export function controlCanaryArguments(spec, endpoints) {
  return [...spec.argv, spec.node, "--input-type=module", "--eval", INLINE_CANARY_MODULE_SOURCE,
    JSON.stringify({...spec.canary, endpoints})];
}
async function guarded(spec) {
  try { assertProbeSandboxArgs(spec.argv,{filesystem:spec.filesystem,declaredRead:spec.declaredRead===true}); }
  catch { process.stderr.write("model-tool policy refused\n"); process.exitCode=6; return; }
  const servers = [], endpoints = [];
  try {
    // Positive controls in the ordinary trusted parent distinguish actual
    // model-tool denial from missing files or unavailable loopback sockets.
    for (const path of [...spec.canary.deniedReads,...(spec.canary.unrelatedFile ? [spec.canary.unrelatedFile] : [])]) { const fd=openSync(path,"r"); closeSync(fd); }
    { const fd=openSync(spec.canary.deniedWrite,"r+"); closeSync(fd); }
    if(spec.canary.unrelatedFile) { const fd=openSync(spec.canary.unrelatedFile,"r+");closeSync(fd); }
    for (const host of ["127.0.0.1", "::1"]) {
      const server = createServer(socket => socket.end()); servers.push(server);
      await new Promise((resolve,reject) => { server.once("error", reject); server.listen({host, port:0}, resolve); });
      const endpoint = {host, port:server.address().port};
      if (await connect(endpoint) !== "CONNECTED") throw new Error("positive loopback unknown");
      endpoints.push(endpoint);
    }
    const argv = controlCanaryArguments(spec, endpoints);
    const child = spawn(spec.cli, argv, {env:process.env, cwd:spec.cwd, stdio:["ignore","pipe","pipe"]});
    let count=0;
    for (const stream of [child.stdout,child.stderr]) stream.on("data", data => {
      count += data.length; if (count > 1048576) child.kill("SIGKILL");
      else (stream === child.stdout ? process.stdout : process.stderr).write(data);
    });
    child.once("error", () => { process.exitCode=6; });
    await new Promise(resolve => child.once("close", (code, signal) => { process.exitCode=signal ? 7 : code ?? 6; resolve(); }));
  } catch { process.stderr.write("probe positive/transport unknown\n"); process.exitCode=6; }
  finally { for (const server of servers) server.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "canary") process.stdout.write(JSON.stringify(await canary(JSON.parse(process.argv[3])))+"\n");
  else if (process.argv[2] === "guarded") await guarded(JSON.parse(process.argv[3]));
  else { process.stderr.write("closed probe worker mode required\n"); process.exitCode=2; }
}
