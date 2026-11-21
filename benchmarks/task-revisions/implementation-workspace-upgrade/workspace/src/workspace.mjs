import { current, transaction } from '../release/database.mjs';
import { decode, encode, reconcile } from './reconcile.mjs';

export function readCard({db}, {site,slot}) {
  const row = current(db,site,slot);
  return row ? {site,slot,issue:row.issue,version:row.version,document:decode(row.format,JSON.parse(row.raw))} : null;
}

export function sheet({db}, {site,id}) {
  const saved = db.prepare('SELECT body FROM sheets WHERE site=? AND id=?').get(site,id);
  if (!saved) return null;
  const edits = JSON.parse(saved.body);
  const members = db.prepare('SELECT pos,status,version FROM members WHERE site=? AND sheet=? ORDER BY pos').all(site,id);
  return {site,id,items:edits.map(({slot,issue},i) => ({slot,issue,status:members[i]?.status ?? 'pending',version:members[i]?.version ?? null}))};
}

function apply(db,site,item) {
  const row = current(db,site,item.slot);
  if (!row) return {status:'retired',version:null};
  const raw = JSON.parse(row.raw);
  const live = decode(row.format,raw);
  const merged = reconcile(item.base,live,item.proposal);
  if (!merged) return {status:'conflict',version:row.version};
  if (JSON.stringify(merged) === JSON.stringify(live)) return {status:'unchanged',version:row.version};
  db.prepare('UPDATE cards SET raw=?,version=version+1 WHERE site=? AND slot=?')
    .run(JSON.stringify(encode(row.format,raw,merged)),site,item.slot);
  return {status:'applied',version:row.version+1};
}

export async function importSheet(context, {site,id,edits}) {
  const {db} = context;
  if (sheet(context,{site,id})) return sheet(context,{site,id});
  db.prepare('INSERT INTO sheets VALUES(?,?,?)').run(site,id,JSON.stringify(edits));
  for (const [pos,item] of edits.entries()) {
    const receipt = transaction(db, () => apply(db,site,item));
    await context.progress({site,id,pos});
    db.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run(site,id,pos,receipt.status,receipt.version);
  }
  return sheet(context,{site,id});
}

export async function recheck(context,q) {
  return sheet(context,q);
}
