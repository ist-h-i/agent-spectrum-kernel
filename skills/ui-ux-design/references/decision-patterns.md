# UI/UX decision patterns

Select only patterns whose conditions are evidenced. Each pattern states a transferable decision, not a mandated component, framework, visual style, animation, or input technique.

## `human-goal-and-context-first`

**Problem:** Schema or implementation structure becomes the UI structure.  
**User consequence:** The user must infer which information and actions matter to their actual goal.  
**Goal:** Align screen/flow structure with the evidenced user decision and action sequence.  
**Decision rule:** Start from user goal, usage context, known constraints, primary action, completion, and continuation; leave unknown product priorities unknown.  
**Applies when:** A user-facing task or flow is being designed or materially changed.  
**Does not apply when:** Output is purely machine-consumed or no user interaction changes.  
**Required states/scenarios:** Entry, decision/action, completion, continuation; include interruption/re-entry when relevant.  
**Avoid:** Invented personas, showing fields because they exist, generic dashboard composition.  
**Preferred alternative:** Evidence-backed task model and smallest information set.  
**Verification:** A reviewer can map every primary region/action to the stated task without invented assumptions.  
**Inclusion:** Consider evidenced capability/environment constraints without stereotyping a user group.

## `inclusive-and-error-tolerant-use`

**Problem:** One input/cue path or avoidable precision/memory demand excludes legitimate use.  
**User consequence:** Users cannot perceive, operate, or recover reliably.  
**Goal:** Preserve required meaning and action through appropriate redundant/equivalent paths.  
**Decision rule:** Do not rely solely on color, icon, hover, motion, gesture, or one input method for important state/action; prevent foreseeable errors and provide proportionate recovery.  
**Applies when:** Critical meaning/action is expressed through interaction or visual state.  
**Does not apply when:** The cue is decorative and conveys no task meaning.  
**Required states/scenarios:** Keyboard/focus where applicable, error, correction, recovery, equivalent operation.  
**Avoid:** Color-only error, drag-only reorder with no alternative, icon-only irreversible action without accessible name.  
**Preferred alternative:** Semantic labels/state plus equivalent controls appropriate to the task.  
**Verification:** Operate the critical path without the fragile cue/input and confirm the same semantic result.  
**Inclusion:** Reduce exclusion without claiming WCAG or legal compliance from this pattern alone.

## `input-and-effort-minimization`

**Problem:** The interface asks users to enter, remember, compare, or navigate more than the decision requires.  
**User consequence:** Slower completion and more avoidable errors.  
**Goal:** Minimize effort while retaining information required for a correct decision.  
**Decision rule:** Reuse known data, choose safe defaults, group related input, and defer optional fields; do not hide constraints that change the decision.  
**Applies when:** A task contains input, repeated data, or multi-step navigation.  
**Does not apply when:** Re-entry is required for security, confirmation of a consequential value, or freshness and that need is evidenced.  
**Required states/scenarios:** Default, edit/override, validation, re-entry when justified.  
**Avoid:** Asking for known values, long placeholder instructions, unnecessary multi-step forms.  
**Preferred alternative:** Prepopulation/selection plus explicit editability and constraints.  
**Verification:** Count user-required actions/entries and confirm removed effort does not remove a required decision.  
**Inclusion:** Lower memory, precision, and repetitive-input demand.

## `page-purpose-and-information-priority`

**Problem:** Available information receives equal placement/weight regardless of the current decision.  
**User consequence:** Primary action and decision inputs are hard to locate.  
**Goal:** Make one page/state purpose and its necessary information evident.  
**Decision rule:** Order and emphasize by task dependency and consequence, not data availability.  
**Applies when:** A screen has multiple regions/actions.  
**Does not apply when:** Deliberate comparison requires equal prominence and the comparison is the primary task.  
**Required states/scenarios:** Entry and changed states that alter what becomes primary.  
**Avoid:** Competing CTAs, card-everything, equal visual weight.  
**Preferred alternative:** Clear hierarchy, grouping, and one evidenced primary action.  
**Verification:** The current task, required information, and primary action are identifiable without explanatory prose.  
**Inclusion:** Hierarchy must not depend only on color or position.

## `explain-last`

**Problem:** Prose compensates for unclear structure or controls.  
**User consequence:** The interface becomes a manual users must read before acting.  
**Goal:** Convey routine operation through structure/state and reserve prose for irreducible meaning.  
**Decision rule:** Before adding instruction text, try removal, ordering, grouping, labeling, defaults, state, and familiar control semantics.  
**Applies when:** Explanatory copy describes where/how to interact.  
**Does not apply when:** Copy communicates a domain constraint, consequence, recovery limit, or required instruction.  
**Required states/scenarios:** First use, error/recovery, consequential action.  
**Avoid:** Repeated title/subtitle/description, long placeholders.  
**Preferred alternative:** Direct labels and visible state; concise guidance only where necessary.  
**Verification:** Remove candidate explanation and test whether the task remains unambiguous; restore text if meaning is lost.  
**Inclusion:** Do not remove semantic labels or instructions needed for accurate use.

## `user-language-and-semantic-clarity`

**Problem:** System terms, abstract labels, or generic verbs obscure target and result.  
**User consequence:** Users cannot predict the effect or recover confidently.  
**Goal:** Use concise language that identifies the user-relevant action/state.  
**Decision rule:** Name the target/result when the verb alone is ambiguous; derive terminology from product/domain evidence.  
**Applies when:** Titles, labels, buttons, empty/error/success states affect action or interpretation.  
**Does not apply when:** A standard concise label is already unambiguous in context.  
**Required states/scenarios:** Normal, validation/error, success, empty/missing when applicable.  
**Avoid:** Abstract headings, unexplained internal nouns, generic “Continue” for consequential steps.  
**Preferred alternative:** Natural task language with precise target/consequence.  
**Verification:** Given the immediate context, a reviewer can state what action occurs and what changes.  
**Inclusion:** Prefer familiar language; retain domain precision where simplification would change meaning.

## `perceived-affordance-and-signifiers`

**Problem:** Users cannot identify what is interactive or how it can be operated.  
**User consequence:** They hunt for instructions or miss available actions.  
**Goal:** Make interaction possibilities perceivable from control semantics and state.  
**Decision rule:** Use familiar control form, placement, labels, and state; add signifiers rather than explanatory prose.  
**Applies when:** An element accepts interaction.  
**Does not apply when:** Content is intentionally non-interactive.  
**Required states/scenarios:** Idle, focus, active/pressed, disabled where applicable.  
**Avoid:** Unsignified clickable cards/text, decorative controls that resemble actions.  
**Preferred alternative:** Semantically appropriate interactive element with visible focus/state.  
**Verification:** Interaction targets are discoverable without reading separate instructions.  
**Inclusion:** Interactive semantics and focus must be available to assistive/keyboard paths where applicable.

## `consistent-interaction-semantics`

**Problem:** Similar controls/states mean different things or the same operation is represented inconsistently.  
**User consequence:** Prior learning becomes unreliable and errors increase.  
**Goal:** Make equivalent operations and states predictable.  
**Decision rule:** Reuse semantics for the same category of action/state; surface contextual differences before action when they change consequence.  
**Applies when:** Multiple comparable controls/states exist.  
**Does not apply when:** Different consequence genuinely requires a different control/state treatment.  
**Required states/scenarios:** Compare equivalent operations across the relevant flow.  
**Avoid:** Same-looking control causing navigation in one place and destructive mutation in another without context.  
**Preferred alternative:** Stable semantics or explicit contextual distinction.  
**Verification:** A semantic inventory maps comparable controls/states to consistent outcomes.  
**Inclusion:** Consistency reduces memory and interpretation burden.

## `continuous-state-and-action-feedback`

**Problem:** Accepted actions, processing, completion, or failure are invisible or confusable.  
**User consequence:** Users repeat actions, wait unnecessarily, or assume success/failure incorrectly.  
**Goal:** Preserve observable progression from action to result.  
**Decision rule:** Acknowledge accepted input promptly; distinguish applicable idle/focus/selected/disabled/loading/success/error/completed states and prevent unsafe duplicate action.  
**Applies when:** An action has latency, state transition, or asynchronous result.  
**Does not apply when:** The result is immediate and unambiguous without an intermediate state.  
**Required states/scenarios:** Accepted, loading, success, failure, retry; duplicate attempt where consequential.  
**Avoid:** Spinnerless latency, disabled-but-broken appearance, transient-only unresolved error.  
**Preferred alternative:** Persistent relevant state and explicit recovery.  
**Verification:** Exercise each transition and inspect both visible and underlying state.  
**Inclusion:** State cannot depend on motion/color alone; announcements/semantics are required when assistive recognition matters.

## `causal-transition-and-direct-manipulation`

**Problem:** UI changes lack a perceivable cause, or direct manipulation sacrifices precision/access.  
**User consequence:** Users lose location or cannot operate reliably.  
**Goal:** Preserve causal/spatial continuity while using direct manipulation only when it clarifies action-result mapping.  
**Decision rule:** Use transition/motion only to communicate causality, hierarchy, or spatial change; provide an equivalent path when manipulation is exclusionary or insufficiently precise/auditable.  
**Applies when:** Elements move/appear/disappear or direct manipulation is proposed.  
**Does not apply when:** Static replacement is already clear, or motion/manipulation adds no task information.  
**Required states/scenarios:** Trigger, transition/end state, reduced/equivalent path where relevant.  
**Avoid:** Decorative delay, drag-only precise ordering, unexplained disappearance.  
**Preferred alternative:** Stable causal change plus equivalent control.  
**Verification:** Users can connect trigger to changed object/destination and complete via required alternative path.  
**Inclusion:** Respect motion/input constraints relevant to the product.

## `state-to-next-action`

**Problem:** The current location/state does not indicate what action is available next.  
**User consequence:** Users re-read or navigate blindly.  
**Goal:** Connect current state to the next meaningful action.  
**Decision rule:** Make current location/selection/status and next available action evident when continuation exists.  
**Applies when:** Multi-state or multi-step interaction exists.  
**Does not apply when:** The state is terminal and no follow-up exists.  
**Required states/scenarios:** Entry, intermediate state, back/return, invalid/blocked state.  
**Avoid:** Step numbers without meaningful state, silent resets.  
**Preferred alternative:** Named state plus contextual next action.  
**Verification:** Navigate forward/back and confirm current, focus, selection, and retained input are correct.  
**Inclusion:** Current state cannot be position/color only.

## `completion-to-continuation`

**Problem:** Success is shown but the user cannot tell what changed or where to go next.  
**User consequence:** The flow becomes a dead end or invites duplicate work.  
**Goal:** Make completed result and meaningful continuation explicit.  
**Decision rule:** On completion, show the resulting state and next relevant action; do not silently return to unrelated prior state.  
**Applies when:** The task completes and another meaningful action exists.  
**Does not apply when:** Completion is intentionally terminal.  
**Required states/scenarios:** Submit/loading/success/next action, re-entry if relevant.  
**Avoid:** Generic “Done” with no result, automatic reset that discards context.  
**Preferred alternative:** Result-oriented success state plus next action.  
**Verification:** Complete the flow and confirm continuation does not duplicate or lose the completed effect.  
**Inclusion:** Success meaning should be text/semantic state, not celebration motion alone.

## `reversible-by-default`

**Problem:** Low-risk changes are made hard to recover from, or fake undo implies restoration that did not occur.  
**User consequence:** Users become cautious, lose work, or trust a recovery path that is false.  
**Goal:** Use truthful recovery proportional to product semantics.  
**Decision rule:** Prefer actual undo/restoration for reversible effects; distinguish pre-commit cancel, post-commit undo, and compensation; preserve state needed by the supported recovery path.  
**Applies when:** The product contract permits reliable reversal.  
**Does not apply when:** The effect is irreversible or external semantics do not support reliable reversal.  
**Required states/scenarios:** Before action, committed state, undo/restored state, expired/unavailable undo when applicable.  
**Avoid:** Visual-only undo, blanket confirmation for every reversible action.  
**Preferred alternative:** Actual state restoration with disclosed limits.  
**Verification:** Compare underlying state before action, after action, and after undo; it must be restored within promised limits.  
**Inclusion:** Recovery must be operable and perceivable without a transient pointer-only affordance.

## `consequence-before-commitment`

**Problem:** Material or irreversible effects become clear only after commitment.  
**User consequence:** Users cannot make an informed decision or cancel safely.  
**Goal:** Expose target, scope, consequence, and recovery limit at the commitment point.  
**Decision rule:** Add proportionate pre-commit consequence awareness only when the effect warrants it; cancellation must leave the effect uncommitted.  
**Applies when:** Action is irreversible or materially consequential.  
**Does not apply when:** Action is low-risk and reliably reversible.  
**Required states/scenarios:** Intent, pre-commit disclosure, cancel/no mutation, commit/result; unknown-outcome handling if remote writes apply.  
**Avoid:** Generic confirmation with no target/scope, warning only by red styling.  
**Preferred alternative:** Specific consequence summary and explicit commit/cancel paths.  
**Verification:** Cancel before commitment and prove underlying state did not mutate; verify disclosure matches actual commit semantics.  
**Inclusion:** Consequence is expressed in text/semantics, not color/icon alone.

## `localized-failure-with-visible-degradation`

**Problem:** Independent failures replace healthy UI, erase work, or fabricate completeness.  
**User consequence:** Users lose usable information/input and cannot judge what remains trustworthy.  
**Goal:** Isolate failure at the smallest safe dependency boundary and make degradation/recovery visible.  
**Decision rule:** Preserve healthy authorized state and user work; distinguish missing/stale/partial/empty; withhold invalid derived results; retry only the affected boundary; expand blocking only for foundational authorization/security/integrity/dependency failure.  
**Applies when:** UI has separable data/render regions or derived values/actions.  
**Does not apply when:** A shared foundational dependency makes the entire screen unsafe or semantically invalid.  
**Required states/scenarios:** Data failure, local render failure, retained input, retry failure, retry success, missing input to aggregate, foundation-wide block.  
**Avoid:** Whole-screen fallback for local failure, zero-fill, disappearing toast, unrelated reset, blind unknown-outcome write retry.  
**Preferred alternative:** Persistent regional error, scoped retry, truthful partial/missing state, dependent action disabled, whole-screen block only with explicit foundation reason.  
**Verification:** Inject each failure and inspect healthy region/input retention, retry outcome, aggregate/action gating, and full block only for foundational failure.  
**Inclusion:** Errors and degradation use persistent semantic status that assistive technology can recognize when applicable.
