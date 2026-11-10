import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const workspace = path.join(root, 'workspace');
export async function inventory(dir=workspace, prefix='') {
  const rows=[];
  for (const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    if (['node_modules','dist','.git'].includes(entry.name)) continue;
    const rel=prefix ? `${prefix}/${entry.name}` : entry.name;
    const full=path.join(dir,entry.name);
    if(entry.isSymbolicLink()) throw new Error(`Input symlink forbidden: ${rel}`);
    if(entry.isDirectory()) rows.push(...await inventory(full,rel));
    else if(entry.isFile()) {
      const b=await fs.readFile(full);
      rows.push({path:rel,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length});
    } else throw new Error(`Special file forbidden: ${rel}`);
  }
  return rows;
}
export async function stats(rows) {
  const out={files:rows.length,bytes:rows.reduce((s,r)=>s+r.bytes,0),implementation_lines:0,test_lines:0,styles_lines:0,markup_lines:0,other_text_lines:0};
  for(const row of rows) {
    if(/\.(png|jpg|woff|ico)$/.test(row.path)) continue;
    const text=await fs.readFile(path.join(workspace,row.path),'utf8');
    const lines=text.split('\n').length-(text.endsWith('\n')?1:0);
    const test=/(^|\/)(__tests__|tests?|fixtures)(\/|$)|\.test\./.test(row.path);
    const key=/\.(ts|tsx|js|mjs|cjs)$/.test(row.path)?(test?'test_lines':'implementation_lines'):/\.css$/.test(row.path)?'styles_lines':/\.html$/.test(row.path)?'markup_lines':'other_text_lines';
    out[key]+=lines;
  }
  return out;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const rows=await inventory(); const totals=await stats(rows);
 const manifest={schema:'ask.review-challenge-input@1',fixture_id:'rc01-shared-review-platform',counts:totals,files:rows};
 const target=path.join(root,'input-manifests/rc01-shared-review-platform.json');
 if(process.argv.includes('--check')) {
   const actual=JSON.parse(await fs.readFile(target,'utf8'));
   if(JSON.stringify(actual)!==JSON.stringify(manifest)) throw new Error('Input manifest differs; inspect and deliberately refresh');
 } else await fs.writeFile(target,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({status:'ok',...totals}));
}
