import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';
import { config } from '@/lib/config';

export function openDb(file: string): Database.Database {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}

let _db: Database.Database | undefined;
export function getDb(): Database.Database {
  if (!_db) {
    _db = openDb(config.DB_PATH);
    migrate(_db);
  }
  return _db;
}
