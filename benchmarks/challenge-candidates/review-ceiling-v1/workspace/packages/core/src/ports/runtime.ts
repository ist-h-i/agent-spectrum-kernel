import type { ArtifactStore } from './artifact-store.js';

export interface Clock {
  now(): Date;
}

export interface WorkspaceFileInfo {
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  modifiedAt: string;
  mtimeMs: number;
}

export interface WorkspaceStore {
  readonly workspaceRoot: string;
  resolvePath(relativePath: string): string;
  relativePath(absolutePath: string): string;
  ensureDirectory(relativePath: string): Promise<'created' | 'existing'>;
  readText(relativePath: string): Promise<string | undefined>;
  writeText(relativePath: string, content: string): Promise<void>;
  appendText(relativePath: string, content: string): Promise<void>;
  directoryExists(relativePath: string): Promise<boolean>;
  fileInfo(relativePath: string): Promise<WorkspaceFileInfo | undefined>;
  listDirectories(relativePath: string): Promise<string[]>;
}

export type ProjectStore = WorkspaceStore;
export type CycleStateStore = WorkspaceStore;
export type MetricsStore = WorkspaceStore;
export type RuleStore = WorkspaceStore;
export type ActionLogStore = WorkspaceStore;
export interface WorkspaceFileReader {
  readText(relativePath: string): Promise<string | undefined>;
}

export interface ReviewOpsCoreRuntime {
  readonly workspaceRoot: string;
  readonly clock: Clock;
  readonly artifactStore: ArtifactStore;
  readonly workspace: WorkspaceStore;
  readonly projectStore: ProjectStore;
  readonly cycleStateStore: CycleStateStore;
  readonly metricsStore: MetricsStore;
  readonly ruleStore: RuleStore;
  readonly actionLogStore: ActionLogStore;
  readonly workspaceFileReader: WorkspaceFileReader;
}

export const systemClock: Clock = {
  now: () => new Date()
};

export function runtimeNow(runtime: Pick<ReviewOpsCoreRuntime, 'clock'>, override?: () => Date): Date {
  return override === undefined ? runtime.clock.now() : override();
}
