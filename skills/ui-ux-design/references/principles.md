# UI/UX Design Harness principles

These principles guide decisions; they are not a component library, branding guide, accessibility certification, or global prohibition list.

## Human goal and task sequence first

Start from evidenced user intent and the decision/action sequence required to reach a meaningful state. Organize the interface around that sequence rather than database shape, service boundaries, or every available field. When the task goal or consequence boundary is materially unknown, surface the missing fact instead of inventing a persona or process.

## Inclusion is a constraint on meaning, not decoration

Important meaning must survive differences in input method, vision, motion tolerance, experience level, language fluency, and temporary conditions when relevant to the product. Do not make a critical state depend only on color, icon, position, hover, gesture, or motion. Direct manipulation can be useful, but an equivalent path is required when precision, keyboard use, auditability, or access would otherwise be impaired.

## Structure before explanation

Use information hierarchy, grouping, ordering, progressive disclosure, sensible defaults, selection, and visible state before adding prose. Explanatory copy is appropriate when it conveys constraints, consequences, recovery limits, or domain meaning that structure cannot make unambiguous. Removing prose must not remove required labels or semantics.

## Perceivable and consistent interaction semantics

Users should be able to identify what can be acted on, what state a control is in, and what result to expect. Equivalent controls and states should have equivalent meanings unless the contextual difference is visible and documented. Applicable states such as focus, selected, disabled, loading, success, error, and completed must be distinguishable through more than one fragile cue when the distinction matters.

## Feedback preserves causality

Acknowledge an accepted action promptly. Show processing, success, failure, and recovery so users can connect cause and effect. Transitions and motion should preserve continuity or hierarchy when useful; they are not evidence of correctness and should not obscure task completion.

## Completion implies continuation

A completed state should make the result and the next meaningful action clear when another action exists. Navigation should preserve current location and relevant work. Avoid silent reset, unrelated return destinations, and dead ends.

## Reversibility must be truthful

Cancellation prevents commitment; undo restores a completed reversible effect; compensation creates a new effect that counteracts a prior committed effect. Do not label a visual reset as undo when the underlying effect remains. Disclose material recovery limits before commitment. Match confirmation friction to consequence rather than requiring confirmation for every action.

## Partial failure preserves usable truth

Keep the largest subset that remains authorized, valid, and semantically safe. Preserve loaded content, unrelated input, selection, and navigation when an independent region fails. Failure must remain perceptible until resolved; a transient toast alone is insufficient for an unresolved regional error. Missing data is not zero. A partial aggregate is shown only when it remains valid for the intended decision and its scope/freshness is clear; otherwise withhold it and disable dependent actions.

## Blocking follows dependency boundaries

Whole-screen blocking is appropriate only when a foundational dependency makes the entire screen unauthorized, inconsistent, insecure, or semantically invalid. Local data or render failure should not automatically become a page failure. State the reason and a viable next step at the boundary that is actually blocked.

## Verification follows behavior

Static evidence can validate visible hierarchy, labeling, and layout. It cannot prove focus movement, loading behavior, duplicate-action prevention, actual undo, state retention, retry success, or recovery. Verify those properties by exercising the state transition and inspecting the resulting visible and underlying state.
