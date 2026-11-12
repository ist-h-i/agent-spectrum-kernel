import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoSymlinkPathSegments } from './content-addressed-store.mjs';
import { writeInstructionSourceSnapshot } from './instruction-source-version.mjs';

const RUNTIME_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const within = (root,path) => {const r=relative(root,path);return r!== '..'&&!r.startsWith(`..${sep}`)&&!isAbsolute(r);};
export function initializePackageWorkspace(workspace,{runtimeRoot=RUNTIME_ROOT}={}) {
  assert.ok(typeof workspace==='string' && workspace.trim(),'--workspace <path> is required');
  const destination=resolve(workspace),source=realpathSync(runtimeRoot);
  assert.ok(!within(source,destination)&&!within(destination,source),'workspace must be separate from the package/runtime');
  assertNoSymlinkPathSegments(destination,'ASK workspace',{allowMissingLeaf:true});
  assert.ok(!existsSync(destination),'workspace already exists; initialization never overwrites assets');
  const inventory=JSON.parse(readFileSync(join(source,'npm-runtime-inventory.json'),'utf8'));
  assert.equal(inventory.schema_version,'1.0.0');assert.ok(Array.isArray(inventory.entries));
  mkdirSync(dirname(destination),{recursive:true});
  const staging=mkdtempSync(join(dirname(destination),`.${basename(destination)}.ask-init-`));
  try {
    const sourceRoot=join(staging,'source');mkdirSync(sourceRoot,{mode:0o700});
    const paths=new Set();
    for(const entry of inventory.entries){
      assert.ok(typeof entry.path==='string'&&entry.path&&!isAbsolute(entry.path)&&!entry.path.includes('\\')&&entry.path.split('/').every(p=>p&&p!=='.'&&p!=='..'),'invalid packaged path');
      assert.ok(!paths.has(entry.path),'duplicate packaged path');paths.add(entry.path);
      const input=join(source,entry.path);assertNoSymlinkPathSegments(input,'packaged runtime input');
      assert.ok(lstatSync(input).isFile(),'packaged runtime must contain regular files');
      const bytes=readFileSync(input);assert.equal(bytes.length,entry.bytes,'packaged size differs');
      assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,'packaged content differs');
      const target=join(sourceRoot,entry.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx',mode:lstatSync(input).mode&0o777});
    }
    // Keep the source runnable independently of npm's replaceable cache.
    cpSync(join(source,'npm-runtime-inventory.json'),join(sourceRoot,'npm-runtime-inventory.json'));
    const revision=writeInstructionSourceSnapshot(sourceRoot);
    mkdirSync(join(staging,'state'),{mode:0o700});
    const record={schema_version:'1.0.0',kind:'ask_npm_workspace_v1',package_name:inventory.package_name,
      package_version:inventory.package_version,source_kind:'filesystem_snapshot',
      source_root:join(destination,'source'),source_revision:revision,state_root:join(destination,'state')};
    writeFileSync(join(staging,'.ask-workspace.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
    // No overwrite of an initialized workspace, including a concurrent init.
    assert.ok(!existsSync(destination),'workspace was created concurrently');
    renameSync(staging,destination);
    return record;
  } finally {if(existsSync(staging))rmSync(staging,{recursive:true,force:true});}
}
export function packageWorkspaceRuntime(workspace){
  const root=resolve(workspace);assertNoSymlinkPathSegments(root,'ASK workspace');
  const metadata=JSON.parse(readFileSync(join(root,'.ask-workspace.json'),'utf8'));
  assert.equal(metadata.kind,'ask_npm_workspace_v1');assert.equal(metadata.schema_version,'1.0.0');
  assert.equal(metadata.source_root,join(root,'source'),'workspace moved; migrate its absolute paths before use');
  assert.equal(metadata.state_root,join(root,'state'));
  assertNoSymlinkPathSegments(metadata.source_root,'ASK source');
  return metadata.source_root;
}
