# Inbox filter pull request review

Support agents use an inbox list and detail pane to triage incoming messages. They switch filters while keeping useful thread history. This pull request changes filtering and selection state.

Review the supplied diff, state contract, implementation, and tests. Write `workspace/review.json` using `workspace/review.schema.json`. The review must provide:

- Any material findings, with supplied paths and lines, the observable effect on inbox use, and the condition needed to resolve the risk.
- A truthful verification state that identifies checks actually run, their results, and any remaining uncertainty about the rendered state.

Judge intended behavior from the state contract rather than assuming every retained value is a defect. There is no required finding count. Local check names are in `workspace/package.json`. Evidence paths are relative to the supplied workspace, with an optional `workspace/` prefix.

Write only `workspace/review.json`. Run `npm run validate:review` from the workspace to check the output structure and source references. Do not change the reviewed source or tests; output validation does not establish a correct user interaction.
