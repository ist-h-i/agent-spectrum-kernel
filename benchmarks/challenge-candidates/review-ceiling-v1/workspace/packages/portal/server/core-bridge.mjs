import { normalizeReviewResponse } from "../../core/src/responses/normalize.ts";
import { createReviewActionPlan } from "../../core/src/reviews/comment-resolution.ts";
import {
  createReviewFixPlan,
  createReviewFixChecklist,
  createReviewFixVerification,
  createReviewFixExplanation,
  normalizeReviewFixVerificationStatus,
} from "../../core/src/reviews/fix-flow.ts";

// These pure core functions run under Node's native TypeScript stripping. No
// VS Code extension, filesystem runtime, provider credentials or YAML is loaded.
export function readCoreResponse(input) {
  return normalizeReviewResponse("```json\n" + JSON.stringify(input) + "\n```");
}

export function buildReviewWorkflow(review, artifact) {
  const actionPlan = createReviewActionPlan({
    triage: {
      totalComments: 0,
      needsFixCount: 0,
      needsReplyCount: 0,
      informationalCount: 0,
      items: [],
    },
    findings: artifact.reviewFindings,
    actionPlanSeeds: artifact.actionPlan,
  });
  const target = {
    provider: "github",
    repository: review.repository,
    id: String(review.pullRequest),
  };
  const fixPlan = createReviewFixPlan(actionPlan, target);
  const checklist = createReviewFixChecklist(fixPlan);
  const results = (review.verificationResults ?? []).map((result) => ({
    ...result,
    status: normalizeReviewFixVerificationStatus(result.status),
  }));
  const verification = createReviewFixVerification({
    fixPlan,
    results,
    target,
    verifiedAt: review.updatedAt,
  });
  const explanation = createReviewFixExplanation(fixPlan, verification);
  return { actionPlan, fixPlan, checklist, verification, explanation };
}
