import {createInstructionLoopCommandRuntime} from './instruction-loop-command-runtime.mjs';
import {createFullPracticalInstructionLoopRuntime} from './instruction-loop-practical-runtime.mjs';
import {createComponentInstructionLoopRuntime} from './instruction-loop-component-runtime.mjs';
export function createConfiguredInstructionLoopRuntime(options){
  const kind=options.definition.kind;
  return (kind==='component_practical_instruction_loop_runtime_v1'?createComponentInstructionLoopRuntime:
    kind==='full_practical_instruction_loop_runtime_v1'?createFullPracticalInstructionLoopRuntime:createInstructionLoopCommandRuntime)(options);
}
