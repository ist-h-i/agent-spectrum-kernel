import {createWorkspaceBuilder} from './workspace.mjs';
export function createBuildSystem(options){const service=createWorkspaceBuilder(options);return {async build(input){const result=await service.build({...input,projectId:'default'});return {generation:result.generation,results:result.results};}};}
