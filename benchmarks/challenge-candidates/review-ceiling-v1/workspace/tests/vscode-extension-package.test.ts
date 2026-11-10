import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listReviewOpsCommandCatalog, reviewOpsCommandCategories } from '../packages/core/src/index';

interface VsCodePackage {
  name: string;
  displayName: string;
  icon: string;
  l10n: string;
  activationEvents: string[];
  contributes: {
    commands: Array<{
      command: string;
      title: string;
      category: string;
      icon: {
        light: string;
        dark: string;
      };
    }>;
    viewsContainers: {
      activitybar: Array<{
        id: string;
        title: string;
        icon: string;
      }>;
    };
    views: Record<string, Array<{
      id: string;
      name: string;
    }>>;
    menus: Record<string, Array<{
      command: string;
      when?: string;
      group?: string;
    }>>;
  };
}

describe('ReviewOps Guard package metadata', () => {
  it('declares the P0 bootstrap extension identity and smoke commands', async () => {
    const packageJsonPath = path.join(process.cwd(), 'packages/vscode-extension/package.json');
    const packageNlsPath = path.join(process.cwd(), 'packages/vscode-extension/package.nls.json');
    const packageNlsJaPath = path.join(process.cwd(), 'packages/vscode-extension/package.nls.ja.json');
    const iconPath = path.join(process.cwd(), 'packages/vscode-extension/resources/reviewops_guard_icon_128.png');
    const activityIconPath = path.join(process.cwd(), 'packages/vscode-extension/resources/reviewops-activitybar.svg');
    const commandLightIconPath = path.join(process.cwd(), 'packages/vscode-extension/resources/reviewops-command-light.svg');
    const commandDarkIconPath = path.join(process.cwd(), 'packages/vscode-extension/resources/reviewops-command-dark.svg');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as VsCodePackage;
    const packageNls = JSON.parse(await readFile(packageNlsPath, 'utf8')) as Record<string, string>;
    const packageNlsJa = JSON.parse(await readFile(packageNlsJaPath, 'utf8')) as Record<string, string>;
    const iconPng = await readFile(iconPath);
    const activityIconSvg = await readFile(activityIconPath, 'utf8');
    const commandLightIconSvg = await readFile(commandLightIconPath, 'utf8');
    const commandDarkIconSvg = await readFile(commandDarkIconPath, 'utf8');
    const commands = packageJson.contributes.commands.map((command) => command.command);
    const resolveNls = (value: string): string => {
      const match = /^%(.+)%$/u.exec(value);
      return match === null ? value : packageNls[match[1]] ?? value;
    };

    expect(packageJson.name).toBe('reviewops-guard');
    expect(resolveNls(packageJson.displayName)).toBe('ReviewOps Guard');
    expect(packageJson.icon).toBe('resources/reviewops_guard_icon_128.png');
    expect(packageJson.l10n).toBe('./l10n');
    expect(packageJson.contributes.viewsContainers.activitybar).toEqual([
      {
        id: 'reviewops',
        title: 'ReviewOps',
        icon: 'resources/reviewops-activitybar.svg'
      }
    ]);
    expect([...iconPng.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(activityIconSvg).toContain('stroke="currentColor"');
    expect(commandLightIconSvg).toContain('stroke="#2f343d"');
    expect(commandDarkIconSvg).toContain('stroke="#d8dee9"');
    for (const command of packageJson.contributes.commands) {
      expect(command.icon).toEqual({
        light: 'resources/reviewops-command-light.svg',
        dark: 'resources/reviewops-command-dark.svg'
      });
    }
    expect(packageNlsJa['reviewops.command.initializeProject.title']).toBe('プロジェクトを初期化');
    expect(packageNlsJa['reviewops.command.openArtifacts.title']).toBe('主要ファイルを開く');
    expect(packageNlsJa['reviewops.command.nextAction.title']).toBe('次の操作を実行');
    expect(packageNlsJa['reviewops.command.buildReviewActionPlan.title']).toBe('レビュー対応計画を作成');
    expect(packageNlsJa['reviewops.command.captureSkillEvidence.title']).toBe('スキル記録を残す');
    expect(packageNlsJa['reviewops.command.generateFieldReport.title']).toBe('フィールドレポートを作成');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.initializeProject');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.updateProjectContext');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.openPreview');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.openArtifacts');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.commandCenter');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.nextAction');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.resumeCurrentCycle');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.prepareGitHubPullRequestReview');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.prepareGitHubCommentTriage');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.prepareLocalDiffReview');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.importManualReviewResponse');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.buildReviewActionPlan');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.planReviewFix');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.buildReviewFixChecklist');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.verifyReviewFix');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.explainReviewFix');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.draftReviewReplies');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.showMetaNext');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.showP0Readiness');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.previewGitHubSummaryComment');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.previewGitHubReplyComment');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.setupGitHubToken');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.applyRules');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.updateRules');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.proposeRules');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.captureKnowledgeCandidates');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.captureSkillEvidence');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.generateFieldReport');
    expect(packageJson.activationEvents).toContain('onCommand:reviewops.status');
    expect(packageJson.activationEvents).toContain('onView:reviewops.statusView');
    expect(packageJson.activationEvents).toContain('onView:reviewops.reviewWorkView');
    expect(packageJson.activationEvents).toContain('onView:reviewops.knowledgeView');
    expect(packageJson.activationEvents).toContain('onView:reviewops.skillEvidenceView');
    expect(packageJson.activationEvents).toContain('onView:reviewops.reportsView');
    expect(commands).toEqual([
      'reviewops.initializeProject',
      'reviewops.updateProjectContext',
      'reviewops.openPreview',
      'reviewops.openArtifacts',
      'reviewops.commandCenter',
      'reviewops.nextAction',
      'reviewops.resumeCurrentCycle',
      'reviewops.prepareGitHubPullRequestReview',
      'reviewops.prepareGitHubCommentTriage',
      'reviewops.prepareLocalDiffReview',
      'reviewops.importManualReviewResponse',
      'reviewops.buildReviewActionPlan',
      'reviewops.planReviewFix',
      'reviewops.buildReviewFixChecklist',
      'reviewops.verifyReviewFix',
      'reviewops.explainReviewFix',
      'reviewops.draftReviewReplies',
      'reviewops.showMetaNext',
      'reviewops.showP0Readiness',
      'reviewops.previewGitHubSummaryComment',
      'reviewops.previewGitHubReplyComment',
      'reviewops.setupGitHubToken',
      'reviewops.applyRules',
      'reviewops.updateRules',
      'reviewops.proposeRules',
      'reviewops.captureKnowledgeCandidates',
      'reviewops.captureSkillEvidence',
      'reviewops.generateFieldReport',
      'reviewops.status'
    ]);
    expect(packageJson.contributes.views.reviewops.map((view) => ({ ...view, name: resolveNls(view.name) }))).toEqual([
      {
        id: 'reviewops.statusView',
        name: 'ReviewOps Guard'
      },
      {
        id: 'reviewops.reviewWorkView',
        name: 'Review Work'
      },
      {
        id: 'reviewops.knowledgeView',
        name: 'Knowledge'
      },
      {
        id: 'reviewops.skillEvidenceView',
        name: 'Skill Evidence'
      },
      {
        id: 'reviewops.reportsView',
        name: 'Reports'
      }
    ]);
    for (const placeholder of [
      packageJson.displayName,
      packageJson.description,
      ...packageJson.contributes.commands.map((command) => command.title),
      ...packageJson.contributes.views.reviewops.map((view) => view.name)
    ]) {
      const key = /^%(.+)%$/u.exec(placeholder)?.[1];
      expect(key).toBeDefined();
      expect(packageNls[key as string]).toBeDefined();
      expect(packageNlsJa[key as string]).toBeDefined();
    }
    expect(packageJson.contributes.menus['view/title'].map((menu) => menu.command)).toEqual([
      'reviewops.commandCenter',
      'reviewops.status',
      'reviewops.updateProjectContext',
      'reviewops.prepareLocalDiffReview',
      'reviewops.resumeCurrentCycle',
      'reviewops.prepareGitHubPullRequestReview',
      'reviewops.prepareGitHubCommentTriage',
      'reviewops.buildReviewFixChecklist',
      'reviewops.explainReviewFix',
      'reviewops.previewGitHubSummaryComment',
      'reviewops.previewGitHubReplyComment',
      'reviewops.setupGitHubToken',
      'reviewops.applyRules',
      'reviewops.updateRules',
      'reviewops.proposeRules',
      'reviewops.captureKnowledgeCandidates',
      'reviewops.captureSkillEvidence',
      'reviewops.generateFieldReport',
      'reviewops.showP0Readiness',
      'reviewops.openPreview',
      'reviewops.openArtifacts'
    ]);
  });

  it('keeps runtime localization bundles aligned with extension strings', async () => {
    const extensionSourceRoot = path.join(process.cwd(), 'packages/vscode-extension/src');
    const englishBundlePath = path.join(process.cwd(), 'packages/vscode-extension/l10n/bundle.l10n.json');
    const japaneseBundlePath = path.join(process.cwd(), 'packages/vscode-extension/l10n/bundle.l10n.ja.json');
    const extensionSource = await readExtensionSourceFiles(extensionSourceRoot);
    const englishBundle = JSON.parse(await readFile(englishBundlePath, 'utf8')) as Record<string, string>;
    const japaneseBundle = JSON.parse(await readFile(japaneseBundlePath, 'utf8')) as Record<string, string>;
    const keys = [
      ...new Set(
        [...extensionSource.matchAll(/localize\('((?:\\'|[^'])*)'/gu)].map((match) => match[1].replaceAll("\\'", "'"))
      )
    ];

    for (const key of keys) {
      expect(englishBundle[key]).toBeDefined();
      expect(japaneseBundle[key]).toBeDefined();
    }
    expect(japaneseBundle['Initialize Project']).toBe('プロジェクトを初期化');
    expect(japaneseBundle['Workflow Map']).toBe('ワークフローマップ');
    expect(japaneseBundle['Configure']).toBe('詳細指定');
    expect(japaneseBundle['Scope label']).toBe('対象範囲名');
    expect(japaneseBundle['Pull request number']).toBe('PR 番号');
    expect(japaneseBundle['More actions']).toBe('詳細操作');
    expect(japaneseBundle['File to review']).toBe('確認するファイル');
    expect(japaneseBundle['What you will see']).toBe('表示されるもの');
    expect(japaneseBundle['Open main files']).toBe('主要ファイルを開く');
    expect(japaneseBundle['No main review files yet']).toBe('主要なレビューファイルはまだありません');
    expect(japaneseBundle['Project files']).toBe('プロジェクトファイル');
    expect(japaneseBundle['Review prompt']).toBe('レビュープロンプト');
    expect(japaneseBundle['Open this first']).toBe('まずこのファイルを開く');
    expect(japaneseBundle['Advanced: show supporting files']).toBe('詳細: 補助ファイルを表示');
    expect(japaneseBundle['main files']).toBe('主要ファイル');
    expect(japaneseBundle['Select the file to open.']).toBe('開くファイルを選択してください。');
    expect(japaneseBundle['Next Safe Step']).toBe('次の操作');
    expect(japaneseBundle['ReviewOps Guide']).toBe('ReviewOps ガイド');
    expect(japaneseBundle['ReviewOps Console']).toBe('ReviewOps Console');
    expect(japaneseBundle['Review understanding kit']).toBe('指摘理解キット');
    expect(japaneseBundle['Review before posting']).toBe('投稿前に必ず確認');
    expect(japaneseBundle['Run Queue']).toBe('実行キュー');
    expect(japaneseBundle['Later']).toBe('未完了');
    expect(japaneseBundle['flow']).toBe('処理');
    expect(japaneseBundle['meta']).toBe('管理');
    expect(japaneseBundle['editable metrics']).toBe('指標');
    expect(japaneseBundle['Skill Evidence']).toBe('スキル記録');
    expect(japaneseBundle['Provider']).toBe('連携先');
    expect(japaneseBundle['Effects']).toBe('更新内容');
  });

  it('keeps Command Center catalog text available in English and Japanese bundles', async () => {
    const englishBundlePath = path.join(process.cwd(), 'packages/vscode-extension/l10n/bundle.l10n.json');
    const japaneseBundlePath = path.join(process.cwd(), 'packages/vscode-extension/l10n/bundle.l10n.ja.json');
    const englishBundle = JSON.parse(await readFile(englishBundlePath, 'utf8')) as Record<string, string>;
    const japaneseBundle = JSON.parse(await readFile(japaneseBundlePath, 'utf8')) as Record<string, string>;
    const catalogStrings = new Set<string>();

    for (const category of reviewOpsCommandCategories) {
      catalogStrings.add(category.title);
      catalogStrings.add(category.description);
    }
    for (const command of listReviewOpsCommandCatalog()) {
      catalogStrings.add(command.kind);
      catalogStrings.add(command.label);
      catalogStrings.add(command.summary);
      catalogStrings.add(command.outcome);
      for (const effect of command.effects) {
        catalogStrings.add(effect);
      }
    }

    for (const text of catalogStrings) {
      expect(englishBundle[text]).toBeDefined();
      expect(japaneseBundle[text]).toBeDefined();
    }
    expect(japaneseBundle['Start Research Cycle']).toBe('調査サイクルを開始');
    expect(japaneseBundle['What happens next']).toBe('次の状態');
  });

  it('keeps localized manifest files in the generated VSIX', async () => {
    const script = await readFile(path.join(process.cwd(), 'scripts/generate-vsix.command'), 'utf8');

    for (const expected of [
      'copy_dir "$EXTENSION_DIR/l10n" "$STAGE_DIR/l10n"',
      'copy_file "$EXTENSION_DIR/package.nls.json" "$STAGE_DIR/package.nls.json"',
      'copy_file "$EXTENSION_DIR/package.nls.ja.json" "$STAGE_DIR/package.nls.ja.json"',
      "'l10n/**'",
      "'package.nls.json'",
      "'package.nls.*.json'",
      "grep -q 'extension/resources/reviewops_guard_icon_128.png'",
      "grep -q 'extension/resources/reviewops-activitybar.svg'",
      "grep -q 'extension/resources/reviewops-command-light.svg'",
      "grep -q 'extension/resources/reviewops-command-dark.svg'",
      "grep -q 'extension/package.nls.json'",
      "grep -q 'extension/package.nls.ja.json'",
      "grep -q 'extension/l10n/bundle.l10n.json'",
      "grep -q 'extension/l10n/bundle.l10n.ja.json'"
    ]) {
      expect(script).toContain(expected);
    }
  });
});

async function readExtensionSourceFiles(sourceRoot: string): Promise<string> {
  const files = await listTypeScriptFiles(sourceRoot);
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return sources.join('\n');
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
    })
  );

  return files.flat().sort();
}
