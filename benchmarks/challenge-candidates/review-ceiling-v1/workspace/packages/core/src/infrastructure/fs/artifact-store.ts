import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ArtifactPathError, toFlowSlug } from '../../domain/artifacts.js';
import type { ArtifactStore, WriteArtifactOptions } from '../../ports/artifact-store.js';

export class FileSystemArtifactStore implements ArtifactStore {
  constructor(private readonly workspaceRoot: string) {}

  getRunDirectory(flowId: string, runId: string): string {
    assertSafePathSegment(runId, 'run id');

    return path.join(this.workspaceRoot, '.reviewops', 'out', toFlowSlug(flowId), runId);
  }

  async write(options: WriteArtifactOptions): Promise<Awaited<ReturnType<ArtifactStore['write']>>> {
    assertSafeArtifactName(options.name);

    const runDirectory = this.getRunDirectory(options.flowId, options.runId);
    const artifactPath = path.join(runDirectory, options.name);

    assertInsideDirectory(runDirectory, artifactPath);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(artifactPath, options.content, 'utf8');

    return {
      flowId: options.flowId,
      runId: options.runId,
      name: options.name,
      kind: options.kind,
      path: path.relative(this.workspaceRoot, artifactPath),
      createdAt: options.createdAt
    };
  }

  async read(ref: Awaited<ReturnType<ArtifactStore['write']>>): Promise<string> {
    const artifactPath = path.join(this.workspaceRoot, ref.path);
    assertInsideDirectory(path.join(this.workspaceRoot, '.reviewops', 'out'), artifactPath);

    return readFile(artifactPath, 'utf8');
  }
}

function assertSafePathSegment(value: string, label: string): void {
  if (value.trim().length === 0 || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new ArtifactPathError(`Unsafe ${label}: ${value}`);
  }
}

function assertSafeArtifactName(name: string): void {
  assertSafePathSegment(name, 'artifact name');
}

function assertInsideDirectory(directory: string, candidate: string): void {
  const relative = path.relative(directory, candidate);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ArtifactPathError(`Artifact path escapes ReviewOps output directory: ${candidate}`);
  }
}
