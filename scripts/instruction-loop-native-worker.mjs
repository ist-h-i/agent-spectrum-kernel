#!/usr/bin/env node
import {readInstructionLoopJson} from './instruction-loop-artifact.mjs';
import assert from 'node:assert/strict';
import {readJsonFileStrict,readStableBytes} from './content-addressed-store.mjs';
import {instructionBytesDigest} from './instruction-environment.mjs';
import {nativeInstructionLoopWorker} from './instruction-loop-native-host.mjs';
const [config,digest,action,request,resultPath]=process.argv.slice(2);
assert.equal(instructionBytesDigest(readStableBytes(config,'host Full/native profile',16*1024*1024)),digest,'host Full/native profile drift');
await nativeInstructionLoopWorker({profile:readInstructionLoopJson(config),job:readInstructionLoopJson(request),resultPath,action,
  modelCallsAuthorized:process.env.ASK_LOOP_MODEL_CALLS_AUTHORIZED==='1'});
