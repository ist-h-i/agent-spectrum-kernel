import { buildManifest } from './archive-compat.mjs';

export function downloadExport(entries, options) {
  return buildManifest(entries, options);
}
