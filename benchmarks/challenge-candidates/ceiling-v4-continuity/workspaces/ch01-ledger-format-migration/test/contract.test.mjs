import assert from 'node:assert/strict';
import {scenarioTest} from '../harness/scenario.mjs';
const ref=name=>({$ref:name});
scenarioTest('an empty journal has no row', {program:{steps:[
 {op:'construct',module:'harness/journal.mjs',export:'LedgerJournal',args:[],as:'journal'},
 {op:'construct',module:'src/ledger.mjs',export:'Ledger',args:[ref('journal')],as:'ledger'},
 {op:'call',target:'ledger',method:'read',args:['north','a'],as:'row'}
]},check:o=>assert.equal(o.row,null)});
scenarioTest('a raw consumer sees its accepted transaction', {program:{steps:[
 {op:'construct',module:'harness/journal.mjs',export:'LedgerJournal',args:[],as:'journal'},
 {op:'invoke',module:'harness/legacy.mjs',export:'legacyClient',args:[ref('journal')],as:'legacy'},
 {op:'call',target:'legacy',method:'write',args:['north','r1',[{id:'a',value:{currency:'USD',amount:'1.00'}}],0],as:'receipt'},
 {op:'call',target:'legacy',method:'read',args:['north','a'],as:'row'}
]},check:o=>{assert.equal(o.receipt.head,1);assert.equal(o.row.value.amount,'1.00');}});
