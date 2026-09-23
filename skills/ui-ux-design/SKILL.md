---
name: ui-ux-design
description: Add a bounded human-centered UI/UX supplement to an already-selected delivery workflow when changed behavior is user-visible and interactive.
---

# UI/UX Design Harness

## Goal

Constrain UI implementation and review around the user's evidenced goal, information priority, interaction semantics, consequence awareness, and recoverable state. This is an execution supplement, not a lifecycle replacement and not a visual design system.

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

1. **Anchor to evidence.** Identify the known user goal, usage context, primary action, completion state, next action, required information, constraints, and existing product contracts. If a consequential choice cannot be made safely because the user goal, task boundary, or recovery semantics are unknown, stop on that missing fact rather than creating a generic persona or workflow.
2. **Select patterns, not decoration.** Read only the applicable sections of `references/principles.md`, `references/decision-patterns.md`, and `references/anti-patterns.md`. Record why each selected pattern applies. Treat examples as evidence prompts, not global bans.
3. **Structure before prose.** Prefer removal, hierarchy, grouping, ordering, defaults, state, and familiar controls before adding explanation. Keep language required for an accurate or accessible decision.
4. **Specify behavior.** Define applicable affordances/signifiers, state semantics, immediate feedback, transitions, focus/current state, continuation, and equivalent interaction paths. Mark non-applicable concerns explicitly; do not manufacture hover, drag, gesture, or motion behavior.
5. **Separate consequence classes.** Distinguish cancel before commitment, undo after a completed reversible change, and compensating action after a committed change. For irreversible or materially consequential actions, show target, scope, consequence, and recovery limit before commitment. Do not add blanket confirmation to low-risk reversible actions.
6. **Bound failures.** Keep healthy, authorized, semantically valid regions and user input usable when an independent region fails. Keep unresolved failure visible in the affected region, make retry scoped, and verify retry outcome. Distinguish loading, legitimate empty, missing, stale, partial, and complete states. Do not zero-fill missing data or expose derived actions whose prerequisite truth is incomplete. Widen the block only when authorization, security, consistency, or dependency semantics require it.
7. **Define observable verification.** Include scenarios that exercise state transitions, keyboard/focus behavior where applicable, actual model/state restoration for undo, pre-commit cancellation for irreversible actions, partial failure preservation, retry failure/success, and whole-screen blocking only for foundational failure. A screenshot can evidence static hierarchy but cannot prove undo, loading, recovery, or state restoration.
8. **Hand constraints back to the selected workflow.** `requirement-grill`, `grill-design`, `controlled-implementation`, `test-first-verification`, review gates, and final merge gates retain their responsibilities. This supplement narrows UI decisions; it does not authorize implementation or approval by itself.

## Output

Emit a bounded supplement. Omit irrelevant fields or use `not_applicable: <reason>`; never fill them speculatively.

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

Each verification scenario names the initial state, action/input, expected visible state, expected retained or mutated state, and recovery/continuation result.

## Exit criteria

- The supplement is connected only because current evidence contains a UI signal.
- User, product, brand, and business assumptions are sourced or marked unknown.
- The primary task and next action are clearer without removing required semantics.
- Dynamic claims have interactive/state evidence requirements, not screenshot-only proof.
- Reversible, irreversible, partial-failure, and foundational-blocking behavior are distinguished when applicable.
- Healthy state and user input are preserved across independent failure and retry.
- The generic workflow and final review authority remain unchanged.
