# From controls to working state

Use the relevant sections for the stateful path selected in `../SKILL.md`. Fit existing components and data APIs; a static screen or local visual adjustment does not need a draft store, revision protocol or failure matrix.

## Locate the affected work

From the affected task's requirements, locate user work and the owners and transitions that can replace it. Include supporting editors or setup choices when present; a main form guard does not protect an independently owned composer. Keep this short in the existing decision record, without redesigning unrelated screens or adding persistence the product does not promise.

| Meaning | Responsibility when applicable |
|---|---|
| Persisted baseline | Last acknowledged data and identity/revision under the existing persistence contract. |
| Working draft | Current input, stable work identity (including an unsaved new item), and baseline it was edited from. |
| View state | Selection, filter, route, tab or focus; a view change must not accidentally replace the draft. |
| Pending action | Submitted target, values/revision and scope, distinct from subsequent edits or navigation. |
| Derived result | Source identities/revisions, requested scope and parameters; whether it describes saved data or a draft preview. |

Separate these meanings even within one store. Key retained work by stable identity, not visible row index. Retain drafts through supported context changes, or intercept departure that would lose unsaved work with a proportionate save/discard/stay choice. Unchanged or lossless departure needs no warning. In-memory retention does not promise reload, crash or cross-device recovery. When a transition removes focus, move it to a logical place in the resulting task; cancelling departure returns focus to retained work.

## Make status and commitment agree

Trace the control through validation, the supported operation and its acknowledged effect; a toast cannot substitute for that effect. Identify what it may write: one item, a selected set or a workspace. Pending or rejected work must not be silently included in a later action outside its agreed scope. Optimistic display and explicit batch saving are valid with clear pending status and commit scope; pending data is not acknowledged data.

Derive unsaved status from current values versus the acknowledged baseline using the product's field semantics, not an editing flag or last-save time. Reverting a value can remove the difference. For asynchronous saves, associate acknowledgement with submitted target and values. An older completion must not roll back a newer known baseline, overwrite later typing, label it saved or replace another item's form. Use existing identity/revision checks or equivalent request ownership, not an invented distributed protocol.

Validation failure, save failure and conflict leave local work recoverable, separate from received persisted versions until supported resolution. Reloading is not implicit consent to discard input. Cancel before commitment leaves the effect uncommitted. Do not invent merge, force-overwrite, undo or all-or-nothing guarantees; resolve required guarantees with the data/storage owner. For partial commitment or unknown outcomes, preserve work, disclose what is known and unresolved, and reconcile through the supported contract before retrying. UI continuity does not prove storage atomicity or rollback.

## Validate candidates before applying them

Stage imports/restores outside live state. Parsing and a valid outer envelope do not establish valid nested data. Reuse the data owner's validation, or implement its evidenced rules within authorized scope: format/version and nested types, identities and reference relationships, domain values, and history consistency when history is accepted or used. Check relationships against the intended resulting state, including retained data for a merge. Self-reference, cycles, unknown fields and older history are not inherently invalid; follow the product contract. Unknown business rules remain unknown.

Rejected data must not enter live state or later saves. Rejecting a whole candidate leaves current data and drafts untouched. For supported partial acceptance, expose accepted/rejected scope without announcing complete success. The apply control invokes the supported operation and reconciles with its acknowledgement. Keep recovery data until the promised operation succeeds. After restoration, keep old drafts recoverable but separate from the new baseline, preventing silent reapplication to different data.

## Keep scope and dependent results honest

When the task requires a choice of records, criteria, period or other scope, expose it and carry it through request, result interpretation and applied effect. A broad default does not fulfill a required choice. Capture submitted scope with source identity/revision and relevant parameters; a timestamp alone does not establish this relationship. Distinguish saved-data results from previews of current edits.

Validate returned results against that submitted contract before relying on them. Check membership, uniqueness and completeness when required, not just response structure. Out-of-scope, duplicate or missing results need contract-appropriate handling; supported partial results remain explicitly partial and cannot authorize actions requiring completeness. Do not silently broaden requested scope. Show source and scope in user terms at the decision point without unnecessary internal identifiers.

On a relevant source, scope or parameter change, invalidate, recompute or visibly mark the result stale; unrelated changes need not invalidate it. Accept a pending result as current only when its complete dependency identity (source identities/revisions, scope and relevant parameters) still matches the represented state. An older completion must not replace a newer result or clear its stale state. Withhold dependent actions when stale or partial input makes them invalid.

## Observe the changed boundaries

Exercise the primary path and select checks by ownership, write scope and dependency risks. Reuse evidence for shared owners and transitions, not merely similar-looking controls. Depending on the change, useful observations include:

- Retained work and usable focus after context change/return or cancelled departure; truthful status for changed and unchanged values.
- The committed set after success or rejection, including a subsequent action if rejected candidates can remain in shared state. A failure message alone cannot prove isolation.
- Real cancel/apply controls with valid and invalid staged data. Use focused validator checks for nested or semantic variants rather than driving every malformed input through the UI.
- Agreement among selected scope, submitted inputs, returned results and displayed decision; relevant source/scope/parameter changes or overlapping completion when supported.

These are prompts, not a fixed sequence or exhaustive matrix. Use distinguishable values in an authorized disposable context. Compare visible results with the relevant draft, acknowledged data, applied snapshot or dependency relationship; re-enter/reload as needed for promised persistence. Source inspection, direct handler calls, screenshots and unit checks alone cannot prove a user path. Missing or unsafe runtime access leaves affected claims unobserved; follow `ui-capability-contract.md`, without inventing results.

Record decisive action/input, expected and observed result, target/revision and evidence reference in the existing task record. Repair observed defects and recheck affected behavior; expand only for unresolved acceptance claims, distinct affected boundaries or new failures. Pair behavior evidence with relevant rendered hierarchy, component finish, narrow layout and keyboard/focus checks. Functionality does not establish visual polish or accessibility.
