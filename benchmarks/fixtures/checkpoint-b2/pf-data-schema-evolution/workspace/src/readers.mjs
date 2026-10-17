import {validateRecord,normalizeV2} from './schema-contract.mjs';
export function legacyReader(schema,record){if(!validateRecord(schema,record))throw new Error('Invalid v1 record');return {id:record.id,name:record.name}}
export function currentReader(schema,record){return normalizeV2(schema,record)}
