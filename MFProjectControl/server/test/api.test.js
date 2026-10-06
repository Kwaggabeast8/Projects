// End-to-end API tests: every workflow as ADMIN and as VIEWER against a fresh database.
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mf-test-'));
process.env.ADMIN_EMAIL = 'admin@mf.test';
process.env.ADMIN_PASSWORD = 'AdminPass123';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createApp, autoSnapshots } = require('../src/app');
const calc = require('../src/calc');

let base, server;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const T = {}; // tokens
async function api(method, url, { token, body, raw } = {}) {
  const res = await fetch(base + url, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  let json = null; try { json = await res.json(); } catch (_) { /* none */ }
  return { status: res.status, json };
}
const A = (m, u, b) => api(m, u, { token: T.admin, body: b });
const V = (m, u, b) => api(m, u, { token: T.viewer, body: b });
const ok = (r, s = 200) => assert.equal(r.status, s, JSON.stringify(r.json));
const d = (n) => calc.addDays(calc.today(), n);

test.before(async () => {
  const app = createApp();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

test('auth: login, bad password, no public registration', async () => {
  let r = await api('POST', '/api/auth/login', { body: { email: 'admin@mf.test', password: 'wrong' } }); ok(r, 401);
  r = await api('POST', '/api/auth/login', { body: { email: 'admin@mf.test', password: 'AdminPass123' } }); ok(r);
  T.admin = r.json.token; assert.equal(r.json.user.role, 'ADMIN');
  ok(await api('GET', '/api/projects'), 401);
  for (const u of ['/api/auth/register', '/api/auth/signup', '/api/register']) ok(await api('POST', u, { body: { email: 'x@y.com', password: 'abcdefghi' } }), 404);
});

test('admin users: create viewer, validation, duplicate, deactivate/reactivate, last-admin guard', async () => {
  ok(await A('POST', '/api/users', { name: 'X', email: 'bad', role: 'VIEWER' }), 400);
  let r = await A('POST', '/api/users', { name: 'Client Viewer', email: 'viewer@mf.test', role: 'VIEWER', password: 'ViewerPass123' }); ok(r, 201);
  const vid = r.json.user.id;
  ok(await A('POST', '/api/users', { name: 'Dup', email: 'VIEWER@mf.test', role: 'VIEWER' }), 400);
  r = await A('POST', '/api/users', { name: 'Gen', email: 'gen@mf.test', role: 'VIEWER' }); ok(r, 201);
  assert.ok(r.json.temporary_password.length >= 8);
  r = await api('POST', '/api/auth/login', { body: { email: 'viewer@mf.test', password: 'ViewerPass123' } }); ok(r); T.viewer = r.json.token;
  T.viewerId = vid;
  // deactivate -> login and existing token fail; reactivate works
  ok(await A('PATCH', `/api/users/${vid}`, { active: 0 }));
  ok(await api('POST', '/api/auth/login', { body: { email: 'viewer@mf.test', password: 'ViewerPass123' } }), 401);
  ok(await V('GET', '/api/projects'), 401);
  ok(await A('PATCH', `/api/users/${vid}`, { active: 1 }));
  ok(await V('GET', '/api/projects'));
  const me = (await A('GET', '/api/auth/me')).json.user;
  ok(await A('PATCH', `/api/users/${me.id}`, { role: 'VIEWER' }), 400);
  ok(await A('PATCH', `/api/users/${me.id}`, { active: 0 }), 400);
  ok(await V('GET', '/api/users'), 403);
  ok(await V('POST', '/api/users', { name: 'Evil', email: 'e@e.com', role: 'ADMIN' }), 403);
  ok(await V('PATCH', `/api/users/${vid}`, { role: 'ADMIN' }), 403);
});

test('projects: create, validate, list, edit, reload, viewer access control', async () => {
  ok(await A('POST', '/api/projects', {}), 400);
  ok(await A('POST', '/api/projects', { name: 'X', baseline_start: '2025-02-01', baseline_finish: '2025-01-01' }), 400);
  let r = await A('POST', '/api/projects', { name: 'Hillcrest Warehouse', client: 'Acme Logistics', site: '12 Industrial Rd, Midrand', project_manager: 'Mike Fourie', baseline_start: d(-20), baseline_finish: d(60), forecast_finish: d(70) });
  ok(r, 201); T.pid = r.json.project.id;
  assert.equal(r.json.project.name, 'Hillcrest Warehouse');
  r = await A('POST', '/api/projects', { name: 'Unassigned Project' }); ok(r, 201); T.pid2 = r.json.project.id;
  // viewer sees nothing until assigned
  assert.deepEqual((await V('GET', '/api/projects')).json.projects, []);
  ok(await V('GET', `/api/projects/${T.pid}`), 404);
  ok(await V('POST', '/api/projects', { name: 'Nope' }), 403);
  ok(await A('PUT', `/api/projects/${T.pid}/members/${T.viewerId}`));
  r = await V('GET', '/api/projects'); assert.equal(r.json.projects.length, 1); assert.equal(r.json.projects[0].name, 'Hillcrest Warehouse');
  ok(await V('GET', `/api/projects/${T.pid2}`), 404);
  ok(await V('PATCH', `/api/projects/${T.pid}`, { name: 'Hacked' }), 403);
  ok(await V('PUT', `/api/projects/${T.pid}/members/${T.viewerId}`), 403);
  r = await A('PATCH', `/api/projects/${T.pid}`, { project_manager: 'Sarah Naidoo', status: 'ACTIVE' }); ok(r);
  r = await A('GET', `/api/projects/${T.pid}`); assert.equal(r.json.project.project_manager, 'Sarah Naidoo'); assert.equal(r.json.members.length, 1);
  assert.equal((await V('GET', `/api/projects/${T.pid}`)).json.members, undefined);
});

test('programme: activities CRUD, duration, milestone, dependencies, cascade, reorder, weighted + planned progress', async () => {
  const mk = async (b) => { const r = await A('POST', `/api/projects/${T.pid}/activities`, b); ok(r, 201); return r.json.activity; };
  ok(await A('POST', `/api/projects/${T.pid}/activities`, { name: '', start_date: d(0) }), 400);
  ok(await A('POST', `/api/projects/${T.pid}/activities`, { name: 'Bad', start_date: d(5), finish_date: d(1) }), 400);
  const site = await mk({ name: 'Site establishment', start_date: d(-20), finish_date: d(-11), weight: 1, actual_progress: 100 });
  assert.equal(site.duration, 10); assert.equal(site.planned_progress, 100);
  const found = await mk({ name: 'Foundations', start_date: d(-10), duration: 20, weight: 3, actual_progress: 40, predecessors: [site.id] });
  assert.equal(found.finish_date, d(9)); assert.equal(found.duration, 20);
  assert.equal(found.planned_progress, 55); // 11 of 20 days elapsed incl. today
  const ms = await mk({ name: 'Foundations complete', start_date: d(10), is_milestone: true, predecessors: [found.id], weight: 0 });
  assert.equal(ms.is_milestone, true); assert.equal(ms.duration, 0); assert.equal(ms.finish_date, ms.start_date);
  const slab = await mk({ name: 'Slab', start_date: d(11), finish_date: d(40), weight: 4, predecessors: [ms.id] });
  // dependency cycle rejected
  ok(await A('PATCH', `/api/activities/${site.id}`, { predecessors: [slab.id] }), 400);
  ok(await A('PATCH', `/api/activities/${site.id}`, { predecessors: [site.id] }), 400);
  ok(await A('PATCH', `/api/activities/${site.id}`, { predecessors: [999999] }), 400);
  // edit: extend foundations by 5 days -> successors cascade
  let r = await A('PATCH', `/api/activities/${found.id}`, { finish_date: d(14) }); ok(r);
  assert.ok(r.json.shifted_activity_ids.includes(ms.id) && r.json.shifted_activity_ids.includes(slab.id));
  r = await A('GET', `/api/projects/${T.pid}`);
  const by = Object.fromEntries(r.json.activities.map((a) => [a.name, a]));
  assert.equal(by['Foundations complete'].start_date, d(15)); assert.equal(by['Slab'].start_date, d(16)); assert.equal(by['Slab'].finish_date, d(45));
  assert.equal(by['Slab'].duration, 30, 'duration preserved on shift');
  // edit by duration
  r = await A('PATCH', `/api/activities/${slab.id}`, { duration: 10 }); ok(r); assert.equal(r.json.activity.finish_date, d(25));
  // progress + weights -> weighted figures
  ok(await A('PATCH', `/api/activities/${found.id}`, { actual_progress: 101 }), 400);
  ok(await A('PATCH', `/api/activities/${found.id}`, { actual_progress: 50, weight: 3 }));
  r = await A('GET', `/api/projects/${T.pid}`);
  const acts = r.json.activities; const W = acts.reduce((t, a) => t + a.weight, 0);
  const expAct = acts.reduce((t, a) => t + a.weight * a.actual_progress, 0) / W;
  const expPlan = acts.reduce((t, a) => t + a.weight * calc.plannedFor(a, calc.today()), 0) / W;
  assert.equal(r.json.summary.actual, calc.round1(expAct)); assert.equal(r.json.summary.planned, calc.round1(expPlan));
  assert.equal(r.json.summary.variance, calc.round1(r.json.summary.actual - r.json.summary.planned));
  assert.ok(['ahead', 'behind', 'on programme'].includes(r.json.summary.ahead_behind));
  assert.equal(by['Foundations'].planned_progress, calc.round1(calc.plannedFor({ start_date: d(-10), finish_date: d(14), is_milestone: false }, calc.today())));
  // reorder
  const ids = r.json.activities.map((a) => a.id).reverse();
  ok(await A('POST', `/api/projects/${T.pid}/activities/reorder`, { ids: ids.slice(1) }), 400);
  ok(await A('POST', `/api/projects/${T.pid}/activities/reorder`, { ids }));
  r = await A('GET', `/api/projects/${T.pid}`); assert.deepEqual(r.json.activities.map((a) => a.id), ids);
  // delete + dependency cleanup
  ok(await A('DELETE', `/api/activities/${ms.id}`));
  r = await A('GET', `/api/projects/${T.pid}`);
  assert.equal(r.json.activities.length, 3); assert.deepEqual(r.json.activities.find((a) => a.id === slab.id).predecessors, []);
  // permissions
  ok(await V('POST', `/api/projects/${T.pid}/activities`, { name: 'x', start_date: d(0) }), 403);
  ok(await V('PATCH', `/api/activities/${found.id}`, { actual_progress: 100 }), 403);
  ok(await V('DELETE', `/api/activities/${found.id}`), 403);
  ok(await V('POST', `/api/projects/${T.pid}/activities/reorder`, { ids }), 403);
  assert.equal((await V('GET', `/api/projects/${T.pid}`)).json.activities.length, 3);
  // dashboard row
  r = await A('GET', '/api/projects'); const row = r.json.projects.find((p) => p.id === T.pid);
  for (const k of ['name', 'client', 'site', 'project_manager', 'actual', 'planned', 'variance', 'programme_status', 'baseline_finish', 'forecast_finish', 'open_rfis', 'open_delays']) assert.ok(k in row, k);
});

for (const [route, create, update, bad, field] of [
  ['rfis', { subject: 'Clarify slab thickness', question: 'Is 200mm correct?', due_date: d(5) }, { status: 'CLOSED', response: 'Yes 200mm' }, { subject: '' }, 'subject'],
  ['variations', { description: 'Extra drainage', amount: 45250.5, time_impact_days: 3 }, { approval_status: 'APPROVED', status: 'SUBMITTED', amount: 50000 }, { description: 'x', amount: 'abc' }, 'description'],
  ['delays', { description: 'Heavy rain', category: 'weather', days_impact: 2, date_recorded: d(-1) }, { status: 'RESOLVED', days_impact: 3 }, { description: 'x', category: 'aliens' }, 'description'],
  ['site-updates', { update_date: d(-1), type: 'DAILY', progress_notes: 'Poured footings', labour_count: 14, material_deliveries: '20m3 concrete', work_completed: 'Footings poured', current_work: 'Stripping shutters', upcoming_work: 'Backfill', problems_risks: 'Rain forecast', pm_comments: 'Good progress' }, { labour_count: 18, current_work: 'Backfilling' }, { update_date: 'yesterday' }, 'progress_notes'],
]) {
  test(`${route}: create/read/edit/reload/delete + validation + viewer denied`, async () => {
    ok(await A('POST', `/api/projects/${T.pid}/${route}`, bad), 400);
    let r = await A('POST', `/api/projects/${T.pid}/${route}`, create); ok(r, 201);
    const id = r.json.item.id;
    if (route === 'rfis') assert.match(r.json.item.reference, /^RFI-001$/);
    if (route === 'variations') assert.match(r.json.item.reference, /^VO-001$/);
    const key = { rfis: 'rfis', variations: 'variations', delays: 'delays', 'site-updates': 'site_updates' }[route];
    r = await A('GET', `/api/projects/${T.pid}`); let item = r.json[key].find((x) => x.id === id); assert.ok(item);
    assert.equal(item[field], create[field]);
    if (route === 'variations') assert.equal(item.amount, 45250.5);
    // viewers can read but not write
    r = await V('GET', `/api/projects/${T.pid}`); assert.ok(r.json[key].find((x) => x.id === id));
    ok(await V('POST', `/api/projects/${T.pid}/${route}`, create), 403);
    ok(await V('PATCH', `/api/${route}/${id}`, update), 403);
    ok(await V('DELETE', `/api/${route}/${id}`), 403);
    ok(await A('PATCH', `/api/${route}/${id}`, update));
    r = await A('GET', `/api/projects/${T.pid}`); item = r.json[key].find((x) => x.id === id);
    for (const [k, v] of Object.entries(update)) assert.equal(item[k], v, k);
    if (route === 'rfis') assert.equal(item.date_closed, calc.today(), 'closing stamps date_closed');
    if (route === 'rfis') { ok(await A('PATCH', `/api/rfis/${id}`, { status: 'OPEN' })); assert.equal((await A('GET', `/api/projects/${T.pid}`)).json.rfis.find((x) => x.id === id).date_closed, null); }
    if (route === 'site-updates') { /* keep one for report + photos */ T.suId = id; return; }
    if (route === 'rfis') T.rfiId = id;
    if (route === 'delays') { await A('POST', `/api/projects/${T.pid}/delays`, { description: 'Open delay', category: 'client', days_impact: 4 }); }
    ok(await A('DELETE', `/api/${route}/${id}`));
    assert.equal((await A('GET', `/api/projects/${T.pid}`)).json[key].find((x) => x.id === id), undefined);
    ok(await A('DELETE', `/api/${route}/${id}`), 404);
  });
}

test('photos: upload to site update, display (download), caption edit, viewer rules, durable storage', async () => {
  const up = async (token, fields, files = 1) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    for (let i = 0; i < files; i++) f.append('photos', new Blob([PNG], { type: 'image/png' }), `site${i}.png`);
    return api('POST', `/api/projects/${T.pid}/files`, { token, body: f });
  };
  let r = await up(T.admin, { site_update_id: T.suId, caption: 'Footings poured' }, 2); ok(r, 201); assert.equal(r.json.files.length, 2);
  T.fileId = r.json.files[0].id;
  // reload -> photo is in the update and retrievable
  r = await A('GET', `/api/projects/${T.pid}`);
  const su = r.json.site_updates.find((x) => x.id === T.suId); assert.equal(su.files.length, 2); assert.equal(su.files[0].caption, 'Footings poured');
  const img = await api('GET', `/api/files/${T.fileId}?t=${T.admin}`, { raw: true });
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
  ok(await api('GET', `/api/files/${T.fileId}`, { raw: true }).then((x) => ({ status: x.status })), 401);
  ok(await A('PATCH', `/api/files/${T.fileId}`, { caption: 'Edited caption' }));
  assert.equal((await A('GET', `/api/projects/${T.pid}`)).json.photos.find((f) => f.id === T.fileId).caption, 'Edited caption');
  // viewer: cannot attach to site update; can view
  ok(await up(T.viewer, { site_update_id: T.suId }), 403);
  ok(await up(T.viewer, {}), 403);
  assert.equal((await api('GET', `/api/files/${T.fileId}?t=${T.viewer}`, { raw: true })).status, 200);
  // non-image rejected
  const f = new FormData(); f.append('photos', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
  ok(await api('POST', `/api/projects/${T.pid}/files`, { token: T.admin, body: f }), 400);
  ok(await V('DELETE', `/api/files/${T.fileId}`), 403);
  // general project photo (no parent)
  r = await up(T.admin, { caption: 'Aerial' }); ok(r, 201); T.generalPhoto = r.json.files[0].id;
});

test('comments: viewer posts with photo, admin deletes, permissions, cross-project isolation', async () => {
  ok(await V('POST', `/api/projects/${T.pid}/comments`, { body: '  ' }), 400);
  let r = await V('POST', `/api/projects/${T.pid}/comments`, { body: 'Please confirm the slab pour date.' }); ok(r, 201);
  const cid = r.json.comment.id; assert.equal(r.json.comment.user_name, 'Client Viewer');
  ok(await V('POST', `/api/projects/${T.pid2}/comments`, { body: 'x' }), 404);
  const f = new FormData(); f.append('comment_id', cid); f.append('caption', 'My view'); f.append('photos', new Blob([PNG], { type: 'image/png' }), 'phone.png');
  r = await api('POST', `/api/projects/${T.pid}/files`, { token: T.viewer, body: f }); ok(r, 201);
  const fid = r.json.files[0].id;
  r = await V('GET', `/api/projects/${T.pid}`);
  const c = r.json.comments.find((x) => x.id === cid); assert.equal(c.body, 'Please confirm the slab pour date.'); assert.equal(c.files.length, 1); assert.ok(c.created_at);
  // admin comment; viewer cannot attach to someone else's comment
  const ac = (await A('POST', `/api/projects/${T.pid}/comments`, { body: 'Will do' })).json.comment;
  const f2 = new FormData(); f2.append('comment_id', ac.id); f2.append('photos', new Blob([PNG], { type: 'image/png' }), 'p.png');
  ok(await api('POST', `/api/projects/${T.pid}/files`, { token: T.viewer, body: f2 }), 403);
  ok(await V('DELETE', `/api/comments/${cid}`), 403);
  ok(await A('DELETE', `/api/comments/${cid}`));
  r = await A('GET', `/api/projects/${T.pid}`);
  assert.equal(r.json.comments.find((x) => x.id === cid), undefined); assert.equal(r.json.photos.find((x) => x.id === fid), undefined, 'comment photos removed');
  assert.equal((await api('GET', `/api/files/${fid}?t=${T.admin}`, { raw: true })).status, 404);
});

test('snapshots / history + automatic weekly snapshot + audit trail', async () => {
  ok(await V('POST', `/api/projects/${T.pid}/snapshots`, {}), 403);
  let r = await A('POST', `/api/projects/${T.pid}/snapshots`, { note: 'Week 3' }); ok(r, 201);
  const sid = r.json.snapshot.id;
  r = await A('POST', `/api/projects/${T.pid}/snapshots`, { snapshot_date: d(-7), note: 'Back-dated' }); ok(r, 201);
  r = await V('GET', `/api/projects/${T.pid}`);
  assert.equal(r.json.snapshots.length, 2);
  const s = r.json.snapshots.find((x) => x.id === sid); assert.equal(s.note, 'Week 3'); assert.equal(s.variance, calc.round1(s.actual - s.planned)); assert.ok(s.detail.length === 3);
  ok(await A('PATCH', `/api/snapshots/${sid}`, { note: 'Week 3 edited' }));
  assert.equal((await A('GET', `/api/projects/${T.pid}`)).json.snapshots.find((x) => x.id === sid).note, 'Week 3 edited');
  ok(await A('POST', `/api/projects/${T.pid2}/snapshots`, {}), 400); // no programme
  // auto snapshot skips projects that already have a recent one
  autoSnapshots(); assert.equal((await A('GET', `/api/projects/${T.pid}`)).json.snapshots.length, 2);
  ok(await A('DELETE', `/api/snapshots/${sid}`));
  assert.equal((await A('GET', `/api/projects/${T.pid}`)).json.snapshots.length, 1);
  // audit
  r = await A('GET', `/api/projects/${T.pid}/audit`); ok(r);
  const acts = new Set(r.json.events.map((e) => `${e.action}:${e.entity}`));
  for (const k of ['create:Project', 'create:Activity', 'update:Activity', 'delete:Activity', 'create:RFI', 'create:Comment', 'delete:Comment', 'create:Snapshot', 'create:Photo']) assert.ok(acts.has(k), 'audit missing ' + k);
  assert.ok(r.json.events.every((e) => e.user_name));
  ok(await V('GET', `/api/projects/${T.pid}/audit`), 403);
});

test('client report PDF + backup export (admin only)', async () => {
  const q = `from=${d(-7)}&to=${calc.today()}`;
  ok(await api('GET', `/api/projects/${T.pid}/report.pdf?${q}`, { raw: true }).then((x) => ({ status: x.status })), 401);
  assert.equal((await api('GET', `/api/projects/${T.pid}/report.pdf?${q}&t=${T.viewer}`, { raw: true })).status, 403);
  ok(await A('GET', `/api/projects/${T.pid}/report.pdf?from=${d(1)}&to=${d(-1)}`).then((x) => x), 400);
  const res = await api('GET', `/api/projects/${T.pid}/report.pdf?${q}&t=${T.admin}`, { raw: true });
  assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-'); assert.ok(buf.length > 5000);
  fs.writeFileSync(process.env.DATA_DIR + '/report.pdf', buf);
  if (process.env.KEEP_PDF) fs.copyFileSync(process.env.DATA_DIR + '/report.pdf', process.env.KEEP_PDF);
  // export
  assert.equal((await api('GET', `/api/projects/${T.pid}/export?t=${T.viewer}`, { raw: true })).status, 403);
  const ex = await (await api('GET', `/api/projects/${T.pid}/export?t=${T.admin}&photos=1`, { raw: true })).json();
  assert.equal(ex.project.name, 'Hillcrest Warehouse'); assert.equal(ex.activities.length, 3); assert.ok(ex.site_updates.length >= 1); assert.ok(ex.file_contents.length >= 2);
  assert.equal(Buffer.from(ex.file_contents[0].base64, 'base64').equals(PNG), true);
  const db = await api('GET', `/api/backup/database?t=${T.admin}`, { raw: true }); assert.equal(db.status, 200);
  assert.equal(Buffer.from(await db.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3');
  assert.equal((await api('GET', `/api/backup/database?t=${T.viewer}`, { raw: true })).status, 403);
});

test('short-lived link tokens work for downloads only', async () => {
  const lt = (await A('POST', '/api/auth/link-token')).json.token;
  assert.equal((await api('GET', `/api/projects/${T.pid}/export?t=${lt}`, { raw: true })).status, 200);
  assert.equal((await api('GET', '/api/projects', { token: lt })).status, 401);
  const vl = (await V('POST', '/api/auth/link-token')).json.token;
  assert.equal((await api('GET', `/api/projects/${T.pid}/export?t=${vl}`, { raw: true })).status, 403);
});

test('realtime: SSE event delivered to assigned viewer, not to unassigned', async () => {
  const got = [];
  const ctl = new AbortController();
  const res = await fetch(`${base}/api/events?t=${T.viewer}`, { signal: ctl.signal });
  assert.equal(res.status, 200);
  (async () => { try { for await (const chunk of res.body) got.push(Buffer.from(chunk).toString()); } catch (_) { /* aborted */ } })();
  await new Promise((r) => setTimeout(r, 150));
  await A('POST', `/api/projects/${T.pid2}/delays`, { description: 'unseen', category: 'other' });
  await A('POST', `/api/projects/${T.pid}/delays`, { description: 'seen', category: 'other' });
  await new Promise((r) => setTimeout(r, 300));
  ctl.abort();
  const text = got.join('');
  assert.ok(text.includes(`"projectId":${T.pid},`), text); assert.ok(!text.includes(`"projectId":${T.pid2},`));
});

test('membership removal revokes access; project archive; delete with confirmation', async () => {
  ok(await A('DELETE', `/api/projects/${T.pid}/members/${T.viewerId}`));
  ok(await V('GET', `/api/projects/${T.pid}`), 404);
  ok(await A('PUT', `/api/projects/${T.pid}/members/${T.viewerId}`));
  ok(await A('PATCH', `/api/projects/${T.pid}`, { status: 'COMPLETED' }));
  assert.equal((await A('GET', '/api/projects')).json.projects.find((p) => p.id === T.pid).programme_status, 'Completed');
  ok(await A('PATCH', `/api/projects/${T.pid}`, { status: 'ARCHIVED' }));
  ok(await A('DELETE', `/api/projects/${T.pid2}`), 400);
  ok(await A('DELETE', `/api/projects/${T.pid2}?confirm=Unassigned%20Project`));
  ok(await A('GET', `/api/projects/${T.pid2}`), 404);
  // password change
  ok(await V('POST', '/api/auth/change-password', { current_password: 'nope', new_password: 'NewViewerPass1' }), 400);
  ok(await V('POST', '/api/auth/change-password', { current_password: 'ViewerPass123', new_password: 'NewViewerPass1' }));
  ok(await api('POST', '/api/auth/login', { body: { email: 'viewer@mf.test', password: 'NewViewerPass1' } }));
});
