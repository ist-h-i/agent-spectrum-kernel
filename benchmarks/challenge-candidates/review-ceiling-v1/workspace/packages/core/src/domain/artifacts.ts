export class ArtifactPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactPathError';
  }
}

export function toFlowSlug(flowId: string): string {
  const slug = flowId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length === 0) {
    throw new ArtifactPathError('Flow id must produce a non-empty artifact slug.');
  }

  return slug;
}
