# Example: MR README generation

## Request

```text
Create an MR README for this change. Make it useful for human reviewers and future AI coding agents.
```

## Workflow

Use:

```text
mr-readme-generation
adr-review if hard-to-reverse architecture decisions appear
review-router only if a merge decision is requested
```

## Expected output

```text
MR README:
- Path: docs/mr/feature-task-export.md
- Created or updated: created
- Evidence reviewed: MR description, diff, changed files, nearby tests, related docs
- Evidence gaps: CI was not available
- ADR status: none
- Review decision emitted: no
- Follow-up skills: review-router if the user later asks whether to merge
```

The generated document should preserve MR概要, 影響範囲, リスク, 切り戻し方針, ドメイン領域, アーキテクチャー判断ログ, 設計思想, 検証結果, 後続AI向け再利用メモ, and 人間レビューで固定したい理解.
