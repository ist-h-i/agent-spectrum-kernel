# Produce a local object map

Use the renderer next to the installed skill:

```sh
node .agents/skills/code-visualization/references/render-guide.mjs guide.json guide.html --repo /path/to/checkout
# Claude Code: .claude/skills/code-visualization/references/render-guide.mjs
```

Choose a fresh output file. `--repo` defaults to the current checkout; a directory inside it works. Local commits and blobs are required. The renderer does not fetch missing content. The output is a single HTML file; open it in a JavaScript-enabled browser. Playback is a source-informed explanation, not execution or a timing measurement. The HTML has no packages, server, external assets or background network calls. Optional GitHub evidence links require an explicit click. Use `githubRepository` only for an observed GitHub `owner/repo` matching the evidence. Otherwise read committed excerpts without leaving the file.

The file includes exact, compact source excerpts. Never include secrets or whole files. A local write does not authorize sharing or publication.

## Describe the evidence and objects separately

- Guide: `mode` (`catch-up` or `pr`), `title`, `purpose`, `scope`, `revision` (full commit SHA), and `flows`. Add `baseRevision` in PR mode, optional `language` (`en` or `ja`) and `unknowns` to record material gaps.
- Flow: `title`, `summary`, source `steps`, and the `visual` object described below. In PR mode set `change`: `modified` requires both `beforeSteps` and `steps`, with `delta` (`changed` or `unchanged`) on each step; `added` requires `steps` only; `removed` requires `beforeSteps` only. Do not label steps in added/removed flows with a delta. The renderer labels an absent side.
- Step: `label`, `detail`, `status` (`code`, `executed`, or `unknown`), optional `evidence` and `branches`. A branch has the same evidence fields. A `code` step needs a source or test file on its own side; refer to a test as code unless its execution was observed. An `executed` step needs an actual run locator. A structurally valid locator does not establish correctness.
- Evidence: `{label, path, startLine, endLine?, at?}` for a committed regular file (relative path; up to 50 lines and 12 KiB per excerpt; optional side `at: "base"|"target"` defaults to the bound step side). A run uses plain text `{label, run}` with a command/output locator. Missing commits, paths and ranges fail rendering.

Each flow's `visual` has:

| Field | What to describe |
| --- | --- |
| `nodes` | Objects with unique `id`, concise `label`, optional `caption`, `shape`, horizontal `stage` (0-based), optional `track` (-1, 0, 1; default 0), and `refs` to the evidence that explains their role. Narrow screens arrange stages vertically. Place the same comparison object only once. |
| `shape` | Choose the closest meaning: `request`, `artifact`, `shelf`, `route`, `gate`, `person`, `result`, `list`, `stop`, `service`. A `person` shows who receives the work; do not jump from permission directly to successful completion. |
| `refs` | One or more `{side, step, branch?}` locators. Use zero-based step/branch indexes; `side` is `base` or `target`. Bind both sides when an object is shared in a PR comparison. |
| `items` | Optional named marks for identities, each `{id, label, excluded?}`. A stable `id` and label let people recognize an object in separate locations. Use `excluded: true` for an item still present but not carried forward. |
| `cases` | Alternatives with `label` and an ordered array of object IDs for each existing version (`base`, `target`). Compare the same input object on both sides. Include each diagrammed object in at least one case. |
| `overrides` | Optional in a case: use an object ID as the key and a short `label`, `caption`, a `state` (`empty` or `blocked`), or `items` (a list of this object's existing identity IDs to show in that case). An `empty` object cannot appear on that case's path. Use a returned result on the path, a label and `items: []` for a valid zero outcome instead. |

Use a few meaningful cases. The renderer limits one scene to 16 objects over 8 stages, 8 cases, and up to 6 identity marks per object so graphs stay readable. Split distinct questions into separate flows instead of packing every call into one diagram. Keep names brief and inspect the static view before adding replay; participants should distinguish the outcome by shape, route, and identity, not by reading a paragraph or relying on color.

For example, for a single committed path with two evidence steps:

```json
{
  "nodes": [
    {"id":"request","label":"Request","shape":"request","stage":0,"refs":[{"side":"target","step":0}]},
    {"id":"receipt","label":"Receipt","shape":"result","stage":1,"refs":[{"side":"target","step":1}]}
  ],
  "cases": [{"label":"Ordinary input","target":["request","receipt"]}]
}
```

Full examples with pinned public ASK source: [PR comparison](examples/pr497.json) and [code catch-up](examples/skill-assets.json). Both are source-derived scenarios, not stored live runs. These files are input examples, not assumptions about another project. Use only exact evidence from the project being visualized.
