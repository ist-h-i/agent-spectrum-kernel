export const CLAUDE_RUNTIME_FILES = Object.freeze([
  { name: "ai-metrics-record.mjs", source: "scripts/ai-metrics-record.mjs", target: "scripts/ai-metrics-record.mjs", assetKind: "runner" },
  { name: "ai-metrics-summarize.mjs", source: "scripts/ai-metrics-summarize.mjs", target: "scripts/ai-metrics-summarize.mjs", assetKind: "runner" },
  { name: "ai-ledger-refresh.mjs", source: "scripts/ai-ledger-refresh.mjs", target: "scripts/ai-ledger-refresh.mjs", assetKind: "runner" },
  { name: "execution-envelope.mjs", source: "scripts/execution-envelope.mjs", target: "scripts/execution-envelope.mjs", assetKind: "runner" },
  { name: "adapter-runtime-event.mjs", source: "scripts/adapter-runtime-event.mjs", target: "scripts/adapter-runtime-event.mjs", assetKind: "runner" },
  { name: "observability-paths.mjs", source: "scripts/observability-paths.mjs", target: "scripts/observability-paths.mjs", assetKind: "runner" },
  { name: "execution-envelope.schema.json", source: "schemas/execution-envelope.schema.json", target: "scripts/execution-envelope.schema.json", assetKind: "schemas" },
  { name: "metrics-event.schema.json", source: "schemas/metrics-event.schema.json", target: "scripts/metrics-event.schema.json", assetKind: "schemas" },
  { name: "adapter-runtime-event.schema.json", source: "schemas/adapter-runtime-event.schema.json", target: "scripts/adapter-runtime-event.schema.json", assetKind: "schemas" },
]);

export const CODEX_RUNTIME_FILES = Object.freeze([
  { name: "codex-exec-runner.mjs", source: "scripts/codex-exec-runner.mjs", target: "scripts/codex-exec-runner.mjs", assetKind: "runner" },
  { name: "ask-sensors.mjs", source: "scripts/ask-sensors.mjs", target: "scripts/ask-sensors.mjs", assetKind: "runner" },
  { name: "ask-shared.mjs", source: "scripts/ask-shared.mjs", target: "scripts/ask-shared.mjs", assetKind: "runner" },
  { name: "execution-envelope.mjs", source: "scripts/execution-envelope.mjs", target: "scripts/execution-envelope.mjs", assetKind: "runner" },
  { name: "adapter-runtime-event.mjs", source: "scripts/adapter-runtime-event.mjs", target: "scripts/adapter-runtime-event.mjs", assetKind: "runner" },
  { name: "execution-envelope.schema.json", source: "schemas/execution-envelope.schema.json", target: "scripts/execution-envelope.schema.json", assetKind: "schemas" },
  { name: "metrics-event.schema.json", source: "schemas/metrics-event.schema.json", target: "scripts/metrics-event.schema.json", assetKind: "schemas" },
  { name: "adapter-runtime-event.schema.json", source: "schemas/adapter-runtime-event.schema.json", target: "scripts/adapter-runtime-event.schema.json", assetKind: "schemas" },
]);

export const ADAPTER_RENDERER_METADATA = Object.freeze({
  claude_code: Object.freeze({
    rendererId: "install-claude-adapter",
    rendererVersion: "4",
    installerPath: "scripts/install-claude-adapter.mjs",
  }),
  codex: Object.freeze({
    rendererId: "install-codex-adapter",
    rendererVersion: "4",
    installerPath: "scripts/install-codex-adapter.mjs",
  }),
});

export const ADAPTER_MANAGED_ASSET_REQUIREMENTS = Object.freeze({
  claude_code: Object.freeze([
    { path: ".claude/skills", assetKind: "skills", ownershipMode: "selected_files" },
    { path: ".claude/commands", assetKind: "commands", ownershipMode: "selected_files" },
    { path: ".claude/settings.json", assetKind: "hooks", ownershipMode: "partial_file" },
    ...CLAUDE_RUNTIME_FILES.map((file) => ({ path: file.target, assetKind: file.assetKind, ownershipMode: "full_file" })),
    { path: "docs/ai/observability-config.yml", assetKind: "configuration", ownershipMode: "full_file" },
    { path: "docs/ai/metrics", assetKind: "runtime_data", ownershipMode: "runtime_directory" },
    { path: "docs/ai/reports", assetKind: "runtime_data", ownershipMode: "runtime_directory" },
  ]),
  codex: Object.freeze([
    { path: ".agents/skills", assetKind: "skills", ownershipMode: "selected_files" },
    { path: ".agents/prompts", assetKind: "prompts", ownershipMode: "selected_files" },
    { path: ".agents/commands", assetKind: "commands", ownershipMode: "selected_files" },
    ...CODEX_RUNTIME_FILES.map((file) => ({ path: file.target, assetKind: file.assetKind, ownershipMode: "full_file" })),
  ]),
});
