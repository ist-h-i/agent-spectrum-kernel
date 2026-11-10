export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePathError';
  }
}

export function normalizeWorkspaceRelativePath(relativePath: string): string {
  if (relativePath.trim().length === 0) {
    return '';
  }

  const normalized = relativePath.replaceAll('\\', '/').replaceAll(/\/+/gu, '/').replace(/^\.\/+/u, '');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new WorkspacePathError(`Workspace path must stay inside the workspace: ${relativePath}`);
  }

  return normalized.replace(/\/$/u, '');
}

export function joinWorkspacePath(...segments: string[]): string {
  return normalizeWorkspaceRelativePath(
    segments
      .filter((segment) => segment.length > 0)
      .join('/')
  );
}
