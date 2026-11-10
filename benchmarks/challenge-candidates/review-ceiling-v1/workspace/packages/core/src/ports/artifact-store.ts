import type { FlowArtifactKind, FlowArtifactRef } from '../types.js';

export interface WriteArtifactOptions {
  flowId: string;
  runId: string;
  name: string;
  kind: FlowArtifactKind;
  content: string;
  createdAt: string;
}

export interface ArtifactStore {
  write(options: WriteArtifactOptions): Promise<FlowArtifactRef>;
  read(ref: FlowArtifactRef): Promise<string>;
  getRunDirectory(flowId: string, runId: string): string;
}
