import { openWorkspace, current, transaction } from './database.mjs';

const db = openWorkspace(process.argv[2]);
const q = JSON.parse(process.argv[3]);
const result = transaction(db, () => {
  if (q.op === 'monitor') {
    return db.prepare('SELECT stage,attempt FROM jobs WHERE site=? AND id=?').get(q.site,q.id) ?? null;
  }
  if (q.op === 'fileBook' || q.op === 'amendBook' || q.op === 'inspectBook') {
    const {district,book}=q;
    const latest=db.prepare('SELECT MAX(edition) AS value FROM flight_editions WHERE district=? AND book=?')
      .get(district,book).value;
    if (q.op === 'inspectBook') {
      const edition=q.edition ?? latest;
      const page=db.prepare('SELECT leaves,limits FROM flight_editions WHERE district=? AND book=? AND edition=?')
        .get(district,book,edition);
      if (!page) return null;
      const tickets=db.prepare('SELECT site,id,attempt,flight,depot FROM flight_tickets WHERE district=? AND book=? ORDER BY pos')
        .all(district,book);
      return {district,book,edition,tickets,leaves:JSON.parse(page.leaves),limits:JSON.parse(page.limits)};
    }
    if (q.op === 'fileBook') {
      if (latest !== null) return {status:'stale'};
      const insert=db.prepare('INSERT INTO flight_tickets VALUES(?,?,?,?,?,?,?,?)');
      for (const [pos,t] of q.tickets.entries()) insert.run(district,book,pos,t.site,t.id,t.attempt,t.flight,t.depot);
    } else if (latest === null || q.edition !== latest) return {status:'stale'};
    const edition=(latest ?? 0)+1;
    db.prepare('INSERT INTO flight_editions VALUES(?,?,?,?,?)')
      .run(district,book,edition,JSON.stringify(q.leaves),JSON.stringify(q.limits));
    return {district,book,edition};
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
