export function summaryCacheKey({ tenantId, windowMinutes }) {
  if (!tenantId || !Number.isInteger(windowMinutes) || windowMinutes < 1) {
    throw new Error("tenantId and a positive windowMinutes are required");
  }
  return `${tenantId}:${windowMinutes}`;
}
