import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { readContentAddressedJson } from './content-addressed-store.mjs';
const fixtures = resolve(import.meta.dirname, '../docs/fixtures/prompt-v2-preregistration');
const reference = JSON.parse(readFileSync(join(fixtures, 'reference.json')));
export function environmentFixture(t, track = 'codex', role = 'baseline', existing = null) {
  const root = existing?.root ?? realpathSync(mkdtempSync(join(tmpdir(), 'ask-environment-')));
  if (!existing) t.after(() => rmSync(root, { recursive: true, force: true }));
  const storeRoot = join(root, 'store');
  if (!existing) cpSync(join(fixtures, 'store'), storeRoot, { recursive: true });
  const adapter = reference.adapters.find(a => a.adapter_track === track);
  const asset = adapter[role === 'baseline' ? 'baseline_asset' : 'candidate_asset'];
  const content = readContentAddressedJson({ storeRoot, digest: asset.content_digest }).value;
  const prefix = track === 'codex' ? '.agents/prompts/' : '.claude/commands/';
  writeFileSync(join(root, 'AGENTS.md'), 'Artificial bounded instruction environment.\n');
  const selection = readContentAddressedJson({ storeRoot, digest: adapter[`${role}_selection`].selection_object_digest }).value;
  const context = readContentAddressedJson({ storeRoot, digest: selection.context_object_digest }).value;
  const options = { storeRoot, sourceRoot: root, environmentId: `fixture-${track}-${role}`,
    adapter: track === 'codex' ? 'codex' : 'claude_code', runtime: { cli_version: 'fixture-v1', model: context.model, ambient_config: 'Unknown' },
    registrySnapshotDigest: reference.registry.snapshot_digest,
    selectionObjectDigest: adapter[`${role}_selection`].selection_object_digest,
    bindings: [{ asset, files: content.files.map(f => ({ source: f.path, target: prefix + basename(f.path) })) }],
    supportPaths: ['AGENTS.md'], trustedPortfolioAuthorityContexts: adapter.portfolio_authority_contexts };
  return { root, storeRoot, options, adapter, content };
}
