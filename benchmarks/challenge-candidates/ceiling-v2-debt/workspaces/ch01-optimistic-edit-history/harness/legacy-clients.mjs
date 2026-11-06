import {createLegacyAdapter} from '../src/legacy.mjs';
export function legacyEdit(editor,row,column,value){const client=createLegacyAdapter(editor),ticket=client.setCell(row,column,value);client.send(ticket);return ticket;}
export function legacyRead(editor,row){return createLegacyAdapter(editor).view(row);}
export function legacyUndoAndSend(editor,row){const client=createLegacyAdapter(editor),ticket=client.undo(row);if(ticket)client.send(ticket);return ticket;}
