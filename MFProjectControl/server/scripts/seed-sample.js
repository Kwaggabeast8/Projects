// OPTIONAL: fills a RUNNING server with a sample project + test logins so you can click around.
// Never runs automatically. Usage:  node scripts/seed-sample.js [http://localhost:4000] [admin-email] [admin-password]
const BASE = process.argv[2] || 'http://localhost:4000';
const EMAIL = process.argv[3] || 'admin@mfbuilding.co.za';
const PASSWORD = process.argv[4] || 'ChangeMe-123';
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let token;
async function api(method, url, body) {
  const r = await fetch(BASE + '/api' + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url}: ${j.error || r.status}`);
  return j;
}
(async () => {
  token = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).token;
  const p = (await api('POST', '/projects', { name: 'Sample - Hillcrest Warehouse', client: 'Sample Client (Pty) Ltd', site: '12 Industrial Rd, Midrand', project_manager: 'Sample PM', baseline_start: day(-30), baseline_finish: day(120), forecast_finish: day(125) })).project.id;
  const act = async (b) => (await api('POST', `/projects/${p}/activities`, b)).activity.id;
  const a1 = await act({ name: 'Site establishment', start_date: day(-30), finish_date: day(-21), weight: 1, actual_progress: 100 });
  const a2 = await act({ name: 'Bulk earthworks', start_date: day(-20), finish_date: day(-1), weight: 3, actual_progress: 80, predecessors: [a1] });
  const a3 = await act({ name: 'Foundations', start_date: day(0), finish_date: day(25), weight: 4, actual_progress: 20, predecessors: [a2] });
  const m = await act({ name: 'Foundations complete', start_date: day(26), is_milestone: true, weight: 0, predecessors: [a3] });
  await act({ name: 'Steel erection', start_date: day(27), finish_date: day(70), weight: 6, predecessors: [m] });
  await act({ name: 'Roof and cladding', start_date: day(71), finish_date: day(100), weight: 4 });
  await api('POST', `/projects/${p}/rfis`, { subject: 'Confirm slab thickness', question: 'Is 200mm correct for the loading bay?', due_date: day(5) });
  await api('POST', `/projects/${p}/variations`, { description: 'Additional stormwater drainage', amount: 45250.5, time_impact_days: 3 });
  await api('POST', `/projects/${p}/delays`, { description: 'Heavy rain - excavation stopped', category: 'weather', days_impact: 2 });
  await api('POST', `/projects/${p}/site-updates`, { update_date: day(-1), progress_notes: 'Compaction complete on pad A', labour_count: 18, work_completed: 'Bulk earthworks pad A', current_work: 'Setting out foundations', upcoming_work: 'Excavate footings', pm_comments: 'On track.' });
  await api('POST', `/projects/${p}/snapshots`, { note: 'Sample snapshot' });
  const mk = async (name, email, preset) => { try { await api('POST', '/users', { name, email, password: 'Sample-1234', role: 'VIEWER', access: [{ project_id: p, preset }] }); } catch (e) { console.log('  (skipped ' + email + ': ' + e.message + ')'); } };
  await mk('Sample Foreman', 'foreman@sample.test', 'foreman');
  await mk('Sample Client', 'client@sample.test', 'client');
  await mk('Sample Site Manager', 'manager@sample.test', 'manager');
  console.log(`Sample data created. Logins (password Sample-1234): foreman@sample.test, client@sample.test, manager@sample.test`);
})().catch((e) => { console.error(e.message); process.exit(1); });
