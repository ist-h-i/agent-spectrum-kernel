#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializePackageWorkspace, packageWorkspaceRuntime } from './ask-package-workspace.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const HELP=`ASK — instruction assets and a supervised improvement loop

Usage:
  ask init --workspace <new-directory>
  ask [--workspace <directory>] setup <inspect|recommend|plan|check|apply> [options]
  ask [--workspace <directory>] doctor [--target <directory>] [--json]
  ask --workspace <directory> loop prepare --spec <file.json> --run-id <id>
  ask [--workspace <directory>] loop <command> [options]
  ask [--workspace <directory>] environment <command> <input.json>
  ask [--workspace <directory>] assets <preview|export|receive|plan|apply> <input.json>
  ask [--workspace <directory>] evaluate <command> [options]
  ask [--workspace <directory>] rules <prepare|status|review> [options]
  ask [--workspace <directory>] findings <init|capture|list|feedback> [options]
  ask [--workspace <directory>] verification <prepare|coverage|review> [options]
  ask --version

init creates a persistent file-based source and state directory, without Git.
Use --workspace for a loop so npm updates/cache cleanup cannot change its runtime.
setup plan is read-only; setup apply needs an exact saved plan. The human approves
both evaluation cases and adoption. Installation never edits your projects.
assets receive/plan/apply imports candidates, not trusted approvals or activation.
Use 'ask setup --help' for installer options. See docs/npm-distribution.md in the
package for the loop configuration and external model/tool prerequisites.
`;
export function packageCommand(args){
  args=[...args];let workspace=null;
  if(args[0]==='--workspace'){args.shift();workspace=args.shift();if(!workspace||workspace.startsWith('--'))throw new Error('--workspace needs a directory');}
  const command=args.shift();
  if(!command||command==='--help'||command==='help'){process.stdout.write(HELP);return 0;}
  if(command==='--version'){if(args.length)throw new Error('--version takes no arguments');const i=JSON.parse(readFileSync(join(ROOT,'npm-runtime-inventory.json'),'utf8'));console.log(i.package_version);return 0;}
  if(command==='init'){
    if(args[0]==='--workspace'&&args.length===2&&!workspace)workspace=args[1];
    else if(args.length)throw new Error('Usage: ask init --workspace <new-directory>');
    console.log(JSON.stringify(initializePackageWorkspace(workspace),null,2));return 0;
  }
  const runtime=workspace?packageWorkspaceRuntime(workspace):ROOT;
  const entries={setup:'ask-setup.mjs',doctor:'ask-setup.mjs',loop:'supervised-instruction-loop-cli.mjs',
    environment:'ask-package-environment.mjs',assets:'ask-package-environment.mjs',evaluate:'practical-evaluation-cli.mjs',verification:'verification-reuse-completion.mjs',rules:'review-rule-lifecycle.mjs',findings:'finding-intake.mjs'};
  if(!Object.hasOwn(entries,command))throw new Error(`Unknown command: ${command}. Run ask --help.`);
  if(command==='loop'&&args[0]==='prepare'){
    if(!workspace)throw new Error('loop prepare requires --workspace');
    args.shift();args.unshift('--workspace',resolve(workspace));
    entries.loop='ask-package-loop-prepare.mjs';
  }
  if(command==='doctor')args.unshift('doctor');
  if(command==='assets'){
    const action=args.shift();if(!['preview','export','receive','plan','apply'].includes(action))throw new Error('assets requires preview, export, receive, plan or apply');
    args.unshift('package-'+action);
  }
  const child=spawnSync(process.execPath,[join(runtime,'scripts',entries[command]),...args],{stdio:'inherit'});
  if(child.error)throw child.error;
  return child.status??1;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{process.exitCode=packageCommand(process.argv.slice(2));}
  catch(error){console.error(`ask: ${error.message}`);process.exitCode=1;}
}
