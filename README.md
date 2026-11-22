# Agent Spectrum Kernel

Agent Spectrum Kernel (ASK) is a shared foundation for coding agents. It gives a project a place to keep its skills, prompts and evaluation history, so a lesson from one task can improve how the next task is done.

## Turn a recurring problem into a better instruction

1. **Capture the problem.** With finding intake enabled, save a missed requirement, a user correction or a review finding while the context is fresh.
2. **Test a revision.** Turn the observation into a candidate skill or prompt. Choose a simulated task that exercises the problem, set the scoring criteria, then compare the current and revised instructions on the same task.
3. **Keep what works.** Review the results and decide whether to adopt the revision. The approved version becomes the baseline for the next cycle.

For example, if a reviewer repeatedly misses unsaved edits, record one occurrence and compare two review prompts on a simulated change with that flaw.

## Get started

With Node.js 24.x, run these commands in your project:

```sh
npm install @hiroshi.inoue/agent-spectrum-kernel@1.0.1
npx --no-install ask init --workspace ./my-ask
```

[Set up your coding agent](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/npm-distribution.md#plan-and-apply-installation) · [Run an improvement cycle](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/supervised-instruction-loop.md) · [Example reports](https://github.com/ist-h-i/agent-spectrum-kernel/tree/main/docs/ai/reports/examples/) · [Japanese guide](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/README.ja.md)
