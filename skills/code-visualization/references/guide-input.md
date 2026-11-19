# Local guide input

Run Node using the renderer next to the installed skill, for example:

```sh
node .agents/skills/code-visualization/references/render-guide.mjs guide.json guide.html --repo /path/to/checkout
# Claude Code projection: .claude/skills/code-visualization/references/render-guide.mjs
```

Use a fresh output file. `--repo` defaults to the current Git checkout. Generation needs local Git commits and blobs; the renderer will not fetch missing source. No npm packages, server, account, or internet are needed to open and explore the file. Clicking a GitHub evidence link is optional and requires GitHub reachability plus any applicable repository permissions; the exact revision, path, line, and an expandable excerpt from the committed source remain visible offline. Set `githubRepository` only for an observed GitHub repository (same repository for all attached evidence); omit it for local-only or other providers. The file includes real committed source excerpts selected by your locators. Do not select secret-bearing or private material for output that might be shared; do not include entire source files. Saving locally never authorizes any sharing.

## Input shape

- `mode`: `"catch-up"` or `"pr"`.
- `title`, `purpose`, `scope`: reader-facing strings; optional `language` is `"en"` (default) or `"ja"`.
- `revision`: inspected full 40-hex commit; `baseRevision` required in PR mode.
- Optional `githubRepository`: `owner/repo` for pinned source links.
- `flows`: one or more representative paths. Each has `title` and `summary`. In catch-up, add ordered `steps`. In PR mode set `change` for each flow: `"modified"` requires both `beforeSteps` and `steps`; `"added"` requires `steps` only; `"removed"` requires `beforeSteps` only. The renderer labels an absent side. State the user-visible effect or affected behavior in the summary.
- Each step has `label`, `detail`, `status` (`code`, `executed`, or `unknown`), and optional `evidence` and `branches`. A branch uses the same label/detail/status/evidence fields and attaches to the step where its condition occurs. `code` must carry a source/test-file ref; `executed` must carry an observed run locator. `unknown` explains what's unavailable or not observed.
- Evidence item: either `{label, path, startLine, endLine?, at?}` (repo-relative path, positive line numbers; at most 50 lines and 12 KiB per excerpt; `at` is `target` or `base`), or a plain-text `{label, run}` locator for an actual run. The default side follows the row; a locator should identify the command and artifact/run, not imply successful execution.
- `unknowns`: array of meaningful unverified points, if any.

Example (fictional content; replace all locators with checked ones):

```json
{
  "mode": "catch-up",
  "title": "Saving a record",
  "purpose": "Find the records feature and see why a write can be rejected.",
  "scope": "Records module; background jobs not inspected.",
  "revision": "1111111111111111111111111111111111111111",
  "flows": [{
    "title": "Save a record",
    "summary": "The request enters through the records route.",
    "steps": [{
      "label": "Validate input",
      "detail": "The save route checks the input before passing it to storage.",
      "status": "code",
      "evidence": [{"label": "Save route", "path": "src/records.ts", "startLine": 31}],
      "branches": [{
        "label": "Invalid input",
        "detail": "The route returns the validation result without writing.",
        "status": "code",
        "evidence": [{"label": "Rejection branch", "path": "src/records.ts", "startLine": 37}]
      }]
    }]
  }],
  "unknowns": ["Persistence behavior was not exercised."]
}
```

The renderer rejects a missing commit, missing or non-regular source file, or an out-of-range location. A structurally valid guide is not proof that its narrative fits the source or that the GitHub URL is accessible. Inspect the referenced lines; preserve the distinction between code reading, execution evidence, and unknowns.
