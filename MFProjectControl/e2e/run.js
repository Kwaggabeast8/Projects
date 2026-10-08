// Browser end-to-end test of the real UI (Expo web build served by the API server).
const { chromium } = require('playwright-core');
const fs = require('fs'); const zlib = require('zlib');
const BASE = process.env.BASE || 'http://localhost:4100';
const OUT = process.env.OUT || '/tmp/claude-0/shots'; fs.mkdirSync(OUT, { recursive: true });

function png(w, h, rgb) { // solid-colour PNG with a gradient so it is recognisable
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = (rgb[1] + x) % 255; raw[o + 2] = (rgb[2] + y) % 255; } }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(OUT + '/site1.png', png(640, 480, [200, 80, 30]));
fs.writeFileSync(OUT + '/site2.png', png(640, 480, [30, 90, 180]));

let step = 0; const fails = [];
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails.push(name); };
const shot = async (page, name) => page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: false });
const modal = (page) => page; // modals render in-page
const field = (page, label) => page.locator(`xpath=(//*[starts-with(normalize-space(text()), "${label}")])[last()]/following::*[self::input or self::textarea][1]`);
const btn = (page, name, opts = {}) => page.getByRole('button', { name, exact: opts.exact !== false }).last();
const text = (page, t) => page.getByText(t, { exact: false }).first();
const visible = async (page, t, timeout = 6000) => { try { await page.getByText(t, { exact: false }).first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; } };
const gone = async (page, t, timeout = 6000) => { try { await page.getByText(t, { exact: false }).first().waitFor({ state: 'hidden', timeout }); return true; } catch { return false; } };

async function login(page, email, pw) {
  await page.goto(BASE); await page.waitForTimeout(800);
  await field(page, 'Email').fill(email); await field(page, 'Password').fill(pw); await btn(page, 'Sign in').click();
}
async function logout(page) { await page.getByText('account', { exact: false }).first().click(); await btn(page, 'Sign out').click(); await page.getByText('Sign in', { exact: true }).first().waitFor(); }
const today = new Date(); const iso = (n) => { const d = new Date(today.getTime() + n * 86400000); return d.toISOString().slice(0, 10); };
async function chooseFiles(page, buttonName, files) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), btn(page, buttonName).click()]);
  await fc.setFiles(files);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); fails.push('pageerror ' + e.message); });
  page.on('dialog', (d) => d.accept());

  // ---- login (bad then good) ----
  await login(page, 'admin@mf.test', 'wrong');
  ok('bad password shows error', await visible(page, 'Incorrect email or password'));
  await field(page, 'Password').fill('AdminPass123'); await btn(page, 'Sign in').click();
  ok('admin signs in -> empty real dashboard (no demo data)', await visible(page, 'No projects yet'));
  await shot(page, 'dashboard-empty');

  // ---- create project ----
  await btn(page, '+ New project').click();
  await field(page, 'Project name').fill('Hillcrest Warehouse');
  await field(page, 'Client').fill('Acme Logistics'); await field(page, 'Site address').fill('12 Industrial Rd, Midrand');
  await field(page, 'Project manager').fill('Mike Fourie');
  await field(page, 'Baseline start').fill(iso(-20)); await field(page, 'Baseline finish').fill(iso(80)); await field(page, 'Forecast').fill(iso(85));
  await btn(page, 'Save').click();
  ok('project created and opened', await visible(page, 'Hillcrest Warehouse') && await visible(page, 'Acme Logistics'));

  // ---- programme: add activities ----
  await page.getByText('Programme', { exact: true }).first().click();
  ok('empty programme prompt', await visible(page, 'No activities yet'));
  const addAct = async (name, start, finish, weight, prog, extra) => {
    await btn(page, '+ Add activity').click();
    await field(page, 'Activity name').fill(name);
    if (extra && extra.milestone) { await page.getByText('This is a milestone', { exact: false }).click(); await field(page, 'Start date').fill(start); }
    else { await field(page, 'Start date').fill(start); await field(page, 'Finish date').fill(finish); }
    await field(page, 'Weight').fill(String(weight)); await field(page, 'Actual progress').fill(String(prog));
    if (extra && extra.pred) await page.getByText(extra.pred, { exact: false }).last().click();
    await btn(page, 'Save').click(); await visible(page, 'Activity saved');
    await gone(page, 'Activity saved', 5000).catch(() => {});
  };
  await addAct('Site establishment', iso(-20), iso(-11), 1, 100);
  await addAct('Foundations', iso(-10), iso(9), 3, 40, { pred: '1. Site establishment' });
  await addAct('Foundations complete', iso(10), null, 0, 0, { milestone: true, pred: '2. Foundations' });
  await addAct('Superstructure', iso(11), iso(60), 6, 0, { pred: '3. Foundations complete' });
  ok('4 activities listed', await visible(page, '4. Superstructure') && await visible(page, '3. ◆ Foundations complete'));
  ok('duration auto-calculated (20 days)', await visible(page, '20 days'));
  ok('weighted progress shown', await visible(page, 'Variance'));
  await shot(page, 'programme-list');

  // quick progress + edit with date/duration linking
  await page.getByText('Foundations', { exact: true }).first().waitFor().catch(() => {});
  await page.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  await field(page, 'Duration').fill('25');
  const fin = await field(page, 'Finish date').inputValue();
  ok('editing duration updates finish date', fin === iso(-10 + 24));
  await field(page, 'Actual progress').fill('50'); await btn(page, 'Save').click();
  ok('edit saved + dependants shifted message', await visible(page, 'moved to follow'));
  await page.reload(); await page.waitForTimeout(1200);
  ok('after reload: still on project programme', await visible(page, 'Hillcrest Warehouse'));
  await page.getByText('Programme', { exact: true }).first().click();
  ok('edit persisted across reload (25 days)', await visible(page, '25 days'));
  // reorder
  await page.getByLabel('Move down').first().click(); await page.waitForTimeout(800);
  ok('reorder: Site establishment moved down', await visible(page, '2. Site establishment'));
  await page.getByLabel('Move up').nth(1).click(); await page.waitForTimeout(800);
  ok('reorder back', await visible(page, '1. Site establishment'));
  // gantt
  await page.getByText('Gantt chart', { exact: true }).click(); await page.waitForTimeout(600);
  await shot(page, 'gantt-mobile');
  ok('gantt shows activities', await visible(page, '2. Foundations'));
  await page.getByText('Days', { exact: true }).click(); await page.waitForTimeout(300);
  await page.getByText('Activity list', { exact: true }).click();

  // ---- RFI ----
  await page.getByText('RFIs', { exact: true }).first().click();
  await btn(page, '+ New RFI').click();
  await field(page, 'Subject').fill('Confirm slab thickness'); await field(page, 'Question').fill('Is 200mm correct?'); await field(page, 'Due date').fill(iso(5));
  await btn(page, 'Save').click(); ok('RFI created with auto number', await visible(page, 'RFI-001'));
  await page.reload(); await page.waitForTimeout(1200); await page.getByText('RFIs', { exact: true }).first().click();
  ok('RFI survives reload', await visible(page, 'Confirm slab thickness'));
  await page.getByText('Tap to edit').first().click(); await page.getByText('Closed', { exact: true }).last().click(); await field(page, 'Response').fill('Yes, 200mm'); await btn(page, 'Save').click();
  ok('RFI closed with response + date', await visible(page, 'Response: Yes, 200mm') && await visible(page, 'Closed '));

  // ---- Variation ----
  await page.getByText('Variations', { exact: true }).first().click();
  await btn(page, '+ New variation').click();
  await field(page, 'Description').fill('Additional stormwater drainage'); await field(page, 'Value').fill('45250.50'); await field(page, 'Time impact').fill('3');
  await btn(page, 'Save').click(); ok('variation created (VO-001, Rand value)', await visible(page, 'VO-001') && await visible(page, 'R 45 250.50'));
  await page.getByText('Tap to edit').first().click(); await page.getByText('Approved', { exact: true }).last().click(); await btn(page, 'Save').click();
  ok('variation approval updated', await visible(page, 'Approved'));

  // ---- Delay ----
  await page.getByText('Delays', { exact: true }).first().click();
  await btn(page, '+ Record delay').click();
  await field(page, 'Description').fill('Heavy rain stopped excavation'); await field(page, 'Days impact').fill('2'); await btn(page, 'Save').click();
  ok('delay recorded', await visible(page, 'Heavy rain stopped excavation') && await visible(page, '1 open'));

  // ---- Site update with photos ----
  await page.getByText('Site updates', { exact: true }).first().click();
  await btn(page, '+ New update').click();
  await field(page, 'Progress notes').fill('Footings poured to grid A-D'); await field(page, 'Labour count').fill('14');
  await field(page, 'Material deliveries').fill('20m3 concrete'); await field(page, 'Work completed').fill('Footings poured and cured');
  await field(page, 'Current work').fill('Stripping shutters'); await field(page, 'Upcoming work').fill('Backfill and compaction');
  await field(page, 'Problems').fill('Rain forecast Thursday'); await field(page, 'Project manager comments').fill('Good progress this week.');
  await chooseFiles(page, 'Choose from gallery', [OUT + '/site1.png', OUT + '/site2.png']);
  await page.waitForTimeout(500);
  await shot(page, 'site-update-form');
  await page.getByPlaceholder('Caption').first().fill('Footings poured');
  await btn(page, 'Save').click();
  ok('site update saved with photos', await visible(page, 'Saved with 2 photos'));
  await page.reload(); await page.waitForTimeout(1500); await page.getByText('Site updates', { exact: true }).first().click(); await page.waitForTimeout(800);
  ok('site update details persisted', await visible(page, 'Footings poured and cured') && await visible(page, 'Rain forecast Thursday'));
  const imgs = await page.locator('img').evaluateAll((els) => els.filter((e) => e.src.includes('/api/files/')).map((e) => ({ w: e.naturalWidth, src: e.src })));
  ok('photos display after reload (2 images loaded from cloud storage)', imgs.length >= 2 && imgs.every((i) => i.w === 640));
  await shot(page, 'site-update-photos');

  // ---- snapshot ----
  await page.getByText('History', { exact: true }).first().click();
  await field(page, 'Take a progress snapshot').fill('Week 3 - footings'); await btn(page, 'Save snapshot').click();
  ok('snapshot saved + listed', await visible(page, 'Week 3 - footings'));
  ok('audit history shows events', await visible(page, 'Create Activity'));
  await shot(page, 'history');

  // ---- users: create viewer, assign project ----
  await btn(page, 'Users').click();
  await btn(page, '+ Add user').click();
  await field(page, 'Full name').fill('Client Viewer'); await field(page, 'Email').fill('viewer@client.test'); await field(page, 'Password').fill('ViewerPass123');
  await page.getByText('Hillcrest Warehouse', { exact: true }).last().click();
  await btn(page, 'Save').click();
  ok('viewer user created with project access', await visible(page, 'Client Viewer') && await visible(page, 'Hillcrest Warehouse') && await visible(page, 'Viewer / Commenter'));
  await shot(page, 'users');

  // ---- report PDF (admin) ----
  await page.getByLabel('Back').click(); await page.getByText('Hillcrest Warehouse').first().click();
  ok('dashboard shows real project metrics', true);
  await page.getByText('Manage', { exact: true }).first().click();
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  await btn(page, 'Generate PDF report').click(); await page.waitForTimeout(800);
  const pdfUrl = await page.evaluate(() => window.__opened[0]); if (!pdfUrl) { await shot(page, 'manage-debug'); console.log('no url; toast?', await page.locator('body').innerText().then((t) => t.slice(-300))); }
  const pdfRes = await ctx.request.get(pdfUrl.startsWith('http') ? pdfUrl : BASE + pdfUrl);
  const pdfBuf = await pdfRes.body();
  ok('report PDF generated from UI', pdfRes.status() === 200 && pdfBuf.subarray(0, 5).toString() === '%PDF-');
  fs.writeFileSync(OUT + '/report.pdf', pdfBuf);
  await shot(page, 'manage');

  // ---- viewer ----
  await logout(page);
  await login(page, 'viewer@client.test', 'ViewerPass123');
  ok('viewer sees assigned project', await visible(page, 'Hillcrest Warehouse'));
  ok('viewer has no Users button / New project', (await page.getByRole('button', { name: 'Users' }).count()) === 0 && (await page.getByRole('button', { name: '+ New project' }).count()) === 0);
  await page.getByText('Hillcrest Warehouse').first().click();
  ok('viewer has no Manage tab', (await page.getByText('Manage', { exact: true }).count()) === 0);
  await page.getByText('Programme', { exact: true }).first().click();
  ok('viewer sees programme + progress', await visible(page, '2. Foundations') && await visible(page, 'Variance'));
  ok('viewer has no edit / add / move controls', (await btn(page, '+ Add activity').count()) === 0 && (await page.getByLabel('Move down').count()) === 0 && (await page.getByRole('button', { name: 'Edit' }).count()) === 0);
  await shot(page, 'viewer-programme');
  for (const [tab, add] of [['RFIs', '+ New RFI'], ['Variations', '+ New variation'], ['Delays', '+ Record delay'], ['Site updates', '+ New update']]) {
    await page.getByText(tab, { exact: true }).first().click(); await page.waitForTimeout(300);
    ok(`viewer cannot add in ${tab}`, (await page.getByRole('button', { name: add }).count()) === 0);
  }
  await page.getByText('Comments', { exact: true }).first().click();
  await page.getByPlaceholder('Add a comment...').fill('Please confirm the slab pour date.');
  await chooseFiles(page, 'Choose from gallery', [OUT + '/site2.png']);
  await btn(page, 'Post comment').click();
  ok('viewer comment posted', await visible(page, 'Comment posted'));
  await page.reload(); await page.waitForTimeout(1500); await page.getByText('Comments', { exact: true }).first().click(); await page.waitForTimeout(800);
  ok('comment + photo persisted after reload', await visible(page, 'Please confirm the slab pour date.') && (await page.locator('img').evaluateAll((e) => e.filter((x) => x.src.includes('/api/files/') && x.naturalWidth === 640).length)) >= 1);
  ok('viewer cannot delete comments', (await page.getByRole('button', { name: 'Delete' }).count()) === 0);
  await shot(page, 'viewer-comments');
  // server-side enforcement from the viewer's own browser session
  const vtoken = await page.evaluate(() => localStorage.getItem('mf_token'));
  const r = await page.evaluate(async (t) => (await fetch('/api/projects/1/activities', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'hack', start_date: '2026-01-01' }) })).status, vtoken);
  ok('server rejects viewer write (403)', r === 403);
  await logout(page);

  // ---- foreman: limited access ----
  await login(page, 'admin@mf.test', 'AdminPass123');
  await btn(page, 'Users').click(); await btn(page, '+ Add user').click();
  await field(page, 'Full name').fill('Site Foreman'); await field(page, 'Email').fill('foreman@mf.test'); await field(page, 'Password').fill('ForemanPass123');
  await page.getByText('Foreman (site)', { exact: true }).last().click();
  await page.getByText('Hillcrest Warehouse', { exact: true }).last().click();
  await btn(page, 'Save').click();
  ok('foreman created with Foreman preset on the project', await visible(page, 'Site Foreman') && await visible(page, 'Foreman (site)'));
  await shot(page, 'users-foreman');
  // open per-project access editor from the Users list
  await page.getByText('Hillcrest Warehouse', { exact: true }).last().click();
  ok('access editor lists every section', await visible(page, 'Gantt chart') && await visible(page, 'Update progress %') && await visible(page, 'Site updates'));
  await shot(page, 'access-editor');
  await page.getByLabel('Back').click().catch(() => {});
  await page.reload(); await page.waitForTimeout(800);
  await logout(page);
  await login(page, 'foreman@mf.test', 'ForemanPass123');
  await page.getByText('Hillcrest Warehouse').first().click(); await page.waitForTimeout(500);
  ok('foreman lands straight on Site updates with a New update button', await visible(page, '+ New update'));
  ok('foreman sees Programme, Site updates, RFIs, Delays, Comments', await visible(page, 'Programme') && (await page.getByText('Site updates', { exact: true }).count()) > 0 && (await page.getByText('RFIs', { exact: true }).count()) > 0);
  ok('foreman does NOT see Variations / History / Manage tabs', (await page.getByText('Variations', { exact: true }).count()) === 0 && (await page.getByText('History', { exact: true }).count()) === 0 && (await page.getByText('Manage', { exact: true }).count()) === 0);
  await shot(page, 'foreman-overview');
  await page.getByText('Programme', { exact: true }).first().click(); await page.waitForTimeout(400);
  ok('foreman cannot add / edit / reorder activities', (await btn(page, '+ Add activity').count()) === 0 && (await page.getByRole('button', { name: 'Edit', exact: true }).count()) === 0 && (await page.getByLabel('Move down').count()) === 0);
  await page.getByText('75%', { exact: true }).nth(1).click(); await page.waitForTimeout(800);
  const ftoken = await page.evaluate(() => localStorage.getItem('mf_token'));
  const prog = await page.evaluate(async (t) => (await (await fetch('/api/projects/1', { headers: { Authorization: 'Bearer ' + t } })).json()).activities.map((a) => [a.name, a.actual_progress]), ftoken);
  ok('foreman updated progress from site (quick % buttons) and it saved', prog.some(([n, p]) => n === 'Foundations' && p === 75));
  const hack = await page.evaluate(async (t) => (await fetch('/api/activities/1', { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ finish_date: '2030-01-01' }) })).status, ftoken);
  ok('server rejects foreman changing dates (403)', hack === 403);
  ok('foreman can see the Gantt', await page.getByText('Gantt chart', { exact: true }).count() > 0);
  await page.getByText('Site updates', { exact: true }).first().click();
  await btn(page, '+ New update').click();
  await field(page, 'Progress notes').fill('Foreman: slab shutters fixed'); await field(page, 'Labour count').fill('22'); await field(page, 'Work completed').fill('Shutters complete');
  await chooseFiles(page, 'Choose from gallery', [OUT + '/site1.png']);
  await btn(page, 'Save').click();
  ok('foreman added a site update with a photo', await visible(page, 'Saved with 1 photo'));
  await page.reload(); await page.waitForTimeout(1500); await page.getByText('Site updates', { exact: true }).first().click(); await page.waitForTimeout(800);
  ok('foreman update persisted; foreman can edit own but not the admin one', await visible(page, 'Foreman: slab shutters fixed') && (await page.getByRole('button', { name: 'Edit', exact: true }).count()) === 1);
  await shot(page, 'foreman-updates');
  await logout(page);
  // admin switches the foreman's Site updates off
  await login(page, 'admin@mf.test', 'AdminPass123');
  await page.getByText('Hillcrest Warehouse').first().click(); await page.getByText('Manage', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Access', exact: true }).nth(1).click();
  await page.locator('xpath=(//*[normalize-space(text())="Site updates"])[last()]/following::*[normalize-space(text())="No access"][1]').click();
  await btn(page, 'Save access').click();
  ok('admin changed access (now Custom)', await visible(page, 'Access saved') && await visible(page, 'Custom'));
  await logout(page);
  await login(page, 'foreman@mf.test', 'ForemanPass123'); await page.getByText('Hillcrest Warehouse').first().click(); await page.waitForTimeout(600);
  ok('foreman no longer sees the Site updates tab', (await page.getByText('Site updates', { exact: true }).count()) === 0 && await visible(page, 'Programme'));
  await shot(page, 'foreman-restricted');
  await logout(page);

  // ---- upgrade foreman to Site manager preset (edit rights across sections) ----
  await login(page, 'admin@mf.test', 'AdminPass123');
  await page.getByText('Hillcrest Warehouse').first().click(); await page.getByText('Manage', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Access', exact: true }).nth(1).click();
  ok('editor offers edit levels beyond view (Gantt edit, everyone\'s updates, delete any comment)', await visible(page, 'Edit dates & progress') && await visible(page, "Edit everyone's") && await visible(page, 'Post + delete any'));
  await page.getByText('Site manager (broad edit)', { exact: true }).last().click();
  await btn(page, 'Save access').click();
  ok('preset applied', await visible(page, 'Access saved') && await visible(page, 'Site manager (broad edit)'));
  await logout(page);
  await login(page, 'foreman@mf.test', 'ForemanPass123'); await page.getByText('Hillcrest Warehouse').first().click(); await page.waitForTimeout(600);
  ok('site manager now sees Variations + History + Site updates tabs, still no Manage', (await page.getByText('Variations', { exact: true }).count()) > 0 && (await page.getByText('History', { exact: true }).count()) > 0 && (await page.getByText('Site updates', { exact: true }).count()) > 0 && (await page.getByText('Manage', { exact: true }).count()) === 0);
  await page.getByText('Programme', { exact: true }).first().click();
  await page.getByText('Gantt chart', { exact: true }).click(); await page.waitForTimeout(500);
  await page.getByText('2. Foundations', { exact: false }).first().click();
  ok('can edit activity dates from the Gantt', await visible(page, 'Edit activity') && await visible(page, 'Finish date'));
  await page.getByText('×', { exact: true }).last().click();
  await page.getByText('Variations', { exact: true }).first().click();
  await btn(page, '+ New variation').click(); await field(page, 'Description').fill('Raised by site manager'); await field(page, 'Value').fill('1500'); await btn(page, 'Save').click();
  ok('site manager can add a variation', await visible(page, 'Raised by site manager'));
  await shot(page, 'site-manager-variation');
  await logout(page);

  // ---- admin deletes comment, realtime in 2nd context ----
  await login(page, 'admin@mf.test', 'AdminPass123');
  await page.getByText('Hillcrest Warehouse').first().click(); await page.getByText('Comments', { exact: true }).first().click();
  ok('admin sees viewer comment', await visible(page, 'Please confirm the slab pour date.'));
  const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } }); const page2 = await ctx2.newPage();
  await login(page2, 'admin@mf.test', 'AdminPass123'); await page2.getByText('Hillcrest Warehouse').first().click(); await page2.getByText('Delays', { exact: true }).first().click();
  await page.getByText('Delays', { exact: true }).first().click(); await btn(page, '+ Record delay').click();
  await field(page, 'Description').fill('Subcontractor no-show'); await page.getByText('Subcontractor', { exact: true }).last().click(); await field(page, 'Days impact').fill('1'); await btn(page, 'Save').click();
  ok('realtime: 2nd device updates without refresh', await visible(page2, 'Subcontractor no-show', 8000));
  await shot(page2, 'desktop-delays');
  await page.getByText('Comments', { exact: true }).first().click();
  await btn(page, 'Delete').first().click(); await btn(page, 'Delete').last().click();
  ok('admin deleted comment', await gone(page, 'Please confirm the slab pour date.'));
  await ctx2.close();

  // dashboard
  await page.getByLabel('Back').click(); await page.waitForTimeout(800); await shot(page, 'dashboard');
  ok('dashboard card: client, PM, variance, open RFIs/delays', await visible(page, 'Acme Logistics') && await visible(page, 'Open RFIs') && await visible(page, 'Delays:'));

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(' | ')}` : '\nALL E2E CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });
