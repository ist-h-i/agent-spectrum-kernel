import { promises as fs } from 'node:fs';
import path from 'node:path';

const AI_DEPENDENCY_PATTERNS = [
  /^openai$/,
  /^@anthropic-ai\//,
  /^@google\/generative-ai$/,
  /^azure-openai$/,
  /^@azure\/openai$/,
  /^langchain$/,
  /^@langchain\//,
  /^ai$/
];

const AI_ENDPOINT_PATTERNS = [
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /openai\.azure\.com/i
];

const CORE_POLICY_DIRS = [
  'packages/core/src/application/',
  'packages/core/src/domain/'
];
const CORE_POLICY_FORBIDDEN_PATTERNS = [
  {
    pattern: /from ['"]node:/,
    reason: 'application/domain layer must not import Node runtime modules'
  },
  {
    pattern: /from ['"].*\/infrastructure\//,
    reason: 'application/domain layer must not import infrastructure adapters'
  },
  {
    pattern: /\bJSON\.parse\s*\(/,
    reason: 'application/domain layer must use serialization helpers instead of raw JSON.parse'
  },
  {
    pattern: /from ['"]yaml['"]/,
    reason: 'application/domain layer must use serialization helpers instead of direct YAML parsing'
  }
];
const FILE_POLICY_FORBIDDEN_PATTERNS = [
  {
    file: 'packages/vscode-extension/src/artifact-loader.ts',
    pattern: /\bJSON\.parse\s*\(/,
    reason: 'artifact loader must use serialization helpers instead of raw JSON.parse'
  }
];

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yaml', '.yml']);

export async function collectPolicyViolations(rootDir) {
  const violations = [];
  const packageJsonPaths = await findFiles(rootDir, 'package.json');

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const dependencySections = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies'
    ];

    for (const section of dependencySections) {
      for (const dependencyName of Object.keys(packageJson[section] ?? {})) {
        if (AI_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(dependencyName))) {
          violations.push(`${relative(rootDir, packageJsonPath)}: ${section} includes ${dependencyName}`);
        }
      }
    }
  }

  const searchableFiles = await findTextFiles(rootDir);
  for (const filePath of searchableFiles) {
    if (filePath.endsWith('scripts/policy-checker.mjs')) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    if (AI_ENDPOINT_PATTERNS.some((pattern) => pattern.test(content))) {
      violations.push(`${relative(rootDir, filePath)}: contains a known AI API endpoint`);
    }

    const relativePath = relative(rootDir, filePath);
    if (CORE_POLICY_DIRS.some((dir) => relativePath.startsWith(dir))) {
      for (const rule of CORE_POLICY_FORBIDDEN_PATTERNS) {
        if (rule.pattern.test(content)) {
          violations.push(`${relativePath}: ${rule.reason}`);
        }
      }
    }

    for (const rule of FILE_POLICY_FORBIDDEN_PATTERNS) {
      if (relativePath === rule.file && rule.pattern.test(content)) {
        violations.push(`${relativePath}: ${rule.reason}`);
      }
    }
  }

  return violations;
}

async function findFiles(rootDir, fileName) {
  const matches = [];
  await walk(rootDir, async (entryPath, entry) => {
    if (entry.isFile() && entry.name === fileName) {
      matches.push(entryPath);
    }
  });
  return matches;
}

async function findTextFiles(rootDir) {
  const matches = [];
  await walk(rootDir, async (entryPath, entry) => {
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      matches.push(entryPath);
    }
  });
  return matches;
}

async function walk(dir, visit) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    await visit(entryPath, entry);

    if (entry.isDirectory()) {
      await walk(entryPath, visit);
    }
  }
}

function relative(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}
