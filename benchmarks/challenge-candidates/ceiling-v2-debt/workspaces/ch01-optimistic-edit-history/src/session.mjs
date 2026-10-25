export function decodeDrafts(blob){
  const drafts=blob.format===1?blob.entries.map(e=>({operationId:e.id,tenantId:blob.tenantId,rowId:e.row,patch:e.changes,baseVersion:e.base,before:e.before,order:e.order})):blob.drafts;
  return structuredClone({format:2,tenantId:blob.tenantId,drafts:drafts??[]});
}
export function encodeDrafts(tenantId,drafts){return structuredClone({format:2,tenantId,drafts});}
