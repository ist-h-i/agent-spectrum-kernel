---
name: ui-ux-design
description: Shape UI composition, visual finish, task usability, and interaction evidence as a bounded supplement to the selected delivery workflow.
---

# UI/UX Design Harness

## Goal

Constrain UI design, implementation and review around the user's evidenced goal, visual hierarchy and finish, task usability, interaction semantics, consequence awareness, and recoverable state. This is an execution supplement, not a lifecycle replacement and not a visual design system.

Use the smallest applicable subset. Do not invent personas, business priorities, device assumptions, recovery guarantees, or interaction behavior that the task does not evidence.

## Use when

Use this skill only after the generic delivery workflow is selected and the task changes or reviews a user-visible interface with one or more of these signals:

- a screen, form, navigation flow, selection, or primary action;
- focus, selected, disabled, loading, success, error, completed, or other interaction state;
- consequential or reversible user actions;
- partial data/render failure, stale or missing data, retry, or recovery behavior;
- UI language whose wording affects task completion or error recovery.

Do not use it for non-UI work, purely machine-consumed output, or as a reason to load every UX concern. Project-specific branding, users, terminology, critical flows, and business rules remain project context.

## Process

1. **Anchor to evidence.** Identify the known user goal, usage context, first information to notice, action priorities, completion/next action, and constraints. Choose density and composition for that purpose: a comparison workspace and a product introduction need different treatments. Existing contracts are inputs, not a quality ceiling; revisit observed weaknesses within scope. Stop only decisions that depend on consequential missing facts, without inventing a persona or workflow.
2. **Select applicable principles and patterns.** Read only the relevant sections of `references/principles.md`, `references/decision-patterns.md`, and `references/anti-patterns.md`. Record why they apply. Treat examples as evidence prompts, not global bans.
3. **Make composition concrete.** Connect grouping, order, text hierarchy and wrapping, alignment anchors, spacing, imagery and control relationships to the task. Prefer clear structure/state before adding explanation; retain required meaning and accessible labels. For Japanese, judge labels, target/result wording and feedback in their displayed position and state, not grammar alone; use an available `japanese-expression` capability under the discovery rules below.
4. **Specify behavior.** Define applicable affordances/signifiers, state semantics, immediate feedback, transitions, focus/current state, continuation, and equivalent interaction paths. Mark non-applicable concerns explicitly; do not manufacture hover, drag, gesture, or motion behavior.
5. **Separate consequence classes.** Distinguish cancel before commitment, undo after a completed reversible change, and compensating action after a committed change. For irreversible or materially consequential actions, show target, scope, consequence, and recovery limit before commitment. Do not add blanket confirmation to low-risk reversible actions.
6. **Bound failures.** Keep healthy, authorized, semantically valid regions and user input usable when an independent region fails. Keep unresolved failure visible in the affected region, make retry scoped, and verify retry outcome. Distinguish loading, legitimate empty, missing, stale, partial, and complete states. Do not zero-fill missing data or expose derived actions whose prerequisite truth is incomplete. Widen the block only when authorization, security, consistency, or dependency semantics require it.
7. **Refine and verify actual rendering.** During implementation, inspect a representative whole screen before polishing controls, then refine relevant component details, narrow layouts and states before independent review. Judge visual finish, task usability and functional behavior separately; working clicks, equal CSS values and no overflow do not establish finish. Exercise applicable transitions, keyboard/focus, actual undo, pre-commit cancellation, retained input and scoped retry. A screenshot supports static appearance, not recovery or state restoration. Use the observation and handoff rules in `references/ui-capability-contract.md`.
8. **Connect available UI capabilities.** Follow `references/ui-capability-contract.md` for contract-only, existing-contract build, or direct UI requests. Keep principle ownership here, resolve external capability owners from the active environment, and preserve contract-to-implementation-to-evidence links. Capability or runtime gaps stop only affected dependent work and never count as completed review.
9. **Hand constraints back to the selected workflow.** `requirement-grill`, `grill-design`, `controlled-implementation`, `test-first-verification`, review gates, and final merge gates retain their responsibilities. This supplement narrows UI decisions; it does not authorize implementation or approval by itself.

## Output

Emit a bounded supplement in the current task's decision record. For a local adjustment, record only the changed decisions and affected evidence; do not require a new JSON contract or a filled template. Omit irrelevant fields or use `not_applicable: <reason>`; never fill them speculatively.

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
- Dynamic claims have interactive/state evidence requirements, not screenshot-only proof.
- Reversible, irreversible, partial-failure, and foundational-blocking behavior are distinguished when applicable.
- Healthy state and user input are preserved across independent failure and retry.
- The generic workflow and final review authority remain unchanged.
