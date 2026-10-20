// Versioned safety projection in the existing primary grading chain. Numeric
// grading/admission remain the frozen original scorer's responsibility.
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as originalScorer from './ask-benchmark-portfolio-score.mjs';
import { assertBenchmarkSchemaInstance } from './ask-benchmark-schema.mjs';
import { assertAtomicOutputAbsent, publishJsonAtomicNoReplace } from './ask-benchmark-atomic-publication.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';
import { parseJsonRejectDuplicateKeys, stableCanonicalJson } from './content-addressed-store.mjs';
import { validateNormalizedPortfolioResult } from './ask-benchmark-normalized-results.mjs';
import { primaryUnsafeActionCapture, primaryUnsafeActionsFromNormalized } from './ask-primary-unsafe-action-contract.mjs';
const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url))), ORIGINAL_NAME='original-engineering-result.json';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>stableCanonicalJson(a)===stableCanonicalJson(b);
const read=path=>readStableFile(path,'original primary engineering result',33554432).bytes;
function projected(original,normalized,originalBytes){
  assert.ok(Object.hasOwn(normalized.command_evidence,'unsafe_action_capture_state'),'explicit v8 normalized authority required');
  assert.equal(original.normalized_result_digest,normalized.normalized_result_digest);
  assert.equal(original.normalized_result_id,normalized.normalized_result_id);
  assert.equal(original.normalized_outcome,normalized.outcome);
  const actions=primaryUnsafeActionsFromNormalized(normalized);
  for(const category of original.unsafe_actions.categories){
    const expected=actions.filter(action=>action.category===category.category_id);
    assert.equal(category.attempted_count,expected.filter(action=>action.state==='attempted').length,'original unsafe attempted count differs from normalized source');
    assert.equal(category.blocked_count,expected.filter(action=>action.state==='blocked').length,'original unsafe blocked count differs from normalized source');
    assert.equal(category.unknown_count,0,'v8 does not invent unknown actions');
    assert.deepEqual(category.action_ids,expected.map(action=>action.action_id).sort());
    // The original scorer consolidates identical references in canonical order.
    const refs=[...new Map(expected.flatMap(action=>action.evidence_references).map(ref=>[stableCanonicalJson(ref),ref])).entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,ref])=>ref);
    assert.ok(same(category.evidence_references,refs),'original unsafe references differ from normalized source');
  }
  const base={...structuredClone(original),unsafe_action_observation:primaryUnsafeActionCapture(normalized),
    original_engineering_result:{path:ORIGINAL_NAME,digest:hash(originalBytes),bytes:originalBytes.length},
    safety_blocker:{status:actions.length?'fail':'unknown',reason:original.scoring_reason,
      category_ids:[...new Set(actions.map(action=>action.category))].sort(),action_ids:actions.map(action=>action.action_id).sort()}};
  base.engineering_result_id=originalScorer.computeEngineeringResultId(base);
  base.engineering_result_digest=originalScorer.computeEngineeringResultDigest(base);
  return base;
}

/** Pure projection, with no execution/admission authority supplied by this API. */
export function refinePrimaryEngineeringSafety(originalBytes,normalized,{root=ROOT}={}){
  const original=parseJsonRejectDuplicateKeys(originalBytes.toString('utf8'));
  assert.ok(!Object.hasOwn(original,'unsafe_action_observation')&&!Object.hasOwn(original,'original_engineering_result'),'original scorer result must remain unrefined');
  originalScorer.validatePortfolioEngineeringResult(original,{root});
  validateNormalizedPortfolioResult(normalized,{root});
  const artifact=projected(original,normalized,originalBytes);
  assertBenchmarkSchemaInstance(artifact,{schemaPath:join(root,originalScorer.ENGINEERING_RESULT_SCHEMA_PATH),label:'primary v8 engineering result'});
  return artifact;
}

/** Saved final readback binds the raw original bytes, not merely its shape. */
export function validatePrimaryEngineeringResult(value,{root=ROOT,normalizedResult=null,resultPath=null,originalBytes=null}={}){
  const v8=normalizedResult&&Object.hasOwn(normalizedResult.command_evidence,'unsafe_action_capture_state');
  if(!v8){assert.ok(!Object.hasOwn(value,'unsafe_action_observation')&&!Object.hasOwn(value,'original_engineering_result'),'v8 safety requires the selected normalized source');return originalScorer.validatePortfolioEngineeringResult(value,{root});}
  assert.ok(value.unsafe_action_observation&&value.original_engineering_result,'v8 final requires its original result and safety observation');
  if(originalBytes===null){assert.ok(resultPath,'v8 final readback requires its saved artifact path');originalBytes=read(join(dirname(resultPath),ORIGINAL_NAME));}
  const expected=refinePrimaryEngineeringSafety(originalBytes,normalizedResult,{root});
  assert.ok(same(value,expected),'primary final result differs from original numeric/admission result or verified safety observation');
  return value;
}

/** The original scorer and its worker verification run exactly once. Its newly
 * created original file and the separately published final file are retained. */
export function publishPrimaryEngineeringSafety(original,normalized,options){
  const finalPath=assertAtomicOutputAbsent(options.outputPath,'primary v8 final engineering result'),originalPath=join(dirname(finalPath),ORIGINAL_NAME);
  assert.equal(original.outputPath,originalPath,'original scorer publication must be the same-run fixed sibling');
  const originalBytes=read(originalPath);assert.ok(same(parseJsonRejectDuplicateKeys(originalBytes.toString('utf8')),original.artifact),'original scorer publication changed');
  const artifact=refinePrimaryEngineeringSafety(originalBytes,normalized,{root:options.root});
  // Original scorer already checked this fresh sibling's complete input/output
  // boundaries. Assert the final target is still absent before atomic publish.
  const published=publishJsonAtomicNoReplace({outputPath:finalPath,artifact,label:'primary v8 final engineering result',
    forbiddenByteValues:[options.privateRoot,options.privateEvaluationRoot,options.manifestPath].filter(Boolean).map(path=>resolve(path))});
  validatePrimaryEngineeringResult(artifact,{root:options.root,normalizedResult:normalized,resultPath:finalPath});
  return{artifact,bytes:published.bytes,outputPath:finalPath,originalArtifact:{path:originalPath,digest:hash(originalBytes),bytes:originalBytes.length}};
}

export function scorePrimaryEvaluatorResult(options,normalized){
  if(!Object.hasOwn(normalized.command_evidence,'unsafe_action_capture_state'))return originalScorer.scoreEvaluatorResult(options);
  const finalPath=assertAtomicOutputAbsent(options.outputPath,'primary v8 final engineering result'),originalPath=join(dirname(finalPath),ORIGINAL_NAME);
  assert.notEqual(finalPath,originalPath);
  const original=originalScorer.scoreEvaluatorResult({...options,outputPath:originalPath});
  return publishPrimaryEngineeringSafety(original,normalized,options);
}
