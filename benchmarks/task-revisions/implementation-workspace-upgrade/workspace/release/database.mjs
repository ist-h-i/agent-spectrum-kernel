import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function connect(directory, name) {
  mkdirSync(directory, {recursive: true});
  const db = new DatabaseSync(join(directory, name));
  db.exec('PRAGMA busy_timeout=4500; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
  return db;
}

export function openWorkspace(directory) {
  const db = connect(directory, 'workspace.sqlite');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards(
      site TEXT NOT NULL, slot TEXT NOT NULL, issue TEXT NOT NULL, version INTEGER NOT NULL,
      format INTEGER NOT NULL, raw TEXT NOT NULL, PRIMARY KEY(site,slot));
    CREATE TABLE IF NOT EXISTS jobs(
      site TEXT NOT NULL, id TEXT NOT NULL, slot TEXT NOT NULL, issue TEXT NOT NULL,
      version INTEGER NOT NULL, packet TEXT NOT NULL, stage TEXT NOT NULL, attempt INTEGER NOT NULL,
      PRIMARY KEY(site,id));
    CREATE TABLE IF NOT EXISTS flight_tickets(
      district TEXT NOT NULL, book TEXT NOT NULL, pos INTEGER NOT NULL, site TEXT NOT NULL,
      id TEXT NOT NULL, attempt INTEGER NOT NULL, flight TEXT NOT NULL, depot TEXT NOT NULL,
      PRIMARY KEY(district,book,pos), UNIQUE(site,id,attempt));
    CREATE TABLE IF NOT EXISTS flight_editions(
      district TEXT NOT NULL, book TEXT NOT NULL, edition INTEGER NOT NULL, leaves TEXT NOT NULL,
      limits TEXT NOT NULL, PRIMARY KEY(district,book,edition));
    CREATE TABLE IF NOT EXISTS sheets(
      site TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(site,id));
    CREATE TABLE IF NOT EXISTS members(
      site TEXT NOT NULL, sheet TEXT NOT NULL, pos INTEGER NOT NULL, status TEXT NOT NULL,
      version INTEGER, PRIMARY KEY(site,sheet,pos));
  `);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function current(db, site, slot) {
  return db.prepare('SELECT * FROM cards WHERE site=? AND slot=?').get(site, slot);
}
