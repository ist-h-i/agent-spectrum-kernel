import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigPathError, FileSystemConfigStore } from '../index.js';

describe('config store', () => {
  it('reads and writes shared and local ReviewOps text files', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-config-'));
    const store = new FileSystemConfigStore(workspaceRoot);

    await store.writeSharedText('templates/prompt-templates.yaml', 'version: 1\n');
    await store.writeLocalText('project-context.local.yaml', 'version: 1\ncontext: {}\n');

    await expect(store.readSharedText('templates/prompt-templates.yaml')).resolves.toBe('version: 1\n');
    await expect(store.readLocalText('project-context.local.yaml')).resolves.toContain('context: {}');
  });

  it('rejects config paths that escape ReviewOps directories', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'reviewops-config-'));
    const store = new FileSystemConfigStore(workspaceRoot);

    await expect(store.writeSharedText('../token.txt', 'secret')).rejects.toThrow(ConfigPathError);
    await expect(store.writeLocalText('/tmp/token.txt', 'secret')).rejects.toThrow(ConfigPathError);
  });
});
