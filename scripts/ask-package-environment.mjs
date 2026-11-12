#!/usr/bin/env node
// npm transport defaults import sources to files; shared domain code is unchanged.
import { runInstructionEnvironmentCommand } from './instruction-environment-cli.mjs';
import { readJsonFileStrict } from './content-addressed-store.mjs';
try {
  if(process.argv.length!==4)throw new Error('Usage: ask environment COMMAND input.json');
  const command=process.argv[2],input=readJsonFileStrict(process.argv[3]);
  if(['package-plan','package-apply'].includes(command)&&input.sourceKind===undefined)input.sourceKind='filesystem_snapshot';
  console.log(JSON.stringify(runInstructionEnvironmentCommand(command,input),null,2));
}catch(error){console.error(`ask environment: ${error.message}`);process.exitCode=1;}
