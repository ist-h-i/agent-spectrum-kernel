import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const path = process.argv[2];
if (!path) throw new Error("usage: validate-handoff.mjs <handoff.json>");

const handoff = JSON.parse(readFileSync(path, "utf8"));
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(readFileSync(resolve(workspace, "state/handoff-policy.json"), "utf8"));
const commands = JSON.parse(readFileSync(resolve(workspace, "operations/commands.json"), "utf8")).commands;
const evidenceIds = new Set([
  JSON.parse(readFileSync(resolve(workspace, "evidence/batch-42-verification.json"), "utf8")).evidence_id,
  JSON.parse(readFileSync(resolve(workspace, "state/compatibility-matrix.json"), "utf8")).evidence_id,
]);
function suppliedReference(value) {
  if (evidenceIds.has(value)) return true;
  if (typeof value !== "string" || value.trim() !== value || isAbsolute(value) || value.includes("\\")) return false;
  const normalized = value.replace(/^\.\//u, "").replace(/^workspace\//u, "");
  if (!normalized || normalized === "handoff.json" || normalized.split("/").some((part) => !part || part === "." || part === "..")) return false;
  const absolute = resolve(workspace, normalized);
  return existsSync(absolute) && realpathSync(absolute) === absolute && lstatSync(absolute).isFile();
}
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
for (const field of ["last_completed_batch", "cursor"]) if (!Number.isInteger(handoff.current_state[field]) || handoff.current_state[field] < 0) throw new Error(`current_state ${field} is invalid`);
if (!Number.isInteger(handoff.current_state.next_batch) || handoff.current_state.next_batch < 1) throw new Error("current_state next_batch is invalid");
traffic(handoff.current_state.write_traffic, "write_traffic");
traffic(handoff.current_state.read_traffic, "read_traffic");
stringArray(handoff.current_state.blocking_condition_ids, "blocking_condition_ids");

exactKeys(handoff.safe_next_action, ["command_id", "mode", "owner", "required_evidence_ids"], "safe_next_action");
string(handoff.safe_next_action.command_id, "safe_next_action command_id");
if (!new Set(["read_only", "write"]).has(handoff.safe_next_action.mode)) throw new Error("safe_next_action mode is invalid");
string(handoff.safe_next_action.owner, "safe_next_action owner");
stringArray(handoff.safe_next_action.required_evidence_ids, "safe_next_action required_evidence_ids");
const command = commands.find(({ command_id }) => command_id === handoff.safe_next_action.command_id);
if (!command || command.mode !== handoff.safe_next_action.mode || command.owner !== handoff.safe_next_action.owner) throw new Error("next action does not reference a supplied command, mode, and owner");
if (!handoff.safe_next_action.required_evidence_ids.every((id) => evidenceIds.has(id))) throw new Error("next action evidence IDs are not supplied");

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
if (!handoff.continuation.evidence_references.every(suppliedReference)) throw new Error("continuation evidence references are not supplied");
stringArray(handoff.continuation.open_questions, "continuation open_questions");
if (!Array.isArray(handoff.continuation.verification_states) || handoff.continuation.verification_states.length === 0) throw new Error("continuation verification_states is invalid");
const verificationIds = [];
for (const verification of handoff.continuation.verification_states) {
  exactKeys(verification, ["verification_id", "state"], "verification state");
  string(verification.verification_id, "verification_id");
  if (!new Set(["passed", "failed", "not_run"]).has(verification.state)) throw new Error("verification state is invalid");
  verificationIds.push(verification.verification_id);
}
if (new Set(verificationIds).size !== verificationIds.length) throw new Error("verification IDs must be unique");
const expectedVerificationIds = [...policy.verification_ids].sort();
if (verificationIds.length !== expectedVerificationIds.length || verificationIds.slice().sort().some((id, index) => id !== expectedVerificationIds[index])) throw new Error("verification IDs must exactly match the supplied policy inventory");

console.log(JSON.stringify({ validation: "pass", verification_states: handoff.continuation.verification_states.length }));
