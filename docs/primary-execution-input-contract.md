# Prospective closed primary execution inputs

Artifact: SPEC-P24-EXECUTION-INPUT-CONTRACT, revision1. Upstream #379,
PR419 and the parent instruction to stop historical regrading and prepare new
nine-condition executions without host/secret/controller inputs. This is a
new opt-in preparation contract, not a modification of frozen task/scoring data.

## Problem and evidence

The existing exploratory comparison inherits ordinary Codex global configuration
and explicitly reports its instruction/Skill inventory as unknown. Saved high
P first read an absolute host Skill; K read AGENTS.md; F read a managed Skill.
The V9 source-owned public manifest contains task.md and workspace files only,
so complete capture correctly refuses those later reads. Old answers/results
stay nonformal/null; no posthoc allowlist or further regrading is permitted.

The harness must bind the task inputs and the condition's necessary, source-owned
public instruction assets separately. Global host instructions, credentials,
installer identity, controller/private data and unrelated management files are
not auxiliary task inputs. A prompt or inventory is not an OS access boundary.

## Contract and implementation boundary

Use the existing single-task preparation and inspection entry points. Add opt-in
primaryInputContract=closed_primary_inputs_v1 for authenticated public primary
recipes and single_shot_v1 only. Existing exploratory plans and prompts retain
their bytes/behavior when the option is absent. No new manager/runner is added.

The plan records a closed primary_execution_input contract with:

- Exact public fixture/manifest/verification recipe pins and per-file task bytes.
- Separate per-condition source-owned public instruction asset pins from the
  already frozen arm baseline. The existing preparer's sourceDistribution
  re-derives the exact Full path set (core immutable paths, full Codex projection,
  and classified reference supplement), not caller-supplied files. P has none;
  K has its source-generated AGENTS; F has those public ASK assets with closed
  asset kinds/origins. Public code classified runtime_dependency is distinct
  from runtime records. Installation
  identity and runtime/controller/secret surfaces are excluded from readable
  auxiliary inputs, even if harness-owned metadata exists elsewhere.
  Readback re-renders projected assets using the installer's own current-source
  renderers and checks actual baseline/arm bytes plus pins. Matching two forged
  metadata hashes does not establish source identity. The public source baseline
  is checked against the unchanged fixture bytes too. Source-owned arm/baseline
  locations are validated before any prepared-file read. Actual executable bits
  must match the source-owned non-executable input mode, not just the metadata.
- Model launch cwd arms/<condition>/workspace. Original task path names are
  explicitly relative to the arm root; workspace/foo refers to foo from this
  launch directory. Canonical arm paths never contain traversal; their fixed
  proposed cwd-relative rendering may be ../task.md or ../AGENTS.md, computed
  only for the declared input mapping and never a general parent-read allowance.
  Declared mutable work products have the same mapping (workspace/review.json
  to review.json). New outputs have no initial input digest; changed/generated
  work belongs to candidate edit/final-snapshot lineage, not external auxiliary
  inputs or fixed initial bytes. Exact public verification scripts execute in workspace
  with unchanged script bytes, rather than an agent-invented cd wrapper.
- A deterministic condition-specific stdin section listing permitted inputs, path bases, exact
  verification scripts, no host/global/parent/controller exploration and the
  need to stop/report unknown when required evidence is unavailable. Each actual
  condition stdin has separate pre-execution path/bytes/digest pins. P never
  receives F's asset inventory. Common task bytes stay unchanged.
- Required independent runtime observations: effective startup instruction/
  Skill discovery closure, initial CLI cwd and native tool command cwd,
  executable/runtime identity, raw command start/completion bytes and pairing,
  resolved model/effort, final candidate/source identity, and explicit failure/unknown states. No
  controller verification or model declaration substitutes for native evidence.

The current ordinary inherited CLI path has no qualified closed-discovery or
native cwd authority. The new opt-in plan therefore remains launch-blocked
before any model dispatch/start consumption. Inspection provides the concrete
proposed cwd/input contract and technical blockers. Caller booleans, a supplied
capture, synthetic fixtures or changed plan fields cannot authorize launch.
This preparation slice deliberately provides no runtime admission API. A later
independently reviewed source-bound runtime/capture connection is necessary;
it must not change authentication, CODEX_HOME, managed policy or permission
settings as a hidden implementation detail.

Dropping both selection fields while the prepared condition-input namespace
exists is refused as an orphaned-contract downgrade, even after rehashing plan
metadata. Ordinary old plans never have that namespace. Local self-digests are
integrity checks, not signatures against an owner who rewrites/deletes an entire
preparation. A different plan digest is not the previously confirmed identity;
future formal experiment admission must independently pin the closed contract
and plan rather than accepting a relabelled legacy experiment.

Full's current workflow can require excluded install-state metadata. That
dependency closure is unqualified, explicitly reported as an additional Full
blocker; the preparer does not invent a substitute, collect host metadata or
claim a fully functional equivalent Full condition. Future qualification must
resolve this definition/dependency without weakening the input boundary.
Current scoring/export preflight also refuses the new contract until a separate
reviewed processing version can bind its condition inputs and runtime evidence.

Public artificial native-capture fixtures document the required provenance
shape and reject missing/wrong cwd, changed script, incomplete/duplicate pair,
unbound host path and edits after verification. They establish contract behavior
only, with runtime attestation unknown and launch/quality authority false.
The supplied-segment inspector is not a native collector or full-session
normalizer: even complete command pairs do not attest startup discovery,
runtime identity, final snapshot, model resolution or isolation. It never opens
host/session files or executes the supplied command.

## Verification contract

Artifact: VERIFICATION-P24-EXECUTION-INPUT-CONTRACT. Formal verification path
(durable input/launch boundary, public plan API and failure provenance).

| ID | Observable condition |
|---|---|
| I1 | Existing plans unchanged; unknown contract/nonprimary/non-single-shot refused |
| I2 | Public fixture pins and per-condition auxiliary pins exact, stable and distinct |
| I3 | Host/absolute/traversal/secret/runtime/controller/installer state cannot become readable input |
| I4 | Proposed startup cwd/workspace path mapping and exact verification commands fixed before execution |
| I5 | Effective host discovery/native cwd remain unknown until genuine runtime proof; supplied labels never authorize launch |
| I6 | Requested closed-input start stops before CLI/marker; fake launch count0 |
| I7 | Artificial normal/boundary/unknown/unsafe provenance fixtures remain non-authoritative |

Tests cover pure canonical24 recipe/input contracts plus representative existing
preparer/inspector/fake start paths; no real model, Codex CLI, native qualifier,
private evaluator or historical regrade. Independent review is required before
publishing the new preparation contract. Existing96/88/202 V9 evidence is not
relabelled as evidence of this new behavior.

## Non-goals and remaining unknowns

No AGENTS/Skill collection from the host, no secret/config/session log import,
no auth copying/HOME switch/provider/billing change, no security or review-rule
override. Task/body/criteria and V8/V9 parser/scoring contracts stay frozen.
This slice neither makes new saved answers scoreable nor supplies missing
client/focused/performance native acceptance. Nine-condition formal graphs need
runtime admission, comparable model/repetition/usage policy and actual new data.

Official source consulted for the discovery limitation:
https://learn.chatgpt.com/docs/agent-configuration/agents-md and
https://learn.chatgpt.com/docs/config-file/config-reference (read2026-10-21).
Documented AGENTS discovery includes Codex-home guidance; project_doc_max_bytes
alone does not establish complete closed Skill/plugin/global instruction input.
No undocumented config switch is assumed to solve that boundary.
