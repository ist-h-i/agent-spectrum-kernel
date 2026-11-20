import { buildManifest } from './archive-compat.mjs';

export function scheduledExport(entries, options) {
  return buildManifest(entries, options);
}
