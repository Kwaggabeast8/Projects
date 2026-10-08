const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'mf.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','VIEWER')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, ip TEXT, success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, client TEXT NOT NULL DEFAULT '', site TEXT NOT NULL DEFAULT '',
  project_manager TEXT NOT NULL DEFAULT '',
  baseline_start TEXT, baseline_finish TEXT, forecast_finish TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','ARCHIVED')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, start_date TEXT NOT NULL, finish_date TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1, actual_progress REAL NOT NULL DEFAULT 0,
  is_milestone INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activity_dependencies (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  predecessor_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, predecessor_id)
);
CREATE TABLE IF NOT EXISTS progress_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL, actual REAL NOT NULL, planned REAL NOT NULL, variance REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS delays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('weather','client','material','subcontractor','other')),
  date_recorded TEXT NOT NULL, days_impact INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS variations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reference TEXT NOT NULL, description TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0, time_impact_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','IMPLEMENTED','CANCELLED')),
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
  date_created TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rfis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reference TEXT NOT NULL, subject TEXT NOT NULL, question TEXT NOT NULL DEFAULT '',
  date_raised TEXT NOT NULL, due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESPONDED','CLOSED')),
  response TEXT NOT NULL DEFAULT '', date_closed TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS site_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  update_date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'DAILY' CHECK (type IN ('DAILY','WEEKLY')),
  progress_notes TEXT NOT NULL DEFAULT '', labour_count INTEGER NOT NULL DEFAULT 0,
  material_deliveries TEXT NOT NULL DEFAULT '', work_completed TEXT NOT NULL DEFAULT '',
  current_work TEXT NOT NULL DEFAULT '', upcoming_work TEXT NOT NULL DEFAULT '',
  problems_risks TEXT NOT NULL DEFAULT '', pm_comments TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  site_update_id INTEGER REFERENCES site_updates(id) ON DELETE CASCADE,
  comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id),
  filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  stored_name TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER, user_id INTEGER, user_name TEXT,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_act_proj ON activities(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_audit_proj ON audit_events(project_id, id);
CREATE INDEX IF NOT EXISTS idx_files_proj ON project_files(project_id);
`);

// Migration: per-project permissions on memberships (existing members become Viewer / Commenter).
if (!db.prepare('PRAGMA table_info(project_members)').all().some((c) => c.name === 'permissions')) {
  db.exec('ALTER TABLE project_members ADD COLUMN permissions TEXT');
}

// Run fn inside a transaction.
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

module.exports = { db, tx, all, get, run, DATA_DIR, DB_FILE };
