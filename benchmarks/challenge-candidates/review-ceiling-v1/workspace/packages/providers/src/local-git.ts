import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ReviewDiff, ReviewDiffFile, ReviewTarget, ReviewTargetRef } from '@reviewops/core';
import { classifyReviewDiffPaths } from '@reviewops/core';
import type { ListReviewTargetsInput, PostResult, ReviewComment, ReviewProvider, ReviewReply } from './index.js';

export type LocalGitTargetMode = 'working-tree' | 'staged' | 'range';

export interface LocalGitProviderOptions {
  workspaceRoot: string;
  gitPath?: string;
  runGit?: GitCommandRunner;
}

export interface CreateLocalGitTargetRefOptions {
  repository: string;
  mode?: LocalGitTargetMode;
  baseRef?: string;
  headRef?: string;
  url?: string;
}

export interface ReviewPromptInputFromLocalGitDiff {
  diff: string;
  target: ReviewTargetRef;
  notes: string;
}

export type GitCommandRunner = (args: string[], cwd: string) => Promise<string>;

interface ParsedLocalGitTarget {
  mode: LocalGitTargetMode;
  baseRef?: string;
  headRef?: string;
}

interface UntrackedDiffResult {
  files: ReviewDiffFile[];
  patch: string;
  additions: number;
}

const execFileAsync = promisify(execFile);
const maxGitOutputBuffer = 20 * 1024 * 1024;

export class LocalGitProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'LocalGitProviderError';
  }
}

export function createLocalGitReviewProvider(options: LocalGitProviderOptions): ReviewProvider {
  return new LocalGitReviewProvider(options);
}

export function createLocalGitTargetRef(options: CreateLocalGitTargetRefOptions): ReviewTargetRef {
  const mode = options.mode ?? (options.baseRef !== undefined ? 'range' : 'working-tree');
  const id = createLocalGitTargetId(mode, options.baseRef, options.headRef);

  return {
    provider: 'local-git',
    repository: options.repository,
    id,
    url: options.url
  };
}

export function createReviewPromptInputFromLocalGitDiff(diff: ReviewDiff): ReviewPromptInputFromLocalGitDiff {
  return {
    diff: formatReviewDiffPatch(diff),
    target: diff.target,
    notes: formatReviewDiffSummary(diff)
  };
}

export function formatReviewDiffPatch(diff: ReviewDiff): string {
  const patch = diff.rawPatch?.trim();
  if (patch !== undefined && patch.length > 0) {
    return `${patch}\n`;
  }

  if (diff.files.length === 0) {
    return '';
  }

  return `${diff.files.map((file) => file.patch?.trim() || `${file.status}: ${file.path}`).join('\n\n')}\n`;
}

export function formatReviewDiffSummary(diff: ReviewDiff): string {
  const summary = diff.summary;
  const fileLines =
    diff.files.length === 0
      ? ['- No changed files were reported by local git.']
      : diff.files.map((file) => `- ${file.status}: ${file.oldPath === undefined ? file.path : `${file.oldPath} -> ${file.path}`}`);

  return [
    'Local git diff summary:',
    `- Target: ${diff.target.id}`,
    `- Repository: ${diff.target.repository}`,
    `- Changed files: ${summary.changedFiles}`,
    `- Additions: ${summary.additions ?? 0}`,
    `- Deletions: ${summary.deletions ?? 0}`,
    `- Backend touched: ${summary.backendTouched}`,
    `- Frontend touched: ${summary.frontendTouched}`,
    `- Tests touched: ${summary.testTouched}`,
    `- Docs touched: ${summary.docsTouched}`,
    `- Config touched: ${summary.configTouched}`,
    '',
    'Changed files:',
    ...fileLines
  ].join('\n');
}

class LocalGitReviewProvider implements ReviewProvider {
  readonly kind = 'local-git' as const;

  private readonly workspaceRoot: string;
  private readonly gitPath: string;
  private readonly runGitCommand: GitCommandRunner;

  constructor(options: LocalGitProviderOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.gitPath = options.gitPath ?? 'git';
    this.runGitCommand = options.runGit ?? ((args, cwd) => runGit(this.gitPath, args, cwd));
  }

  async listReviewTargets(input: ListReviewTargetsInput = {}): Promise<ReviewTarget[]> {
    const repository = await this.readRepositoryName();
    const targetRef = createLocalGitTargetRef({
      repository,
      baseRef: input.baseRef,
      headRef: input.headRef
    });

    return [await this.getReviewTarget(targetRef)];
  }

  async getReviewTarget(target: ReviewTargetRef): Promise<ReviewTarget> {
    assertLocalGitTarget(target);
    const targetSpec = parseLocalGitTargetId(target.id);
    const branchInfo = await this.readBranchInfo();

    return {
      ref: target,
      title: titleForTarget(targetSpec),
      sourceBranch: targetSpec.mode === 'range' ? targetSpec.headRef : branchInfo.currentBranch ?? branchInfo.headSha,
      targetBranch: targetSpec.mode === 'range' ? targetSpec.baseRef : branchInfo.upstream,
      status: 'unknown',
      updatedAt: new Date().toISOString()
    };
  }

  async getDiff(target: ReviewTargetRef): Promise<ReviewDiff> {
    assertLocalGitTarget(target);
    const targetSpec = parseLocalGitTargetId(target.id);
    const patch = await this.runGitCommand(diffArgs('patch', targetSpec), this.workspaceRoot);
    const nameStatus = await this.runGitCommand(diffArgs('name-status', targetSpec), this.workspaceRoot);
    const numstat = await this.runGitCommand(diffArgs('numstat', targetSpec), this.workspaceRoot);
    const untrackedDiff = targetSpec.mode === 'working-tree' ? await this.collectUntrackedDiff() : emptyUntrackedDiff();
    const rawPatch = joinPatchSections([patch, untrackedDiff.patch]);
    const patchesByPath = splitPatchByPath(rawPatch);
    const files = [...parseNameStatus(nameStatus, patchesByPath), ...untrackedDiff.files];
    const lineStats = parseNumstat(numstat);

    return {
      target,
      files,
      summary: {
        changedFiles: files.length,
        additions: lineStats.additions + untrackedDiff.additions,
        deletions: lineStats.deletions,
        ...classifyReviewDiffPaths(files.map((file) => file.path), 'local-git-provider')
      },
      rawPatch
    };
  }

  async getComments(target: ReviewTargetRef): Promise<ReviewComment[]> {
    assertLocalGitTarget(target);
    return [];
  }

  async postSummaryComment(target: ReviewTargetRef, body: string): Promise<PostResult> {
    assertLocalGitTarget(target);
    return unsupportedPostResult(body);
  }

  async postReplies(target: ReviewTargetRef, replies: ReviewReply[]): Promise<PostResult[]> {
    assertLocalGitTarget(target);
    return replies.map((reply) => unsupportedPostResult(reply.body));
  }

  private async readRepositoryName(): Promise<string> {
    const topLevel = (await this.runGitCommand(['rev-parse', '--show-toplevel'], this.workspaceRoot)).trim();
    return path.basename(topLevel || this.workspaceRoot);
  }

  private async readBranchInfo(): Promise<{
    currentBranch?: string;
    headSha?: string;
    upstream?: string;
  }> {
    const [currentBranch, headSha, upstream] = await Promise.all([
      this.runGitCommand(['branch', '--show-current'], this.workspaceRoot).catch(() => ''),
      this.runGitCommand(['rev-parse', '--short', 'HEAD'], this.workspaceRoot).catch(() => ''),
      this.runGitCommand(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], this.workspaceRoot).catch(() => '')
    ]);

    return {
      currentBranch: emptyToUndefined(currentBranch.trim()),
      headSha: emptyToUndefined(headSha.trim()),
      upstream: emptyToUndefined(upstream.trim())
    };
  }

  private async collectUntrackedDiff(): Promise<UntrackedDiffResult> {
    const output = await this.runGitCommand(['ls-files', '--others', '--exclude-standard', '-z'], this.workspaceRoot);
    const filePaths = output.split('\0').filter((filePath) => filePath.length > 0);
    const files: ReviewDiffFile[] = [];
    const patchSections: string[] = [];
    let additions = 0;

    for (const filePath of filePaths) {
      const fileDiff = await createUntrackedFileDiff(this.workspaceRoot, filePath);
      files.push({
        path: filePath,
        status: 'added',
        patch: fileDiff.patch
      });
      patchSections.push(fileDiff.patch);
      additions += fileDiff.additions;
    }

    return {
      files,
      patch: joinPatchSections(patchSections),
      additions
    };
  }
}

async function runGit(gitPath: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(gitPath, args, {
      cwd,
      maxBuffer: maxGitOutputBuffer
    });

    return stdout.toString();
  } catch (error) {
    throw new LocalGitProviderError('GIT_COMMAND_FAILED', formatGitError(args, error));
  }
}

function createLocalGitTargetId(mode: LocalGitTargetMode, baseRef: string | undefined, headRef: string | undefined): string {
  if (mode === 'working-tree') {
    return 'working-tree';
  }

  if (mode === 'staged') {
    return 'staged';
  }

  if (baseRef === undefined || baseRef.trim().length === 0) {
    throw new LocalGitProviderError('INVALID_TARGET', 'A baseRef is required for local git range targets.');
  }

  const normalizedHeadRef = headRef?.trim() || 'HEAD';
  return `range:${baseRef.trim()}...${normalizedHeadRef}`;
}

function parseLocalGitTargetId(id: string): ParsedLocalGitTarget {
  if (id === 'working-tree') {
    return { mode: 'working-tree' };
  }

  if (id === 'staged') {
    return { mode: 'staged' };
  }

  const rangeMatch = /^range:(.+)\.\.\.(.+)$/u.exec(id);
  if (rangeMatch !== null && rangeMatch[1].trim().length > 0 && rangeMatch[2].trim().length > 0) {
    return {
      mode: 'range',
      baseRef: rangeMatch[1],
      headRef: rangeMatch[2]
    };
  }

  throw new LocalGitProviderError('INVALID_TARGET', `Unsupported local git target id: ${id}`);
}

function diffArgs(format: 'patch' | 'name-status' | 'numstat', target: ParsedLocalGitTarget): string[] {
  const args = ['diff', '--no-ext-diff', '--no-color', '--find-renames'];
  if (format === 'patch') {
    args.push('--patch');
  } else {
    args.push(`--${format}`);
  }

  if (target.mode === 'working-tree') {
    args.push('HEAD');
  } else if (target.mode === 'staged') {
    args.push('--cached');
  } else {
    args.push(`${target.baseRef}...${target.headRef}`);
  }

  return args;
}

function parseNameStatus(nameStatus: string, patchesByPath: Map<string, string>): ReviewDiffFile[] {
  return nameStatus
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => parseNameStatusLine(line, patchesByPath));
}

function parseNameStatusLine(line: string, patchesByPath: Map<string, string>): ReviewDiffFile {
  const columns = line.split('\t');
  const statusCode = columns[0];

  if (statusCode.startsWith('R')) {
    const oldPath = columns[1] ?? '';
    const newPath = columns[2] ?? oldPath;
    return {
      path: newPath,
      oldPath,
      status: 'renamed',
      patch: patchesByPath.get(newPath) ?? patchesByPath.get(oldPath)
    };
  }

  const filePath = columns[1] ?? '';
  return {
    path: filePath,
    status: mapGitStatus(statusCode),
    patch: patchesByPath.get(filePath)
  };
}

function mapGitStatus(statusCode: string): ReviewDiffFile['status'] {
  if (statusCode === 'A') {
    return 'added';
  }

  if (statusCode === 'D') {
    return 'deleted';
  }

  return 'modified';
}

function splitPatchByPath(patch: string): Map<string, string> {
  const patches = new Map<string, string>();
  const sections = patch.split(/(?=^diff --git )/mu).filter((section) => section.trim().length > 0);

  for (const section of sections) {
    const header = /^diff --git a\/(.+) b\/(.+)$/mu.exec(section);
    if (header === null) {
      continue;
    }

    patches.set(header[2], section.trimEnd());
  }

  return patches;
}

function parseNumstat(numstat: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of numstat.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }

    const [rawAdditions, rawDeletions] = line.split('\t');
    additions += parseGitLineCount(rawAdditions);
    deletions += parseGitLineCount(rawDeletions);
  }

  return { additions, deletions };
}

function parseGitLineCount(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function createUntrackedFileDiff(workspaceRoot: string, filePath: string): Promise<{ patch: string; additions: number }> {
  const absolutePath = resolveWorkspaceFile(workspaceRoot, filePath);
  const content = await readTextFileForDiff(absolutePath);
  const additions = countTextLines(content);
  const addedLines = formatAddedDiffLines(content);
  const hunk =
    addedLines.length === 0
      ? ''
      : [
          `@@ -0,0 +1,${additions} @@`,
          ...addedLines
        ].join('\n');
  const patch = [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    'index 0000000..0000000',
    '--- /dev/null',
    `+++ b/${filePath}`,
    hunk
  ]
    .filter((line) => line.length > 0)
    .join('\n');

  return {
    patch,
    additions
  };
}

async function readTextFileForDiff(absolutePath: string): Promise<string> {
  const content = await readFile(absolutePath);
  if (content.includes(0)) {
    return '';
  }

  return content.toString('utf8');
}

function resolveWorkspaceFile(workspaceRoot: string, filePath: string): string {
  const absolutePath = path.resolve(workspaceRoot, filePath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new LocalGitProviderError('INVALID_PATH', `Git reported a path outside the workspace: ${filePath}`);
  }

  return absolutePath;
}

function countTextLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  const normalized = content.replaceAll('\r\n', '\n');
  return normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n').length : normalized.split('\n').length;
}

function formatAddedDiffLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  const normalized = content.replaceAll('\r\n', '\n');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  return lines.map((line) => `+${line}`);
}

function joinPatchSections(sections: string[]): string {
  return sections
    .map((section) => section.trim())
    .filter((section) => section.length > 0)
    .join('\n');
}

function emptyUntrackedDiff(): UntrackedDiffResult {
  return {
    files: [],
    patch: '',
    additions: 0
  };
}

function titleForTarget(target: ParsedLocalGitTarget): string {
  if (target.mode === 'staged') {
    return 'Local staged diff';
  }

  if (target.mode === 'range') {
    return `Local git range ${target.baseRef}...${target.headRef}`;
  }

  return 'Local working tree diff';
}

function unsupportedPostResult(body: string): PostResult {
  void body;
  return {
    id: 'local-git-preview-required',
    status: 'unsupported',
    message: 'Local git does not support publishing review comments. Use a PR/MR provider for preview-first posting.'
  };
}

function assertLocalGitTarget(target: ReviewTargetRef): void {
  if (target.provider !== 'local-git') {
    throw new LocalGitProviderError('INVALID_TARGET', `Expected local-git target, received ${target.provider}.`);
  }
}

function emptyToUndefined(value: string): string | undefined {
  return value.length === 0 ? undefined : value;
}

function formatGitError(args: string[], error: unknown): string {
  if (error instanceof Error) {
    return `git ${args.join(' ')} failed: ${error.message}`;
  }

  return `git ${args.join(' ')} failed.`;
}
