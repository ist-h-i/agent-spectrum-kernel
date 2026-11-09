import{validateSchemaValue}from'./json-schema-validation.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {fixedGradeJudgmentSchema,normalizeFixedGradeResponse} from './instruction-loop-grade-response.mjs';
const fields=['items','crosscutting','nonfunctional','defects','critical'];
const judgment=()=>({items:{A:{status:'partial'}},crosscutting:{},nonfunctional:{},defects:[],critical:{status:'suspected'}});
test('response schema requests exactly the same five fields as the parser and retains nested criteria',()=>{
 const full={type:'object',required:[...fields,'identity','coverage'],properties:Object.fromEntries([...fields,'identity','coverage'].map(k=>[k,{type:k==='defects'?'array':'object'}]))};
 const before=structuredClone(full),result=fixedGradeJudgmentSchema(full);assert.deepEqual(result.required,fields);assert.deepEqual(Object.keys(result.properties),fields);assert.equal(result.additionalProperties,false);assert.deepEqual(full,before);
 for(const k of fields)assert.deepEqual(result.properties[k],full.properties[k]);
});
for(const role of ['primary','verification'])test(`${role} removes only an exact duplicate coverage, without changing any judgment`,()=>{
 const raw=role==='primary'?{...judgment(),coverage:['A']}:{verdict:'correct',review:'source correction',judgment:{...judgment(),coverage:['A']}};
 const before=structuredClone(raw),r=normalizeFixedGradeResponse(raw,{role,expectedCoverage:['A']});assert.deepEqual(raw,before);assert.equal(r.repairs.length,1);assert.deepEqual(role==='primary'?r.value:r.value.judgment,judgment());assert.notEqual(r.original_digest,r.normalized_digest);
});
test('already valid data is unchanged, including low scores/defects, and has no repair',()=>{
 const raw=judgment(),r=normalizeFixedGradeResponse(raw,{role:'primary',expectedCoverage:['A']});assert.deepEqual(r.value,raw);assert.deepEqual(r.repairs,[]);assert.equal(r.original_digest,r.normalized_digest);
});
for(const raw of [{...judgment(),coverage:['other']},{...judgment(),identity:{}},{...judgment(),score:100},[],null])test('unknown metadata, changed coverage or invalid objects fail closed',()=>{
 assert.throws(()=>normalizeFixedGradeResponse(raw,{role:'primary',expectedCoverage:['A']}));
});
test('verification preserves abstention and refuses contradictory or incomplete output',()=>{
 for(const verdict of ['agree','undetermined']){const raw={verdict,judgment:null,review:'bounded evidence'};assert.deepEqual(normalizeFixedGradeResponse(raw,{role:'verification',expectedCoverage:[]}).value,raw);}
 for(const raw of [{verdict:'agree',judgment:judgment(),review:'bad'},{verdict:'correct',judgment:null,review:'bad'},{verdict:'correct',judgment:{items:{}},review:'bad'},{verdict:'agree',judgment:null,review:'',score:100}])assert.throws(()=>normalizeFixedGradeResponse(raw,{role:'verification',expectedCoverage:[]}));
});

test('unknown reasons declared by the source schema are required without changing saved judgments',()=>{
 const row={type:'object',required:['status'],properties:{status:{enum:['achieved','undetermined']},reason:{type:'string'}},additionalProperties:false};
 const full={type:'object',properties:{items:{type:'array',items:{$ref:'#/$defs/row'}},crosscutting:{type:'object'},nonfunctional:{type:'object'},defects:{type:'array'},critical:{type:'object'}},$defs:{row}};
 const before=structuredClone(full),projected=fixedGradeJudgmentSchema(full);
 assert.deepEqual(full,before);
 assert.deepEqual(projected.$defs.row.allOf,[{if:{properties:{status:{const:'undetermined'}},required:['status']},then:{required:['reason'],properties:{reason:{type:'string',minLength:1,pattern:'\\S'}}}}]);
 assert.deepEqual(fixedGradeJudgmentSchema(projected),projected,'schema projection is idempotent');
 for(const value of [{status:'undetermined'},{status:'undetermined',reason:''},{status:'undetermined',reason:' \t\n'}])assert.ok(validateSchemaValue(value,projected.$defs.row).length>0,'missing/blank unknown reasons are rejected');
 assert.deepEqual(validateSchemaValue({status:'undetermined',reason:'Runtime evidence is unavailable.'},projected.$defs.row),[]);
 assert.deepEqual(validateSchemaValue({status:'achieved'},projected.$defs.row),[],'known rows do not gain unrelated reason requirements');
 const raw={...judgment(),items:[{id:'C06',status:'undetermined'}]};
 assert.deepEqual(normalizeFixedGradeResponse(raw,{role:'primary',expectedCoverage:['C06']}).value,raw,'never invent a missing reason');
});
