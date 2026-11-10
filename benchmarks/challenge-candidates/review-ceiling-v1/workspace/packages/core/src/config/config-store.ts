import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ConfigStore {
  sharedPath(...segments: string[]): string;
  localPath(...segments: string[]): string;
  writeSharedText(relativePath: string, content: string): Promise<void>;
  writeLocalText(relativePath: string, content: string): Promise<void>;
  readSharedText(relativePath: string): Promise<string>;
  readLocalText(relativePath: string): Promise<string>;
}

export class ConfigPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigPathError';
  }
}

export class FileSystemConfigStore implements ConfigStore {
  constructor(private readonly workspaceRoot: string) {}

  sharedPath(...segments: string[]): string {
    return path.join(this.workspaceRoot, '.reviewops', ...segments);
  }

  localPath(...segments: string[]): string {
    return path.join(this.workspaceRoot, '.reviewops.local', ...segments);
  }

  async writeSharedText(relativePath: string, content: string): Promise<void> {
    await writeTextInside(this.sharedPath(), relativePath, content);
  }

  async writeLocalText(relativePath: string, content: string): Promise<void> {
    await writeTextInside(this.localPath(), relativePath, content);
  }

  readSharedText(relativePath: string): Promise<string> {
    return readTextInside(this.sharedPath(), relativePath);
  }

  readLocalText(relativePath: string): Promise<string> {
    return readTextInside(this.localPath(), relativePath);
  }
}

async function writeTextInside(root: string, relativePath: string, content: string): Promise<void> {
  const target = resolveInside(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function readTextInside(root: string, relativePath: string): Promise<string> {
  return readFile(resolveInside(root, relativePath), 'utf8');
}

function resolveInside(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new ConfigPathError(`Config path must be relative: ${relativePath}`);
  }

  const target = path.join(root, relativePath);
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ConfigPathError(`Config path escapes ReviewOps directory: ${relativePath}`);
  }

  return resolvedTarget;
}
