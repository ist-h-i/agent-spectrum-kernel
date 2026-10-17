import * as v1 from '../vendor/archive-v1.mjs';import * as v2 from '../vendor/archive-v2.mjs';
export async function buildManifest(entries,{root,platform,libraryVersion=2}){const library=libraryVersion===1?v1:v2;const archive=library.openArchive(root,platform);for(const entry of entries)archive.write(entry.relativePath,entry.text);return archive.finish()}
