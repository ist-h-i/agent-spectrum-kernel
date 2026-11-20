import {sealedInput,stats} from './manifest.mjs';
const rows=sealedInput().files;
const counts=stats(rows);
if(counts.implementation_lines+counts.test_lines<20000) throw new Error('Expected tens-of-thousands of meaningful source/test lines');
if(!rows.some(r=>r.path==='LICENSE')) throw new Error('Missing MIT notice');
for(const row of rows){
 if(/(^|\/)(private|oracle|answer-key|authoring)(\/|$)/.test(row.path)) throw new Error(`Evaluator-like path in input: ${row.path}`);
 if(row.path.endsWith('.png')) continue;
 const body=row.bytes.toString('utf8');
 if(/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|AKIA[A-Z0-9]{16}/.test(body)) throw new Error(`Credential-pattern match: ${row.path}`);
}
const {createPortal}=await import('../workspace/packages/portal/server/app.mjs');
const app=createPortal(); const base=await app.listen();
try {
 const page=await fetch(base+'/'); if(page.status!==200) throw new Error('Portal HTML unavailable');
 const api=await fetch(base+'/api/teams');if(api.status!==200) throw new Error('API unavailable');
 if(!Array.isArray((await api.json()).teams)) throw new Error('Team contract broken');
} finally {await app.close();}
console.log(JSON.stringify({status:'passed',checks:['manifest','minimum_source_test_size','license','limited_credential_patterns','loopback_html_api_smoke'],...counts,not_proven:['complete_secret_absence','full_legacy_suite','model_difficulty','semantic_grader_quality']}));
