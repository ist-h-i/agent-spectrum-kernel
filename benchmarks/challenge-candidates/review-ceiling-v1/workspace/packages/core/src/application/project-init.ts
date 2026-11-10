import { listReviewOpsCommandCatalog } from '../meta/command-catalog.js';
import { renderDefaultReviewOpsMetricsSnapshot } from '../metrics/review-work.js';
import type { ProjectStore } from '../ports/runtime.js';
import { stringifyJsonDocument } from '../serialization/json.js';

export interface ProjectInitRuntime {
  readonly workspaceRoot: string;
  readonly projectStore: ProjectStore;
}

export interface InitializeProjectWithRuntimeOptions {
  runtime: ProjectInitRuntime;
}

export interface ProjectInitResult {
  workspaceRoot: string;
  sharedRoot: string;
  localRoot: string;
  created: string[];
  existing: string[];
  updated: string[];
}

const sharedDirectories = [
  '.reviewops',
  '.reviewops/templates',
  '.reviewops/metrics',
  '.reviewops/knowledge',
  '.reviewops/out'
];

const localDirectories = [
  '.reviewops.local',
  '.reviewops.local/prompt-packs.local',
  '.reviewops.local/ai-responses.local'
];

const sharedFiles: ReadonlyMap<string, string> = new Map([
  [
    '.reviewops/config.yaml',
    [
      'version: 1',
      'product: ReviewOps',
      'workspaceFiles:',
      '  shared: .reviewops/',
      '  local: .reviewops.local/',
      'aiExecution: manual-only',
      ''
    ].join('\n')
  ],
  [
    '.reviewops/commands.json',
    stringifyJsonDocument({
      version: 1,
      commands: listReviewOpsCommandCatalog()
    })
  ],
  [
    '.reviewops/templates/prompt-templates.yaml',
    [
      'version: 1',
      'templates:',
      '  - id: diff-review-default',
      '    flowId: diff/review',
      '    version: 1',
      '    sections:',
      '      - id: purpose',
      '        title: Purpose',
      '      - id: projectContext',
      '        title: Project Context',
      '      - id: target',
      '        title: Target',
      '      - id: inputSummary',
      '        title: Input Summary',
      '      - id: rules',
      '        title: Rules / Guidelines',
      '      - id: task',
      '        title: Task',
      '      - id: expectedOutput',
      '        title: Expected Output',
      '      - id: outputSchema',
      '        title: Output JSON Schema',
      ''
    ].join('\n')
  ],
  [
    '.reviewops/templates/output-schemas.yaml',
    ['version: 1', 'schemas: []', ''].join('\n')
  ],
  [
    '.reviewops/metrics/review-work.yaml',
    renderDefaultReviewOpsMetricsSnapshot()
  ],
  [
    '.reviewops/knowledge/coding-guidelines.yaml',
    ['version: 1', 'guidelines: []', ''].join('\n')
  ],
  [
    '.reviewops/knowledge/review-rules.yaml',
    ['version: 1', 'rules: []', ''].join('\n')
  ],
  [
    '.reviewops/knowledge/architecture-rules.yaml',
    ['version: 1', 'rules: []', ''].join('\n')
  ],
  [
    '.reviewops/knowledge/docs-drift-rules.yaml',
    ['version: 1', 'rules: []', ''].join('\n')
  ],
  [
    '.reviewops/knowledge/test-rules.yaml',
    ['version: 1', 'rules: []', ''].join('\n')
  ],
  [
    '.reviewops/knowledge/generic-debt-patterns.yaml',
    ['version: 1', 'patterns: []', ''].join('\n')
  ],
  [
    '.reviewops/knowledge/project-debt.yaml',
    ['version: 1', 'debt: []', ''].join('\n')
  ],
  [
    '.reviewops/knowledge/roadmap-skills.yaml',
    ['version: 1', 'skills: []', ''].join('\n')
  ]
]);

const localFiles: ReadonlyMap<string, string> = new Map([
  [
    '.reviewops.local/project-context.local.yaml',
    ['version: 1', 'context: {}', ''].join('\n')
  ],
  [
    '.reviewops.local/project-rules.local.yaml',
    ['version: 1', 'rules: []', ''].join('\n')
  ],
  [
    '.reviewops.local/project-debt.local.yaml',
    ['version: 1', 'debt: []', ''].join('\n')
  ],
  [
    '.reviewops.local/provider-target.local.yaml',
    ['version: 1', 'provider: null', 'target: null', ''].join('\n')
  ],
  ['.reviewops.local/raw-findings.local.jsonl', ''],
  ['.reviewops.local/field-evidence.local.jsonl', ''],
  ['.reviewops.local/metrics-events.local.jsonl', ''],
  [
    '.reviewops.local/current-cycle.local.json',
    stringifyJsonDocument({ version: 1, currentCycle: null })
  ]
]);

export async function initializeReviewOpsProjectWithRuntime(
  options: InitializeProjectWithRuntimeOptions
): Promise<ProjectInitResult> {
  const { runtime } = options;
  const result: ProjectInitResult = {
    workspaceRoot: runtime.workspaceRoot,
    sharedRoot: runtime.projectStore.resolvePath('.reviewops'),
    localRoot: runtime.projectStore.resolvePath('.reviewops.local'),
    created: [],
    existing: [],
    updated: []
  };

  for (const directory of [...sharedDirectories, ...localDirectories]) {
    await ensureDirectory(runtime, directory, result);
  }

  for (const [relativePath, content] of [...sharedFiles, ...localFiles]) {
    await writeIfMissing(runtime, relativePath, content, result);
  }

  await ensureReviewOpsLocalIgnored(runtime, result);

  return result;
}

async function ensureDirectory(
  runtime: ProjectInitRuntime,
  relativePath: string,
  result: ProjectInitResult
): Promise<void> {
  const status = await runtime.projectStore.ensureDirectory(relativePath);
  result[status === 'created' ? 'created' : 'existing'].push(relativePath);
}

async function writeIfMissing(
  runtime: ProjectInitRuntime,
  relativePath: string,
  content: string,
  result: ProjectInitResult
): Promise<void> {
  const current = await runtime.projectStore.readText(relativePath);
  if (current !== undefined) {
    result.existing.push(relativePath);
    return;
  }

  await runtime.projectStore.writeText(relativePath, content);
  result.created.push(relativePath);
}

async function ensureReviewOpsLocalIgnored(runtime: ProjectInitRuntime, result: ProjectInitResult): Promise<void> {
  const gitignorePath = '.gitignore';
  const ignoreLine = '.reviewops.local/';
  const current = await runtime.projectStore.readText(gitignorePath);

  if (current === undefined) {
    await runtime.projectStore.writeText(gitignorePath, `${ignoreLine}\n`);
    result.created.push(gitignorePath);
    return;
  }

  if (current.split(/\r?\n/u).includes(ignoreLine)) {
    result.existing.push(gitignorePath);
    return;
  }

  const suffix = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  await runtime.projectStore.writeText(gitignorePath, `${current}${suffix}${ignoreLine}\n`);
  result.updated.push(gitignorePath);
}
