import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('kernel narrows investigation by decision relevance, not a fixed reading tour',()=>{
 const s=read('AGENTS.md');assert.match(s,/nearest relevant behavior, consumers, and evidence/);assert.match(s,/unresolved requirement, risk, dependency, or required gate/);assert.doesNotMatch(s,/Minimum inspection for non-trivial work:/);
});
test('partial blockers preserve authorized outcomes without bypassing gates',()=>{
 const s=read('AGENTS.md');assert.match(s,/Continue independent requested, authorized outcomes/);assert.match(s,/Pause only the dependent action or claim/);assert.match(s,/required gates remain mandatory/);assert.match(s,/unmet outcome and its concrete reason in the existing/);
 const f=read('CUSTOM_INSTRUCTIONS.md');assert.match(f,/preserve unaffected behavior/);assert.match(f,/do not skip required work to shrink the diff/);assert.match(f,/without bypassing required gates or approval/);
});
test('verification distinguishes outcomes from plausible wrong results proportionately',()=>{
 for(const p of ['AGENTS.md','skills/test-first-verification/SKILL.md']){const s=read(p);assert.match(s,/consumer-facing boundary/);assert.match(s,/plausible wrong one/);assert.match(s,/schema.only/);assert.match(s,/static documents do not inherently/i);}
 const s=read('AGENTS.md');assert.match(s,/static evidence does not prove runtime behavior/);assert.match(s,/never downgrade formal/);
});
