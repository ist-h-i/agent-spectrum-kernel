export type ReviewDiffPathClassificationMode = 'github-provider' | 'local-git-provider';

export interface ReviewDiffPathTouches {
  backendTouched: boolean;
  frontendTouched: boolean;
  testTouched: boolean;
  docsTouched: boolean;
  configTouched: boolean;
}

export function classifyReviewDiffPaths(
  filePaths: string[],
  mode: ReviewDiffPathClassificationMode
): ReviewDiffPathTouches {
  return {
    backendTouched: filePaths.some((filePath) => isBackendReviewPath(filePath, mode)),
    frontendTouched: filePaths.some(isFrontendReviewPath),
    testTouched: filePaths.some(isTestReviewPath),
    docsTouched: filePaths.some(isDocsReviewPath),
    configTouched: filePaths.some((filePath) => isConfigReviewPath(filePath, mode))
  };
}

export function isBackendReviewPath(filePath: string, mode: ReviewDiffPathClassificationMode): boolean {
  if (mode === 'github-provider') {
    return /(^|\/)(src|server|api|backend|packages\/core|packages\/providers)\//u.test(filePath) || /\.(ts|js|mjs|cjs)$/u.test(filePath);
  }

  if (isTestReviewPath(filePath) || isFrontendReviewPath(filePath) || isDocsReviewPath(filePath) || isConfigReviewPath(filePath, mode)) {
    return false;
  }

  return /\.(?:cjs|cts|go|java|js|json|mjs|mts|php|py|rb|rs|ts)$/u.test(filePath);
}

export function isFrontendReviewPath(filePath: string): boolean {
  return (
    /(?:^|\/)(?:app|components|frontend|pages|ui)\//u.test(filePath) ||
    /(^|\/)(web|frontend|client|ui|components|pages|app)\//u.test(filePath) ||
    /\.(?:css|html|jsx|scss|svelte|tsx|vue)$/u.test(filePath)
  );
}

export function isTestReviewPath(filePath: string): boolean {
  return /(?:^|\/)(?:__tests__|tests?|specs?|e2e)\//u.test(filePath) || /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(filePath);
}

export function isDocsReviewPath(filePath: string): boolean {
  return (
    /(?:^|\/)(?:docs?|README)(?:\/|$)/u.test(filePath) ||
    /(^|\/)(docs?|adr)\//u.test(filePath) ||
    /\.(?:md|mdx|rst|adoc)$/u.test(filePath)
  );
}

export function isConfigReviewPath(filePath: string, mode: ReviewDiffPathClassificationMode): boolean {
  if (mode === 'github-provider') {
    return /(^|\/)(package\.json|pnpm-lock\.yaml|tsconfig|vite\.config|webpack\.config|eslint\.config|\.github\/)/u.test(filePath);
  }

  return (
    /(?:^|\/)(?:package|tsconfig|vite|webpack|eslint|prettier|pnpm-workspace)\.(?:json|mjs|ts|yaml|yml)$/u.test(filePath) ||
    /\.(?:toml|ya?ml)$/u.test(filePath)
  );
}
