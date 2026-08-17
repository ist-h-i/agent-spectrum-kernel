function requiredText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export function sessionCacheKey({ tenantId, region }) {
  const tenant = requiredText(tenantId, "tenantId");
  const canonicalRegion = requiredText(region, "region").toLowerCase();
  return `${tenant}:${canonicalRegion}`;
}
