import {
  FileSystemArtifactStore,
  stringifyJsonDocument,
  type PublishDraft
} from '@reviewops/core';

export interface PublishDraftArtifactPaths {
  markdownPath: string;
  jsonPath: string;
}

export async function writePublishDraftArtifacts(
  workspaceRoot: string,
  runId: string,
  draft: PublishDraft
): Promise<PublishDraftArtifactPaths> {
  const artifactStore = new FileSystemArtifactStore(workspaceRoot);
  const flowId = draft.mode === 'reply' ? 'publish/reply-draft' : 'publish/summary-draft';
  const markdown = await artifactStore.write({
    flowId,
    runId,
    name: 'publish.draft.md',
    kind: 'markdown',
    content: renderPublishDraftMarkdown(draft),
    createdAt: draft.createdAt
  });
  const json = await artifactStore.write({
    flowId,
    runId,
    name: 'publish.draft.json',
    kind: 'json',
    content: stringifyJsonDocument(draft),
    createdAt: draft.createdAt
  });

  return {
    markdownPath: markdown.path,
    jsonPath: json.path
  };
}

function renderPublishDraftMarkdown(draft: PublishDraft): string {
  return [
    '# ReviewOps Publish Draft',
    '',
    `- Title: ${draft.title}`,
    `- Provider: ${draft.provider}`,
    `- Target: ${draft.target.repository} ${draft.target.id}`,
    `- Mode: ${draft.mode}`,
    `- Requires confirmation: ${draft.requiresConfirmation}`,
    `- Status: ${draft.status}`,
    '',
    '## Body',
    '',
    draft.body,
    ''
  ].join('\n');
}
