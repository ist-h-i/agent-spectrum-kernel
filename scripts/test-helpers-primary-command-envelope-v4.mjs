// Fresh artificial events only. These strings are never shell-executed.
import { join } from 'node:path';
import { renderCommandEvent } from './ask-benchmark-command-evidence.mjs';
export const envelopeHeaders = () => [{ type:'thread.started',thread_id:'artificial-envelope-thread' },{ type:'turn.started' }];
export const envelopeEnd = () => ({type:'turn.completed',usage:{input_tokens:12,cached_input_tokens:3,output_tokens:4,cache_write_input_tokens:0,reasoning_output_tokens:2}});
export function artificialCommand(command,id,status='completed',exit_code=0) {
 return [{type:'item.started',item:{id,type:'command_execution',command,status:'in_progress'}},
  {type:'item.completed',item:{id,type:'command_execution',command,status,exit_code,aggregated_output:'artificial output; not an executed check'}}];
}
export function artificialEdit(path,id='artificial-edit',kind='update') {
 return [{type:'item.started',item:{id,type:'file_change',status:'in_progress',changes:[{path,kind}]}},
  {type:'item.completed',item:{id,type:'file_change',status:'completed',changes:[{path,kind}]}}];
}
export function artificialCombinedEnvelope({contract,armRoot='/synthetic/retained/arms/plain',path='workspace/build.config.json',absolute=true,status='completed',exit_code=0,edit=true}) {
 const a=artificialCommand("/bin/zsh -lc 'pwd'",'artificial-reader-a');
 const b=artificialCommand("/bin/zsh -lc 'cat README.md'",'artificial-reader-b');
 const checks=contract.commands.map((command,i)=>artificialCommand(renderCommandEvent(command),`artificial-check-${i}`,status,exit_code));
 return [...envelopeHeaders(),a[0],b[0],b[1],a[1],...(edit?artificialEdit(absolute?join(armRoot,path):path):[]),
  ...checks.map(pair=>pair[0]),...checks.toReversed().map(pair=>pair[1]),envelopeEnd()];
}
