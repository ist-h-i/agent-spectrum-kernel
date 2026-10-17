// Independently authored artificial spelling only; never execute these strings.
import {artificialCombinedEnvelope} from './test-helpers-primary-command-envelope-v4.mjs';
const doubleWord=value=>'"'+value.replace(/[\\"$`]/gu,c=>'\\'+c)+'"';
export function artificialLiteralCommand(command,{literalPrefix=false}={}) {
 const script=command.canonical_script;
 const prefix=literalPrefix&&script.startsWith('node')?'node':'';
 const word=prefix+script.slice(prefix.length).split('!').map(doubleWord).join("'!'" );
 return '/bin/bash -lc '+word;
}
export function artificialLiteralEnvelope({contract,...options}) {
 const events=artificialCombinedEnvelope({contract,...options});
 for(const event of events) {
  if(event.item?.id==='artificial-reader-a')event.item.command='/bin/bash -lc "pwd"';
  if(event.item?.id==='artificial-reader-b')event.item.command='/bin/bash -lc "cat README.md"';
  if(event.item?.id?.startsWith('artificial-check-')) {
   const index=Number(event.item.id.slice('artificial-check-'.length));
   event.item.command=artificialLiteralCommand(contract.commands[index]);
  }
 }
 return events;
}
