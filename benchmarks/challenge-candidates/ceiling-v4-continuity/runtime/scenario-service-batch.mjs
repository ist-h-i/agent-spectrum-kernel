// v2-only bounded scheduler leaf. Reuses the unchanged scenario worker/engine.
// Data-only programs enter; submitted test JavaScript never enters this side.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const request=JSON.parse(readFileSync('.ceiling/scenario-service-request.json','utf8'));
const capabilities=JSON.parse(readFileSync('harness/scenario-capabilities.json','utf8'));
const profiles=capabilities.resourceProfiles??[],items=request.scenarios;
const resource=item=>Object.hasOwn(item.program,'resourceProfile');
const invalid=!Array.isArray(items)||items.length===0||items.length>6||!Array.isArray(profiles)
  ||items.some(item=>!item||typeof item.id!=='string'||!item.program||resource(item)&&!profiles.includes(item.program.resourceProfile))
  ||items.some(resource)&&(items.length!==1);
if(invalid){process.stdout.write(JSON.stringify({version:'ceiling-scenario-service-v1',runtime:process.version,input_error:'invalid bounded service batch',observations:{}})+'\n');process.exit(0);}
const observations={};
for(const item of items){
  const heavy=resource(item),transportNonce=randomBytes(32).toString('hex');
  const result=spawnSync(process.execPath,[...(heavy?['--expose-gc']:[]),'--permission',`--allow-fs-read=${process.cwd()}`,'harness/scenario-worker.mjs'],{
    cwd:process.cwd(),input:JSON.stringify({program:item.program,transportNonce}),encoding:'utf8',timeout:heavy?90000:15000,maxBuffer:4*1024*1024,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',LANG:'C'},
  });
  let value=null;try{value=JSON.parse(result.stdout);}catch{}
  observations[item.id]=result.status===0&&!result.error&&value?.transportNonce===transportNonce
    ?{state:value.state,observations:value.observations??null,error:value.error??null}
    :{state:'service_failure',error:result.error?.code??result.signal??result.status};
}
process.stdout.write(JSON.stringify({version:'ceiling-scenario-service-v1',runtime:process.version,observations})+'\n');
