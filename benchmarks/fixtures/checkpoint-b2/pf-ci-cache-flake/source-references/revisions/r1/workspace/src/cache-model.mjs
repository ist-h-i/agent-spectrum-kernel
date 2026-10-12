export function observeBuild(config, scenarios, run, {noCache=false,includeLock=false,nodeMajor=scenarios.node_major}={}) {
 const fields=includeLock?[...config.artifact_cache.key_fields,'lock_digest']:config.artifact_cache.key_fields;
 const key=(lock,node)=>config.artifact_cache.namespace+':'+fields.map(field=>field==='lock_digest'?lock:field==='node_major'?node:'unsupported').join(':');
 const requestedKey=key(run.lock_digest,nodeMajor);
 const proposed=scenarios.cache_entries.find(entry=>entry.cache_id===run.restore_cache);
 const restored=!noCache&&proposed&&key(proposed.lock_digest,proposed.node_major)===requestedKey?proposed:null;
 const artifactVersion=restored?restored.artifact_version:run.required_artifact_version;
 return {run_id:run.run_id,node_major:nodeMajor,lock_digest:run.lock_digest,requested_key:requestedKey,restored_key:restored?key(restored.lock_digest,restored.node_major):null,restored_cache:restored?.cache_id??null,dependencies:'installed',artifact_version:artifactVersion,required_artifact_version:run.required_artifact_version,exit_code:artifactVersion===run.required_artifact_version?0:1};
}
