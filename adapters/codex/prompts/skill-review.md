---
description: Run the Agent Spectrum Kernel review flow for the current PR, branch diff, or generated output in Codex.
---

Use the repository `AGENTS.md` and projected skills from `.agents/skills`.

Start with `review-router` to decide applicable review layers. Run only required gates. End with `review-final-merge-gate` style output.

If the checked-out workspace, PR head, changed files, relevant docs, generated output, or verification evidence is unavailable, mark the affected layer as `insufficient evidence` instead of treating it as skipped.

Review output:

```text
Decision:
- approve | approve with comments | request changes | block | insufficient evidence

Layer summary:
- Domain: pass | fail | skipped | insufficient evidence - evidence/reason
- Architecture: pass | fail | skipped | insufficient evidence - evidence/reason
- Design: pass | fail | skipped | insufficient evidence - evidence/reason
- Logic: pass | fail | skipped | insufficient evidence - evidence/reason
- Output quality: pass | fail | skipped | insufficient evidence - evidence/reason
- Test / verification: pass | fail | skipped | insufficient evidence - evidence/reason
- Style / maintainability: pass | fail | skipped | insufficient evidence - evidence/reason
- Mechanical: pass | fail | skipped | insufficient evidence - evidence/reason
- Adversarial risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Risk: pass | fail | skipped | insufficient evidence - evidence/reason
- Evidence: pass | fail | skipped | insufficient evidence - evidence/reason

Required fixes:
- [severity] file:line - issue, evidence, required fix

Suggestions:
- ...

Evidence reviewed:
- ...

Residual risk:
- ...
```

Keep current-PR blockers separate from non-blocking improvement-ledger candidates. Do not publish comments, labels, checks, metrics, or notifications externally unless the user explicitly requested that external action and `risk-gate` approved it.

$ARGUMENTS
