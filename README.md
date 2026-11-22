# Agent Spectrum Kernel

**Agent Spectrum Kernel (ASK) is a self-improvement platform for AI-driven development environments.** It helps you turn problems you encounter during development into evals for the skills and prompts your coding agents use.

Suppose your agent reviews a change and misses a loading indicator that never clears. With finding intake enabled, you can save that observation, revise the review prompt, and choose a frontend state review from ASK’s **35 simulated engineering tasks**. The [eval catalog](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/evaluation-task-catalog.md) also covers work such as diagnosing flaky CI and planning data migrations.

Run the current and revised prompts on the same task with the same scoring criteria. Inspect what each review caught or missed, then decide which version to carry into the next real task.

## Get started

With Node.js 24.x, run these commands in your project:

```sh
npm install @hiroshi.inoue/agent-spectrum-kernel@1.0.1
npx --no-install ask init --workspace ./my-ask
npx --no-install ask --workspace ./my-ask evaluate task-list
```

[Set up your coding agent](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/npm-distribution.md#plan-and-apply-installation) · [Run an improvement cycle](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/supervised-instruction-loop.md) · [Example reports](https://github.com/ist-h-i/agent-spectrum-kernel/tree/main/docs/ai/reports/examples/) · [Japanese guide](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/README.ja.md)
