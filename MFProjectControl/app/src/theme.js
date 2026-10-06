export const C = {
  navy: '#12263F', navy2: '#1C3556', orange: '#E8731A', orangeDark: '#C75F10', bg: '#F3F5F8', card: '#FFFFFF', ink: '#1F2933', grey: '#6B7785',
  line: '#D9DFE7', light: '#EEF1F5', green: '#2E8B57', red: '#C0392B', amber: '#D68910', blue: '#2F6DB5', white: '#FFFFFF',
};
export const fmtDate = (s) => {
  if (!s) return '-';
  const [y, m, d] = s.split('-');
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`;
};
export const fmtTs = (s) => {
  if (!s) return '';
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d)) return s;
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const rand = (n) => 'R ' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
export const sgn = (n) => `${n > 0 ? '+' : ''}${Number(n || 0).toFixed(1)}%`;
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z'));
export const statusColor = (s) => (/Ahead|On programme|Completed/.test(s || '') ? C.green : /Slightly/.test(s || '') ? C.amber : /Behind/.test(s || '') ? C.red : C.grey);
export const varColor = (v) => (v >= 0 ? C.green : v >= -10 ? C.amber : C.red);
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
