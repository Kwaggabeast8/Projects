// Programme calculations shared by the API, snapshots and the PDF report.
const DAY = 86400000;

const isDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};
const toMs = (s) => Date.parse(s + 'T00:00:00Z');
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => fromMs(toMs(s) + n * DAY);
const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
const today = () => new Date().toISOString().slice(0, 10);
const durationOf = (a) => (a.is_milestone ? 0 : diffDays(a.start_date, a.finish_date) + 1);
const round1 = (n) => Math.round(n * 10) / 10;

// Planned % of one activity on a given date, from its dates alone.
function plannedFor(a, asOf) {
  if (a.is_milestone) return asOf >= a.finish_date ? 100 : 0;
  if (asOf < a.start_date) return 0;
  if (asOf >= a.finish_date) return 100;
  return ((diffDays(a.start_date, asOf) + 1) / (diffDays(a.start_date, a.finish_date) + 1)) * 100;
}

function weightOf(a, equal) {
  return equal ? 1 : Math.max(0, Number(a.weight) || 0);
}

function statusFor(variance, hasProgramme, projectStatus) {
  if (projectStatus === 'COMPLETED') return 'Completed';
  if (!hasProgramme) return 'No programme';
  if (variance > 2) return 'Ahead of programme';
  if (variance >= -2) return 'On programme';
  if (variance >= -10) return 'Slightly behind programme';
  return 'Behind programme';
}

// Weighted overall figures. asOf defaults to today.
function summarise(project, acts, asOf = today()) {
  const total = acts.reduce((s, a) => s + (Number(a.weight) || 0), 0);
  const equal = total <= 0;
  const W = acts.reduce((s, a) => s + weightOf(a, equal), 0);
  let actual = 0, planned = 0;
  for (const a of acts) {
    const w = weightOf(a, equal);
    actual += w * (a.is_milestone ? (a.actual_progress >= 100 ? 100 : a.actual_progress) : a.actual_progress);
    planned += w * plannedFor(a, asOf);
  }
  actual = W ? actual / W : 0;
  planned = W ? planned / W : 0;
  actual = round1(actual); planned = round1(planned);
  const variance = round1(actual - planned);
  const programmeFinish = acts.length ? acts.reduce((m, a) => (a.finish_date > m ? a.finish_date : m), '0000-00-00') : null;
  const programmeStart = acts.length ? acts.reduce((m, a) => (a.start_date < m ? a.start_date : m), '9999-99-99') : null;
  return {
    as_of: asOf,
    actual,
    planned,
    variance,
    ahead_behind: variance > 0.05 ? 'ahead' : variance < -0.05 ? 'behind' : 'on programme',
    programme_status: statusFor(variance, acts.length > 0, project && project.status),
    programme_start: programmeStart,
    programme_finish: programmeFinish,
    forecast_finish: (project && project.forecast_finish) || programmeFinish,
    activity_count: acts.length,
  };
}

// Would adding predecessor `pred` to `act` create a cycle?
function createsCycle(deps, actId, predId) {
  if (actId === predId) return true;
  // walk predecessors of predId; if we reach actId there is a cycle
  const seen = new Set();
  const stack = [predId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === actId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of deps) if (d.activity_id === cur) stack.push(d.predecessor_id);
  }
  return false;
}

module.exports = { isDate, toMs, fromMs, addDays, diffDays, today, durationOf, plannedFor, summarise, createsCycle, round1 };
