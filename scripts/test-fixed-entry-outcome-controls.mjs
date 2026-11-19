import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFixedEntryControlMap,renderFixedEntryControls,validateRenderedFixedEntryControls} from './fixed-entry-profile.mjs';
const original=JSON.parse(readFileSync(new URL('../schemas/compact-profile-control-map.json',import.meta.url)));
test('fixed controls scope blockers without promoting incomplete proof or edit authority',()=>{
 const rendered=renderFixedEntryControls();
 assert.match(rendered,/inspect relevant repo\/code\/tests\/docs\/API/u);
 assert.match(rendered,/missing=>stop dependent action\/claim\|insufficient/u);
 assert.match(rendered,/continue independent authorized outcomes/u);
 assert.match(rendered,/read-only entries do not edit/u);
 assert.match(rendered,/never bypass mandatory gates or approval/u);
 assert.match(rendered,/consumer-facing requested outcome with the smallest discriminating check/u);
 assert.match(rendered,/shape\/sample checks are not behavioral proof/u);
 assert.match(rendered,/static checks are not runtime proof/u);
 assert.match(rendered,/unknown limits the supported claim/u);
 validateRenderedFixedEntryControls(rendered);
 for(const text of ['read-only entries do not edit','continue independent authorized outcomes','never bypass mandatory gates or approval','shape/sample checks are not behavioral proof','static checks are not runtime proof']){
  assert.throws(()=>validateRenderedFixedEntryControls(rendered.replaceAll(text,'unrestricted')),/canonical .* semantics/u);
 }
});
for(const [control,field,value] of [
 ['scope','missing_input_behavior','stop_or_insufficient_evidence'],
 ['scope','missing_input_behavior','infer_and_proceed'],
 ['missing_evidence','stop_scope','entire_task'],
 ['missing_evidence','stop_when_required',false],
 ['missing_evidence','continue_independent_authorized_outcomes',false],
 ['missing_evidence','inference','permitted'],
 ['verification','consumer_outcome_check_required',false],
 ['verification','smallest_discriminating_check_required',false],
 ['verification','proof_boundaries_required',false],
 ['verification','compact_to_formal_upgrade_required',false],
 ['risk_approval','stop_without_approval',false],
]) test(`closed control rejects ${control}.${field}=${value}`,()=>{
 const mutated=structuredClone(original);mutated.controls[control][field]=value;
 assert.throws(()=>validateFixedEntryControlMap(mutated));
});


test('compact controls preserve independent expectations, bounded reuse and easy-task exception',()=>{
 const text=renderFixedEntryControls();
 const clauses=['derive expectations from contract/consumer/independent observable, not the tested implementation or incidental sequence','accept alternative valid mechanisms','reuse same-task proof only for unchanged artifact/inputs/environment/claim, recheck material change/contradiction/required gate','simple direct proof needs no extra tests/docs/agents','for interacting observed constraints, check the highest-impact incompatible outcome at the first useful boundary','no imagined failures or extra steps for simple direct changes','read-only entries do not edit','never bypass mandatory gates or approval'];
 for(const clause of clauses){assert.ok(text.includes(clause),clause);assert.throws(()=>validateRenderedFixedEntryControls(text.replace(clause,'omitted')),/canonical .* semantics/);}
});
