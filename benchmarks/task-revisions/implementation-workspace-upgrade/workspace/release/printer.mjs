import { connect, transaction } from './database.mjs';
import { observe } from './operator.mjs';

function open(directory) {
  const db = connect(directory, 'printer.sqlite');
  db.exec(`
    CREATE TABLE IF NOT EXISTS slips(n INTEGER PRIMARY KEY,site TEXT,id TEXT,attempt INTEGER,packet TEXT);
    CREATE TABLE IF NOT EXISTS fences(site TEXT,id TEXT,attempt INTEGER,PRIMARY KEY(site,id,attempt));
    CREATE TABLE IF NOT EXISTS outages(site TEXT PRIMARY KEY);
  `);
  return db;
}

export async function send(directory, site, id, attempt, packet) {
  await observe('before-print',{site,id,attempt});
  const db = open(directory);
  let result;
  try {
    result = transaction(db, () => {
      if (db.prepare('SELECT 1 FROM outages WHERE site=?').get(site)) throw new Error('channel unavailable');
      if (db.prepare('SELECT 1 FROM fences WHERE site=? AND id=? AND attempt=?').get(site,id,attempt)) return 'sealed_empty';
      db.prepare('INSERT INTO slips(site,id,attempt,packet) VALUES(?,?,?,?)').run(site,id,attempt,JSON.stringify(packet));
      return 'printed';
    });
  } finally {
    db.close();
  }
  await observe('after-print',{site,id,attempt,result});
  return result;
}

export function lookup(directory, site, id, attempt) {
  const db = open(directory);
  try {
    if (db.prepare('SELECT 1 FROM outages WHERE site=?').get(site)) throw new Error('channel unavailable');
    if (db.prepare('SELECT 1 FROM slips WHERE site=? AND id=? AND attempt=?').get(site,id,attempt)) return 'printed';
    if (db.prepare('SELECT 1 FROM fences WHERE site=? AND id=? AND attempt=?').get(site,id,attempt)) return 'sealed_empty';
    return 'unseen';
  } finally {
    db.close();
  }
}

// Installed printer console. The desk application has no access to this interface.
export function administer(directory, q) {
  const db = open(directory);
  try {
    return transaction(db, () => {
      if (q.op === 'close') {
        if (!db.prepare('SELECT 1 FROM slips WHERE site=? AND id=? AND attempt=?').get(q.site,q.id,q.attempt)) {
          db.prepare('INSERT OR IGNORE INTO fences VALUES(?,?,?)').run(q.site,q.id,q.attempt);
        }
      } else if (q.op === 'outage') {
        if (q.on) db.prepare('INSERT OR IGNORE INTO outages VALUES(?)').run(q.site);
        else db.prepare('DELETE FROM outages WHERE site=?').run(q.site);
      } else if (q.op !== 'slips') throw new Error('unknown printer console operation');
      return db.prepare('SELECT site,id,attempt,packet FROM slips WHERE site=? ORDER BY n').all(q.site)
        .map(row => ({...row,packet:JSON.parse(row.packet)}));
    });
  } finally {
    db.close();
  }
}
