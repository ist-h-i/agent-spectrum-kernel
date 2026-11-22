# Agent Spectrum Kernel

Agent Spectrum Kernel (ASK) is a foundation for evaluating and improving the skills and prompts your coding agents use. Capture problems from real tasks, then run evals to see whether a revised instruction helps.

## Run evals on 35 simulated engineering tasks

Choose from tasks such as diagnosing a flaky CI cache, reviewing an accessibility interaction or planning a data migration. Compare the current skill or prompt with a candidate on the same task using the same scoring criteria. [Browse the evaluation catalog](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/evaluation-task-catalog.md)

## Turn findings into the next eval

Enable finding intake to collect user corrections and review findings as you work. For example, if a review misses a stale loading state, save the finding, revise the review prompt and try it on the frontend state review task. Inspect both results before choosing the baseline for your next cycle.

## Get started

With Node.js 24.x, run these commands in your project:

```sh
npm install @hiroshi.inoue/agent-spectrum-kernel@1.0.1
npx --no-install ask init --workspace ./my-ask
npx --no-install ask --workspace ./my-ask evaluate task-list
```

[Set up your coding agent](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/npm-distribution.md#plan-and-apply-installation) · [Run an improvement cycle](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/supervised-instruction-loop.md) · [Example reports](https://github.com/ist-h-i/agent-spectrum-kernel/tree/main/docs/ai/reports/examples/) · [Japanese guide](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/README.ja.md)
