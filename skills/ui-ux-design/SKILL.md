---
name: ui-ux-design
description: Shape working UI task paths, trustworthy state transitions, visual finish and accessibility as a bounded supplement to the selected delivery workflow.
---

# UI/UX Design Harness

## Goal

Constrain UI design, implementation and review around the user's evidenced goal, visual hierarchy and finish, task usability, interaction semantics, consequence awareness, and recoverable state. This is an execution supplement, not a lifecycle replacement and not a visual design system.

Prioritize working functionality, trustworthy interaction and polished usable screens. Speed, token savings and shorter records do not substitute for these outcomes. Use the smallest applicable subset. Do not invent personas, business priorities, device assumptions, recovery guarantees, or interaction behavior that the task does not evidence.

## Use when

Use this skill only after the generic delivery workflow is selected and the task changes or reviews a user-visible interface with one or more of these signals:

- a screen, form, navigation flow, selection, or primary action;
- focus, selected, disabled, loading, success, error, completed, or other interaction state;
- consequential or reversible user actions;
- partial data/render failure, stale or missing data, retry, or recovery behavior;
- UI language whose wording affects task completion or error recovery.

Do not use it for non-UI work, purely machine-consumed output, or as a reason to load every UX concern. Project-specific branding, users, terminology, critical flows, and business rules remain project context.

## Process

1. **Anchor to evidence and scope.** Identify the user goal, usage context, first information to notice, primary action, completion/next action, and known constraints. Existing contracts are inputs, not a quality ceiling; revisit observed weaknesses within scope. Stop only decisions that depend on consequential missing facts. Follow `references/ui-capability-contract.md` for contract-only, existing-contract build, direct UI, local adjustment, or review-only requests. Resolve external capability owners from the active environment before dependent work; capability or runtime gaps stop only affected work and never count as completed review.
2. **Select the applicable execution path.** For a local visual or copy adjustment, reuse adopted decisions and inspect the affected rendering, meaning and interaction; do not expand it into a whole-flow redesign. For a flow that edits data, changes context around a draft, commits/restores state, or displays dependent results, read the relevant parts of `references/working-state.md` before dependent design or implementation. Read `references/principles.md`, `references/decision-patterns.md`, and `references/anti-patterns.md` only for the decisions at hand. Record why selected constraints apply; examples and scenario lists are evidence prompts, not global bans or a requirement to cover every state.
3. **Turn the task into a working transition.** Identify the primary action's before state, actual effect, resulting visible state and continuation. Include the relevant interruption or rejection that could lose work or misstate success. For editing, distinguish persisted baseline, current draft and view selection; navigation and a failed/conflicted save must not silently erase the draft. Saved status describes the current values' relationship to acknowledged persistence. For dependent results, identify the inputs/revision that make the result current. Keep this short in the existing decision record; do not require a new state schema.
4. **Make composition concrete and implement the task path.** Connect grouping, order, text hierarchy and wrapping, alignment anchors, spacing, imagery and control relationships to the task. Choose density for the purpose: a comparison workspace and a product introduction need different treatments. Prefer clear structure/state before adding explanation; retain required meaning and accessible labels. For Japanese, judge labels, target/result wording and feedback in their displayed position and state; use an available `japanese-expression` capability under the discovery rules. When implementation is authorized, connect the actual controls through validation and the supported underlying effect to truthful feedback. Complete a working primary path before expanding secondary features; a confirmation or success toast alone does not complete an action. For user judgments, present the relevant facts and consequential differences in the user's terms, with supporting detail inspectable; raw structures can be appropriate when inspecting them is the task. Make the current activity clear while retaining information needed for simultaneous comparison.
5. **Make transitions recoverable and consequences explicit.** Define applicable affordances/signifiers, state semantics, immediate feedback, focus/current state, continuation and equivalent interaction paths. Do not manufacture hover, drag, gesture, or motion behavior. Distinguish cancel before commitment, undo after a completed reversible change, and compensating action after a committed change. Show target, scope, consequence and recovery limit before irreversible or materially consequential commitment. Do not add blanket confirmation to low-risk reversible actions. Stage and validate imported or restored state before applying it; preserve recoverable drafts through rejection and reconciliation. UI continuity does not establish storage atomicity or rollback guarantees.
6. **Bound failures.** Keep healthy, authorized, semantically valid regions and user input usable when an independent region fails. Keep unresolved failure visible in the affected region, make retry scoped, and verify retry outcome. Distinguish loading, legitimate empty, missing, stale, partial, and complete states. Do not zero-fill missing data or expose derived actions whose prerequisite truth is incomplete. Widen the block only when authorization, security, consistency, or dependency semantics require it.
7. **Exercise the running task path.** During implementation, operate the real controls for the primary action and a short sequence across the changed boundaries that could lose work, apply the wrong effect, or misstate freshness. Use distinguishable values in an authorized test context; inspect the visible result and the relevant draft, persisted state or result-to-input relationship. Include return/re-entry and failure/recovery where they are part of that boundary. Confirm that rejection retains work and that completion actually changes the intended state. Use `references/working-state.md` to select representative probes, not an exhaustive matrix. Source inspection, a screenshot or a passing unit check alone cannot prove these transitions. Repair observed defects and recheck affected behavior before handoff.
8. **Refine and verify actual rendering.** Inspect a representative whole screen before polishing controls, then refine relevant component details, narrow layouts and states before independent review. Judge visual finish, task usability and functional behavior separately; working clicks, equal CSS values and no overflow do not establish finish. Exercise applicable keyboard/focus, equivalent paths, actual undo, pre-commit cancellation, retained input and scoped retry. A screenshot supports static appearance, not recovery or state restoration. Use the observation and handoff rules in `references/ui-capability-contract.md`; preserve contract-to-implementation-to-evidence links. Contract-only work specifies these observations without claiming they ran. Check affected text and state cues, including secondary text, against applicable contrast criteria on their actual backgrounds; numerical claims require measurement.
9. **Hand constraints back to the selected workflow.** `requirement-grill`, `grill-design`, `controlled-implementation`, `test-first-verification`, review gates, and final merge gates retain their responsibilities. This supplement narrows UI decisions; it does not authorize implementation or approval by itself.

## Output

Emit a bounded supplement in the current task's decision record. Usually a short note connecting the task/action, changed decision, expected visible and underlying result, and observed evidence or gap is sufficient. For a local adjustment, record only the changed decisions and affected evidence; do not require a new JSON contract or a filled template. The vocabulary below is available when the selected workflow needs more structure, not a form to complete. Omit irrelevant fields or use `not_applicable: <reason>`; never fill them speculatively.

```yaml
UX supplement:
  user_context:
    user_goal:
    usage_context:
    known_constraints:
    capability_or_environment_considerations:
  task_model:
    page_or_flow_goal:
    primary_action:
    completion_state:
    next_action:
  information_model:
    required_information:
    secondary_information:
    omit:
    language_required_for_clarity:
  interaction_model:
    affordances_and_signifiers:
    state_semantics:
    action_feedback:
    transition_behavior:
    consistency_expectations:
    direct_manipulation:
    equivalent_interaction_paths:
  inclusion_constraints:
    single_cue_dependencies_to_avoid:
    error_prevention:
    recovery_paths:
    input_and_effort_constraints:
  resilience_and_consequences:
    action_reversibility_and_limits:
    pre_commit_consequences:
    failure_boundaries_and_dependencies:
    safe_remaining_content_and_actions:
    partial_failure_and_freshness_feedback:
    scoped_retry_and_recovery_refs:
    blocking_conditions:
  applicable_patterns:
  anti_patterns:
  implementation_constraints:
  verification_scenarios:
  stop_conditions:
```

Each verification scenario names the inspected state and observable relationship. For interactions, add action/input, expected visible and underlying state, and applicable recovery/continuation result. Keep design decisions in the existing information model and implementation constraints rather than creating another schema.

## Exit criteria

- The supplement is connected only because current evidence contains a UI signal.
- User, product, brand, and business assumptions are sourced or marked unknown.
- The primary task and next action are clearer without removing required semantics.
- For rendered UI judgments, composition and component finish have rendered evidence distinct from functional checks; contract-only work specifies observation criteria without claiming actual-screen approval. A passing contract does not dismiss observed roughness.
- Dynamic claims have interactive/state evidence requirements, not screenshot-only proof. Implemented actions complete their advertised effect; running-UI evidence covers the primary path and the relevant continuity, commitment or freshness boundary. Missing runtime evidence remains a named gap.
- Reversible, irreversible, partial-failure, and foundational-blocking behavior are distinguished when applicable.
- Healthy state and user input are preserved across independent failure and retry. Applicable navigation and rejected/conflicted saves retain recoverable drafts; saved/current labels match the state they describe. Imported/restored state is validated before commitment, and derived results remain linked to the inputs that produced them.
- The generic workflow and final review authority remain unchanged.
