import type { ReviewComment, ReviewDiff, ReviewProviderKind, ReviewReply, ReviewTarget, ReviewTargetRef } from '@reviewops/core';

export type {
  PublishDraft,
  ReviewComment,
  ReviewDiff,
  ReviewDiffFile,
  ReviewProviderKind,
  ReviewReply,
  ReviewTarget,
  ReviewTargetRef
} from '@reviewops/core';

export interface ListReviewTargetsInput {
  baseRef?: string;
  headRef?: string;
  limit?: number;
  state?: 'open' | 'closed' | 'all';
}


export interface PostResult {
  id: string;
  status: 'posted' | 'preview-required' | 'unsupported';
  url?: string;
  message?: string;
}

export interface ReviewProvider {
  kind: ReviewProviderKind;
  listReviewTargets(input?: ListReviewTargetsInput): Promise<ReviewTarget[]>;
  getReviewTarget(target: ReviewTargetRef): Promise<ReviewTarget>;
  getDiff(target: ReviewTargetRef): Promise<ReviewDiff>;
  getComments(target: ReviewTargetRef): Promise<ReviewComment[]>;
  postSummaryComment(target: ReviewTargetRef, body: string): Promise<PostResult>;
  postReplies?(target: ReviewTargetRef, replies: ReviewReply[]): Promise<PostResult[]>;
}

export interface ProviderAdapterBoundary {
  kind: ReviewProviderKind;
  ownsNetworkMapping: true;
  ownsSecretStorage: false;
}

export function createProviderBoundary(kind: ReviewProviderKind): ProviderAdapterBoundary {
  return {
    kind,
    ownsNetworkMapping: true,
    ownsSecretStorage: false
  };
}

export * from './local-git.js';
export * from './github.js';
