export function documentClient(service, tenant, user) {
  return {
    list: () => service.list({ tenant, user }),
    detail: (resource, linkToken = null) => service.detail({ tenant, user, resource, linkToken }),
    export: (resource, linkToken = null) => service.requestExport({ tenant, user, resource, linkToken }),
    next: jobId => service.runChunk(jobId),
    cancel: jobId => service.cancelExport(jobId),
    status: jobId => service.exportStatus(jobId),
  };
}
