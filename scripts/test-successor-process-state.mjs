// Test observation only. Does not send termination signals or change runner policy.
import { readFileSync } from "node:fs";

export function linuxProcessState(source, pid) {
  const prefix = `${pid} (`;
  const end = source.lastIndexOf(") ");
  if (!source.startsWith(prefix) || end < prefix.length || !/^[A-Za-z] /u.test(source.slice(end + 2))) {
    throw new Error("invalid Linux process stat identity/state");
  }
  return source[end + 2];
}

/** ESRCH and a Linux zombie both mean no executing child, but only ESRCH is reaped. */
export function inspectChildTermination(pid, {
  platform = process.platform,
  probe = value => process.kill(value, 0),
  readStat = value => readFileSync(`/proc/${value}/stat`, "utf8"),
} = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("invalid fake child PID");
  const absent = { state: "absent", execution_terminated: true, reaped: true };
  try { probe(pid); }
  catch (error) { if (error.code === "ESRCH") return absent; throw error; }
  if (platform === "linux") {
    let stat;
    try { stat = readStat(pid); }
    catch (error) {
      // The child may have been reaped between kill(0) and reading procfs.
      if (error.code !== "ENOENT") throw error;
      try { probe(pid); } catch (again) { if (again.code === "ESRCH") return absent; throw again; }
      throw new Error("child still exists but its Linux process state is unavailable");
    }
    if (linuxProcessState(stat, pid) === "Z") return { state: "zombie", execution_terminated: true, reaped: false };
  }
  return { state: "present", execution_terminated: false, reaped: false };
}
