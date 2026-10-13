import { canonicalDigest } from "./content-addressed-store.mjs";

const INPUT_KEYS = ["observation_id", "repository_id", "task_ids", "evidence_refs", "evidence_status", "correction",
  "intended_mechanism", "applicability", "non_applicability", "privacy"];
const META_KEYS = ["schema_version", "object_kind", "authority_implied", "effectiveness_status", "observation_digest"];
const STATUSES = new Set(["Verified", "Supported", "Hypothesis", "Unknown", "Falsified"]);
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u;
// Accidental disclosure checks are an aid; they do not authenticate privacy.
const SENSITIVE = /(?:\b(?:token|secret|password|credential)[\w-]*\s*=|\/(?:Users|home|private|var\/folders)\/|file:\/\/)/iu;
const equal = (a, b) => canonicalDigest(a) === canonicalDigest(b);

export function assertPersonalEvolutionFields(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be a JSON object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) throw new Error(`${label} has missing or unknown fields`);
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048 || SENSITIVE.test(value)) throw new Error(`${label} is not a bounded public summary`);
}
function id(value, label) {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} is not a bounded ID`);
}
function nonemptySet(values, check, label) {
  if (!Array.isArray(values) || !values.length || values.length > 32 || new Set(values).size !== values.length) throw new Error(`${label} must be a bounded unique nonempty set`);
  values.forEach(value => check(value, label));
}
function validateInput(input) {
  assertPersonalEvolutionFields(input, INPUT_KEYS, "personal observation");
  id(input.observation_id, "observation ID"); id(input.repository_id, "repository ID");
  nonemptySet(input.task_ids, id, "observed task IDs");
  nonemptySet(input.non_applicability, text, "non-applicability conditions");
  for (const key of ["correction", "intended_mechanism", "applicability"]) text(input[key], key);
  if (!STATUSES.has(input.evidence_status)) throw new Error("observation evidence status is unknown vocabulary");
  if (!Array.isArray(input.evidence_refs) || !input.evidence_refs.length || input.evidence_refs.length > 32) throw new Error("bounded observation evidence is required");
  const ids = new Set();
  for (const entry of input.evidence_refs) {
    assertPersonalEvolutionFields(entry, ["artifact_id", "digest"], "observation evidence ref");
    id(entry.artifact_id, "evidence artifact ID");
    if (!DIGEST.test(entry.digest) || ids.has(entry.artifact_id)) throw new Error("invalid or ambiguous evidence ref");
    ids.add(entry.artifact_id);
  }
  assertPersonalEvolutionFields(input.privacy, ["classification", "raw_content_retained", "private_answers_retained"], "observation privacy declaration");
  if (input.privacy.classification !== "public_summary" || input.privacy.raw_content_retained !== false || input.privacy.private_answers_retained !== false) throw new Error("observation requires a caller-reviewed public summary");
}

export function freezePersonalEvolutionValue(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezePersonalEvolutionValue); Object.freeze(value);
  }
  return value;
}

export function buildPersonalEvolutionObservation(input) {
  validateInput(input);
  const value = structuredClone(input);
  value.task_ids.sort(); value.non_applicability.sort();
  value.evidence_refs.sort((a, b) => a.artifact_id < b.artifact_id ? -1 : a.artifact_id > b.artifact_id ? 1 : 0);
  const body = { schema_version: "1.0.0", object_kind: "personal_evolution_observation", ...value,
    authority_implied: false, effectiveness_status: "Unknown" };
  return freezePersonalEvolutionValue({ ...body, observation_digest: canonicalDigest(body) });
}

export function validatePersonalEvolutionObservation(value) {
  assertPersonalEvolutionFields(value, [...INPUT_KEYS, ...META_KEYS], "saved personal observation");
  const input = Object.fromEntries(INPUT_KEYS.map(key => [key, value[key]]));
  if (!equal(buildPersonalEvolutionObservation(input), value)) throw new Error("personal observation bytes or digest drifted");
  return value;
}
