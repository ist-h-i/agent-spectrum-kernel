# Agent Spectrum Kernel

Your coding agent misses a stale loading state in review. You catch it this time. How do you know a better review prompt would catch it next time?

Agent Spectrum Kernel (ASK) gives you a foundation for improving coding skills and prompts through evals. Enable finding intake to save the missed issue while its context is fresh. Use that finding to draft a revised prompt and choose a task that tests it.

**ASK includes 35 simulated engineering tasks**, from frontend state reviews to flaky CI investigations and data migration planning. Run the original and revised prompts on the same task with the same scoring criteria. Inspect what each one caught or missed, then decide which version your agent should use on its next review. [Browse the eval catalog](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/evaluation-task-catalog.md)

## Get started

With Node.js 24.x, run these commands in your project:

```sh
npm install @hiroshi.inoue/agent-spectrum-kernel@1.0.1
npx --no-install ask init --workspace ./my-ask
npx --no-install ask --workspace ./my-ask evaluate task-list
```

[Set up your coding agent](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/npm-distribution.md#plan-and-apply-installation) · [Run an improvement cycle](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/supervised-instruction-loop.md) · [Example reports](https://github.com/ist-h-i/agent-spectrum-kernel/tree/main/docs/ai/reports/examples/) · [Japanese guide](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/README.ja.md)
