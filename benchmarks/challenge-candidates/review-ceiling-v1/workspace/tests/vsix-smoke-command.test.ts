import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('VSIX smoke command', () => {
  it('launches ReviewOps Guard from an isolated VS Code profile', async () => {
    const script = await readFile(path.join(process.cwd(), 'scripts/smoke-vsix.command'), 'utf8');

    expect(script).toContain('scripts/smoke-vsix.command');
    expect(script).toContain('generate-vsix.command');
    expect(script).toContain('--user-data-dir "$USER_DATA_DIR"');
    expect(script).toContain('--extensions-dir "$EXTENSIONS_DIR"');
    expect(script).toContain('--install-extension "$VSIX_PATH"');
    expect(script).toContain('SMOKE_ROOT="${SMOKE_ROOT:A}"');
    expect(script).toContain('GENERATED_VSIX_PATH="$OUT_DIR/$OUTPUT_NAME"');
    expect(script).toContain('cp "$GENERATED_VSIX_PATH" "$VSIX_PATH"');
    expect(script).toContain('reviewops-vsix-smoke-workspace');
    expect(script).toContain('ReviewOps: Initialize Project');
    expect(script).toContain('ReviewOps: Update Project Context');
    expect(script).toContain('ReviewOps: Prepare Local Diff Review');
    expect(script).toContain('ReviewOps: Show P0 Readiness');
    expect(script).toContain('select the six verified smoke steps');
  });

  it('validates normalized smoke roots before cleanup', async () => {
    const script = await readFile(path.join(process.cwd(), 'scripts/smoke-vsix.command'), 'utf8');

    expect(script.indexOf('SMOKE_ROOT="${SMOKE_ROOT:A}"')).toBeLessThan(script.indexOf('rm -rf "$SMOKE_ROOT"'));
    expect(script).toContain('"$REPO_ROOT" | "$OUT_DIR"');
  });
});
