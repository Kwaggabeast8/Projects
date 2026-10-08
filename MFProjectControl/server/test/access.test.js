// Per-user, per-project access levels (foreman, client, gantt-only, custom) enforced on the server.
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mf-access-'));
process.env.ADMIN_EMAIL = 'admin@mf.test';
process.env.ADMIN_PASSWORD = 'AdminPass123';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const calc = require('../src/calc');

let base, server;
const T = {}; const ID = {};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function api(method, url, token, body) {
  const res = await fetch(base + url, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (_) { /* none */ }
  return { status: res.status, json };
}
const as = (who) => (m, u, b) => api(m, u, T[who], b);
const A = as('admin'), F = as('foreman'), G = as('gantt'), C = as('client');
const ok = (r, s = 200) => assert.equal(r.status, s, JSON.stringify(r.json));
const d = (n) => calc.addDays(calc.today(), n);
const photo = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); f.append('photos', new Blob([PNG], { type: 'image/png' }), 'p.png'); return f; };

test.before(async () => {
  const app = createApp();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
  T.admin = (await api('POST', '/api/auth/login', null, { email: 'admin@mf.test', password: 'AdminPass123' })).json.token;
  const pr = await A('POST', '/api/projects', { name: 'Site One' }); ID.p = pr.json.project.id;
  ID.p2 = (await A('POST', '/api/projects', { name: 'Site Two' })).json.project.id;
  const a1 = (await A('POST', `/api/projects/${ID.p}/activities`, { name: 'Excavation', start_date: d(-5), finish_date: d(5) })).json.activity;
  ID.a1 = a1.id;
  ID.a2 = (await A('POST', `/api/projects/${ID.p}/activities`, { name: 'Footings', start_date: d(6), finish_date: d(15), predecessors: [a1.id] })).json.activity.id;
  ID.rfi = (await A('POST', `/api/projects/${ID.p}/rfis`, { subject: 'Check levels' })).json.item.id;
  ID.vo = (await A('POST', `/api/projects/${ID.p}/variations`, { description: 'Extra rock', amount: 12000 })).json.item.id;
  ID.adminUpdate = (await A('POST', `/api/projects/${ID.p}/site-updates`, { progress_notes: 'admin note' })).json.item.id;
  ID.adminPhoto = (await api('POST', `/api/projects/${ID.p}/files`, T.admin, photo({ site_update_id: ID.adminUpdate }))).json.files[0].id;
  ID.generalPhoto = (await api('POST', `/api/projects/${ID.p}/files`, T.admin, photo({ caption: 'general' }))).json.files[0].id;
  // users
  const mk = async (key, body) => { const r = await A('POST', '/api/users', body); ok(r, 201); ID[key] = r.json.user.id; T[key] = (await api('POST', '/api/auth/login', null, { email: body.email, password: body.password })).json.token; return r.json.user; };
  const u = await mk('foreman', { name: 'Foreman Joe', email: 'joe@mf.test', password: 'ForemanPass1', role: 'VIEWER', access: [{ project_id: ID.p, preset: 'foreman' }] });
  assert.equal(u.access[0].preset, 'foreman');
  await mk('gantt', { name: 'Gantt Only', email: 'gantt@mf.test', password: 'GanttPass123', role: 'VIEWER', access: [{ project_id: ID.p, permissions: { gantt: 'view', programme: 'edit', updates: 'edit' } }] });
  await mk('client', { name: 'Client', email: 'client@mf.test', password: 'ClientPass12', role: 'VIEWER', access: [{ project_id: ID.p, preset: 'client' }] });
});
test.after(() => server.close());

test('access meta lists sections and presets', async () => {
  const r = await F('GET', '/api/access-meta'); ok(r);
  assert.ok(r.json.sections.find((s) => s.key === 'gantt') && r.json.presets.foreman.permissions.updates === 'edit');
});

test('foreman: sees their sections, hidden ones come back empty', async () => {
  const r = await F('GET', `/api/projects/${ID.p}`); ok(r);
  assert.equal(r.json.permissions.programme, 'progress'); assert.equal(r.json.permissions.variations, 'none');
  assert.equal(r.json.activities.length, 2); assert.equal(r.json.rfis.length, 1);
  assert.deepEqual(r.json.variations, []); assert.deepEqual(r.json.snapshots, []);
  assert.equal(r.json.members, undefined);
  assert.ok(r.json.site_updates[0].files.length >= 1, 'foreman sees site-update photos');
  const list = (await F('GET', '/api/projects')).json.projects[0]; assert.equal(list.open_rfis, 1);
  assert.equal((await F('GET', `/api/projects/${ID.p2}`)).status, 404, 'unassigned project invisible');
});

test('foreman: can update progress % only, not dates / structure', async () => {
  ok(await F('PATCH', `/api/activities/${ID.a1}`, { actual_progress: 60 }));
  assert.equal((await A('GET', `/api/projects/${ID.p}`)).json.activities.find((a) => a.id === ID.a1).actual_progress, 60);
  ok(await F('PATCH', `/api/activities/${ID.a1}`, { actual_progress: 70, finish_date: d(30) }), 403);
  ok(await F('PATCH', `/api/activities/${ID.a1}`, { name: 'Renamed' }), 403);
  ok(await F('POST', `/api/projects/${ID.p}/activities`, { name: 'x', start_date: d(0) }), 403);
  ok(await F('DELETE', `/api/activities/${ID.a1}`), 403);
  ok(await F('POST', `/api/projects/${ID.p}/activities/reorder`, { ids: [ID.a2, ID.a1] }), 403);
  assert.equal((await A('GET', `/api/projects/${ID.p}`)).json.activities.find((a) => a.id === ID.a1).finish_date, d(5));
});

test('foreman: adds site updates + photos, edits only their own', async () => {
  let r = await F('POST', `/api/projects/${ID.p}/site-updates`, { progress_notes: 'Excavated grid A', labour_count: 9, work_completed: 'Trenches' }); ok(r, 201);
  ID.fu = r.json.item.id;
  r = await api('POST', `/api/projects/${ID.p}/files`, T.foreman, photo({ site_update_id: ID.fu, caption: 'Trench' })); ok(r, 201); ID.fp = r.json.files[0].id;
  assert.equal((await api('GET', `/api/files/${ID.fp}?t=${T.foreman}`, null)).status, 200);
  ok(await F('PATCH', `/api/site-updates/${ID.fu}`, { labour_count: 11 }));
  ok(await F('PATCH', `/api/files/${ID.fp}`, { caption: 'Trench A' }));
  // not admin's update / photo
  ok(await F('PATCH', `/api/site-updates/${ID.adminUpdate}`, { labour_count: 1 }), 403);
  ok(await F('DELETE', `/api/site-updates/${ID.adminUpdate}`), 403);
  ok(await api('POST', `/api/projects/${ID.p}/files`, T.foreman, photo({ site_update_id: ID.adminUpdate })), 403);
  ok(await F('DELETE', `/api/files/${ID.adminPhoto}`), 403);
  ok(await F('PATCH', `/api/files/${ID.adminPhoto}`, { caption: 'x' }), 403);
  // general project photo (photos: edit)
  ok(await api('POST', `/api/projects/${ID.p}/files`, T.foreman, photo({ caption: 'Gate' })), 201);
  ok(await F('DELETE', `/api/files/${ID.fp}`));
  ok(await F('DELETE', `/api/site-updates/${ID.fu}`));
});

test('foreman: delays editable, RFIs read-only, variations and history blocked', async () => {
  const r = await F('POST', `/api/projects/${ID.p}/delays`, { description: 'Rain', category: 'weather', days_impact: 1 }); ok(r, 201);
  ok(await F('PATCH', `/api/delays/${r.json.item.id}`, { days_impact: 2 }));
  ok(await F('POST', `/api/projects/${ID.p}/rfis`, { subject: 'nope' }), 403);
  ok(await F('PATCH', `/api/rfis/${ID.rfi}`, { status: 'CLOSED' }), 403);
  ok(await F('POST', `/api/projects/${ID.p}/variations`, { description: 'nope' }), 403);
  ok(await F('PATCH', `/api/variations/${ID.vo}`, { amount: 1 }), 403);
  ok(await F('DELETE', `/api/variations/${ID.vo}`), 403);
  ok(await F('POST', `/api/projects/${ID.p}/snapshots`, {}), 403);
  const c = await F('POST', `/api/projects/${ID.p}/comments`, { body: 'On it' }); ok(c, 201);
  ok(await F('DELETE', `/api/comments/${c.json.comment.id}`), 403);
});

test('foreman: no admin functions', async () => {
  ok(await F('GET', '/api/users'), 403);
  ok(await F('GET', `/api/projects/${ID.p}/audit`), 403);
  ok(await F('PUT', `/api/projects/${ID.p}/members/${ID.foreman}`, { preset: 'viewer' }), 403);
  ok(await F('PATCH', `/api/projects/${ID.p}`, { name: 'x' }), 403);
  for (const u of [`/api/projects/${ID.p}/report.pdf`, `/api/projects/${ID.p}/export`]) { const lt = (await F('POST', '/api/auth/link-token')).json.token; assert.equal((await api('GET', `${u}?t=${lt}`, null)).status, 403); }
});

test('gantt-only style custom access: sees the programme, nothing else', async () => {
  const r = await G('GET', `/api/projects/${ID.p}`); ok(r);
  assert.equal(r.json.permissions.gantt, 'view'); assert.equal(r.json.permissions.programme, 'edit');
  assert.equal(r.json.activities.length, 2);
  assert.deepEqual([r.json.rfis, r.json.variations, r.json.delays, r.json.comments], [[], [], [], []]);
  // custom was normalised: gantt can never be "edit"; programme edit lets them change the programme
  ok(await G('PATCH', `/api/activities/${ID.a2}`, { name: 'Footings (rev)' }));
  ok(await G('POST', `/api/projects/${ID.p}/comments`, { body: 'x' }), 403);
  ok(await G('POST', `/api/projects/${ID.p}/rfis`, { subject: 'x' }), 403);
});

test('client preset: no RFIs/variations/delays, can comment, cannot edit', async () => {
  const r = await C('GET', `/api/projects/${ID.p}`); ok(r);
  assert.deepEqual([r.json.rfis, r.json.variations, r.json.delays], [[], [], []]);
  assert.ok(r.json.site_updates.length >= 1);
  const list = (await C('GET', '/api/projects')).json.projects[0]; assert.equal(list.open_rfis, null); assert.equal(list.open_delays, null);
  ok(await C('POST', `/api/projects/${ID.p}/comments`, { body: 'Thanks' }), 201);
  ok(await C('PATCH', `/api/activities/${ID.a1}`, { actual_progress: 100 }), 403);
  ok(await C('POST', `/api/projects/${ID.p}/site-updates`, { progress_notes: 'x' }), 403);
});

test('admin changes access on the fly; takes effect immediately; hidden photos are blocked', async () => {
  // hide site updates + photos from the client: their photo URLs stop working too
  let r = await A('PUT', `/api/projects/${ID.p}/members/${ID.client}`, { permissions: { gantt: 'view', comments: 'view' } }); ok(r);
  assert.equal(r.json.member.preset, 'custom');
  r = await C('GET', `/api/projects/${ID.p}`); assert.deepEqual([r.json.site_updates, r.json.photos], [[], []]); assert.equal(r.json.activities.length, 2, 'Gantt access still shows the programme');
  assert.equal((await api('GET', `/api/files/${ID.adminPhoto}?t=${T.client}`, null)).status, 403);
  assert.equal((await api('GET', `/api/files/${ID.generalPhoto}?t=${T.client}`, null)).status, 403);
  ok(await C('POST', `/api/projects/${ID.p}/comments`, { body: 'x' }), 403);
  // demote foreman to viewer: can no longer update progress or post updates
  ok(await A('PUT', `/api/projects/${ID.p}/members/${ID.foreman}`, { preset: 'viewer' }));
  ok(await F('PATCH', `/api/activities/${ID.a1}`, { actual_progress: 80 }), 403);
  ok(await F('POST', `/api/projects/${ID.p}/site-updates`, { progress_notes: 'x' }), 403);
  // members listing shows presets
  const m = (await A('GET', `/api/projects/${ID.p}`)).json.members;
  assert.equal(m.find((x) => x.id === ID.foreman).preset, 'viewer'); assert.equal(m.find((x) => x.id === ID.client).preset, 'custom');
  // restore foreman, then revoke entirely
  ok(await A('PUT', `/api/projects/${ID.p}/members/${ID.foreman}`, { preset: 'foreman' }));
  ok(await F('PATCH', `/api/activities/${ID.a1}`, { actual_progress: 85 }));
  ok(await A('DELETE', `/api/projects/${ID.p}/members/${ID.foreman}`));
  ok(await F('GET', `/api/projects/${ID.p}`), 404);
  // re-grant without a body keeps nothing odd: defaults to viewer preset
  ok(await A('PUT', `/api/projects/${ID.p}/members/${ID.foreman}`));
  assert.equal((await A('GET', `/api/projects/${ID.p}`)).json.members.find((x) => x.id === ID.foreman).preset, 'viewer');
});

test('audit trail records access changes', async () => {
  const ev = (await A('GET', `/api/projects/${ID.p}/audit`)).json.events;
  assert.ok(ev.some((e) => e.entity === 'Access' && /Foreman/.test(e.summary)), JSON.stringify(ev.filter((e) => e.entity === 'Access')));
});

test('higher edit levels: gantt edit, "all" on updates/photos/comments/history, site-manager preset', async () => {
  const mk = async (key, email, access) => { const r = await A('POST', '/api/users', { name: key, email, password: 'Passw0rd!x', role: 'VIEWER', access }); ok(r, 201); ID[key] = r.json.user.id; T[key] = (await api('POST', '/api/auth/login', null, { email, password: 'Passw0rd!x' })).json.token; return as(key); };
  const proj = ID.p;
  // content authored by admin that others will try to change
  const upd = (await A('POST', `/api/projects/${proj}/site-updates`, { progress_notes: 'by admin' })).json.item.id;
  const ph = (await api('POST', `/api/projects/${proj}/files`, T.admin, photo({ site_update_id: upd }))).json.files[0].id;
  const adminComment = (await A('POST', `/api/projects/${proj}/comments`, { body: 'admin comment' })).json.comment.id;
  const snap = (await A('POST', `/api/projects/${proj}/snapshots`, { note: 'x' })).json.snapshot.id;

  // 1) Gantt edit only: can change dates (via Gantt) but still sees nothing else
  const GE = await mk('ganttEdit', 'ge@mf.test', [{ project_id: proj, permissions: { gantt: 'edit' } }]);
  ok(await GE('PATCH', `/api/activities/${ID.a1}`, { finish_date: d(8) }));
  assert.equal((await A('GET', `/api/projects/${proj}`)).json.activities.find((a) => a.id === ID.a1).finish_date, d(8));
  ok(await GE('POST', `/api/projects/${proj}/activities`, { name: 'Added from Gantt', start_date: d(20), finish_date: d(25) }), 201);
  ok(await GE('POST', `/api/projects/${proj}/rfis`, { subject: 'x' }), 403);
  assert.deepEqual((await GE('GET', `/api/projects/${proj}`)).json.site_updates, []);

  // 2) "edit" (own only) vs "all" (anyone's) on site updates + photos
  const own = await mk('ownEditor', 'oe@mf.test', [{ project_id: proj, permissions: { updates: 'edit', photos: 'edit', comments: 'edit', history: 'edit' } }]);
  ok(await own('PATCH', `/api/site-updates/${upd}`, { labour_count: 3 }), 403);
  ok(await own('DELETE', `/api/files/${ph}`), 403);
  ok(await own('DELETE', `/api/comments/${adminComment}`), 403);
  ok(await own('DELETE', `/api/snapshots/${snap}`), 403);
  ok(await own('PATCH', `/api/snapshots/${snap}`, { note: 'edited by editor' }));          // history edit may edit notes
  const all = await mk('allEditor', 'ae@mf.test', [{ project_id: proj, permissions: { updates: 'all', photos: 'all', comments: 'all', history: 'all', programme: 'view' } }]);
  ok(await all('PATCH', `/api/site-updates/${upd}`, { labour_count: 5 }));
  ok(await all('PATCH', `/api/files/${ph}`, { caption: 'fixed by manager' }));
  ok(await all('POST', `/api/projects/${proj}/comments`, { body: 'mine' }), 201);
  ok(await all('DELETE', `/api/comments/${adminComment}`));
  ok(await all('DELETE', `/api/snapshots/${snap}`));
  ok(await all('DELETE', `/api/files/${ph}`));
  ok(await all('DELETE', `/api/site-updates/${upd}`));
  ok(await all('PATCH', `/api/activities/${ID.a1}`, { actual_progress: 10 }), 403);

  // 3) Site manager preset = broad edit, but still no administration
  const mgr = await mk('mgr', 'mgr@mf.test', [{ project_id: proj, preset: 'manager' }]);
  ok(await mgr('POST', `/api/projects/${proj}/variations`, { description: 'from manager', amount: 5 }), 201);
  ok(await mgr('POST', `/api/projects/${proj}/rfis`, { subject: 'from manager' }), 201);
  ok(await mgr('PATCH', `/api/activities/${ID.a2}`, { start_date: d(12), finish_date: d(18) }));
  ok(await mgr('GET', '/api/users'), 403);
  ok(await mgr('PUT', `/api/projects/${proj}/members/${ID.mgr}`, { preset: 'viewer' }), 403);
  ok(await mgr('PATCH', `/api/projects/${proj}`, { name: 'x' }), 403);
  const m = (await A('GET', `/api/projects/${proj}`)).json.members.find((x) => x.id === ID.mgr); assert.equal(m.preset, 'manager');

  // 4) levels a section does not offer are normalised (e.g. programme "all" -> none; gantt "all" -> none)
  let r = await A('PUT', `/api/projects/${proj}/members/${ID.ownEditor}`, { permissions: { programme: 'all', gantt: 'edit', rfis: 'progress' } });
  ok(r); assert.deepEqual([r.json.member.permissions.programme, r.json.member.permissions.gantt, r.json.member.permissions.rfis], ['none', 'edit', 'none']);
});
