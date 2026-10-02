// Invoked only inside the admitted Mac parent guard. Never reads credentials.
import { openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, createConnection } from "node:net";
import { spawn } from "node:child_process";
import { classifyDenial, assertProbeSandboxArgs } from "./ask-local-codex-boundaries.mjs";

const connect = ({host, port}) => new Promise(resolve => {
  const socket = createConnection({host, port});
  const done = code => { socket.destroy(); resolve(code); };
  socket.once("connect", () => done("CONNECTED")); socket.once("error", e => done(e.code));
  socket.setTimeout(1500, () => done("TIMEOUT"));
});
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
  return {kind: "ask_codex_canary_v1", filesystem: {read, write}, network};
}
async function guarded(spec) {
  try { assertProbeSandboxArgs(spec.argv,{filesystem:spec.filesystem}); }
  catch { process.stderr.write("model-tool policy refused\n"); process.exitCode=6; return; }
  const servers = [], endpoints = [];
  try {
    // Positive filesystem controls in the same outer guard prevent mistaking
    // the parent's restriction for enforcement by the nested CLI profile.
    for (const path of spec.canary.deniedReads) { const fd=openSync(path,"r"); closeSync(fd); }
    { const fd=openSync(spec.canary.deniedWrite,"r+"); closeSync(fd); }
    for (const host of ["127.0.0.1", "::1"]) {
      const server = createServer(socket => socket.end()); servers.push(server);
      await new Promise((resolve,reject) => { server.once("error", reject); server.listen({host, port:0}, resolve); });
      const endpoint = {host, port:server.address().port};
      if (await connect(endpoint) !== "CONNECTED") throw new Error("positive loopback unknown");
      endpoints.push(endpoint);
    }
    const argv = [...spec.argv, spec.node, spec.worker, "canary", JSON.stringify({...spec.canary, endpoints})];
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
if (process.argv[2] === "canary") process.stdout.write(JSON.stringify(await canary(JSON.parse(process.argv[3])))+"\n");
else if (process.argv[2] === "guarded") await guarded(JSON.parse(process.argv[3]));
else { process.stderr.write("closed probe worker mode required\n"); process.exitCode=2; }
