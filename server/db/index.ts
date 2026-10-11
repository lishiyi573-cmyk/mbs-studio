// ============================================================
// 数据库连接（better-sqlite3 同步驱动，单文件 data/woodwork.db）
// SQLite 天然支持事务与原子提交，替代旧版"整文件覆写 db.json"的非原子写
// ============================================================
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'woodwork.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });

export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');        // WAL：读写并发 + 崩溃安全
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');

export const db = drizzle(sqlite, { schema });
export { schema, DB_PATH, DATA_DIR };

// 建表（幂等，IF NOT EXISTS）
sqlite.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '',
  address TEXT DEFAULT '', phase TEXT DEFAULT '量尺', needs TEXT DEFAULT '',
  note TEXT DEFAULT '', progress INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, client_id TEXT, title TEXT NOT NULL, type TEXT DEFAULT '跟进',
  priority TEXT DEFAULT 'P1', status TEXT DEFAULT '待办', due TEXT DEFAULT '',
  note TEXT DEFAULT '', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS site_records (
  id TEXT PRIMARY KEY, client_id TEXT, type TEXT DEFAULT '量尺照片',
  date TEXT DEFAULT '', note TEXT DEFAULT '', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY, client_id TEXT, date TEXT DEFAULT '',
  attendees TEXT DEFAULT '', topics TEXT DEFAULT '', conclusion TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY, meeting_id TEXT, text TEXT DEFAULT '',
  due TEXT DEFAULT '', done INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS appliances (
  id TEXT PRIMARY KEY, client_id TEXT, appliance_id TEXT DEFAULT '',
  brand TEXT DEFAULT '', model TEXT DEFAULT '', name TEXT DEFAULT '',
  w REAL, d REAL, h REAL, ow REAL, od REAL, oh REAL,
  cutout TEXT DEFAULT '', doc_url TEXT DEFAULT '', page_url TEXT DEFAULT '',
  note TEXT DEFAULT '', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY, client_id TEXT, items TEXT DEFAULT '{}',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, client_id TEXT, phase TEXT DEFAULT '', kind TEXT DEFAULT 'link',
  name TEXT DEFAULT '', url TEXT DEFAULT '', size INTEGER DEFAULT 0,
  ext TEXT DEFAULT '', version TEXT DEFAULT '', note TEXT DEFAULT '',
  date TEXT DEFAULT '', created_at TEXT
);
`);

// 简易备份：每日首启 + 手动触发都写一份（保留最近 14 份）
export function backupDb(reason = 'startup') {
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(DATA_DIR, 'backups', `woodwork-${stamp}-${reason}.db`);
  if (!fs.existsSync(target)) {
    sqlite.backup(target);
    // 轮转：只留最近 14 份
    const list = fs.readdirSync(path.join(DATA_DIR, 'backups')).sort();
    while (list.length > 14) fs.unlinkSync(path.join(DATA_DIR, 'backups', list.shift()!));
  }
  return target;
}

export function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function newId(prefix = '') {
  const rnd = Array.from({ length: 12 }, () => Math.floor(36 * Math.random()).toString(36)).join('');
  return (prefix ? prefix + '_' : '') + rnd;
}
