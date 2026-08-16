export function summaryCacheKey({ tenantId, windowMinutes, requestId }) {
  if (!tenantId || !Number.isInteger(windowMinutes) || windowMinutes < 1 || !requestId) {
    throw new Error("tenantId, windowMinutes, and requestId are required");
  }
  return `${tenantId}:${windowMinutes}:${requestId}`;
}
