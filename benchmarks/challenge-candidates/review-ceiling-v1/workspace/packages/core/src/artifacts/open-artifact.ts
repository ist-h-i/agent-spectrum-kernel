import type { FlowArtifactKind, FlowArtifactRef } from '../types.js';
import type { ArtifactStore } from '../ports/artifact-store.js';

export interface OpenFlowArtifactContentResult {
  ref: FlowArtifactRef;
  displayName: string;
  kind: FlowArtifactKind;
  content: string;
}

export async function openFlowArtifactContent(
  artifactStore: ArtifactStore,
  ref: FlowArtifactRef
): Promise<OpenFlowArtifactContentResult> {
  return {
    ref,
    displayName: ref.name,
    kind: ref.kind,
    content: await artifactStore.read(ref)
  };
}
