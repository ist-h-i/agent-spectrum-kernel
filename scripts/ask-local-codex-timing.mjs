import { parseJsonRejectDuplicateKeys } from "./content-addressed-store.mjs";

const NAMES = ["first_record", "task_started", "first_assistant_message", "first_tool_call",
  "last_tool_result", "answer_file_mtime", "final_response", "task_complete"];
/** Advisory only: never promotes process, identity, grading or usage outcomes. */
export function codexTrialTiming({ started, completed, session = null, answerMtimeMs = null }) {
  const start = Date.parse(started), end = Date.parse(completed);
  const unknown = reason => ({status:"unknown",timestamp:null,elapsed_ms:null,reason});
  const milestones = Object.fromEntries(NAMES.map(name => [name,unknown("not_observed")]));
  const result = {kind:"ask_local_codex_timing_v1",process_started:started,process_completed:completed,
    process_duration_ms:Number.isFinite(start) && Number.isFinite(end) && end>=start ? end-start : null,milestones};
  if (result.process_duration_ms === null) {
    for (const name of NAMES) milestones[name]=unknown("invalid_process_window");
    return result;
  }
  const observe = (name, value, last = false) => {
    const time = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(time) || time<start || time>end) {
      if (milestones[name].status !== "known") milestones[name]=unknown("invalid_or_outside_process_window");
      return;
    }
    if (milestones[name].status === "known" && (last ? time<=Date.parse(milestones[name].timestamp) : time>=Date.parse(milestones[name].timestamp))) return;
    milestones[name]={status:"known",timestamp:new Date(time).toISOString(),elapsed_ms:time-start,reason:null};
  };
  if (answerMtimeMs !== null) observe("answer_file_mtime",answerMtimeMs);
  if (session === null) return result;
  try {
    if (session.length>4*1024*1024) throw new Error("timing size limit");
    const rows = new TextDecoder("utf-8",{fatal:true}).decode(session).trimEnd().split("\n").map(parseJsonRejectDuplicateKeys);
    for (const row of rows) {
      const payload=row.payload ?? {}, stamp=row.timestamp;
      observe("first_record",stamp);
      if (row.type === "event_msg" && ["task_started","task_complete"].includes(payload.type)) observe(payload.type,stamp);
      if (row.type !== "response_item") continue;
      if (payload.type === "function_call") observe("first_tool_call",stamp);
      if (payload.type === "function_call_output") observe("last_tool_result",stamp,true);
      if (payload.type === "message" && payload.role === "assistant") {
        observe("first_assistant_message",stamp);
        if (payload.phase === "final_answer") observe("final_response",stamp);
      }
    }
  } catch {
    for (const name of NAMES.filter(name=>name!=="answer_file_mtime")) milestones[name]=unknown("invalid_session_timing");
  }
  return result;
}
