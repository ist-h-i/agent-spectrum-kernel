import { toFlowSlug } from '../../domain/artifacts.js';
import type { ArtifactStore, WriteArtifactOptions } from '../../ports/artifact-store.js';
import type { Clock, ReviewOpsCoreRuntime, WorkspaceFileInfo, WorkspaceStore } from '../../ports/runtime.js';
import { joinWorkspacePath, normalizeWorkspaceRelativePath } from '../../serialization/paths.js';
import type { FlowArtifactRef } from '../../types.js';

export interface InMemoryReviewOpsRuntimeOptions {
  workspaceRoot?: string;
  now?: Date;
}

export class InMemoryWorkspaceStore implements WorkspaceStore {
  readonly workspaceRoot: string;
  private readonly directories = new Set<string>(['']);
  private readonly files = new Map<string, { content: string; modifiedAt: Date }>();
  private currentTime: Date;

  constructor(workspaceRoot = '/memory/reviewops', now = new Date('2026-05-05T00:00:00.000Z')) {
    this.workspaceRoot = workspaceRoot;
    this.currentTime = now;
  }

  setNow(now: Date): void {
    this.currentTime = now;
  }

  resolvePath(relativePath: string): string {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    return normalized.length === 0 ? this.workspaceRoot : `${this.workspaceRoot}/${normalized}`;
  }

  relativePath(absolutePath: string): string {
    if (absolutePath === this.workspaceRoot) {
      return '';
    }

    const prefix = `${this.workspaceRoot}/`;
    if (!absolutePath.startsWith(prefix)) {
      throw new Error(`Path is outside in-memory workspace: ${absolutePath}`);
    }

    return normalizeWorkspaceRelativePath(absolutePath.slice(prefix.length));
  }

  async ensureDirectory(relativePath: string): Promise<'created' | 'existing'> {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    const existed = this.directories.has(normalized);
    this.addDirectory(normalized);
    return existed ? 'existing' : 'created';
  }

  async readText(relativePath: string): Promise<string | undefined> {
    return this.files.get(normalizeWorkspaceRelativePath(relativePath))?.content;
  }

  async writeText(relativePath: string, content: string): Promise<void> {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    this.addDirectory(parentPath(normalized));
    this.files.set(normalized, { content, modifiedAt: this.currentTime });
  }

  async appendText(relativePath: string, content: string): Promise<void> {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    const current = this.files.get(normalized)?.content ?? '';
    await this.writeText(normalized, `${current}${content}`);
  }

  async directoryExists(relativePath: string): Promise<boolean> {
    return this.directories.has(normalizeWorkspaceRelativePath(relativePath));
  }

  async fileInfo(relativePath: string): Promise<WorkspaceFileInfo | undefined> {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    const file = this.files.get(normalized);
    if (file !== undefined) {
      return {
        path: normalized,
        isFile: true,
        isDirectory: false,
        modifiedAt: file.modifiedAt.toISOString(),
        mtimeMs: file.modifiedAt.getTime()
      };
    }

    if (this.directories.has(normalized)) {
      return {
        path: normalized,
        isFile: false,
        isDirectory: true,
        modifiedAt: this.currentTime.toISOString(),
        mtimeMs: this.currentTime.getTime()
      };
    }

    return undefined;
  }

  async listDirectories(relativePath: string): Promise<string[]> {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    const prefix = normalized.length === 0 ? '' : `${normalized}/`;
    const names = new Set<string>();

    for (const directory of this.directories) {
      if (directory === normalized || !directory.startsWith(prefix)) {
        continue;
      }

      const rest = directory.slice(prefix.length);
      if (rest.length > 0 && !rest.includes('/')) {
        names.add(rest);
      }
    }

    return [...names].sort();
  }

  private addDirectory(relativePath: string): void {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    if (normalized.length === 0) {
      this.directories.add('');
      return;
    }

    const segments = normalized.split('/');
    for (let index = 1; index <= segments.length; index += 1) {
      this.directories.add(segments.slice(0, index).join('/'));
    }
  }
}

export class InMemoryArtifactStore implements ArtifactStore {
  constructor(private readonly workspace: InMemoryWorkspaceStore) {}

  getRunDirectory(flowId: string, runId: string): string {
    return this.workspace.resolvePath(joinWorkspacePath('.reviewops', 'out', toFlowSlug(flowId), runId));
  }

  async write(options: WriteArtifactOptions): Promise<FlowArtifactRef> {
    const relativePath = joinWorkspacePath('.reviewops', 'out', toFlowSlug(options.flowId), options.runId, options.name);
    await this.workspace.writeText(relativePath, options.content);
    return {
      flowId: options.flowId,
      runId: options.runId,
      name: options.name,
      kind: options.kind,
      path: relativePath,
      createdAt: options.createdAt
    };
  }

  async read(ref: FlowArtifactRef): Promise<string> {
    const content = await this.workspace.readText(ref.path);
    if (content === undefined) {
      throw new Error(`In-memory artifact not found: ${ref.path}`);
    }

    return content;
  }
}

export function createInMemoryReviewOpsRuntime(options: InMemoryReviewOpsRuntimeOptions = {}): ReviewOpsCoreRuntime {
  const workspace = new InMemoryWorkspaceStore(options.workspaceRoot, options.now);
  const artifactStore = new InMemoryArtifactStore(workspace);
  const clock: Clock = {
    now: () => options.now ?? new Date('2026-05-05T00:00:00.000Z')
  };

  return {
    workspaceRoot: workspace.workspaceRoot,
    clock,
    artifactStore,
    workspace,
    projectStore: workspace,
    cycleStateStore: workspace,
    metricsStore: workspace,
    ruleStore: workspace,
    actionLogStore: workspace,
    workspaceFileReader: workspace
  };
}

function parentPath(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index === -1 ? '' : relativePath.slice(0, index);
}
