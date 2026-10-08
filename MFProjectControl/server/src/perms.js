// Per-project access control. Every non-admin member of a project has a level for each section.
//   none     – section hidden and blocked on the server
//   view     – read only
//   progress – (programme only) may update activity progress % but not dates / structure
//   edit     – create / change / delete (site updates & photos: only their own unless admin)
const SECTIONS = [
  { key: 'programme', label: 'Programme (activity list)', levels: ['none', 'view', 'progress', 'edit'], hint: 'progress = can update % complete only' },
  { key: 'gantt', label: 'Gantt chart', levels: ['none', 'view'] },
  { key: 'updates', label: 'Site updates', levels: ['none', 'view', 'edit'], hint: 'edit = add updates and edit their own' },
  { key: 'photos', label: 'Project photos', levels: ['none', 'view', 'edit'] },
  { key: 'rfis', label: 'RFIs', levels: ['none', 'view', 'edit'] },
  { key: 'variations', label: 'Variations', levels: ['none', 'view', 'edit'] },
  { key: 'delays', label: 'Delays', levels: ['none', 'view', 'edit'] },
  { key: 'comments', label: 'Comments', levels: ['none', 'view', 'edit'], hint: 'edit = can post comments' },
  { key: 'history', label: 'Progress history', levels: ['none', 'view', 'edit'], hint: 'edit = can take snapshots' },
];
const RANK = { none: 0, view: 1, progress: 2, edit: 3 };
const KEYS = SECTIONS.map((s) => s.key);

const PRESETS = {
  viewer: { label: 'Viewer / Commenter', programme: 'view', gantt: 'view', updates: 'view', photos: 'view', rfis: 'view', variations: 'view', delays: 'view', comments: 'edit', history: 'view' },
  foreman: { label: 'Foreman (site)', programme: 'progress', gantt: 'view', updates: 'edit', photos: 'edit', rfis: 'view', variations: 'none', delays: 'edit', comments: 'edit', history: 'none' },
  client: { label: 'Client (limited)', programme: 'view', gantt: 'view', updates: 'view', photos: 'view', rfis: 'none', variations: 'none', delays: 'none', comments: 'edit', history: 'view' },
};

const ALL = Object.fromEntries(KEYS.map((k) => [k, SECTIONS.find((s) => s.key === k).levels.slice(-1)[0]]));

function normalize(input) {
  const out = {};
  for (const s of SECTIONS) {
    const v = input && input[s.key];
    out[s.key] = s.levels.includes(v) ? v : (v === 'edit' && s.levels.includes('view') ? 'view' : 'none');
  }
  return out;
}
const preset = (name) => normalize(PRESETS[name]);
function presetOf(perms) {
  const n = normalize(perms);
  for (const [name, p] of Object.entries(PRESETS)) if (KEYS.every((k) => normalize(p)[k] === n[k])) return name;
  return 'custom';
}
function parse(json) { try { return normalize(JSON.parse(json)); } catch (_) { return preset('viewer'); } }
// Resolve a request body {preset} or {permissions}; returns null when neither given.
function fromBody(body) {
  if (body && body.permissions && typeof body.permissions === 'object') return normalize(body.permissions);
  if (body && body.preset && PRESETS[body.preset]) return preset(body.preset);
  return null;
}
const has = (perms, section, need) => (RANK[perms[section]] || 0) >= RANK[need];

module.exports = { SECTIONS, PRESETS, ALL, normalize, preset, presetOf, parse, fromBody, has };
