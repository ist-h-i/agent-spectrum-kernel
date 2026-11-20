# Formatting toolbar pull request review

An editor uses the formatting toolbar while writing a customer notice. Decide whether the proposed keyboard changes allow the editor to keep their place and continue to the next control. Use the supplied diff, markup, implementation and `docs/interaction-notes.md`.

Serve this workspace over localhost (for example, `python3 -m http.server 8000 --bind 127.0.0.1`) and open `/notice-editor.html`. Choose a keyboard path from the control before the toolbar, through its controls and out again. Record the expected and observed focus, page movement and next available action. Manual keyboard use and browser automation are equally acceptable. Identify the browser or the simulated event fixture used for each observation. If a browser is unavailable, say which results remain unobserved.

Write only `review.json` in this workspace using `review.schema.json`. Cite supplied paths and line numbers for material findings. Explain the consequence for the editor, the merge recommendation, and an observable condition for accepting the change. The scripts in `package.json` are available for local checks. Run `npm run validate:review` and report the result.
