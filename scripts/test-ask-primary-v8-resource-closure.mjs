// Source graph construction only. No model, evaluator, sandbox or generator runs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deriveEvaluatorDependencyGraph } from './ask-benchmark-evaluator-boundary.mjs';
import { withPrimaryProcessingSourceBuild } from './ask-primary-evaluation-scope.mjs';
import { primaryProcessingDescriptor } from './ask-primary-scoring-version.mjs';

const root=resolve(import.meta.dirname,'..');
const baseRevision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const generator='scripts/generate-ask-primary-grading-schemas.mjs';
for(const commandEvidenceParserRevision of ['1.10.0-primary-saved','1.11.0-primary-saved']) {
  test(`real resource source graph retains every selected processing pin: ${commandEvidenceParserRevision}`,()=>{
    const processing=primaryProcessingDescriptor({root,commandEvidenceParserRevision});
    const graph=withPrimaryProcessingSourceBuild({root,baseRevision,commandEvidenceParserRevision},()=>deriveEvaluatorDependencyGraph({root,baseRevision}));
    for(const [path,sha256] of Object.entries(processing.source_file_digests)) {
      const node=graph.node_inventory.find(node=>node.path===path);
      assert.ok(node,`selected processing source missing from real resource graph: ${path}`);
      assert.equal(node.sha256,sha256);
    }
    const node=graph.node_inventory.find(node=>node.path===generator);
    if(commandEvidenceParserRevision==='1.11.0-primary-saved') {
      assert.equal(node.file_type,'authority_data');
      assert.ok(graph.edge_inventory.some(edge=>edge.kind==='authority_read'&&edge.to===generator));
      assert.ok(!graph.edge_inventory.some(edge=>edge.kind==='private_entry_import'&&edge.to===generator),'build-source pin grants no private runtime import');
    } else assert.equal(node,undefined,'v7 keeps its historical graph selection');
  });
}
