# Agent Spectrum Kernel

Agent Spectrum Kernel (ASK) gives coding agents reusable instructions for implementation, review and verification. You can install a set of skills in a project, record issues that surface during work, and compare a revised skill with the version you use today.

## Get started

In a project with Node.js 24.x, install ASK and create a workspace for its skills, evaluation results and version history.

```sh
npm install @hiroshi.inoue/agent-spectrum-kernel@1.0.1
npx --no-install ask init --workspace ./my-ask
```

Use a new directory for the workspace. To install skills in your project, choose an adapter and profile, inspect the setup plan and apply it. The [installation guide](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/npm-distribution.md#plan-and-apply-installation) walks through these steps for Codex.

## Work with skills

- **Use a skill.** Ask your coding agent to investigate a bug, implement a change or review a diff. The installed profile determines which workflows the agent can select.
- **Collect feedback.** Enable project-local finding intake to save review findings and task observations. Select the records you want to use in a future improvement cycle. [Finding intake](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/finding-intake.md)
- **Evaluate a change.** Choose a skill, configure your model CLI and scoring criteria, and approve the evaluation cases. Compare the candidate with the current version before deciding whether to adopt it. The Full workflow requires POSIX tar and gzip. [Supervised improvement loop](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/supervised-instruction-loop.md)
- **Manage versions and share skills.** Activate an approved candidate, restore a prior version, or export an individual skill. A recipient can inspect the import and evaluate it locally. [Versioning and asset sharing](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/instruction-improvement-continuity.md)

## Further reading

[Japanese project guide](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/README.ja.md) · [Japanese installation guide](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/docs/npm-distribution-ja.md) · [Example readiness reports](https://github.com/ist-h-i/agent-spectrum-kernel/tree/main/docs/ai/reports/examples/) · [MIT license](https://github.com/ist-h-i/agent-spectrum-kernel/blob/main/LICENSE)
