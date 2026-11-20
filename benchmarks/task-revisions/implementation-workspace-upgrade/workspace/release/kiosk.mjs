import { openWorkspace, current, transaction } from './database.mjs';

const db = openWorkspace(process.argv[2]);
const q = JSON.parse(process.argv[3]);
const result = transaction(db, () => {
  if (q.op === 'monitor') {
    return db.prepare('SELECT stage,attempt FROM jobs WHERE site=? AND id=?').get(q.site,q.id) ?? null;
  }
  const row = current(db,q.site,q.slot);
  if (q.op === 'install') {
    if (row && row.issue === q.issue) throw new Error('occupied by this issue');
    db.prepare(`INSERT INTO cards VALUES(?,?,?,1,?,?) ON CONFLICT(site,slot) DO UPDATE SET
      issue=excluded.issue, version=1, format=excluded.format, raw=excluded.raw`)
      .run(q.site,q.slot,q.issue,q.format,JSON.stringify(q.raw));
  } else if (q.op === 'edit') {
    if (!row || row.issue !== q.issue || row.version !== q.version) return {status:'stale'};
    db.prepare('UPDATE cards SET raw=?,version=version+1 WHERE site=? AND slot=?')
      .run(JSON.stringify(q.raw),q.site,q.slot);
  } else if (q.op !== 'raw') throw new Error('unknown kiosk operation');
  const data = current(db,q.site,q.slot);
  return data ? {...data,raw:JSON.parse(data.raw)} : null;
});
db.close();
console.log(JSON.stringify(result));
