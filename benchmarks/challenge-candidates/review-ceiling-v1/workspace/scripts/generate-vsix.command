#!/bin/zsh
set -euo pipefail

SCRIPT_PATH="${0:A}"
SCRIPT_DIR="${SCRIPT_PATH:h}"
REPO_ROOT="${SCRIPT_DIR:h}"
EXTENSION_DIR="$REPO_ROOT/packages/vscode-extension"
CORE_DIR="$REPO_ROOT/packages/core"
PROVIDERS_DIR="$REPO_ROOT/packages/providers"
OUT_DIR="$REPO_ROOT/dist"
STAGE_ROOT="$OUT_DIR/vsix-stage"
STAGE_DIR="$STAGE_ROOT/reviewops-guard"
RUN_CHECKS="${RUN_CHECKS:-1}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

copy_dir() {
  local source_path="$1"
  local target_path="$2"

  [[ -d "$source_path" ]] || fail "Missing directory: $source_path"
  rm -rf "$target_path"
  mkdir -p "${target_path:h}"
  cp -R -L "$source_path" "$target_path"
}

copy_file() {
  local source_path="$1"
  local target_path="$2"

  [[ -f "$source_path" ]] || fail "Missing file: $source_path"
  mkdir -p "${target_path:h}"
  cp "$source_path" "$target_path"
}

for command_name in node pnpm unzip zip grep; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required."
done

[[ -f "$REPO_ROOT/package.json" ]] || fail "Repository root was not detected from $SCRIPT_PATH"
[[ -f "$EXTENSION_DIR/package.json" ]] || fail "VS Code extension package was not found."

cd "$REPO_ROOT"

log "Installing workspace dependencies"
pnpm install --frozen-lockfile

log "Building ReviewOps packages"
pnpm build

if [[ "$RUN_CHECKS" != "0" ]]; then
  log "Running tests"
  pnpm vitest run --testTimeout=15000

  log "Running lint"
  pnpm lint

  log "Running policy checks"
  pnpm check:policy
else
  log "Skipping tests/lint/policy because RUN_CHECKS=0"
fi

VERSION="$(node -p "require('./packages/vscode-extension/package.json').version")"
OUTPUT_NAME="${OUTPUT_NAME:-reviewops-guard-${VERSION}-rc.vsix}"
OUTPUT_PATH="$OUT_DIR/$OUTPUT_NAME"
CONTENTS_PATH="$OUT_DIR/${OUTPUT_NAME:r}.contents.txt"

log "Preparing VSIX staging directory"
rm -rf "$STAGE_ROOT"
mkdir -p "$STAGE_DIR/node_modules/@reviewops" "$OUT_DIR"

copy_dir "$EXTENSION_DIR/dist" "$STAGE_DIR/dist"
copy_dir "$EXTENSION_DIR/resources" "$STAGE_DIR/resources"
copy_dir "$EXTENSION_DIR/l10n" "$STAGE_DIR/l10n"
copy_file "$EXTENSION_DIR/package.nls.json" "$STAGE_DIR/package.nls.json"
copy_file "$EXTENSION_DIR/package.nls.ja.json" "$STAGE_DIR/package.nls.ja.json"
copy_file "$REPO_ROOT/README.md" "$STAGE_DIR/README.md"
copy_file "$REPO_ROOT/LICENSE" "$STAGE_DIR/LICENSE"
copy_dir "$CORE_DIR/dist" "$STAGE_DIR/node_modules/@reviewops/core/dist"
copy_dir "$PROVIDERS_DIR/dist" "$STAGE_DIR/node_modules/@reviewops/providers/dist"

YAML_PACKAGE_JSON="$(node -e 'console.log(require.resolve("yaml/package.json", { paths: [process.argv[1]] }))' "$CORE_DIR")"
copy_dir "${YAML_PACKAGE_JSON:h}" "$STAGE_DIR/node_modules/yaml"

export REPO_ROOT EXTENSION_DIR CORE_DIR PROVIDERS_DIR STAGE_DIR
node <<'NODE'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = process.env.REPO_ROOT;
const extensionDir = process.env.EXTENSION_DIR;
const coreDir = process.env.CORE_DIR;
const providersDir = process.env.PROVIDERS_DIR;
const stageDir = process.env.STAGE_DIR;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runtimePackageJson(sourceDir, overrides = {}) {
  const pkg = readJson(path.join(sourceDir, 'package.json'));
  delete pkg.private;
  delete pkg.scripts;
  delete pkg.devDependencies;
  return {
    ...pkg,
    ...overrides
  };
}

const extensionPkg = runtimePackageJson(extensionDir);
const corePkg = runtimePackageJson(coreDir);
const providersPkg = runtimePackageJson(providersDir);
const repositoryUrl = detectRepositoryUrl(repoRoot);

extensionPkg.dependencies = {
  '@reviewops/core': corePkg.version,
  '@reviewops/providers': providersPkg.version
};
extensionPkg.files = [
  'dist/**',
  'resources/**',
  'l10n/**',
  'package.nls.json',
  'package.nls.*.json',
  'README.md',
  'LICENSE'
];
if (repositoryUrl !== undefined) {
  extensionPkg.repository = {
    type: 'git',
    url: repositoryUrl
  };
}
corePkg.dependencies = {
  ...(corePkg.dependencies ?? {})
};
providersPkg.dependencies = {
  '@reviewops/core': corePkg.version
};

writeJson(path.join(stageDir, 'package.json'), extensionPkg);
writeJson(path.join(stageDir, 'node_modules', '@reviewops', 'core', 'package.json'), corePkg);
writeJson(path.join(stageDir, 'node_modules', '@reviewops', 'providers', 'package.json'), providersPkg);

const licensePath = path.join(repoRoot, 'LICENSE');
for (const packageDir of [
  path.join(stageDir, 'node_modules', '@reviewops', 'core'),
  path.join(stageDir, 'node_modules', '@reviewops', 'providers')
]) {
  fs.copyFileSync(licensePath, path.join(packageDir, 'LICENSE'));
}

function detectRepositoryUrl(cwd) {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    if (remoteUrl.length === 0) {
      return undefined;
    }

    if (remoteUrl.startsWith('git@github.com:')) {
      return `https://github.com/${remoteUrl.slice('git@github.com:'.length).replace(/\.git$/u, '')}.git`;
    }

    return remoteUrl;
  } catch {
    return undefined;
  }
}
NODE

log "Packaging VSIX"
rm -f "$OUTPUT_PATH" "$CONTENTS_PATH"
(
  cd "$STAGE_DIR"
  pnpm dlx @vscode/vsce package --out "$OUTPUT_PATH" --no-dependencies --allow-missing-repository
)

log "Injecting workspace runtime dependencies"
INJECT_DIR="$STAGE_ROOT/vsix-inject"
rm -rf "$INJECT_DIR"
mkdir -p "$INJECT_DIR/extension"
copy_dir "$STAGE_DIR/node_modules" "$INJECT_DIR/extension/node_modules"
(
  cd "$INJECT_DIR"
  zip -qr "$OUTPUT_PATH" extension/node_modules
)

log "Inspecting VSIX contents"
unzip -l "$OUTPUT_PATH" > "$CONTENTS_PATH"

grep -q 'extension/dist/extension.js' "$CONTENTS_PATH" || fail "VSIX does not contain extension/dist/extension.js"
grep -q 'extension/resources/reviewops_guard_icon_128.png' "$CONTENTS_PATH" || fail "VSIX does not contain ReviewOps icon"
grep -q 'extension/resources/reviewops-activitybar.svg' "$CONTENTS_PATH" || fail "VSIX does not contain ReviewOps Activity Bar icon"
grep -q 'extension/resources/reviewops-command-light.svg' "$CONTENTS_PATH" || fail "VSIX does not contain ReviewOps light command icon"
grep -q 'extension/resources/reviewops-command-dark.svg' "$CONTENTS_PATH" || fail "VSIX does not contain ReviewOps dark command icon"
grep -q 'extension/package.nls.json' "$CONTENTS_PATH" || fail "VSIX does not contain package.nls.json"
grep -q 'extension/package.nls.ja.json' "$CONTENTS_PATH" || fail "VSIX does not contain package.nls.ja.json"
grep -q 'extension/l10n/bundle.l10n.json' "$CONTENTS_PATH" || fail "VSIX does not contain runtime l10n bundle"
grep -q 'extension/l10n/bundle.l10n.ja.json' "$CONTENTS_PATH" || fail "VSIX does not contain Japanese runtime l10n bundle"
grep -q 'extension/node_modules/@reviewops/core/dist/index.js' "$CONTENTS_PATH" || fail "VSIX does not contain @reviewops/core"
grep -q 'extension/node_modules/@reviewops/providers/dist/index.js' "$CONTENTS_PATH" || fail "VSIX does not contain @reviewops/providers"
grep -q 'extension/node_modules/yaml/package.json' "$CONTENTS_PATH" || fail "VSIX does not contain yaml runtime dependency"

log "VSIX generated"
printf 'VSIX: %s\n' "$OUTPUT_PATH"
printf 'Contents: %s\n' "$CONTENTS_PATH"
printf '\nInstall for local smoke:\n  code --install-extension "%s"\n' "$OUTPUT_PATH"
