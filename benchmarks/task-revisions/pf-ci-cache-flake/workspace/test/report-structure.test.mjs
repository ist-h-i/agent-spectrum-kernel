import test from 'node:test';import assert from 'node:assert/strict';import {validateReport} from '../scripts/validate-report.mjs';
test('absent investigation evidence is structurally refused',()=>{for(const value of [null,{},[],{format_version:2}, {format_version:1}])assert.throws(()=>validateReport(value),/Invalid report structure/)});
