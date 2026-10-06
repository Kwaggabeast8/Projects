// Client progress report (PDF) for MF Building Civils & Development.
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const calc = require('./calc');

const C = { navy: '#12263F', orange: '#E8731A', ink: '#1F2933', grey: '#6B7785', light: '#EEF1F5', line: '#D5DBE3', green: '#2E8B57', red: '#C0392B', amber: '#D68910', blue: '#2F6DB5' };
const M = 40, W = 595.28, H = 841.89, CW = W - M * 2;

const fmtDate = (s) => {
  if (!s) return '-';
  const d = new Date(s + 'T00:00:00Z');
  return `${String(d.getUTCDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const rand = (n) => 'R ' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pct = (n) => `${Number(n).toFixed(1)}%`;
const sgn = (n) => `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

function statusColor(status) {
  if (/Ahead|On programme|Completed/.test(status)) return C.green;
  if (/Slightly/.test(status)) return C.amber;
  if (/Behind/.test(status)) return C.red;
  return C.grey;
}

function buildReport({ bundle, from, to, include, uploadsDir, stored }) {
  const { project: p, summary: s, activities: acts } = bundle;
  const doc = new PDFDocument({ size: 'A4', margins: { top: M, left: M, right: M, bottom: 0 }, bufferPages: true, info: { Title: `Progress Report - ${p.name}`, Author: 'MF Building Civils & Development', Subject: `Reporting period ${from} to ${to}` } });
  let y = M;
  const bottom = H - 60;

  const space = (h) => { if (y + h > bottom) { doc.addPage(); y = 70; pageHeader(); } };
  function pageHeader() {
    doc.rect(0, 0, W, 8).fill(C.navy);
    doc.rect(0, 8, W, 2).fill(C.orange);
    doc.font('Helvetica').fontSize(8).fillColor(C.grey).text(`${p.name}  |  Progress report ${fmtDate(from)} - ${fmtDate(to)}`, M, 28, { width: CW, align: 'right', lineBreak: false });
  }
  function logo(x, yy, size) {
    doc.rect(x, yy, size, size).fill(C.orange);
    doc.font('Helvetica-Bold').fontSize(size * 0.5).fillColor('#fff').text('MF', x, yy + size * 0.24, { width: size, align: 'center', lineBreak: false });
  }
  function heading(text) {
    space(60);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.navy).text(text, M, y, { lineBreak: false });
    y += 20;
    doc.rect(M, y, 40, 2.5).fill(C.orange); doc.rect(M + 40, y + 0.75, CW - 40, 1).fill(C.line);
    y += 12;
  }
  function para(text, opts = {}) {
    const f = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
    doc.font(f).fontSize(opts.size || 9.5).fillColor(opts.color || C.ink);
    const h = doc.heightOfString(text, { width: opts.width || CW, lineGap: 2 });
    space(Math.min(h, 120) + 4);
    doc.text(text, opts.x || M, y, { width: opts.width || CW, lineGap: 2 });
    y += h + (opts.after ?? 4);
  }
  function bullets(lines) {
    for (const l of lines) {
      doc.font('Helvetica').fontSize(9.5);
      const h = doc.heightOfString(l, { width: CW - 14, lineGap: 2 });
      space(h + 3);
      doc.circle(M + 4, y + 5, 1.6).fill(C.orange);
      doc.fillColor(C.ink).text(l, M + 14, y, { width: CW - 14, lineGap: 2 });
      y += h + 3;
    }
  }
  // Generic table. cols: [{h, w (fraction), key|fn, align}]
  function table(cols, rows, { empty = 'None recorded.' } = {}) {
    if (!rows.length) { para(empty, { color: C.grey }); return; }
    const widths = cols.map((c) => c.w * CW);
    const drawHead = () => {
      space(30);
      doc.rect(M, y, CW, 18).fill(C.navy);
      let x = M;
      cols.forEach((c, i) => { doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text(c.h, x + 5, y + 5, { width: widths[i] - 10, align: c.align || 'left', lineBreak: false }); x += widths[i]; });
      y += 18;
    };
    drawHead();
    rows.forEach((r, ri) => {
      doc.font('Helvetica').fontSize(8.5);
      const cells = cols.map((c) => String(c.fn ? c.fn(r) : r[c.key] ?? ''));
      const rh = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 10 })), 10) + 8;
      if (y + rh > bottom) { doc.addPage(); y = 70; pageHeader(); drawHead(); }
      if (ri % 2 === 0) doc.rect(M, y, CW, rh).fill(C.light);
      let x = M;
      cells.forEach((t, i) => { doc.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(t, x + 5, y + 4, { width: widths[i] - 10, align: cols[i].align || 'left' }); x += widths[i]; });
      y += rh;
    });
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.line).lineWidth(0.5).stroke();
    y += 10;
  }
  function bar(x, yy, w, hgt, value, color) {
    doc.roundedRect(x, yy, w, hgt, hgt / 2).fill(C.line);
    const fw = Math.max(0, Math.min(100, value)) / 100 * w;
    if (fw > 0) doc.roundedRect(x, yy, Math.max(fw, hgt), hgt, hgt / 2).fill(color);
  }

  // ---------- Cover / summary ----------
  doc.rect(0, 0, W, 190).fill(C.navy);
  doc.rect(0, 190, W, 4).fill(C.orange);
  logo(M, 36, 54);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#fff').text('MF BUILDING CIVILS & DEVELOPMENT', M + 68, 42, { lineBreak: false });
  doc.font('Helvetica').fontSize(9.5).fillColor('#B8C4D4').text('Construction progress and programme report', M + 68, 64, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.orange).text('CLIENT PROGRESS REPORT', M, 112, { lineBreak: false, characterSpacing: 1.5 });
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#fff').text(p.name, M, 128, { width: CW, height: 56, ellipsis: true });
  y = 214;

  const info = [
    ['Client', p.client], ['Site', p.site], ['Project manager', p.project_manager],
    ['Reporting period', `${fmtDate(from)} to ${fmtDate(to)}`], ['Baseline start', fmtDate(p.baseline_start || s.programme_start)],
    ['Baseline completion', fmtDate(p.baseline_finish)], ['Forecast completion', fmtDate(s.forecast_finish)], ['Report date', fmtDate(calc.today())],
  ];
  const colW = CW / 2;
  info.forEach(([k, v], i) => {
    const cx = M + (i % 2) * colW; const cy = y + Math.floor(i / 2) * 30;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.grey).text(k.toUpperCase(), cx, cy, { lineBreak: false, characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.ink).text(v || '-', cx, cy + 10, { width: colW - 12, height: 14, ellipsis: true });
  });
  y += Math.ceil(info.length / 2) * 30 + 6;

  // KPI cards
  const kw = (CW - 30) / 4;
  const kpis = [
    ['ACTUAL PROGRESS', pct(s.actual), C.blue], ['PLANNED PROGRESS', pct(s.planned), C.grey],
    ['VARIANCE', sgn(s.variance), s.variance >= 0 ? C.green : s.variance >= -10 ? C.amber : C.red],
    ['PROGRAMME STATUS', s.programme_status, statusColor(s.programme_status)],
  ];
  kpis.forEach(([k, v, col], i) => {
    const x = M + i * (kw + 10);
    doc.roundedRect(x, y, kw, 66, 4).fill(C.light);
    doc.rect(x, y, 4, 66).fill(col);
    doc.font('Helvetica').fontSize(7).fillColor(C.grey).text(k, x + 12, y + 10, { width: kw - 16, lineBreak: false, characterSpacing: 0.5 });
    const big = i < 3;
    doc.font('Helvetica-Bold').fontSize(big ? 20 : 11.5).fillColor(col).text(v, x + 12, y + (big ? 26 : 29), { width: kw - 16, height: 32 });
  });
  y += 82;

  // progress bars
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text('Actual', M, y + 1, { lineBreak: false });
  bar(M + 55, y, CW - 110, 9, s.actual, C.blue);
  doc.font('Helvetica').text(pct(s.actual), M + CW - 45, y + 1, { width: 45, align: 'right', lineBreak: false });
  y += 18;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text('Planned', M, y + 1, { lineBreak: false });
  bar(M + 55, y, CW - 110, 9, s.planned, C.grey);
  doc.font('Helvetica').text(pct(s.planned), M + CW - 45, y + 1, { width: 45, align: 'right', lineBreak: false });
  y += 28;

  heading('Executive summary');
  const dir = s.variance > 0.05 ? `${Math.abs(s.variance).toFixed(1)}% ahead of` : s.variance < -0.05 ? `${Math.abs(s.variance).toFixed(1)}% behind` : 'on';
  const openDelays = bundle.delays.filter((d) => d.status === 'OPEN');
  const delayDays = openDelays.reduce((t, d) => t + d.days_impact, 0);
  let summary = `As at ${fmtDate(to)}, overall weighted progress is ${pct(s.actual)} against a planned ${pct(s.planned)}, placing the project ${dir} programme (${s.programme_status}).`;
  if (p.baseline_finish) summary += ` Baseline completion is ${fmtDate(p.baseline_finish)}; current forecast completion is ${fmtDate(s.forecast_finish)}.`;
  if (include.has('delays')) summary += openDelays.length ? ` There ${openDelays.length === 1 ? 'is 1 open delay' : `are ${openDelays.length} open delays`} with a recorded impact of ${delayDays} day${delayDays === 1 ? '' : 's'}.` : ' No programme delays are currently open.';
  if (include.has('rfis')) { const n = bundle.rfis.filter((r) => r.status !== 'CLOSED').length; summary += ` ${n} RFI${n === 1 ? ' is' : 's are'} currently open.`; }
  para(summary);

  // ---------- Gantt ----------
  y += 6; space(150);
  heading('Construction programme');
  if (!acts.length) para('No programme activities have been captured yet.', { color: C.grey });
  else gantt();

  function gantt() {
    const labelW = 175, gx = M + labelW, gw = CW - labelW, rowH = 17;
    const min = acts.reduce((m, a) => (a.start_date < m ? a.start_date : m), acts[0].start_date);
    const max0 = acts.reduce((m, a) => (a.finish_date > m ? a.finish_date : m), acts[0].finish_date);
    let lo = min < to ? min : to; let hi = max0 > to ? max0 : to;
    if (p.baseline_finish && p.baseline_finish > hi) hi = p.baseline_finish;
    const total = Math.max(calc.diffDays(lo, hi) + 1, 14);
    const px = (d) => gx + (calc.diffDays(lo, d) / total) * gw;
    const pxEnd = (d) => gx + ((calc.diffDays(lo, d) + 1) / total) * gw;

    const header = () => {
      doc.rect(M, y, CW, 26).fill(C.navy);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text('Activity', M + 5, y + 9, { lineBreak: false });
      // month ticks
      const d0 = new Date(lo + 'T00:00:00Z'); let cur = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1));
      const step = total > 420 ? 3 : 1;
      while (cur.toISOString().slice(0, 10) <= hi) {
        const ds = cur.toISOString().slice(0, 10); const x = Math.max(gx, px(ds < lo ? lo : ds));
        const label = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}`;
        if (x < gx + gw - 30) { doc.moveTo(x, y + 4).lineTo(x, y + 26).strokeColor('#4B6280').lineWidth(0.5).stroke(); doc.font('Helvetica').fontSize(7).fillColor('#fff').text(label, x + 2, y + 10, { lineBreak: false }); }
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + step, 1));
      }
      y += 26;
    };
    const monthLines = (y0, y1) => {
      const d0 = new Date(lo + 'T00:00:00Z'); let cur = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1));
      while (cur.toISOString().slice(0, 10) <= hi) {
        const x = px(cur.toISOString().slice(0, 10)); doc.moveTo(x, y0).lineTo(x, y1).strokeColor('#E3E8EE').lineWidth(0.4).stroke();
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
      }
    };
    let pageStart = y; header(); let rowsStart = y;
    const endPage = () => {
      monthLines(rowsStart, y);
      if (to >= lo && to <= hi) { const tx = px(to); doc.moveTo(tx, rowsStart).lineTo(tx, y).strokeColor(C.red).lineWidth(1).dash(3, { space: 2 }).stroke().undash(); }
    };
    const pos = new Map();
    acts.forEach((a, i) => {
      if (y + rowH > bottom - 24) { endPage(); doc.addPage(); y = 70; pageHeader(); pageStart = y; header(); rowsStart = y; }
      if (i % 2 === 0) doc.rect(M, y, CW, rowH).fill('#F6F8FA');
      doc.font(a.is_milestone ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(C.ink).text(`${i + 1}. ${a.name}`, M + 4, y + 5, { width: labelW - 8, height: 9, ellipsis: true, lineBreak: false });
      const by = y + 4, bh = rowH - 8;
      if (a.is_milestone) {
        const cx = px(a.finish_date) + (gw / total) / 2, cy = y + rowH / 2;
        const col = a.actual_progress >= 100 ? C.green : C.navy;
        doc.polygon([cx - 5, cy], [cx, cy - 5], [cx + 5, cy], [cx, cy + 5]).fill(col);
        pos.set(a.id, { l: cx, r: cx, y: cy });
      } else {
        const x1 = px(a.start_date), x2 = pxEnd(a.finish_date), w = Math.max(x2 - x1, 2);
        doc.rect(x1, by, w, bh).fill('#C9D3E0');
        const ap = calc.plannedFor(a, to);
        doc.rect(x1, by + bh - 2, w * ap / 100, 2).fill(C.grey);   // planned marker
        if (a.actual_progress > 0) doc.rect(x1, by, w * Math.min(a.actual_progress, 100) / 100, bh - 2).fill(a.actual_progress >= 100 ? C.green : C.blue);
        doc.rect(x1, by, w, bh).lineWidth(0.4).strokeColor('#8896A9').stroke();
        if (w > 28) doc.font('Helvetica-Bold').fontSize(6.5).fillColor(a.actual_progress > 55 ? '#fff' : C.ink).text(`${Math.round(a.actual_progress)}%`, x1, by + 1.8, { width: w, align: 'center', lineBreak: false });
        pos.set(a.id, { l: x1, r: x1 + w, y: y + rowH / 2 });
      }
      y += rowH;
    });
    endPage();
    doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.line).lineWidth(0.5).stroke();
    y += 10;
    // legend
    space(30);
    const lg = [[C.blue, 'Actual progress'], ['#C9D3E0', 'Planned duration'], [C.green, 'Complete'], [C.navy, 'Milestone'], [C.red, `Report date (${fmtDate(to)})`]];
    let lx = M;
    lg.forEach(([c, t]) => { doc.rect(lx, y, 9, 9).fill(c); doc.font('Helvetica').fontSize(7.5).fillColor(C.grey).text(t, lx + 13, y + 1, { lineBreak: false }); lx += 20 + doc.widthOfString(t) + 10; });
    y += 22;
    const deps = acts.filter((a) => a.predecessors.length);
    if (deps.length) {
      const idx = new Map(acts.map((a, i) => [a.id, i + 1]));
      para('Dependencies: ' + deps.map((a) => `${idx.get(a.id)} follows ${a.predecessors.map((q) => idx.get(q)).join(', ')}`).join('; ') + '.', { size: 8, color: C.grey });
    }
  }

  // ---------- Progress & work ----------
  const updates = bundle.site_updates.filter((u) => u.update_date >= from && u.update_date <= to).sort((a, b) => a.update_date.localeCompare(b.update_date));
  heading('Progress summary for the period');
  const linesOf = (k) => updates.filter((u) => u[k] && u[k].trim()).map((u) => `${fmtDate(u.update_date)}: ${u[k].trim().replace(/\n+/g, ' ')}`);
  const latest = updates[updates.length - 1];
  const section = (title, lines, fallback) => { para(title, { bold: true, size: 10.5, color: C.navy, after: 3 }); if (lines.length) bullets(lines); else para(fallback, { color: C.grey }); y += 4; };
  if (!updates.length) para('No site updates were recorded in this reporting period.', { color: C.grey });
  section('Work completed', linesOf('work_completed'), 'No completed work recorded for this period.');
  section('Current work', latest && latest.current_work ? [latest.current_work.trim().replace(/\n+/g, ' ')] : [], 'No current work recorded.');
  section('Upcoming work', latest && latest.upcoming_work ? [latest.upcoming_work.trim().replace(/\n+/g, ' ')] : [], 'No upcoming work recorded.');
  const notes = linesOf('progress_notes'); if (notes.length) section('Progress notes', notes, '');
  const risks = linesOf('problems_risks'); if (risks.length) section('Problems and risks', risks, '');
  const labour = updates.filter((u) => u.labour_count > 0);
  if (labour.length) para(`Labour on site: average ${(labour.reduce((t, u) => t + u.labour_count, 0) / labour.length).toFixed(1)} workers across ${labour.length} recorded day${labour.length === 1 ? '' : 's'} (peak ${Math.max(...labour.map((u) => u.labour_count))}).`, { size: 9, color: C.grey });
  const deliv = linesOf('material_deliveries'); if (deliv.length) section('Material deliveries', deliv, '');

  // ---------- Progress history ----------
  if (include.has('history')) {
    const snaps = bundle.snapshots.filter((x) => x.snapshot_date <= to).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).slice(-12);
    if (snaps.length) {
      heading('Progress history');
      table([
        { h: 'Date', w: 0.2, fn: (r) => fmtDate(r.snapshot_date) }, { h: 'Actual', w: 0.12, fn: (r) => pct(r.actual), align: 'right' },
        { h: 'Planned', w: 0.12, fn: (r) => pct(r.planned), align: 'right' }, { h: 'Variance', w: 0.12, fn: (r) => sgn(r.variance), align: 'right' },
        { h: 'Note', w: 0.44, fn: (r) => r.note },
      ], snaps);
    }
  }

  // ---------- RFIs ----------
  if (include.has('rfis')) {
    heading('Requests for information (RFIs)');
    const rfis = bundle.rfis.filter((r) => r.status !== 'CLOSED' || (r.date_closed && r.date_closed >= from) || r.date_raised >= from).sort((a, b) => a.reference.localeCompare(b.reference));
    table([
      { h: 'Ref', w: 0.1, key: 'reference' }, { h: 'Subject', w: 0.34, fn: (r) => r.subject + (r.response ? `\nResponse: ${r.response}` : '') },
      { h: 'Raised', w: 0.14, fn: (r) => fmtDate(r.date_raised) }, { h: 'Due', w: 0.14, fn: (r) => fmtDate(r.due_date) },
      { h: 'Status', w: 0.12, fn: (r) => cap(r.status) }, { h: 'Closed', w: 0.16, fn: (r) => fmtDate(r.date_closed) },
    ], rfis, { empty: 'No RFIs to report.' });
  }
  // ---------- Variations ----------
  if (include.has('variations')) {
    heading('Variations');
    const vars = bundle.variations.filter((v) => v.status !== 'CANCELLED').sort((a, b) => a.reference.localeCompare(b.reference));
    table([
      { h: 'Ref', w: 0.1, key: 'reference' }, { h: 'Description', w: 0.36, key: 'description' },
      { h: 'Value', w: 0.16, fn: (v) => rand(v.amount), align: 'right' }, { h: 'Time (days)', w: 0.11, fn: (v) => v.time_impact_days, align: 'right' },
      { h: 'Status', w: 0.12, fn: (v) => cap(v.status) }, { h: 'Approval', w: 0.15, fn: (v) => cap(v.approval_status) },
    ], vars, { empty: 'No variations to report.' });
    if (vars.length) {
      const approved = vars.filter((v) => v.approval_status === 'APPROVED'); const pending = vars.filter((v) => v.approval_status === 'PENDING');
      para(`Approved variations: ${rand(approved.reduce((t, v) => t + v.amount, 0))} (${approved.reduce((t, v) => t + v.time_impact_days, 0)} days).   Pending approval: ${rand(pending.reduce((t, v) => t + v.amount, 0))} (${pending.reduce((t, v) => t + v.time_impact_days, 0)} days).`, { bold: true, size: 9 });
    }
  }
  // ---------- Delays ----------
  if (include.has('delays')) {
    heading('Delays and programme impacts');
    table([
      { h: 'Recorded', w: 0.15, fn: (d) => fmtDate(d.date_recorded) }, { h: 'Category', w: 0.16, fn: (d) => cap(d.category) },
      { h: 'Description', w: 0.43, key: 'description' }, { h: 'Days', w: 0.1, key: 'days_impact', align: 'right' }, { h: 'Status', w: 0.16, fn: (d) => cap(d.status) },
    ], bundle.delays, { empty: 'No delays have been recorded.' });
    if (bundle.delays.length) para(`Total recorded delay: ${bundle.delays.reduce((t, d) => t + d.days_impact, 0)} days (${delayDays} days still open).`, { bold: true, size: 9 });
  }

  // ---------- Photos ----------
  if (include.has('photos')) {
    const inPeriod = (f) => f.created_at.slice(0, 10) >= from && f.created_at.slice(0, 10) <= to;
    const suDates = new Map(bundle.site_updates.map((u) => [u.id, u.update_date]));
    const photos = bundle.photos.filter((f) => !f.comment_id && /image\/(jpeg|png)/.test(f.mime) && (f.site_update_id ? (suDates.get(f.site_update_id) >= from && suDates.get(f.site_update_id) <= to) : inPeriod(f)))
      .sort((a, b) => a.id - b.id).slice(0, 16);
    heading('Progress photographs');
    if (!photos.length) para('No photographs were uploaded in this reporting period.', { color: C.grey });
    const pw = (CW - 14) / 2, ph = 165;
    for (let i = 0; i < photos.length; i += 2) {
      space(ph + 40);
      photos.slice(i, i + 2).forEach((f, j) => {
        const x = M + j * (pw + 14);
        doc.rect(x, y, pw, ph).fill(C.light);
        const file = stored.get(f.id);
        try { doc.image(path.join(uploadsDir, file), x, y, { fit: [pw, ph], align: 'center', valign: 'center' }); } catch (_) { doc.font('Helvetica').fontSize(8).fillColor(C.grey).text('Image unavailable', x, y + ph / 2, { width: pw, align: 'center' }); }
        doc.rect(x, y, pw, ph).lineWidth(0.5).strokeColor(C.line).stroke();
        const d = f.site_update_id ? suDates.get(f.site_update_id) : f.created_at.slice(0, 10);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text(f.caption || 'Site photograph', x, y + ph + 4, { width: pw, height: 10, ellipsis: true, lineBreak: false });
        doc.font('Helvetica').fontSize(7.5).fillColor(C.grey).text(fmtDate(d), x, y + ph + 15, { width: pw, lineBreak: false });
      });
      y += ph + 34;
    }
  }

  // ---------- PM comments ----------
  const pm = updates.filter((u) => u.pm_comments && u.pm_comments.trim());
  heading('Project manager comments');
  if (!pm.length) para('No project manager comments for this period.', { color: C.grey });
  pm.forEach((u) => { para(`${fmtDate(u.update_date)}${p.project_manager ? ' - ' + p.project_manager : ''}`, { bold: true, size: 8.5, color: C.grey, after: 1 }); para(u.pm_comments.trim(), { after: 8 }); });

  // ---------- footers ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(M, H - 42).lineTo(W - M, H - 42).strokeColor(C.line).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(C.grey)
      .text('MF Building Civils & Development  |  Confidential progress report', M, H - 34, { width: CW, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, M, H - 34, { width: CW, align: 'right', lineBreak: false });
  }
  doc.end();
  return doc;
}

module.exports = { buildReport };
