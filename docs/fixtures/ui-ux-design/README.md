# UI/UX Design Harness local fixture

This is an **authored demonstration**, not evidence that an AI model becomes better when the `ui-ux-design` skill is used. It exists to make the harness's state and recovery requirements executable without an external provider or network service.

## What it exercises

- form input -> validation error -> correction -> submit -> loading -> success -> next action;
- selection -> move to details -> back while preserving current selection, focus target, and form input;
- a reversible local change whose Undo restores the underlying state;
- an irreversible action whose pre-commit Cancel leaves state unchanged;
- independent data and local-render failures that preserve healthy regions and user input;
- scoped retry that can fail again and later succeed;
- missing data that withholds a derived total and disables a dependent action rather than substituting zero;
- a foundational authorization/integrity failure that blocks the whole fixture with a reason and next action.

## Local verification

```bash
node --test docs/fixtures/ui-ux-design/fixture-state.test.mjs
python3 -m http.server 4173
# Then open http://127.0.0.1:4173/docs/fixtures/ui-ux-design/
```

Browser verification should exercise keyboard focus and the actual state transitions. A screenshot alone is not evidence for Undo, loading, retry, or state restoration.

## Review regressions

The state suite also checks draft/pending/saved-value separation, duplicate
submission, edit-during-save, and continuation after an edit. Browser checks
must include Tab/Shift+Tab and Escape within the native confirmation dialog,
focus return on cancel/commit, retry failure and success, and an independent
selection remaining focused when a save finishes.

The adapter integration suite (`node --test scripts/test-ui-ux-adapter-assets.mjs`)
checks ordinary profiles and actual reference-file install, update, local-edit
conflict, stale retention, prune and rollback for both adapters.
