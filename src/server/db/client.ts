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

// Next dev HMR 会重载本模块:用 globalThis 缓存连接,避免旧 Database/Statement 沦为孤儿对象被 GC 析构(v11 在 Node24 上曾因此崩溃,升级 v13 N-API 后此为防御)
const g = globalThis as { __shidi_db?: Database.Database };
export function getDb(): Database.Database {
  if (!g.__shidi_db) {
    g.__shidi_db = openDb(config.DB_PATH);
    migrate(g.__shidi_db);
  }
  return g.__shidi_db;
}

export function __setDbForTests(db: Database.Database): void { g.__shidi_db = db; migrate(db); }
