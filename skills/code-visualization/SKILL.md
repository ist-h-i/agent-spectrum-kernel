---
name: code-visualization
description: Produce an interactive local HTML guide for understanding a PR's changes or catching up on existing code without a PR or diff. Start with a visual map, then let readers follow representative paths to exact source and tests.
---

# Code visualization

## Purpose

Create the guide when asked to visualize a change or understand existing code visually. Use [the renderer and input reference](references/guide-input.md). Rendering is a local, additive action, not a review gate, an approval, or a decision to publish.

## Process

1. Choose the question and reading boundary. For **PR review**, use the actual base/head commits, inspect the diff and affected consumers, and show what changes from before to after, the impact, and what remains unverified. For **code catch-up**, use a repository or directory at one revision; no PR, diff, or specific question is required. Identify what the code does, where to start, and the main behavior paths. If a specific goal is given, narrow the first view to that goal. If a boundary is omitted, use the current checkout; disclose omissions that could affect understanding.
2. Inspect real entry points, configuration, implementation and relevant tests. Pick an object a human cares about (a request, an identity, a record, a file or a result). Show what it encounters, what changes, and what remains. For PRs, compare the same input across versions on one map. Show permission or other conditions, the person or system that receives work, and the actual result as separate objects when that distinction matters. For catch-up, show what is copied, retained, excluded, transformed or not returned; do not draw a directory dump. Use a matching C4 asset as optional context only.
3. Prepare the guide input. Choose meaningful shapes and short identity labels, selective branches and representative cases. Include a successful zero outcome separately from no result if relevant. Place related states so the first static view tells the story; replay and a single step should show what happens, not replace the static view. Put explanation, verified source and tests behind object selection. Only cite source at exact commits, only excerpt what is needed, and label observed runs separately from static code evidence. Unknown cases must stay visible as unknown; do not claim exhaustive coverage.
4. Generate the self-contained HTML with the bundled renderer. Pass the source repository checkout if different from the current directory. Save to a new path in a user-appropriate local scratch/output directory. Do not change tracked project files, run unrelated code, attach/export private code, or upload automatically. If shell execution, a suitable local output directory or the renderer is unavailable, say what is missing instead of claiming that a guide was generated. Report the file path, scope, and material limitations.
5. Check at least one successful and consequential alternative path if the code has both. In a browser, check the static map, playback and stepping, and open a source excerpt. On a narrow screen confirm labels do not overlap the route. If browser verification is unavailable, state that it was not done. If the checked-out code has uncommitted edits, pinned links still point to committed content; either visualize the committed revision or explain the omitted changes.

## Output

Deliver the local HTML path, its scope and revision, and what remains unverified. Do not attach, publish, or claim a review decision by default.

For an actual review decision use `review-router`; for a durable rationale or rollback note use `mr-readme-generation`; for comparing specification/test scenarios use the visual-review reference in `spec-driven-development`. Generating this guide does not replace any of those workflows.
