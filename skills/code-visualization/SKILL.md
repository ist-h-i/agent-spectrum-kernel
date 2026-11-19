---
name: code-visualization
description: Produce an interactive local HTML guide for understanding a PR's changes or catching up on existing code without a PR or diff. Start with a visual map, then let readers follow representative paths to exact source and tests.
---

# Code visualization

## Purpose

Create the guide when asked to visualize a change or understand existing code visually. Use [the renderer and input reference](references/guide-input.md). Rendering is a local, additive action, not a review gate, an approval, or a decision to publish.

## Process

1. Choose the question and reading boundary. For **PR review**, use the actual base/head commits, inspect the diff and affected consumers, and show what changes from before to after, the impact, and what remains unverified. For **code catch-up**, use a repository or directory at one revision; no PR, diff, or specific question is required. Identify what the code does, where to start, and the main behavior paths. If a specific goal is given, narrow the first view to that goal. If a boundary is omitted, use the current checkout; disclose omissions that could affect understanding.
2. Inspect real entry points, configuration, implementation and relevant tests. Pick representative paths that answer the reader's question, including important branches or failures. Diagram the behavior, not the directory tree or every function. Use a matching C4 asset as optional context only; verify against source when missing, stale, or contradictory.
3. Prepare the guide input. Put each decision or meaningful step in the map with concise labels. Use expandable detail for conditions, consequences, and references. Verify each source path and line against its exact revision. A test file shows test intent, not evidence that a test was run. Only label a claim execution-confirmed if you observed a matching run and can point to its evidence. Do not claim complete coverage; list meaningful unknowns.
4. Generate the self-contained HTML with the bundled renderer. Save to a new path in a user-appropriate local scratch/output directory. Do not change tracked project files, run unrelated code, attach/export private code, or upload automatically. If shell execution, a suitable local output directory or the renderer is unavailable, say what is missing instead of claiming that a guide was generated. Report the file path, scope, and material limitations.
5. Check at least one path from the overview through a meaningful branch or step to its evidence. Inspect the HTML in a browser when available. If the checked-out code has uncommitted edits, pinned links still point to committed content; either visualize the committed revision or explain the omitted changes.

## Output

Deliver the local HTML path, its scope and revision, and what remains unverified. Do not attach, publish, or claim a review decision by default.

For an actual review decision use `review-router`; for a durable rationale or rollback note use `mr-readme-generation`; for comparing specification/test scenarios use the visual-review reference in `spec-driven-development`. Generating this guide does not replace any of those workflows.
