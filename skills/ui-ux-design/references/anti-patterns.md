# Representative UI/UX anti-patterns

Use these as prompts to inspect a concrete interface, not universal bans or a finding quota. Name the observed location/state, concrete relationship, reading or interaction impact and repair direction. Visible roughness can be a supported finding even when operation succeeds; distinguish it from an optional aesthetic alternative. Do not call an interface “unpolished” without explaining what is wrong.

## Structure and language

- Abstract or hero-sized headings that displace the task in a task-oriented UI.
- Subtitle-by-default or title/subtitle/label/description that repeat the same meaning.
- Long explanation walls used to compensate for weak grouping, ordering, control labels, or visible state.
- Card-everything and nested cards that erase information hierarchy.
- Equal visual weight for primary and secondary information or competing primary actions.
- Step numbers that do not communicate current state, completion, or what changes next.
- Decorative badges, icons, gradients, or motion with no semantic role.
- Asking the user to re-enter information the system already knows without a reason.
- Ambiguous action labels such as only “Next” or “Continue” where the consequence is not evident.
- A completed flow that provides no meaningful continuation where one exists.

## Visual finish and evidence

- Treating no overflow, non-collision, passing tests or contract compliance as overall visual approval.
- Checking text-to-arrow clearance while overlooking an arrow crowded against its frame; confusing CSS padding with native indicator geometry.
- Uneven optical alignment, accidental wrapping or cramped text/icon/border relationships that weaken scanning despite working controls.
- Polishing isolated controls before checking whole-screen hierarchy and density.
- Automatically shrinking an appropriate introduction heading or loosening a useful comparison list merely to fit one preferred style.
- Approving Japanese strings in isolation when their location or changed state makes the target/result misleading.
- Claiming a screenshot was reviewed after only saving it or extracting its text, or inventing precise pixel measurements/implementation causes from appearance alone.

## Affordance, state, and behavior

- Interactive content that is perceivable as interactive only because nearby prose explains it.
- Clickable text/cards without a consistent signifier, or identical controls that produce materially different categories of result without visible context.
- Focus, selected, disabled, loading, error, success, and completed states that are indistinguishable when the distinction matters.
- Accepting an action without acknowledgement or allowing duplicate consequential actions during loading.
- Errors that do not name the affected target/region or available recovery.
- Elements appearing/disappearing without a perceivable relationship to the triggering action.
- Hover-only, drag-only, gesture-only, color-only, icon-only, or motion-only critical meaning without an equivalent/redundant path.
- Decorative animation that delays or obscures completion.
- Direct manipulation where precise, auditable, or keyboard-operable input is required but no equivalent path exists.

## Reversibility and partial failure

- Presenting an irreversible action like a routine reversible action, or revealing consequences only after commitment.
- An “undo” or “cancel” that changes only the display after the external/underlying effect has committed.
- Blanket confirmation dialogs for low-risk reversible actions instead of proportionate recovery.
- Replacing the whole screen because one independent data or render region failed.
- Retrying one region by resetting unrelated form input, selection, or navigation.
- Hiding unresolved failure in a toast that disappears.
- Treating failed/missing data as an empty list, zero, or complete aggregate.
- Showing a derived decision/action even though required inputs are partial or stale and the result is not valid for that decision.
- Blindly retrying a write whose outcome is unknown.
- Using whole-screen blocking without a screen-wide authorization, integrity, security, or dependency reason.
