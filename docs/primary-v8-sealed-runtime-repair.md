# Prospective V8 sealed validation and verification environment repair

Artifact ID: `SPEC-P24-V8-SEALED-RUNTIME-REPAIR`, revision 1, provisional.
Upstream: #379, `primary-24-private-v2.md`, `primary-24-unsafe-action-v8.md`.

A new three-condition run obtained all three responses, but its first private
grading stopped before any worker started. Graph construction classified V8
schemas and the schema generator as authority data; sealed byte validation
recognized schemas only through V7. The read-only diagnostic reproduced the
first V8 schema failure. Adding only schemas would still reject the generator.

Graph construction and sealed validation now consume the same closed
processing-revision mapping. V8 adds exactly its eight schemas and its
build-time generator. Other JavaScript modules keep their module type; no
descriptor-provided type authorizes itself, and source bytes, hashes, paths,
external authority and private-import restrictions remain required. Existing
v1–v7 interpretation is preserved.

The controller's public verification also removed HOME before starting the
fixture's canonical login shell. On the observed Mac this produced brew's
missing-HOME error and selected Node 22.4.1, despite the controller running
Node 24.19.0. Shell fixture verification now retains ordinary HOME, alongside
the existing sanitized PATH/locale/Git settings. It does not copy the entire
environment or inherit API keys, CODEX_HOME, NODE_OPTIONS, BASH_ENV or ENV.
Direct Node verification retains its previous no-HOME environment.

The request records the environment policy and a digest of the supplied
environment, without its raw values. Runtime metadata explicitly identifies
the controller's Node and leaves the shell's resolved Node unknown. Keeping
HOME restores ordinary shell startup resolution; it is not a guarantee of a
particular Node version on every machine. Login startup files and user npm
configuration may apply. Verification is already ordinary repository code
execution, not an OS security sandbox or credential-isolation guarantee.
No global configuration, authentication, permissions or startup files change.

## Formal Verification Contract

Artifact ID: `VERIFICATION-P24-V8-SEALED-RUNTIME-REPAIR`.
Proof path: formal_verification_contract under
`ask.verification-proof-policy@1.0.0`, for reproduction/regression,
cross-module evidence contracts and durable handoff. Existing formal proof
is retained; no compact downgrade applies.

| Item | Required observable proof |
|---|---|
| P24SR-ROUNDTRIP | v1–v8 generated graphs pass actual sealed byte validation |
| P24SR-TYPE | Every V8 schema and generator has the required type; type substitutions fail; runtime modules do not become authority data |
| P24SR-COMPAT | Previous source selection, fresh import order, root/revision/lifetime guards remain valid |
| P24SR-ENV | Canonical shell argv is unchanged; HOME survives the narrow environment; credential/startup-injection variables do not |
| P24SR-RUNTIME | Controller Node metadata does not assert shell Node resolution; new local supplemental shell readback records the observed version |
| P24SR-PROVENANCE | Prior run, producer, failed grade, old private bundles and public results remain untouched |

Tests extend the existing `test-ask-primary-processing-source.mjs` public-only
byte roundtrip and `test-ask-primary-fixture-recipe.mjs` fake transport, with
the existing user comparison regressions. They do not start a model or a
private evaluator. A new local supplemental `bash -lc` readback with the fixed
environment observed Node v24.19.0, exit0 and empty stderr; it does not replace
the saved run's Node 22 verification evidence.

## New authority and existing response reuse

This changes processing-pinned source. A new source/resource/version and its
independent review/admission must precede selection. Do not edit a frozen
bundle or patch the old selector to make its saved run pass. The old grading
attempt stays blocked/null, including its partial sealed directory.

The existing grading API separates the saved comparison plan/source/task and
verification digests from the explicitly selected grading version. Therefore
preserved responses need not be discarded: a separately authorized offline
evaluation can use a derived block's grading pins, a fresh producer and fresh
private/public output roots, after the new authority is validated. It must
retain the original run and label the output as a new derived evaluation,
not overwrite or relabel the old result. This is a source-level available
route, not a performed or accepted re-evaluation. Full catalog resource
inventory and all existing provenance checks still apply.
The derived block retains the original comparison root, run_id, plan_digest,
source/task/verification digests and saved responses. Only the separately
versioned grading selection/binding and fresh grading destinations differ;
it does not invent a new execution identity or edit the old selector.

Whether that route is suitable for the intended formal comparison depends on
the retained agent-native command evidence, actual model/runtime identity,
task/ASK version and the experiment's declared policy. Controller Node 22
alone does not prove that the model's command used Node 22, or that the
responses are incorrect. A supplemental verification can assess the saved
output, but cannot retrospectively change the original process runtime,
time, tokens or missing resolved-model evidence. A new model run is needed
when those missing execution facts are mandatory comparison conditions;
no model rerun or grading retry is started by this repair.

GitHub operations and publication remain pending separate user confirmation.
