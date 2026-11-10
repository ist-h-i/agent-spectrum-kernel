import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkspaceFileInfo, WorkspaceStore } from '../../ports/runtime.js';
import { normalizeWorkspaceRelativePath } from '../../serialization/paths.js';

export class FileSystemWorkspaceStore implements WorkspaceStore {
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  resolvePath(relativePath: string): string {
    return resolveInsideWorkspace(this.workspaceRoot, relativePath);
  }

  relativePath(absolutePath: string): string {
    const relative = path.relative(this.workspaceRoot, path.resolve(absolutePath));
    return normalizeWorkspaceRelativePath(relative);
  }

  async ensureDirectory(relativePath: string): Promise<'created' | 'existing'> {
    const createdPath = await mkdir(this.resolvePath(relativePath), { recursive: true });
    return createdPath === undefined ? 'existing' : 'created';
  }

  async readText(relativePath: string): Promise<string | undefined> {
    try {
      return await readFile(this.resolvePath(relativePath), 'utf8');
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async writeText(relativePath: string, content: string): Promise<void> {
    const targetPath = this.resolvePath(relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf8');
  }

  async appendText(relativePath: string, content: string): Promise<void> {
    const targetPath = this.resolvePath(relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await appendFile(targetPath, content, 'utf8');
  }

  async directoryExists(relativePath: string): Promise<boolean> {
    const info = await this.fileInfo(relativePath);
    return info?.isDirectory ?? false;
  }

  async fileInfo(relativePath: string): Promise<WorkspaceFileInfo | undefined> {
    try {
      const targetPath = this.resolvePath(relativePath);
      const fileStat = await stat(targetPath);
      return {
        path: this.relativePath(targetPath),
        isFile: fileStat.isFile(),
        isDirectory: fileStat.isDirectory(),
        modifiedAt: fileStat.mtime.toISOString(),
        mtimeMs: fileStat.mtimeMs
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async listDirectories(relativePath: string): Promise<string[]> {
    try {
      const entries = await readdir(this.resolvePath(relativePath), { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }

      throw error;
    }
  }
}

function resolveInsideWorkspace(workspaceRoot: string, relativePath: string): string {
  // Portal jobs can carry an absolute artifact locator from the workspace registry.
  // Both locator forms retain the workspace containment invariant.
  const targetPath = path.isAbsolute(relativePath)
    ? path.resolve(relativePath)
    : path.resolve(workspaceRoot, normalizeWorkspaceRelativePath(relativePath));

  if (!targetPath.startsWith(workspaceRoot)) {
    throw new Error(`Workspace path escapes workspace root: ${relativePath}`);
  }

  return targetPath;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
