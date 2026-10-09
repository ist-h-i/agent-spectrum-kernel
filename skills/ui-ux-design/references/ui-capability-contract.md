# UI capability connection

This reference owns the ASK-to-UI capability boundary. ASK `skill-router` owns the primary delivery workflow; this connection never creates a second router. `ui-ux-design` owns the human-centered constraints in `principles.md` and the task's UX supplement. Available project/global skills own their UI procedures: `ui-design` is a thin entry point, `ui-contract` authors a versioned design contract, `ui-build` implements that contract, and `ui-review` independently checks actual screens and interactions. Do not copy their procedures or ASK principles into another skill.

## Capability discovery and bounded stops

Resolve these capability names from the active environment's available skills or evidenced project equivalents. Read the selected skill before use. These are external capabilities, not ASK `selected_skills`, required filesystem paths, or bundled dependencies. A name or directory alone is not evidence that a capability was invoked successfully. Never require a global absolute path in an ASK installation.

Record capability/owner and invocation evidence references in the existing Execution Envelope `evidence_status.checked`/`missing`, and the affected obligation in `stop_reason.details`; do not add new Envelope fields. For a confirmed absent external capability use `blocked`; for unknown availability use `insufficient_evidence`. Name the exact dependent scope and the next capability discovery/provisioning check. Reserve `capability_missing` and profile/`--skills` remedies for ASK routes absent from active adapter `selected_skills` as defined by the Envelope contract. Continue independent evidence gathering or generic work only when it does not depend on the missing capability. Do not invent the missing procedure, mark it used, or declare its output verified. An equivalent requires an observed owner and matching contract/evidence responsibilities; a generic coding skill is not automatically an equivalent.

## Three request paths within one development flow

| Request | UI capability sequence | Bounded completion |
|---|---|---|
| Contract only | `ui-contract` consumes evidenced context and the applicable UX supplement | Versioned design contract; no UI implementation or actual-screen approval claim |
| Build from existing contract | Validate the contract's revision, source context and acceptance criteria, then `ui-build`; `ui-review` checks the result | Stop affected implementation when the contract is missing, stale or contradictory; retain review gaps when runtime evidence is absent |
| Direct UI request | Reuse a current compatible contract or ask `ui-contract` for the smallest sufficient contract, then `ui-build` and `ui-review` | No mandatory large document; contract and implementation reference the same revision |

`ui-design` may select among these capabilities when available, but the ASK primary requirement/design/implementation/verification/review flow remains in charge. Explicit requests for one phase do not authorize the later phases. Non-UI tasks and purely machine-consumed output do not activate this connection. Frontend files alone are not a trigger.

## Contract handoff requirements

Use the producer's versioned artifact format; ASK does not define a competing schema. The handoff must identify artifact ID, format version, observed revision, source evidence for users/use cases and constraints, unknowns, and acceptance criteria. Its applicable contents cover:

- component geometry: dimensions, spacing, alignment, control/icon placement and content density;
- action priority, information hierarchy, grouping and placement;
- tokens and their component bindings, rather than token values alone;
- interaction states, transitions, feedback and consequence/recovery limits;
- responsive behavior with evidenced viewport/device assumptions;
- observable static and interactive verification criteria.

Missing source facts remain unknown. One screen/one purpose and reduced decoration are contextual options, never unconditional bans. A numerical overall score never substitutes for acceptance criteria or discharges an unresolved material defect.

Each applicable UX obligation has a stable local item ID and links its ASK principle/pattern source to a contract item, implementation location, and verification scenario/evidence. Record `not_applicable` with a reason where needed; do not fabricate coverage. At review, an unimplemented or unobserved link remains a gap. Existing lifecycle and verification artifacts retain their authority; these links supplement them rather than duplicating them.

| ASK concern | Contract / implementation obligation | Verification evidence |
|---|---|---|
| goal and task sequence | sourced task, action priority, completion and next action | rendered hierarchy and exercised task path |
| information | required meaning, grouping, density and labels | actual screen at supported viewports |
| interaction and feedback | geometry, signifiers, states and transitions | screen plus exercised controls and resulting state |
| inclusion | equivalent paths and meaning beyond single cues | keyboard/focus and applicable access checks |
| reversibility | cancellation, actual undo, compensation and limits | underlying state before/after the action |
| partial failure and blocking | dependency boundary, retained input and scoped retry | exercise independent/foundational failure and retry |
| continuation | preserved location/work and next step | exercise completion and navigation |

## Review evidence and known regression probes

For implemented UI, `ui-review` must inspect actual rendered screens and exercise applicable interactions independently of the implementation's own claims. Record target/revision, viewport, inspected state, action, observed result, evidence reference and reviewer independence. A contract-only review can assess specification consistency, but cannot claim the UI was visually or interactively reviewed. Screenshots support static claims only. Source inspection, mock fixtures and passing automated checks are supporting evidence, not actual-screen review. Missing runtime access blocks the affected UI judgment as `insufficient_evidence`; preserve any independent code/contract checks. ASK review gates and final merge authority remain unchanged.

Include these probes when the relevant controls exist (otherwise record applicability):

- Select control: inspect the arrow's trailing space, arrow/text separation, clipping and alignment at supported widths, with long labels and applicable focus/disabled states; exercise keyboard selection. Contract geometry must state the intended trailing inset and text reserve.
- Editable table: inspect relative prominence of primary edit/save versus secondary/cancel actions, row/column/control alignment and dense/narrow layouts; exercise edit, save, cancel and error states and verify retained data/input. Bind the judgment to evidenced action priority and geometry rather than taste.

This connection specifies verification obligations. It does not prove measured ASK effectiveness or certify the quality of an unobserved product.
