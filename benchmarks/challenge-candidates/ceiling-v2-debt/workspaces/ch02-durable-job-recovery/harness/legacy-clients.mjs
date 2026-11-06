import {createLegacyQueue} from '../src/legacy.mjs';
export function legacySubmit(queue,wire){return createLegacyQueue(queue).submit(wire);}
export function legacyPoll(queue,tenant,request){return createLegacyQueue(queue).poll(tenant,request);}
export function legacyCancel(queue,tenant,request){return createLegacyQueue(queue).cancel(tenant,request);}
