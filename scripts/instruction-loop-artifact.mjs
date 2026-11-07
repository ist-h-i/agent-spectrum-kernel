// Trusted loop IPC metadata shares the existing 16MiB journal/writer ceiling.
// CAS objects, task/source bytes, archives and semantic model limits are separate.
import {readJsonFileStrict,readStableBytes} from './content-addressed-store.mjs';
export const INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES=16*1024*1024;
export const readInstructionLoopJson=(path,label='instruction loop metadata')=>readJsonFileStrict(path,label,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES);
export const readInstructionLoopBytes=(path,label='instruction loop metadata')=>readStableBytes(path,label,INSTRUCTION_LOOP_ARTIFACT_MAX_BYTES);
