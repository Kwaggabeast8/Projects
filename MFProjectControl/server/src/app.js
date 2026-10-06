const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, tx, all, get, run, DATA_DIR } = require('./db');
const calc = require('./calc');
const { buildReport } = require('./report');

const UPLOADS = path.join(DATA_DIR, 'uploads');
const MAX_UPLOAD = 15 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'image/gif': '.gif' };

// ---------- secrets ----------
function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let r = get("SELECT value FROM settings WHERE key='jwt_secret'");
  if (!r) { run("INSERT INTO settings(key,value) VALUES('jwt_secret',?)", crypto.randomBytes(32).toString('hex')); r = get("SELECT value FROM settings WHERE key='jwt_secret'"); }
  return r.value;
}

// ---------- helpers ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new HttpError(400, m);
const h = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const nowTs = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function audit(user, projectId, action, entity, entityId, summary) {
  run('INSERT INTO audit_events(project_id,user_id,user_name,action,entity,entity_id,summary) VALUES(?,?,?,?,?,?,?)',
    projectId ?? null, user ? user.id : null, user ? user.name : 'system', action, entity, entityId ?? null, String(summary || '').slice(0, 500));
}

// Field validation. spec: {field: {t:'text'|'date'|'int'|'num'|'enum', req, values, max, nullable}}
function clean(spec, body, partial) {
  const out = {};
  for (const [k, s] of Object.entries(spec)) {
    let v = body[k];
    if (v === undefined) {
      if (partial) continue;
      if (s.req && s.def === undefined) throw bad(`${s.label || k} is required`);
      if (s.def !== undefined) out[k] = typeof s.def === 'function' ? s.def() : s.def;
      else if (s.t === 'date' || s.nullable) out[k] = null;
      continue;
    }
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === null) {
      if (s.req || s.t === 'enum') throw bad(`${s.label || k} is required`);
      out[k] = s.t === 'date' || s.nullable ? null : s.t === 'int' || s.t === 'num' ? 0 : '';
      continue;
    }
    switch (s.t) {
      case 'text': if (typeof v !== 'string') v = String(v); if (v.length > (s.max || 5000)) throw bad(`${s.label || k} is too long`); break;
      case 'date': if (!calc.isDate(v)) throw bad(`${s.label || k} must be a date (YYYY-MM-DD)`); break;
      case 'int': v = Number(v); if (!Number.isInteger(v)) throw bad(`${s.label || k} must be a whole number`); if (s.min !== undefined && v < s.min) throw bad(`${s.label || k} must be at least ${s.min}`); break;
      case 'num': v = Number(v); if (!Number.isFinite(v)) throw bad(`${s.label || k} must be a number`); if (s.min !== undefined && v < s.min) throw bad(`${s.label || k} must be at least ${s.min}`); if (s.max !== undefined && v > s.max) throw bad(`${s.label || k} must be at most ${s.max}`); break;
      case 'enum': v = s.lower ? String(v).toLowerCase() : String(v).toUpperCase(); if (!s.values.includes(v)) throw bad(`${s.label || k} must be one of ${s.values.join(', ')}`); break;
    }
    out[k] = v;
  }
  return out;
}

// ---------- entity specs ----------
const todayFn = () => calc.today();
const SPECS = {
  rfis: {
    table: 'rfis', audit: 'RFI',
    spec: {
      reference: { t: 'text', max: 60, def: '' }, subject: { t: 'text', req: true, max: 300, label: 'Subject' },
      question: { t: 'text', def: '' }, date_raised: { t: 'date', req: true, def: todayFn, label: 'Date raised' },
      due_date: { t: 'date' }, status: { t: 'enum', values: ['OPEN', 'RESPONDED', 'CLOSED'], def: 'OPEN' },
      response: { t: 'text', def: '' }, date_closed: { t: 'date' },
    },
    prefix: 'RFI', label: (r) => `${r.reference} ${r.subject}`,
  },
  variations: {
    table: 'variations', audit: 'Variation',
    spec: {
      reference: { t: 'text', max: 60, def: '' }, description: { t: 'text', req: true, label: 'Description' },
      amount: { t: 'num', def: 0 }, time_impact_days: { t: 'int', def: 0 },
      status: { t: 'enum', values: ['DRAFT', 'SUBMITTED', 'IMPLEMENTED', 'CANCELLED'], def: 'DRAFT' },
      approval_status: { t: 'enum', values: ['PENDING', 'APPROVED', 'REJECTED'], def: 'PENDING' },
      date_created: { t: 'date', req: true, def: todayFn, label: 'Date created' },
    },
    prefix: 'VO', label: (r) => `${r.reference} ${r.description}`,
  },
  delays: {
    table: 'delays', audit: 'Delay',
    spec: {
      description: { t: 'text', req: true, label: 'Description' },
      category: { t: 'enum', lower: true, req: true, values: ['weather', 'client', 'material', 'subcontractor', 'other'], label: 'Category' },
      date_recorded: { t: 'date', req: true, def: todayFn, label: 'Date recorded' }, days_impact: { t: 'int', def: 0, min: 0 },
      status: { t: 'enum', values: ['OPEN', 'RESOLVED'], def: 'OPEN' },
    },
    label: (r) => `${r.category}: ${r.description}`,
  },
  'site-updates': {
    table: 'site_updates', audit: 'Site update',
    spec: {
      update_date: { t: 'date', req: true, def: todayFn, label: 'Date' }, type: { t: 'enum', values: ['DAILY', 'WEEKLY'], def: 'DAILY' },
      progress_notes: { t: 'text', def: '' }, labour_count: { t: 'int', def: 0, min: 0 },
      material_deliveries: { t: 'text', def: '' }, work_completed: { t: 'text', def: '' }, current_work: { t: 'text', def: '' },
      upcoming_work: { t: 'text', def: '' }, problems_risks: { t: 'text', def: '' }, pm_comments: { t: 'text', def: '' },
    },
    label: (r) => `${r.type} update ${r.update_date}`,
  },
};

const PROJECT_SPEC = {
  name: { t: 'text', req: true, max: 200, label: 'Project name' }, client: { t: 'text', max: 200, def: '' },
  site: { t: 'text', max: 400, def: '' }, project_manager: { t: 'text', max: 200, def: '' },
  baseline_start: { t: 'date' }, baseline_finish: { t: 'date' }, forecast_finish: { t: 'date' },
  status: { t: 'enum', values: ['ACTIVE', 'COMPLETED', 'ARCHIVED'], def: 'ACTIVE' },
};
const ACT_SPEC = {
  name: { t: 'text', req: true, max: 300, label: 'Activity name' },
  start_date: { t: 'date', req: true, label: 'Start date' }, finish_date: { t: 'date', label: 'Finish date' },
  weight: { t: 'num', min: 0, def: 1 }, actual_progress: { t: 'num', min: 0, max: 100, def: 0 },
  notes: { t: 'text', def: '' },
};

function insertRow(table, obj) {
  const keys = Object.keys(obj);
  const r = run(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, ...keys.map((k) => obj[k]));
  return Number(r.lastInsertRowid);
}
function updateRow(table, id, obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`, ...keys.map((k) => obj[k]), id);
}

// ---------- realtime ----------
const clients = new Set();
function broadcast(projectId, kind) {
  const msg = `data: ${JSON.stringify({ projectId, kind, at: Date.now() })}\n\n`;
  for (const c of clients) {
    try {
      if (projectId == null || c.user.role === 'ADMIN' || get('SELECT 1 x FROM project_members WHERE project_id=? AND user_id=?', projectId, c.user.id)) c.res.write(msg);
    } catch (_) { /* closed */ }
  }
}

// ---------- project data ----------
function loadActivities(projectId) {
  const acts = all('SELECT * FROM activities WHERE project_id=? ORDER BY sort_order, id', projectId);
  const deps = all('SELECT d.* FROM activity_dependencies d JOIN activities a ON a.id=d.activity_id WHERE a.project_id=?', projectId);
  const t = calc.today();
  return acts.map((a) => ({
    ...a, is_milestone: !!a.is_milestone, duration: calc.durationOf(a),
    planned_progress: calc.round1(calc.plannedFor(a, t)),
    predecessors: deps.filter((d) => d.activity_id === a.id).map((d) => d.predecessor_id),
  }));
}

function attachFiles(rows, key, projectId) {
  const files = all(`SELECT id,project_id,site_update_id,comment_id,filename,mime,size,caption,created_at FROM project_files WHERE project_id=? AND ${key} IS NOT NULL ORDER BY id`, projectId);
  return rows.map((r) => ({ ...r, files: files.filter((f) => f[key] === r.id) }));
}

function projectSummary(p) {
  const acts = loadActivities(p.id);
  const s = calc.summarise(p, acts);
  const open_rfis = get("SELECT COUNT(*) c FROM rfis WHERE project_id=? AND status!='CLOSED'", p.id).c;
  const open_delays = get("SELECT COUNT(*) c, COALESCE(SUM(days_impact),0) d FROM delays WHERE project_id=? AND status='OPEN'", p.id);
  return { ...p, ...s, open_rfis, open_delays: open_delays.c, open_delay_days: open_delays.d };
}

function projectBundle(p, isAdmin) {
  const acts = loadActivities(p.id);
  const comments = all('SELECT c.*, u.name user_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.project_id=? ORDER BY c.id DESC', p.id);
  const bundle = {
    project: p,
    summary: calc.summarise(p, acts),
    activities: acts,
    rfis: all('SELECT * FROM rfis WHERE project_id=? ORDER BY id DESC', p.id),
    variations: all('SELECT * FROM variations WHERE project_id=? ORDER BY id DESC', p.id),
    delays: all('SELECT * FROM delays WHERE project_id=? ORDER BY date_recorded DESC, id DESC', p.id),
    site_updates: attachFiles(all('SELECT s.*, u.name created_by_name FROM site_updates s LEFT JOIN users u ON u.id=s.created_by WHERE s.project_id=? ORDER BY s.update_date DESC, s.id DESC', p.id), 'site_update_id', p.id),
    comments: attachFiles(comments, 'comment_id', p.id),
    snapshots: all('SELECT id,project_id,snapshot_date,actual,planned,variance,note,detail,created_at FROM progress_snapshots WHERE project_id=? ORDER BY snapshot_date DESC, id DESC', p.id)
      .map((s) => ({ ...s, detail: JSON.parse(s.detail || '[]') })),
    photos: all('SELECT id,project_id,site_update_id,comment_id,filename,mime,size,caption,created_at FROM project_files WHERE project_id=? ORDER BY id DESC', p.id),
  };
  if (isAdmin) bundle.members = all('SELECT u.id,u.name,u.email,u.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY u.name', p.id);
  return bundle;
}

// Shift successors that now start before their predecessor finishes. Never pulls dates earlier.
function cascade(projectId, startId) {
  const acts = new Map(all('SELECT * FROM activities WHERE project_id=?', projectId).map((a) => [a.id, a]));
  const deps = all('SELECT d.* FROM activity_dependencies d JOIN activities a ON a.id=d.activity_id WHERE a.project_id=?', projectId);
  const queue = [startId]; const moved = [];
  let guard = 0;
  while (queue.length && guard++ < 10000) {
    const pid = queue.shift(); const pred = acts.get(pid);
    for (const d of deps.filter((x) => x.predecessor_id === pid)) {
      const s = acts.get(d.activity_id);
      const need = calc.addDays(pred.finish_date, 1);
      if (s.start_date < need) {
        const shift = calc.diffDays(s.start_date, need);
        s.start_date = need; s.finish_date = calc.addDays(s.finish_date, shift);
        run("UPDATE activities SET start_date=?, finish_date=?, updated_at=datetime('now') WHERE id=?", s.start_date, s.finish_date, s.id);
        moved.push(s.id); queue.push(s.id);
      }
    }
  }
  return moved;
}

function setPredecessors(actId, projectId, preds) {
  if (!Array.isArray(preds)) throw bad('predecessors must be a list');
  const ids = [...new Set(preds.map(Number))];
  const deps = all('SELECT d.* FROM activity_dependencies d JOIN activities a ON a.id=d.activity_id WHERE a.project_id=? AND d.activity_id!=?', projectId, actId);
  const added = [];
  for (const p of ids) {
    if (!Number.isInteger(p)) throw bad('Invalid predecessor');
    if (!get('SELECT 1 x FROM activities WHERE id=? AND project_id=?', p, projectId)) throw bad('Predecessor must be an activity in this project');
    if (calc.createsCycle([...deps, ...added.map((q) => ({ activity_id: actId, predecessor_id: q }))], actId, p)) throw bad('That dependency would create a loop');
    added.push(p);
  }
  run('DELETE FROM activity_dependencies WHERE activity_id=?', actId);
  for (const p of ids) run('INSERT INTO activity_dependencies(activity_id,predecessor_id) VALUES(?,?)', actId, p);
}

function takeSnapshot(project, user, note, date) {
  const acts = loadActivities(project.id);
  const s = calc.summarise(project, acts, date || calc.today());
  const detail = acts.map((a) => ({ id: a.id, name: a.name, actual: a.actual_progress, planned: calc.round1(calc.plannedFor(a, s.as_of)) }));
  const id = insertRow('progress_snapshots', {
    project_id: project.id, snapshot_date: s.as_of, actual: s.actual, planned: s.planned, variance: s.variance,
    note: note || '', detail: JSON.stringify(detail), created_by: user ? user.id : null,
  });
  return id;
}

// Weekly automatic snapshot for active projects that have a programme and none in the last 7 days.
function autoSnapshots() {
  let n = 0;
  for (const p of all("SELECT * FROM projects WHERE status='ACTIVE'")) {
    if (!get('SELECT 1 x FROM activities WHERE project_id=?', p.id)) continue;
    const last = get('SELECT MAX(snapshot_date) d FROM progress_snapshots WHERE project_id=?', p.id).d;
    if (last && calc.diffDays(last, calc.today()) < 7) continue;
    const id = takeSnapshot(p, null, 'Automatic weekly snapshot');
    audit(null, p.id, 'create', 'Snapshot', id, 'Automatic weekly snapshot');
    broadcast(p.id, 'snapshots'); n++;
  }
  return n;
}

function removeFileFromDisk(stored) { try { fs.unlinkSync(path.join(UPLOADS, stored)); } catch (_) { /* gone */ } }

// ---------- app ----------
function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  const SECRET = jwtSecret();

  // Bootstrap first admin.
  if (!get('SELECT 1 x FROM users LIMIT 1')) {
    const email = process.env.ADMIN_EMAIL || 'admin@mfbuilding.co.za';
    const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
    run('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)', email, 'MF Admin', bcrypt.hashSync(pw, 10), 'ADMIN');
    console.log(`\n=== First admin created ===\n  email:    ${email}\n  password: ${pw}\n  (change it after first login)\n`);
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: UPLOADS,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + (IMAGE_TYPES[file.mimetype] || '.bin')),
    }),
    limits: { fileSize: MAX_UPLOAD, files: 10 },
    fileFilter: (req, file, cb) => (IMAGE_TYPES[file.mimetype] ? cb(null, true) : cb(bad('Only image files can be uploaded'))),
  });

  // --- auth ---
  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active });
  const sign = (u) => jwt.sign({ uid: u.id }, SECRET, { expiresIn: '30d' });

  function authenticate(req, allowQuery) {
    let token = null;
    const hdr = req.headers.authorization || '';
    if (hdr.startsWith('Bearer ')) token = hdr.slice(7);
    else if (allowQuery && req.query.t) token = String(req.query.t);
    if (!token) throw new HttpError(401, 'Not signed in');
    let payload;
    try { payload = jwt.verify(token, SECRET); } catch (_) { throw new HttpError(401, 'Session expired, please sign in again'); }
    // short-lived link tokens are only valid in a query string (downloads), never as an API bearer token
    if (payload.scope === 'link' && !(allowQuery && !hdr)) throw new HttpError(401, 'Invalid token');
    const u = get('SELECT * FROM users WHERE id=?', payload.uid);
    if (!u || !u.active) throw new HttpError(401, 'Account is disabled');
    return u;
  }
  const auth = (allowQuery) => (req, res, next) => { try { req.user = authenticate(req, allowQuery); next(); } catch (e) { next(e); } };
  const needAdmin = (req, res, next) => (req.user.role === 'ADMIN' ? next() : next(new HttpError(403, 'Administrator access required')));

  function projectFor(req, id, { admin } = {}) {
    id = int(id);
    const p = Number.isNaN(id) ? null : get('SELECT * FROM projects WHERE id=?', id);
    if (!p) throw new HttpError(404, 'Project not found');
    if (req.user.role !== 'ADMIN') {
      if (admin) throw new HttpError(403, 'Administrator access required');
      if (!get('SELECT 1 x FROM project_members WHERE project_id=? AND user_id=?', id, req.user.id)) throw new HttpError(404, 'Project not found');
    }
    return p;
  }

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.post('/api/auth/login', h((req, res) => {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    const fails = get("SELECT COUNT(*) c FROM login_attempts WHERE email=? COLLATE NOCASE AND success=0 AND created_at > datetime('now','-15 minutes')", email).c;
    if (fails >= 8) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
    const u = get('SELECT * FROM users WHERE email=?', email);
    const ok = u && u.active && bcrypt.compareSync(password, u.password_hash);
    run('INSERT INTO login_attempts(email,ip,success) VALUES(?,?,?)', email, req.ip, ok ? 1 : 0);
    if (!ok) throw new HttpError(401, u && !u.active ? 'This account has been deactivated' : 'Incorrect email or password');
    res.json({ token: sign(u), user: publicUser(u) });
  }));
  app.post('/api/auth/link-token', auth(), (req, res) => res.json({ token: jwt.sign({ uid: req.user.id, scope: 'link' }, SECRET, { expiresIn: '10m' }) }));
  app.get('/api/auth/me', auth(), (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/change-password', auth(), h((req, res) => {
    const { current_password, new_password } = req.body;
    if (!bcrypt.compareSync(String(current_password || ''), req.user.password_hash)) throw bad('Current password is incorrect');
    if (String(new_password || '').length < 8) throw bad('New password must be at least 8 characters');
    run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(new_password, 10), req.user.id);
    audit(req.user, null, 'update', 'User', req.user.id, 'Changed own password');
    res.json({ ok: true });
  }));
  // Intentionally no self-registration endpoint: accounts are created by an administrator.

  // --- realtime (SSE) ---
  app.get('/api/events', auth(true), (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const c = { res, user: req.user };
    clients.add(c);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) { /* closed */ } }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(c); });
  });

  // --- users (admin) ---
  const userRow = (u) => ({
    ...publicUser(u), created_at: u.created_at,
    project_ids: all('SELECT project_id FROM project_members WHERE user_id=?', u.id).map((r) => r.project_id),
  });
  const USER_SPEC = {
    name: { t: 'text', req: true, max: 120, label: 'Name' },
    email: { t: 'text', req: true, max: 200, label: 'Email' },
    role: { t: 'enum', values: ['ADMIN', 'VIEWER'], def: 'VIEWER' },
  };
  const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const activeAdmins = () => get("SELECT COUNT(*) c FROM users WHERE role='ADMIN' AND active=1").c;

  app.get('/api/users', auth(), needAdmin, h((req, res) => res.json({ users: all('SELECT * FROM users ORDER BY name').map(userRow) })));
  app.post('/api/users', auth(), needAdmin, h((req, res) => {
    const d = clean(USER_SPEC, req.body);
    if (!emailOk(d.email)) throw bad('Enter a valid email address');
    if (get('SELECT 1 x FROM users WHERE email=?', d.email)) throw bad('A user with that email already exists');
    let pw = String(req.body.password || '');
    let generated = false;
    if (!pw) { pw = crypto.randomBytes(6).toString('base64url'); generated = true; }
    if (pw.length < 8) throw bad('Password must be at least 8 characters');
    const id = tx(() => {
      const uid = insertRow('users', { ...d, password_hash: bcrypt.hashSync(pw, 10) });
      for (const pid of Array.isArray(req.body.project_ids) ? req.body.project_ids : []) {
        if (get('SELECT 1 x FROM projects WHERE id=?', pid)) run('INSERT OR IGNORE INTO project_members VALUES(?,?)', pid, uid);
      }
      audit(req.user, null, 'create', 'User', uid, `Created ${d.role} account ${d.email}`);
      return uid;
    });
    res.status(201).json({ user: userRow(get('SELECT * FROM users WHERE id=?', id)), temporary_password: generated ? pw : undefined });
  }));
  app.patch('/api/users/:id', auth(), needAdmin, h((req, res) => {
    const u = get('SELECT * FROM users WHERE id=?', int(req.params.id));
    if (!u) throw new HttpError(404, 'User not found');
    const d = clean({ ...USER_SPEC, active: { t: 'int' } }, req.body, true);
    if (d.email !== undefined && !emailOk(d.email)) throw bad('Enter a valid email address');
    if (d.email && d.email.toLowerCase() !== u.email.toLowerCase() && get('SELECT 1 x FROM users WHERE email=?', d.email)) throw bad('A user with that email already exists');
    const losesAdmin = u.role === 'ADMIN' && u.active && ((d.role && d.role !== 'ADMIN') || d.active === 0);
    if (losesAdmin && activeAdmins() <= 1) throw bad('There must be at least one active administrator');
    let temporary_password;
    if (req.body.reset_password) { temporary_password = crypto.randomBytes(6).toString('base64url'); d.password_hash = bcrypt.hashSync(temporary_password, 10); }
    else if (req.body.password) { if (String(req.body.password).length < 8) throw bad('Password must be at least 8 characters'); d.password_hash = bcrypt.hashSync(req.body.password, 10); }
    updateRow('users', u.id, d);
    audit(req.user, null, 'update', 'User', u.id, `Updated ${u.email}: ${Object.keys(d).filter((k) => k !== 'password_hash').join(', ') || 'password'}${d.password_hash ? ' (password reset)' : ''}`);
    res.json({ user: userRow(get('SELECT * FROM users WHERE id=?', u.id)), temporary_password });
  }));
  app.put('/api/projects/:pid/members/:uid', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.pid); const u = get('SELECT * FROM users WHERE id=?', int(req.params.uid));
    if (!u) throw new HttpError(404, 'User not found');
    run('INSERT OR IGNORE INTO project_members VALUES(?,?)', p.id, u.id);
    audit(req.user, p.id, 'update', 'Access', u.id, `Granted ${u.name} access`);
    broadcast(p.id, 'members'); res.json({ ok: true });
  }));
  app.delete('/api/projects/:pid/members/:uid', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.pid); const u = get('SELECT * FROM users WHERE id=?', int(req.params.uid));
    if (!u) throw new HttpError(404, 'User not found');
    run('DELETE FROM project_members WHERE project_id=? AND user_id=?', p.id, u.id);
    audit(req.user, p.id, 'delete', 'Access', u.id, `Removed ${u.name}'s access`);
    broadcast(p.id, 'members'); res.json({ ok: true });
  }));

  // --- projects ---
  app.get('/api/projects', auth(), h((req, res) => {
    const rows = req.user.role === 'ADMIN'
      ? all('SELECT * FROM projects ORDER BY (status=\'ACTIVE\') DESC, name')
      : all('SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id WHERE m.user_id=? ORDER BY (p.status=\'ACTIVE\') DESC, p.name', req.user.id);
    res.json({ projects: rows.map(projectSummary) });
  }));
  app.post('/api/projects', auth(), needAdmin, h((req, res) => {
    const d = clean(PROJECT_SPEC, req.body);
    if (d.baseline_start && d.baseline_finish && d.baseline_finish < d.baseline_start) throw bad('Baseline finish cannot be before baseline start');
    const id = tx(() => {
      const pid = insertRow('projects', { ...d, created_by: req.user.id });
      audit(req.user, pid, 'create', 'Project', pid, `Created project ${d.name}`);
      return pid;
    });
    broadcast(null, 'projects');
    res.status(201).json({ project: projectSummary(get('SELECT * FROM projects WHERE id=?', id)) });
  }));
  app.get('/api/projects/:id', auth(), h((req, res) => {
    const p = projectFor(req, req.params.id);
    res.json(projectBundle(p, req.user.role === 'ADMIN'));
  }));
  app.patch('/api/projects/:id', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    const d = clean(PROJECT_SPEC, req.body, true);
    const m = { ...p, ...d };
    if (m.baseline_start && m.baseline_finish && m.baseline_finish < m.baseline_start) throw bad('Baseline finish cannot be before baseline start');
    updateRow('projects', p.id, d);
    audit(req.user, p.id, 'update', 'Project', p.id, `Updated project: ${Object.keys(d).join(', ')}`);
    broadcast(p.id, 'project'); broadcast(null, 'projects');
    res.json({ project: get('SELECT * FROM projects WHERE id=?', p.id) });
  }));
  app.delete('/api/projects/:id', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    if (req.query.confirm !== p.name) throw bad('Type the project name to confirm deletion');
    const files = all('SELECT stored_name FROM project_files WHERE project_id=?', p.id);
    tx(() => { run('DELETE FROM projects WHERE id=?', p.id); audit(req.user, null, 'delete', 'Project', p.id, `Deleted project ${p.name}`); });
    files.forEach((f) => removeFileFromDisk(f.stored_name));
    broadcast(null, 'projects'); res.json({ ok: true });
  }));

  // --- activities ---
  function actFromBody(body, existing) {
    const d = clean(ACT_SPEC, body, !!existing);
    const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true';
    const ms = body.is_milestone !== undefined ? truthy(body.is_milestone) : !!(existing && existing.is_milestone);
    const start = d.start_date ?? (existing && existing.start_date);
    if (!start) throw bad('Start date is required');
    let finish = d.finish_date;
    const hasDur = body.duration !== undefined && body.duration !== null && body.duration !== '';
    if (ms) finish = start;
    else if (!finish && hasDur) {
      const dur = Number(body.duration);
      if (!Number.isInteger(dur) || dur < 1) throw bad('Duration must be a whole number of days (1 or more)');
      finish = calc.addDays(start, dur - 1);
    } else if (!finish) {
      finish = existing ? (d.start_date ? calc.addDays(start, Math.max(calc.durationOf(existing), 1) - 1) : existing.finish_date) : start;
    }
    if (finish < start) throw bad('Finish date cannot be before start date');
    d.start_date = start; d.finish_date = finish;
    if (body.is_milestone !== undefined || !existing) d.is_milestone = ms ? 1 : 0;
    return d;
  }
  app.post('/api/projects/:id/activities', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    const d = actFromBody(req.body);
    const id = tx(() => {
      d.project_id = p.id;
      d.sort_order = get('SELECT COALESCE(MAX(sort_order),0)+1 n FROM activities WHERE project_id=?', p.id).n;
      const aid = insertRow('activities', d);
      if (req.body.predecessors) setPredecessors(aid, p.id, req.body.predecessors);
      for (const pr of req.body.predecessors || []) cascade(p.id, Number(pr));
      audit(req.user, p.id, 'create', 'Activity', aid, `Added activity ${d.name}`);
      return aid;
    });
    broadcast(p.id, 'programme');
    res.status(201).json({ activity: loadActivities(p.id).find((a) => a.id === id) });
  }));
  app.patch('/api/activities/:id', auth(), needAdmin, h((req, res) => {
    const a = get('SELECT * FROM activities WHERE id=?', int(req.params.id));
    if (!a) throw new HttpError(404, 'Activity not found');
    const p = projectFor(req, a.project_id);
    const d = actFromBody(req.body, a);
    let moved = [];
    tx(() => {
      if (req.body.predecessors !== undefined) setPredecessors(a.id, p.id, req.body.predecessors);
      d.updated_at = nowTs();
      updateRow('activities', a.id, d);
      const changedDates = (d.start_date && d.start_date !== a.start_date) || (d.finish_date && d.finish_date !== a.finish_date) || req.body.predecessors !== undefined;
      if (changedDates) {
        // a changed activity may itself now clash with its own predecessors
        for (const pr of all('SELECT predecessor_id FROM activity_dependencies WHERE activity_id=?', a.id)) moved.push(...cascade(p.id, pr.predecessor_id));
        moved.push(...cascade(p.id, a.id));
      }
      audit(req.user, p.id, 'update', 'Activity', a.id, `Updated activity ${d.name || a.name}: ${Object.keys(d).filter((k) => k !== 'updated_at').join(', ')}`);
    });
    broadcast(p.id, 'programme');
    res.json({ activity: loadActivities(p.id).find((x) => x.id === a.id), shifted_activity_ids: [...new Set(moved)] });
  }));
  app.delete('/api/activities/:id', auth(), needAdmin, h((req, res) => {
    const a = get('SELECT * FROM activities WHERE id=?', int(req.params.id));
    if (!a) throw new HttpError(404, 'Activity not found');
    const p = projectFor(req, a.project_id);
    tx(() => { run('DELETE FROM activities WHERE id=?', a.id); audit(req.user, p.id, 'delete', 'Activity', a.id, `Deleted activity ${a.name}`); });
    broadcast(p.id, 'programme'); res.json({ ok: true });
  }));
  app.post('/api/projects/:id/activities/reorder', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    const ids = (req.body.ids || []).map(Number);
    const have = all('SELECT id FROM activities WHERE project_id=?', p.id).map((r) => r.id);
    if (ids.length !== have.length || !have.every((i) => ids.includes(i))) throw bad('ids must list every activity of the project exactly once');
    tx(() => { ids.forEach((id, i) => run('UPDATE activities SET sort_order=? WHERE id=?', i + 1, id)); audit(req.user, p.id, 'update', 'Programme', null, 'Reordered activities'); });
    broadcast(p.id, 'programme'); res.json({ ok: true });
  }));

  // --- RFIs / variations / delays / site updates ---
  for (const [route, cfg] of Object.entries(SPECS)) {
    app.post(`/api/projects/:id/${route}`, auth(), needAdmin, h((req, res) => {
      const p = projectFor(req, req.params.id);
      const d = clean(cfg.spec, req.body);
      if (cfg.prefix && !d.reference) {
        const n = all(`SELECT reference FROM ${cfg.table} WHERE project_id=?`, p.id).reduce((m, r) => Math.max(m, parseInt((r.reference.match(/(\d+)$/) || [0, 0])[1], 10) || 0), 0);
        d.reference = `${cfg.prefix}-${String(n + 1).padStart(3, '0')}`;
      }
      if (route === 'rfis' && d.status === 'CLOSED' && !d.date_closed) d.date_closed = calc.today();
      if (route === 'site-updates') d.created_by = req.user.id;
      d.project_id = p.id;
      const id = tx(() => { const rid = insertRow(cfg.table, d); audit(req.user, p.id, 'create', cfg.audit, rid, cfg.label(d)); return rid; });
      broadcast(p.id, route);
      res.status(201).json({ item: get(`SELECT * FROM ${cfg.table} WHERE id=?`, id) });
    }));
    app.patch(`/api/${route}/:id`, auth(), needAdmin, h((req, res) => {
      const row = get(`SELECT * FROM ${cfg.table} WHERE id=?`, int(req.params.id));
      if (!row) throw new HttpError(404, 'Not found');
      const p = projectFor(req, row.project_id);
      const d = clean(cfg.spec, req.body, true);
      if (route === 'rfis' && d.status) {
        if (d.status === 'CLOSED' && !(d.date_closed || row.date_closed)) d.date_closed = calc.today();
        if (d.status !== 'CLOSED' && req.body.date_closed === undefined) d.date_closed = null;
      }
      if (cfg.prefix && d.reference === '') d.reference = row.reference;
      updateRow(cfg.table, row.id, d);
      audit(req.user, p.id, 'update', cfg.audit, row.id, `${cfg.label({ ...row, ...d })} (${Object.keys(d).join(', ')})`);
      broadcast(p.id, route);
      res.json({ item: get(`SELECT * FROM ${cfg.table} WHERE id=?`, row.id) });
    }));
    app.delete(`/api/${route}/:id`, auth(), needAdmin, h((req, res) => {
      const row = get(`SELECT * FROM ${cfg.table} WHERE id=?`, int(req.params.id));
      if (!row) throw new HttpError(404, 'Not found');
      const p = projectFor(req, row.project_id);
      const files = route === 'site-updates' ? all('SELECT stored_name FROM project_files WHERE site_update_id=?', row.id) : [];
      tx(() => { run(`DELETE FROM ${cfg.table} WHERE id=?`, row.id); audit(req.user, p.id, 'delete', cfg.audit, row.id, cfg.label(row)); });
      files.forEach((f) => removeFileFromDisk(f.stored_name));
      broadcast(p.id, route); res.json({ ok: true });
    }));
  }

  // --- comments (any project member; delete = admin) ---
  app.post('/api/projects/:id/comments', auth(), h((req, res) => {
    const p = projectFor(req, req.params.id);
    const body = String(req.body.body || '').trim();
    if (!body) throw bad('Comment cannot be empty');
    if (body.length > 5000) throw bad('Comment is too long');
    const id = insertRow('comments', { project_id: p.id, user_id: req.user.id, body });
    audit(req.user, p.id, 'create', 'Comment', id, body.slice(0, 100));
    broadcast(p.id, 'comments');
    res.status(201).json({ comment: get('SELECT c.*, u.name user_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?', id) });
  }));
  app.delete('/api/comments/:id', auth(), needAdmin, h((req, res) => {
    const c = get('SELECT * FROM comments WHERE id=?', int(req.params.id));
    if (!c) throw new HttpError(404, 'Comment not found');
    const files = all('SELECT stored_name FROM project_files WHERE comment_id=?', c.id);
    tx(() => { run('DELETE FROM comments WHERE id=?', c.id); audit(req.user, c.project_id, 'delete', 'Comment', c.id, c.body.slice(0, 100)); });
    files.forEach((f) => removeFileFromDisk(f.stored_name));
    broadcast(c.project_id, 'comments'); res.json({ ok: true });
  }));

  // --- files / photos ---
  app.post('/api/projects/:id/files', auth(), (req, res, next) => {
    try { projectFor(req, req.params.id); } catch (e) { return next(e); }
    upload.array('photos', 10)(req, res, (err) => {
      if (err) return next(err.code === 'LIMIT_FILE_SIZE' ? bad('Photo is too large (15 MB max)') : err);
      try {
        const p = projectFor(req, req.params.id);
        const files = req.files || [];
        const cleanup = () => files.forEach((f) => removeFileFromDisk(f.filename));
        if (!files.length) throw bad('No photo received');
        const suId = req.body.site_update_id ? int(req.body.site_update_id) : null;
        const cId = req.body.comment_id ? int(req.body.comment_id) : null;
        if (suId !== null && (Number.isNaN(suId) || !get('SELECT 1 x FROM site_updates WHERE id=? AND project_id=?', suId, p.id))) { cleanup(); throw bad('Site update not found'); }
        if (cId !== null) {
          const c = Number.isNaN(cId) ? null : get('SELECT * FROM comments WHERE id=? AND project_id=?', cId, p.id);
          if (!c) { cleanup(); throw bad('Comment not found'); }
          if (req.user.role !== 'ADMIN' && c.user_id !== req.user.id) { cleanup(); throw new HttpError(403, 'You can only attach photos to your own comments'); }
        } else if (req.user.role !== 'ADMIN') { cleanup(); throw new HttpError(403, 'Viewers can only attach photos to their own comments'); }
        let captions = req.body.captions; if (captions !== undefined && !Array.isArray(captions)) captions = [captions];
        const out = tx(() => files.map((f, i) => {
          const id = insertRow('project_files', {
            project_id: p.id, site_update_id: suId, comment_id: cId, uploaded_by: req.user.id,
            filename: (f.originalname || 'photo').slice(0, 200), mime: f.mimetype, size: f.size, stored_name: f.filename,
            caption: String((captions && captions[i]) || req.body.caption || '').slice(0, 500),
          });
          audit(req.user, p.id, 'create', 'Photo', id, `${f.originalname || 'photo'}${suId ? ' (site update)' : cId ? ' (comment)' : ''}`);
          return get('SELECT id,project_id,site_update_id,comment_id,filename,mime,size,caption,created_at FROM project_files WHERE id=?', id);
        }));
        broadcast(p.id, 'files');
        res.status(201).json({ files: out });
      } catch (e) { next(e); }
    });
  });
  app.get('/api/files/:id', auth(true), h((req, res) => {
    const f = get('SELECT * FROM project_files WHERE id=?', int(req.params.id));
    if (!f) throw new HttpError(404, 'File not found');
    projectFor(req, f.project_id);
    res.set('Cache-Control', 'private, max-age=3600'); res.type(f.mime);
    res.sendFile(path.join(UPLOADS, f.stored_name), (e) => { if (e && !res.headersSent) res.status(404).json({ error: 'File missing from storage' }); });
  }));
  app.patch('/api/files/:id', auth(), needAdmin, h((req, res) => {
    const f = get('SELECT * FROM project_files WHERE id=?', int(req.params.id));
    if (!f) throw new HttpError(404, 'File not found');
    const caption = String(req.body.caption ?? '').slice(0, 500);
    run('UPDATE project_files SET caption=? WHERE id=?', caption, f.id);
    audit(req.user, f.project_id, 'update', 'Photo', f.id, `Caption: ${caption}`);
    broadcast(f.project_id, 'files'); res.json({ ok: true });
  }));
  app.delete('/api/files/:id', auth(), needAdmin, h((req, res) => {
    const f = get('SELECT * FROM project_files WHERE id=?', int(req.params.id));
    if (!f) throw new HttpError(404, 'File not found');
    run('DELETE FROM project_files WHERE id=?', f.id); removeFileFromDisk(f.stored_name);
    audit(req.user, f.project_id, 'delete', 'Photo', f.id, f.filename);
    broadcast(f.project_id, 'files'); res.json({ ok: true });
  }));

  // --- snapshots / history ---
  app.post('/api/projects/:id/snapshots', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    const date = req.body.snapshot_date || calc.today();
    if (!calc.isDate(date)) throw bad('Date must be YYYY-MM-DD');
    if (!get('SELECT 1 x FROM activities WHERE project_id=?', p.id)) throw bad('Add programme activities before taking a snapshot');
    const id = takeSnapshot(p, req.user, String(req.body.note || '').slice(0, 2000), date);
    audit(req.user, p.id, 'create', 'Snapshot', id, `Progress snapshot ${date}`);
    broadcast(p.id, 'snapshots');
    res.status(201).json({ snapshot: get('SELECT * FROM progress_snapshots WHERE id=?', id) });
  }));
  app.patch('/api/snapshots/:id', auth(), needAdmin, h((req, res) => {
    const s = get('SELECT * FROM progress_snapshots WHERE id=?', int(req.params.id));
    if (!s) throw new HttpError(404, 'Snapshot not found');
    run('UPDATE progress_snapshots SET note=? WHERE id=?', String(req.body.note ?? '').slice(0, 2000), s.id);
    audit(req.user, s.project_id, 'update', 'Snapshot', s.id, 'Edited note'); broadcast(s.project_id, 'snapshots'); res.json({ ok: true });
  }));
  app.delete('/api/snapshots/:id', auth(), needAdmin, h((req, res) => {
    const s = get('SELECT * FROM progress_snapshots WHERE id=?', int(req.params.id));
    if (!s) throw new HttpError(404, 'Snapshot not found');
    run('DELETE FROM progress_snapshots WHERE id=?', s.id);
    audit(req.user, s.project_id, 'delete', 'Snapshot', s.id, `Snapshot ${s.snapshot_date}`); broadcast(s.project_id, 'snapshots'); res.json({ ok: true });
  }));

  // --- audit ---
  app.get('/api/projects/:id/audit', auth(), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    const limit = Math.min(int(req.query.limit) || 200, 1000);
    res.json({ events: all('SELECT * FROM audit_events WHERE project_id=? ORDER BY id DESC LIMIT ?', p.id, limit) });
  }));

  // --- export / backup ---
  app.get('/api/projects/:id/export', auth(true), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    const data = {
      exported_at: new Date().toISOString(), format: 'mf-project-control/1', project: p,
      activities: loadActivities(p.id), activity_dependencies: all('SELECT d.* FROM activity_dependencies d JOIN activities a ON a.id=d.activity_id WHERE a.project_id=?', p.id),
      rfis: all('SELECT * FROM rfis WHERE project_id=?', p.id), variations: all('SELECT * FROM variations WHERE project_id=?', p.id),
      delays: all('SELECT * FROM delays WHERE project_id=?', p.id), site_updates: all('SELECT * FROM site_updates WHERE project_id=?', p.id),
      comments: all('SELECT c.*, u.name user_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.project_id=?', p.id),
      progress_snapshots: all('SELECT * FROM progress_snapshots WHERE project_id=?', p.id),
      members: all('SELECT u.id,u.name,u.email,u.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?', p.id),
      audit_events: all('SELECT * FROM audit_events WHERE project_id=?', p.id),
      files: all('SELECT id,site_update_id,comment_id,filename,mime,size,caption,created_at FROM project_files WHERE project_id=?', p.id),
    };
    if (req.query.photos === '1') {
      data.file_contents = all('SELECT id,stored_name FROM project_files WHERE project_id=?', p.id).map((f) => {
        try { return { id: f.id, base64: fs.readFileSync(path.join(UPLOADS, f.stored_name)).toString('base64') }; } catch (_) { return { id: f.id, missing: true }; }
      });
    }
    audit(req.user, p.id, 'export', 'Project', p.id, `Exported project data${req.query.photos === '1' ? ' with photos' : ''}`);
    const safe = p.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    res.set('Content-Disposition', `attachment; filename="MF_${safe}_backup_${calc.today()}.json"`).json(data);
  }));
  app.get('/api/backup/database', auth(true), needAdmin, h((req, res) => {
    const out = path.join(DATA_DIR, `backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
    audit(req.user, null, 'export', 'Database', null, 'Full database backup downloaded');
    res.download(out, `MF_database_backup_${calc.today()}.db`, () => fs.unlink(out, () => {}));
  }));

  // --- client report (PDF) ---
  app.get('/api/projects/:id/report.pdf', auth(true), needAdmin, h((req, res) => {
    const p = projectFor(req, req.params.id);
    const to = req.query.to || calc.today();
    const from = req.query.from || calc.addDays(to, -6);
    if (!calc.isDate(from) || !calc.isDate(to) || from > to) throw bad('Reporting period must be valid dates with From before To');
    const include = new Set(String(req.query.include || 'rfis,variations,delays,photos,history').split(','));
    const bundle = projectBundle(p, true);
    // statements as of end of reporting period
    bundle.summary = calc.summarise(p, bundle.activities, to);
    const stored = new Map(all('SELECT id,stored_name FROM project_files WHERE project_id=?', p.id).map((f) => [f.id, f.stored_name]));
    const safe = p.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.download === '0' ? 'inline' : 'attachment'}; filename="MF_Progress_Report_${safe}_${to}.pdf"` });
    audit(req.user, p.id, 'export', 'Report', null, `Client report ${from} to ${to}`);
    buildReport({ bundle, from, to, include, uploadsDir: UPLOADS, stored }).pipe(res);
  }));

  // --- static web app ---
  const dist = path.join(__dirname, '..', '..', 'app', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.code && String(err.code).startsWith('LIMIT_')) return res.status(400).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}

module.exports = { createApp, autoSnapshots };
