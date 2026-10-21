import {createHash} from 'node:crypto';

// Prospective helper only. No existing producer or selector imports this module.
export const PRIMARY_DISCOVERY_GRAMMAR_V9_CANDIDATE_REVISION='primary-discovery-grammar-v9-candidate-2';
const MAX_BYTES=16*1024,MAX_WORDS=512,MAX_OPERATIONS=32;
const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
export class PrimaryDiscoveryGrammarError extends Error {
 constructor(code){super('finite discovery classification unavailable: '+code);this.name='PrimaryDiscoveryGrammarError';this.code=code;}
}
const fail=code=>{throw new PrimaryDiscoveryGrammarError(code);};

// Literal words and two serial connectors only. This never evaluates shell code.
// Quoting/escaping is decoded before vocabulary checks; no whitespace splitting
// or connector recognition takes place inside a quoted word.
function literalOperations(input){
 if(typeof input!=='string'||!input.length||!input.isWellFormed()||Buffer.byteLength(input)>MAX_BYTES)fail('unsupported_command');
 if(/[\0\r\n]/u.test(input))fail('unsupported_command');
 const operations=[],words=[];let value='',active=false,quote=null,count=0;
 const word=()=>{if(active){if(++count>MAX_WORDS||Buffer.byteLength(value)>4096)fail('unsupported_command');words.push(value);value='';active=false;}};
 const operation=()=>{word();if(!words.length||operations.length>=MAX_OPERATIONS)fail('unsupported_command');operations.push(words.splice(0));};
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quote==="'"){if(c==="'")quote=null;else value+=c;continue;}
  if(c==='\\'){
   const next=input[++i];if(next===undefined)fail('unsupported_command');
   active=true;
   if(quote==='"'&&!['$','`','"','\\'].includes(next))value+='\\';
   value+=next;continue;
  }
  if(quote==='"'){
   if(c==='"')quote=null;else if(c==='$'||c==='`')fail('unsafe_command');else value+=c;
   continue;
  }
  if(c==="'"||c==='"'){quote=c;active=true;continue;}
  if(c===' '||c==='\t'){word();continue;}
  if(c===';'||c==='&'&&input[i+1]==='&'){
   operation();if(c==='&')i++;continue;
  }
  if(/[&|<>()$`]/u.test(c))fail('unsafe_command');
  // Unquoted expansion characters, comments and history syntax stay unknown.
  if(!/[A-Za-z0-9_./:@%+=,-]/u.test(c))fail('unsupported_command');
  active=true;value+=c;
 }
 if(quote!==null)fail('unsupported_command');operation();return operations;
}

function publicContext(files){
 if(!Array.isArray(files)||!files.length||files.length>10000||new Set(files).size!==files.length)fail('auxiliary_read_context_unavailable');
 const segment='[A-Za-z0-9_][A-Za-z0-9_.-]*';
 const path=new RegExp('^(?:task\\.md|workspace/(?:'+segment+'/)*'+segment+')$','u');
 // for-of visits array holes as undefined; Array#some would skip them.
 for(const file of files)if(typeof file!=='string'||file.length>4096||!path.test(file))fail('auxiliary_read_context_unavailable');
 const directories=new Set(['.']);
 for(const file of files){const parts=file.split('/');parts.pop();while(parts.length){directories.add(parts.join('/'));parts.pop();}}
 return {files:new Set(files),directories};
}

function globWord(value){
 if(!value||value.length>512||!/^[A-Za-z0-9_.*?{}\[\],!\\/-]+$/u.test(value))fail('unsupported_command');
 // Positive ripgrep overrides can whitelist hidden files despite --files'
 // default hidden exclusion. Only explicit negative argv filters are qualified;
 // never infer exclusion from an escaped leading bang or ambiguous double bang.
 if(!value.startsWith('!')||value.startsWith('!!'))fail('auxiliary_read_path_unavailable');
 // Tool-level escaped glob characters remain literal argv, never shell syntax.
 // Validate their decoded path vocabulary too; escaped dots cannot hide '..'.
 if(/\\(?![.\[\]{}*?!,\\])/u.test(value))fail('unsupported_command');
 const path=value.replace(/\\([.\[\]{}*?!,\\])/gu,'$1').replace(/^!/u,'');
 if(!path||path.startsWith('/')||path.split('/').some(segment=>!segment||segment==='.'||segment==='..'))fail('auxiliary_read_path_unavailable');
 return value;
}

const activeTools=new Set(['rm','mv','cp','touch','tee','chmod','chown','mkdir','rmdir','curl','wget','ssh','scp','source','exec','eval','export','unset']);
function classifyOperation(argv,context){
 const [tool,...args]=argv;
 if(activeTools.has(tool)||/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tool))fail('unsafe_command');
 if(tool==='pwd'&&!args.length)return {tool,argv:[]};
 if(tool==='cat'){
  const paths=args[0]==='--'?args.slice(1):args;
  if(!paths.length)fail('unsupported_command');
  if(paths.some(path=>!context.files.has(path)))fail('auxiliary_read_path_unavailable');
  return {tool,argv:args};
 }
 if(tool==='rg'&&args[0]==='--files'){
  let index=1,target='.';
  while(index<args.length&&(args[index]==='-g'||args[index]==='--glob')){
   if(index+1>=args.length)fail('unsupported_command');globWord(args[index+1]);index+=2;
  }
  if(args[index]==='--'&&index+2===args.length){target=args[index+1];index+=2;}
  if(index!==args.length)fail('unsupported_command');
  if(!context.directories.has(target))fail('auxiliary_read_path_unavailable');
  return {tool,argv:args,enumeration_target:target};
 }
 fail('unsupported_command');
}

export function classifyPrimaryDiscoveryCommandV9(raw,{publicFiles}={}){
 const context=publicContext(publicFiles),outer=literalOperations(raw);
 if(outer.length!==1||outer[0].length!==3||!['/bin/bash','/bin/zsh'].includes(outer[0][0])||outer[0][1]!=='-lc')fail('unsupported_shell');
 const [shell,,script]=outer[0];
 // Full closure: a later unknown operation prevents any partial result.
 const operations=literalOperations(script).map(argv=>classifyOperation(argv,context));
 return {revision:PRIMARY_DISCOVERY_GRAMMAR_V9_CANDIDATE_REVISION,kind:'finite_public_read_vocabulary',
  rendered_command_digest:digest(raw),script_digest:digest(script),shell_executable:shell,
  verification_authority:false,runtime_isolation_authority:false,working_directory:'unverified',operations};
}
