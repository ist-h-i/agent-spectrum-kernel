import { readCard } from './workspace.mjs';

export function job({db},{site,id}) {
  const row = db.prepare('SELECT * FROM jobs WHERE site=? AND id=?').get(site,id);
  return row ? {...row,packet:JSON.parse(row.packet)} : null;
}

export function queue(context,q) {
  const existing = job(context,q);
  if (existing) return existing;
  const packet = readCard(context,q);
  if (!packet || packet.issue !== q.issue) return {status:'retired'};
  context.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,0)').run(q.site,q.id,q.slot,q.issue,packet.version,JSON.stringify(packet),'ready');
  return job(context,q);
}

export async function dispatch(context,q) {
  const existing = job(context,q);
  if (!existing || existing.stage !== 'ready') return existing;
  const packet = readCard(context,existing);
  await context.send(q.site,q.id,existing.attempt+1,packet);
  context.db.prepare("UPDATE jobs SET stage='printed', attempt=attempt+1 WHERE site=? AND id=?").run(q.site,q.id);
  return job(context,q);
}

export function recover(context,q) {
  return job(context,q);
}
