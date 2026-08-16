import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("usage: validate-handoff.mjs <handoff.json>");

const handoff = JSON.parse(readFileSync(path, "utf8"));
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw new Error(`${label} fields are not closed`);
};
const string = (value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} is invalid`);
};
const stringArray = (value, label) => {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) throw new Error(`${label} is invalid`);
  for (const item of value) string(item, label);
};
const traffic = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) throw new Error(`${label} is invalid`);
  for (const [key, percentage] of Object.entries(value)) {
    string(key, label);
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) throw new Error(`${label} percentage is invalid`);
  }
  if (Object.values(value).reduce((sum, percentage) => sum + percentage, 0) !== 100) throw new Error(`${label} must total 100`);
};

exactKeys(handoff, ["current_state", "safe_next_action", "resume_gate", "rollback", "continuation"], "handoff");
exactKeys(handoff.current_state, ["phase", "last_completed_batch", "next_batch", "cursor", "write_traffic", "read_traffic", "blocking_condition_ids"], "current_state");
string(handoff.current_state.phase, "current_state phase");
for (const field of ["last_completed_batch", "next_batch", "cursor"]) if (!Number.isInteger(handoff.current_state[field]) || handoff.current_state[field] < 0) throw new Error(`current_state ${field} is invalid`);
traffic(handoff.current_state.write_traffic, "write_traffic");
traffic(handoff.current_state.read_traffic, "read_traffic");
stringArray(handoff.current_state.blocking_condition_ids, "blocking_condition_ids");

exactKeys(handoff.safe_next_action, ["command_id", "mode", "owner", "required_evidence_ids"], "safe_next_action");
string(handoff.safe_next_action.command_id, "safe_next_action command_id");
if (!new Set(["read_only", "write"]).has(handoff.safe_next_action.mode)) throw new Error("safe_next_action mode is invalid");
string(handoff.safe_next_action.owner, "safe_next_action owner");
stringArray(handoff.safe_next_action.required_evidence_ids, "safe_next_action required_evidence_ids");

exactKeys(handoff.resume_gate, ["approval_role", "required_condition_ids"], "resume_gate");
string(handoff.resume_gate.approval_role, "resume_gate approval_role");
stringArray(handoff.resume_gate.required_condition_ids, "resume_gate required_condition_ids");

exactKeys(handoff.rollback, ["supported_action_ids", "forbidden_action_ids", "data_preservation"], "rollback");
stringArray(handoff.rollback.supported_action_ids, "rollback supported_action_ids");
stringArray(handoff.rollback.forbidden_action_ids, "rollback forbidden_action_ids");
string(handoff.rollback.data_preservation, "rollback data_preservation");

exactKeys(handoff.continuation, ["stop_condition_ids", "verification_states", "evidence_references", "open_questions"], "continuation");
stringArray(handoff.continuation.stop_condition_ids, "continuation stop_condition_ids");
stringArray(handoff.continuation.evidence_references, "continuation evidence_references");
stringArray(handoff.continuation.open_questions, "continuation open_questions");
if (!Array.isArray(handoff.continuation.verification_states) || handoff.continuation.verification_states.length === 0) throw new Error("continuation verification_states is invalid");
for (const verification of handoff.continuation.verification_states) {
  exactKeys(verification, ["verification_id", "state"], "verification state");
  string(verification.verification_id, "verification_id");
  if (!new Set(["passed", "failed", "not_run"]).has(verification.state)) throw new Error("verification state is invalid");
}

console.log(JSON.stringify({ validation: "pass", verification_states: handoff.continuation.verification_states.length }));
