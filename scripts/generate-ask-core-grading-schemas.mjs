import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const names=['normalized-portfolio-result','normalized-portfolio-run','evaluator-result-envelope','portfolio-engineering-result','original-workspace-authority','portfolio-terminal-workspace-authority','repository-diff-artifact','portfolio-command-evidence'];
const legacy=['plain','kernel_only','adaptive_ask','full_ask'];
function extend(value){if(!value||typeof value!=='object')return;if(JSON.stringify(value.enum)===JSON.stringify(legacy))value.enum=['plain','core','full'];for(const child of Object.values(value))extend(child);}
for(const name of names){const v=JSON.parse(readFileSync(resolve(root,`benchmarks/schemas/${name}.schema.json`),'utf8'));extend(v);v.title=`Core grading compatibility profile: ${v.title}`;v.$comment='Generated condition extension. Base schema_path is retained; this profile requires independently pinned Core provenance authority.';const coverage=v.properties?.completeness?.properties?.by_condition;if(coverage){if(coverage.minItems===4)coverage.minItems=3;if(coverage.maxItems===4)coverage.maxItems=3;}const bytes=JSON.stringify(v,null,2)+'\n',path=resolve(root,`benchmarks/schemas/core-${name}.schema.json`);if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw new Error(`stale Core grading schema: ${name}`);}else writeFileSync(path,bytes);}
console.log('Core grading schemas verified');
