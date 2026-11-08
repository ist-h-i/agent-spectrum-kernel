// Closed dispatch preserves the original supplement contract while admitting a
// separately typed retained grading report. Neither reader executes a model.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readStableFile} from './ask-benchmark-stable-file.mjs';
import {readJsonFileStrict,assertNoSymlinkPathSegments} from './content-addressed-store.mjs';
import {instructionBytesDigest} from './instruction-environment.mjs';
import {readPracticalGradeSupplementContinuation as legacy,readAdmittedPracticalGradeSupplement as admittedLegacy} from './practical-grade-supplement.mjs';
import {readPracticalRetainedGradeContinuation,readAdmittedPracticalRetainedGrade} from './practical-retained-grade-report.mjs';
function retained(reference){assert.equal(resolve(reference.path),reference.path);assertNoSymlinkPathSegments(reference.path,'grade report revision');assert.equal(instructionBytesDigest(readStableFile(reference.path,'grade report revision',16*1024*1024).bytes),reference.digest,'grade report revision drift');const v=readJsonFileStrict(reference.path,'grade report revision',16*1024*1024);assert.ok(['practical_grade_supplement_readout_v1','practical_retained_grade_readout_v1'].includes(v.kind),'unsupported grade report revision');return v.kind==='practical_retained_grade_readout_v1';}
export function readPracticalGradeSupplementContinuation(options){return retained(options.reference)?readPracticalRetainedGradeContinuation(options):legacy(options);}
export function readAdmittedPracticalGradeSupplement(options){return retained(options.reference)?readAdmittedPracticalRetainedGrade(options):admittedLegacy(options);}
