# Lifecycle Traceability Contract

This contract adds an optional, file-portable trace chain across lifecycle artifacts. It supplements `docs/lifecycle-artifact-contract.md`; it does not change artifact ownership, copy upstream content, or introduce a workflow engine.

## Activation rule

Create trace links only when they are needed to support a current completion, merge, or release-readiness claim. A missing link is `insufficient evidence` only when that claim depends on it.

Trivial or localized changes are exempt only from creating a lifecycle trace chain. The exemption never waives approval, rollback, release evidence, review gates, or `risk-gate`.

An exemption is not established by a `trivial` label or reason alone. It requires observed facts with evidence for `localized_scope`, `no_claim`, and `no_required_gate`. Any completion, merge, or release claim, or any security, permission, deployment, production, migration, or other required gate, makes the exemption invalid. Record the evidence-backed exemption only when a consumer needs to know why no chain exists; otherwise create no traceability artifact.

## Stable reference model

Every reference points to an artifact and, when the claim needs item-level precision, a stable item inside it:

```text
artifact reference: ARTIFACT-ID@observed-revision
item reference: ARTIFACT-ID@observed-revision#ITEM-ID
```

The portable structured form is:

```json
{
  "artifact_id": "SPEC-CSV",
  "item_id": "AC-ESCAPE-COMMAS",
  "observed_revision": 2
}
```

- `artifact_id` identifies the stable logical artifact. It is neither an item ID nor a revision-specific ID.
- `item_id` is stable inside the artifact and is never reused for a different meaning.
- `revision` is a separate positive integer field on a trace-enabled artifact. It is not embedded in `artifact_id`.
- `observed_revision` records the revision used by the consumer. Increment the artifact revision when an item's meaning, status, or membership changes.
- A reference is stale when its `observed_revision` differs from the current artifact revision. A stale reference cannot support a current claim until it is re-evaluated.
- File paths, URLs, commit SHAs, CI run IDs, or issue comments may be evidence locators, but they do not replace the stable artifact or item ID.

`upstream_refs` remains the canonical artifact-dependency field from `docs/lifecycle-artifact-contract.md`; traceability does not create a competing dependency field. When traceability is active for an artifact, every `upstream_refs` entry and every claim ref uses the structured form above, `observed_revision` is mandatory, and structured and unversioned refs must not be mixed. Revision omission is invalid. An unversioned artifact-ID string remains compatible only on a lifecycle artifact that is outside a trace-enabled chain.

Claim fields such as `subject_refs`, `evidence_refs`, `blocker_refs`, `accepted_risk_refs`, and `required_refs[].item_ref` are typed uses of the same structured reference. They map a claim; they do not replace `upstream_refs`.

Exact support edges are item-level. An item may define `upstream_refs`, and reachability nodes are the collision-free tuple `[artifact_id, revision, item_id]`, not a delimiter-concatenated string or an artifact ID. An Evidence artifact with exactly one evidence item may use its artifact-level `upstream_refs` as that sole item's support edges for compact compatibility. An Evidence artifact with multiple items must define `upstream_refs` on each evidence item; artifact-level refs never let one evidence item inherit another item's support.

Every one of those fields uses the same resolver rules: the ref must be an object with a non-empty `artifact_id`, a positive integer `observed_revision`, and a non-empty `item_id` where an item is required. String refs are invalid. A malformed required ref is a structural error, not an evidence gap.

Canonical item kinds:

| Artifact | Stable item kinds |
|---|---|
| Requirement | `decision` |
| Spec | `behavior`, `acceptance` |
| Work Package | `task` |
| Verification | `obligation` |
| Implementation | `change` |
| Evidence record | `evidence` |
| Review | `decision`, `blocker`, `accepted_risk` |
| Release Readiness | `check`, `approval`, `rollback` |

An accepted-risk item must record `accepted_by` and `accepted_stage`. Approval evidence remains a referenceable item; it is not inferred from a lack of objections.

## Propagation and delta rules

- Requirement, Spec, Work Package, Verification, and Implementation artifacts keep the ownership rules in `docs/lifecycle-artifact-contract.md`.
- Downstream artifacts add `upstream_refs` or item refs without copying unchanged fields.
- A changed assumption, acceptance condition, scope boundary, or proof obligation remains a lifecycle `delta`. Trace links point to the resulting current item; they do not encode a second delta mechanism.
- Review records reference the implementation changes, verification evidence, acceptance conditions, blockers, and accepted risks relevant to the merge claim.
- Release Readiness records reference the reviewed change set plus exact unresolved acceptance, verification, review, approval, or rollback items relevant to the release claim. A claim-required `review` ref points to a review `decision`; blockers and accepted risks remain in their dedicated ref lists.
- The shared Execution Envelope may list stable refs under `evidence_status` and `stop_reason`, but it does not own or duplicate the referenced content.

## Claim record

A claim is a small mapping record, not another lifecycle artifact:

```text
Claim:
- Claim ID:
- Claim type: completion | merge | release
- Status: supported | blocked | insufficient_evidence
- Subject refs:
- Evidence refs:
- Blocker refs:
- Accepted-risk refs:
- Applicable gap types:
- Not-applicable gap types:
- Not-applicable reasons: gap type / reason / evidence
- Required refs: gap type plus expected item ref
- Supersedes claim refs:
```

Rules:

- Each claim classifies every allowed gap type as applicable or not applicable. Applicable types require an exact expected item ref; every not-applicable type requires a reason and evidence. This is how a partial chain is distinguished from an insufficient chain without allowing silent or self-serving omission.
- Completion classifies `acceptance` and `verification`; merge classifies `implementation` and `review`; release classifies `acceptance`, `verification`, `review`, `approval`, and `rollback`.
- `supported` requires at least one current evidence ref, every applicable required ref to resolve at its observed revision, and no unresolved blocker ref.
- For `acceptance` and `verification`, at least one claim evidence ref must reach the exact required item by following current `upstream_refs`. Merely listing unrelated current refs in the same claim does not establish support.
- Completion subjects are Spec `behavior` / `acceptance` items or Work Package `task` items. Merge subjects are Implementation `change` items. Release subjects are Release Readiness `check` items.
- Every resolved required ref must be the same item as, or have a valid item-level trace relationship to, at least one subject. Every subject must likewise connect to at least one resolved required ref.
- Every blocker ref and accepted-risk ref must connect to at least one subject; type correctness alone does not establish claim scope.
- The Release Readiness sibling exception applies only when a Release Readiness `check` subject and an `approval` or `rollback` required item belong to the same Release Readiness artifact. It never connects an unrelated review decision, blocker, accepted risk, or other item kind.
- `blocked` requires exact blocker refs, and every blocker ref resolves to a `review` artifact item whose kind is `blocker`.
- `insufficient_evidence` emits one structured gap for every missing, stale, or wrong-kind required ref. It names the expected ref; it does not synthesize the absent artifact.
- If an applicable gap type has no `required_refs` entry, the claim is structurally invalid. It must not emit `missing_item_ref: undeclared` or pass as ordinary insufficient evidence.
- Two claims about the same type and subjects with incompatible statuses are contradictory unless the later claim lists every displaced claim in `supersedes_claim_refs`.
- A complete chain is evidence of trace coverage, not proof of business correctness.

Structured gaps use this portable shape:

```text
- gap_type: acceptance | verification | implementation | review | approval | rollback
- required_by_claim: claim ID
- missing_item_ref: expected structured item ref
- stage: completion | review | release
```

A Release Readiness report uses only the five release gap types: `acceptance`, `verification`, `review`, `approval`, and `rollback`. It must preserve each type rather than collapsing all failures into a generic missing-reference message.

## Claim-dependent sufficiency

Use the smallest mapping needed for the current question:

| Question | Required links |
|---|---|
| Which evidence supports completion? | completion claim -> behavior/acceptance or task subjects -> verification evidence |
| Which acceptance remains unverified? | completion or merge claim -> acceptance ref -> obligation/evidence, or the acceptance ref under missing required refs |
| Which blocker prevents merge? | merge claim -> review blocker ref |
| Did a requirement change after implementation began? | current ref revision plus lifecycle delta decision evidence; a stale implementation ref is insufficient |
| Which residual risk was accepted? | merge/release claim -> accepted-risk ref with acceptor and stage |
| What prevents release? | release claim -> exact acceptance, obligation/evidence, blocker, approval, or rollback refs |

Do not require unrelated links. For example, a documentation-only release-note claim does not make an unrelated runtime acceptance link mandatory.

A partial chain with no claim is valid. Adding a claim activates only that claim's applicable types: completion requires its applicable acceptance and verification refs, merge requires its applicable implementation and review refs, and release requires its applicable five-category refs. Explicit not-applicable classifications prevent full-chain ceremony without allowing silent omission.

## Portable storage

The chain may live in Markdown, JSON, YAML, issue text, or adapter output as long as IDs, revisions, refs, claim status, and deltas preserve these semantics. Resolution is local and deterministic: collect the files supplied to the task, resolve IDs and revisions, and report missing, stale, or contradictory refs. No central server, workflow database, network call, or issue-tracker replacement is required.

Executable examples and negative cases live in `docs/fixtures/lifecycle-traceability-chains.json`.
