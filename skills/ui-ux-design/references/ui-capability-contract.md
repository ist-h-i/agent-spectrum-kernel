# UI capability connection

This reference owns the ASK-to-UI capability boundary. ASK `skill-router` owns the primary delivery workflow; this connection never creates a second router. `ui-ux-design` owns the human-centered constraints in `principles.md` and the task's UX supplement. Available project/global skills own their UI procedures: `ui-design` establishes task-specific quality direction, `ui-contract` resolves scoped design decisions and versioned contracts, `ui-build` implements and refines actual rendering, and `ui-review` independently judges actual screens and interactions. Connect these responsibilities without copying their procedures into ASK.

## Capability discovery and bounded stops

Resolve these capability names, and relevant language capabilities such as `japanese-expression`, from the active environment's available skills or evidenced project equivalents. Read the selected skill before use. These are external capabilities, not ASK `selected_skills`, required filesystem paths, or bundled dependencies. A name or directory alone is not evidence that a capability was invoked successfully. Never require a global absolute path in an ASK installation.

Record capability/owner and invocation evidence references in the existing Execution Envelope `evidence_status.checked`/`missing`, and the affected obligation in `stop_reason.details`; do not add new Envelope fields. For a confirmed absent external capability use `blocked`; for unknown availability use `insufficient_evidence`. Name the exact dependent scope and the next capability discovery/provisioning check. Reserve `capability_missing` and profile/`--skills` remedies for ASK routes absent from active adapter `selected_skills` as defined by the Envelope contract. Continue independent evidence gathering or generic work only when it does not depend on the missing capability. Do not invent the missing procedure, mark it used, or declare its output verified. An equivalent requires an observed owner and matching contract/evidence responsibilities; a generic coding skill is not automatically an equivalent.

## Scoped request paths within one development flow

| Request | UI capability sequence | Bounded completion |
|---|---|---|
| Contract only | `ui-contract` consumes evidenced context and the applicable UX supplement | Versioned design contract; no UI implementation or actual-screen approval claim |
| Build from existing contract | Validate the contract's revision, source context and acceptance criteria, then `ui-build`; `ui-review` checks the result | Resolve missing, stale or contradictory requirements before dependent implementation; do not use the lightweight path to bypass an explicitly required contract |
| Direct UI request | Reuse current decisions or resolve missing decisions with `ui-contract`, then `ui-build` and `ui-review` | Use the smallest sufficient decision record; an adopted versioned contract and implementation reference the same revision |
| Small local adjustment | Reuse adopted components/tokens, record the changed decision and inspect the affected rendering/state | No mandatory new JSON contract, persona or full template |
| Review only | `ui-review` uses the actual artifact, task and available decisions/contract | Findings and evidence limits; no silent implementation |

`ui-design` may select among these capabilities when available, but the ASK primary requirement/design/implementation/verification/review flow remains in charge. Explicit requests for one phase do not authorize the later phases. Non-UI tasks and purely machine-consumed output do not activate this connection. Frontend files alone are not a trigger.

## Contract handoff requirements

When a versioned contract is adopted or requested, use the producer's artifact format; ASK does not define a competing schema. Identify artifact ID, format version, observed revision, source evidence for users/use cases and constraints, unknowns, and acceptance criteria. For local decisions without a formal contract, retain the task/decision reference, affected scope and observed artifact instead; do not manufacture a contract just to fill identity fields. Applicable decisions cover:

- component geometry: dimensions, spacing, alignment, control/icon placement and content density;
- action priority, information hierarchy, grouping and placement;
- first information to notice, text roles and wrapping, alignment anchors, section rhythm and imagery in relation to the task;
- tokens and their component bindings, rather than token values alone;
- interaction states, transitions, feedback and consequence/recovery limits;
- responsive behavior with evidenced viewport/device assumptions;
- observable static and interactive verification criteria.

Missing source facts remain unknown. Dense workspaces and spacious product introductions can both be appropriate. One screen/one purpose and reduced decoration are contextual options, never unconditional bans. An existing contract is not a quality ceiling: report observed design gaps without inventing a violated requirement, and revise adopted decisions within the authorized scope. A numerical overall score never substitutes for acceptance criteria or discharges an unresolved material defect.

Link each applicable UX obligation to its ASK principle/pattern, adopted contract item or scoped decision, implementation location when available, and verification evidence. Reuse stable local item IDs when formal trace is required; a local adjustment can use the existing task reference and affected locations. Record `not_applicable` with a reason where needed; do not fabricate coverage. At review, required unimplemented or unobserved links remain gaps. Existing lifecycle and verification artifacts retain their authority; these links supplement them rather than duplicating them.

| ASK concern | Contract / implementation obligation | Verification evidence |
|---|---|---|
| goal and task sequence | sourced task, action priority, completion and next action | rendered hierarchy and exercised task path |
| information | required meaning, grouping, density and labels | actual screen at supported viewports |
| visual finish | text hierarchy, alignment, spacing and component relationships | whole-screen and detail inspection distinct from functional results |
| interaction and feedback | geometry, signifiers, states and transitions | screen plus exercised controls and resulting state |
| inclusion | equivalent paths and meaning beyond single cues | keyboard/focus and applicable access checks |
| reversibility | cancellation, actual undo, compensation and limits | underlying state before/after the action |
| partial failure and blocking | dependency boundary, retained input and scoped retry | exercise independent/foundational failure and retry |
| continuation | preserved location/work and next step | exercise completion and navigation |

## Review evidence and known regression probes

During implementation, inspect a representative rendered whole screen before polishing controls, then refine the relevant components and states before review. For nontrivial delivery, use an actual separate reviewer with the raw task/artifacts and adopted decisions, without the implementation conversation, expected verdict or a list of defects to find. If independence is unavailable, report self-review and its limits. Review-only requests do not authorize repairs.

For implemented UI, `ui-review` must inspect actual rendered screens and exercise applicable interactions independently of the implementation's own claims. Record target/revision (or public URL and observation time), viewport, inspected state, action, observed result, evidence reference and reviewer independence. Observe whole-screen scan order and density, representative component details, then task/state transitions. View the image itself, not merely its filename or extracted DOM text. Use relevant narrow layouts, long/localized content and text enlargement proportionally; do not require a new fixture, report directory or exhaustive matrix. On public sites, stay within authorized non-destructive operations.

Keep visual finish, task usability and functionality on separate evidence. A contract-only review cannot approve actual rendering. Screenshots support static claims only; missing runtime access limits interaction judgments while supplied screenshots can still support scoped visual findings. Source inspection, mock fixtures and passing automated checks do not replace actual-screen review. A missing private contract does not bar a task-based critique of an available screen; missing context limits only dependent judgments. ASK gates retain their own existing statuses and final merge authority; do not substitute external `ui-review` verdicts for executed ASK gate evidence.

Include these probes when the relevant controls exist (otherwise record applicability):

- Select control: inspect the arrow's trailing space, arrow/text separation, clipping and alignment at supported widths, with long labels and applicable focus/disabled states; exercise keyboard selection. State the intended trailing inset and text reserve in applicable design decisions. Text clearance or CSS padding does not measure a native arrow's edge clearance. If exact geometry is unavailable, keep dimensions unverified while reporting visible crowding and its relation to neighboring controls; do not replace native semantics solely to make measurement easier.
- Editable table: inspect relative prominence of primary edit/save versus secondary/cancel actions, row/column/control alignment and dense/narrow layouts; exercise edit, save, cancel and error states and verify retained data/input. Bind the judgment to evidenced action priority and geometry rather than taste.

For each finding, connect the observed location/state and relationship to its reading or interaction impact and repair direction. Distinguish a contract violation, visible design weakness and optional aesthetic alternative. Neither a working click nor a missing pixel measurement dismisses an observed finish defect. Do not impose a finding quota or mechanically reject large headings, dense lists or cards. Read Japanese labels and feedback with their actual target, value, position and changed state; unclear structure is not repaired by adding explanation alone.

This connection specifies verification obligations. It does not prove measured ASK effectiveness or certify the quality of an unobserved product.
