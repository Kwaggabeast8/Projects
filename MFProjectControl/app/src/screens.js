import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Platform, TextInput } from 'react-native';
import { api, downloadUrl, getBase, setServer, setToken, isWeb } from './api';
import { C, fmtDate, fmtTs, pct, sgn, varColor, statusColor, todayStr, addDays, cap } from './theme';
import { Btn, Card, Chips, DateInput, Empty, ErrorBox, FormModal, H, Loading, Muted, Pill, Bar, Sheet, st, useUI, useWide } from './ui';
import { SummaryStats, ProgrammeTab } from './programme';
import { RfiTab, VariationTab, DelayTab, SiteUpdatesTab, CommentsTab } from './registers';
import { PhotoPicker, PhotoGrid } from './photos';
import { uploadPhotos } from './api';
import { AccessEditor, accessMeta, presetLabel } from './access';

const LOGO = (size = 34) => (
  <View style={{ width: size, height: size, borderRadius: 4, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.46 }}>MF</Text>
  </View>
);

export function Header({ user, title, onBack, onHome, onUsers, onAccount }) {
  const wide = useWide();
  return (
    <View style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 50 : Platform.OS === 'android' ? 34 : 12, paddingBottom: 12, borderBottomWidth: 3, borderColor: C.orange }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
        {onBack ? <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back"><Text style={{ color: '#fff', fontSize: 26, marginRight: 2 }}>‹</Text></Pressable> : null}
        <Pressable onPress={onHome}>{LOGO(32)}</Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{title || 'MF Project Control'}</Text>
          {wide && <Text style={{ color: '#9FB0C6', fontSize: 11.5 }}>MF Building Civils & Development</Text>}
        </View>
        {user && user.role === 'ADMIN' && onUsers && <Btn label="Users" kind="light" small onPress={onUsers} />}
        {user && <Pressable onPress={onAccount} style={{ alignItems: 'flex-end' }}><Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{user.name}</Text><Text style={{ color: '#9FB0C6', fontSize: 11 }}>{user.role === 'ADMIN' ? 'Admin' : 'Team member'} · account</Text></Pressable>}
      </View>
    </View>
  );
}

export const Page = ({ children }) => (
  <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 60, maxWidth: 1100, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
);

// ---------- login ----------
export function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setSrv] = useState(getBase());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (!isWeb) await setServer(server);
      const r = await api('POST', '/auth/login', { email, password });
      await setToken(r.token); onLoggedIn(r.user);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
        <View style={{ alignItems: 'center', marginBottom: 18 }}>{LOGO(56)}
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.navy, marginTop: 10 }}>MF Project Control</Text>
          <Muted>MF Building Civils & Development</Muted></View>
        {!isWeb && <><Text style={st.label}>Server address</Text><TextInput value={server} onChangeText={setSrv} autoCapitalize="none" autoCorrect={false} placeholder="https://your-mf-server.example.com" style={[st.input, { marginBottom: 12 }]} /></>}
        <Text style={st.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={[st.input, { marginBottom: 12 }]} />
        <Text style={st.label}>Password</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} style={[st.input, { marginBottom: 12 }]} />
        {!!err && <Text style={{ color: C.red, marginBottom: 10 }}>{err}</Text>}
        <Btn label="Sign in" onPress={submit} busy={busy} />
        <Muted style={{ marginTop: 14, textAlign: 'center', fontSize: 12 }}>Accounts are created by MF administration.</Muted>
      </View>
    </View>
  );
}

// ---------- dashboard ----------
export function Projects({ user, onOpen, rt }) {
  const { toast } = useUI();
  const [state, setState] = useState({ loading: true });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('ACTIVE');
  const load = useCallback(async () => {
    try { const r = await api('GET', '/projects'); setState({ projects: r.projects }); } catch (e) { setState({ error: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load, rt]);
  const admin = user.role === 'ADMIN';
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorBox message={state.error} onRetry={load} />;
  const shown = state.projects.filter((p) => filter === 'ALL' || p.status === filter);
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <H style={{ marginBottom: 0 }}>Projects</H>
        {admin && <Btn label="+ New project" onPress={() => setCreating(true)} />}
      </View>
      <View style={{ marginBottom: 10 }}><Chips scroll value={filter} onChange={setFilter} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'ARCHIVED', label: 'Archived' }, { value: 'ALL', label: 'All' }]} /></View>
      {!shown.length && <Card><Empty text={state.projects.length ? 'No projects in this view.' : admin ? 'No projects yet. Create your first project to get started.' : 'You have not been assigned to any projects yet. Please contact MF administration.'} /></Card>}
      {shown.map((p) => (
        <Pressable key={p.id} onPress={() => onOpen(p.id)}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>{p.name}</Text>
                <Muted>{[p.client, p.site].filter(Boolean).join('  ·  ') || 'No client / site set'}</Muted>
                <Muted>PM: {p.project_manager || '-'}</Muted>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}><Pill text={p.programme_status} color={statusColor(p.programme_status)} />{p.status !== 'ACTIVE' && <Pill text={cap(p.status)} color={C.grey} />}</View>
            </View>
            <View style={{ marginTop: 10, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ width: 54, fontSize: 12, color: C.grey, fontWeight: '600' }}>Actual</Text><View style={{ flex: 1 }}><Bar value={p.actual} /></View><Text style={{ width: 50, textAlign: 'right', fontWeight: '700' }}>{pct(p.actual)}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ width: 54, fontSize: 12, color: C.grey, fontWeight: '600' }}>Planned</Text><View style={{ flex: 1 }}><Bar value={p.planned} color={C.grey} /></View><Text style={{ width: 50, textAlign: 'right', fontWeight: '700' }}>{pct(p.planned)}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
              <Muted>Variance: <Text style={{ fontWeight: '800', color: varColor(p.variance) }}>{sgn(p.variance)}</Text></Muted>
              <Muted>Baseline: <Text style={{ fontWeight: '700', color: C.ink }}>{fmtDate(p.baseline_finish)}</Text></Muted>
              <Muted>Forecast: <Text style={{ fontWeight: '700', color: C.ink }}>{fmtDate(p.forecast_finish)}</Text></Muted>
              {p.open_rfis != null && <Muted>Open RFIs: <Text style={{ fontWeight: '700', color: C.ink }}>{p.open_rfis}</Text></Muted>}
              {p.open_delays != null && <Muted>Delays: <Text style={{ fontWeight: '700', color: p.open_delays ? C.red : C.ink }}>{p.open_delays} open{p.open_delay_days ? ` (${p.open_delay_days}d)` : ''}</Text></Muted>}
            </View>
          </Card>
        </Pressable>
      ))}
      {admin && <ProjectForm visible={creating} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); toast('Project created'); onOpen(id); }} />}
    </View>
  );
}

const PROJECT_FIELDS = [
  { key: 'name', label: 'Project name', required: true }, { key: 'client', label: 'Client' }, { key: 'site', label: 'Site address' },
  { key: 'project_manager', label: 'Project manager' }, { key: 'baseline_start', label: 'Baseline start', type: 'date' },
  { key: 'baseline_finish', label: 'Baseline finish', type: 'date' }, { key: 'forecast_finish', label: 'Forecast / revised completion', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'ARCHIVED', label: 'Archived' }] },
];
function ProjectForm({ visible, onClose, project, onSaved }) {
  return (
    <FormModal visible={visible} title={project ? 'Edit project' : 'New project'} fields={PROJECT_FIELDS} onClose={onClose}
      initial={project ? { ...project } : { status: 'ACTIVE', baseline_start: todayStr() }}
      onSubmit={async (v) => {
        const body = {}; PROJECT_FIELDS.forEach((f) => { body[f.key] = v[f.key] === undefined ? '' : v[f.key]; });
        const r = project ? await api('PATCH', `/projects/${project.id}`, body) : await api('POST', '/projects', body);
        onSaved(r.project.id);
      }} />
  );
}

// ---------- project workspace ----------
const TABS = [['overview', 'Overview'], ['programme', 'Programme'], ['updates', 'Site updates'], ['rfis', 'RFIs'], ['variations', 'Variations'], ['delays', 'Delays'], ['comments', 'Comments'], ['history', 'History'], ['manage', 'Manage']];

export function ProjectScreen({ user, projectId, tab, setTab, rt, onBack }) {
  const [state, setState] = useState({ loading: true });
  const admin = user.role === 'ADMIN';
  const load = useCallback(async () => {
    try { setState({ data: await api('GET', `/projects/${projectId}`) }); } catch (e) { setState({ error: e.message }); }
  }, [projectId]);
  useEffect(() => { load(); }, [load, rt]);
  if (state.loading) return <Loading />;
  if (state.error) return <View><ErrorBox message={state.error} onRetry={load} /><Btn label="Back to projects" kind="ghost" onPress={onBack} /></View>;
  const data = state.data; const p = data.project;
  const pm = data.permissions;
  const v = (k) => pm[k] !== 'none';
  const visibleTab = { overview: true, programme: v('programme') || v('gantt'), updates: v('updates'), rfis: v('rfis'), variations: v('variations'), delays: v('delays'), comments: v('comments'), history: v('history'), manage: admin };
  const tabs = TABS.filter(([k]) => visibleTab[k]);
  const props = { data, admin, user, pm, reload: load, projectId };
  const cur = visibleTab[tab] ? tab : 'overview';
  return (
    <View>
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 21, fontWeight: '900', color: C.navy }}>{p.name}</Text>
        <Muted>{[p.client, p.site].filter(Boolean).join('  ·  ')}</Muted>
      </View>
      <View style={{ marginBottom: 12 }}><Chips scroll value={cur} onChange={setTab} options={tabs.map(([value, label]) => ({ value, label }))} /></View>
      {cur === 'overview' && <Overview {...props} />}
      {cur === 'programme' && <ProgrammeTab {...props} />}
      {cur === 'updates' && <SiteUpdatesTab {...props} />}
      {cur === 'rfis' && <RfiTab {...props} admin={pm.rfis === 'edit'} />}
      {cur === 'variations' && <VariationTab {...props} admin={pm.variations === 'edit'} />}
      {cur === 'delays' && <DelayTab {...props} admin={pm.delays === 'edit'} />}
      {cur === 'comments' && <CommentsTab {...props} />}
      {cur === 'history' && <History {...props} />}
      {cur === 'manage' && admin && <Manage {...props} onDeleted={onBack} />}
    </View>
  );
}

function Overview({ data, user, pm, reload, projectId }) {
  const isAdmin = user.role === 'ADMIN';
  const canPhotos = pm.photos === 'edit' || pm.photos === 'all';
  const canManage = (f) => isAdmin || pm.photos === 'all' || (canPhotos && f.uploaded_by === user.id);
  const p = data.project, s = data.summary;
  const { toast } = useUI();
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const row = (k, v) => <View style={{ flexDirection: 'row', paddingVertical: 4 }}><Text style={{ width: 130, color: C.grey, fontSize: 13 }}>{k}</Text><Text style={{ flex: 1, color: C.ink, fontWeight: '600' }}>{v || '-'}</Text></View>;
  const gallery = data.photos;
  return (
    <View>
      <SummaryStats summary={s} />
      <Card>
        {row('Client', p.client)}{row('Site', p.site)}{row('Project manager', p.project_manager)}{row('Status', cap(p.status))}
        {row('Baseline start', fmtDate(p.baseline_start))}{row('Baseline finish', fmtDate(p.baseline_finish))}{row('Forecast finish', fmtDate(s.forecast_finish))}{row('Programme finish', fmtDate(s.programme_finish))}
      </Card>
      {pm.updates !== 'none' && <Card>
        <H style={{ fontSize: 15 }}>Latest site update</H>
        {data.site_updates.length ? (() => { const u = data.site_updates[0]; return <View><Text style={{ fontWeight: '700' }}>{fmtDate(u.update_date)}</Text><Muted>{u.current_work || u.progress_notes || u.work_completed || 'No details'}</Muted></View>; })() : <Muted>No site updates yet.</Muted>}
      </Card>}
      {pm.photos !== 'none' && <Card>
        <H style={{ fontSize: 15 }}>Photos ({gallery.filter((f) => !f.comment_id).length})</H>
        <PhotoGrid files={gallery.filter((f) => !f.comment_id)} canManage={canManage} onChanged={reload} />
        {!gallery.filter((f) => !f.comment_id).length && <Muted>No photos uploaded yet.</Muted>}
        {canPhotos && (
          <View style={{ marginTop: 12 }}>
            <PhotoPicker value={photos} onChange={setPhotos} />
            {!!photos.length && <View style={{ marginTop: 10 }}><Btn label={`Upload ${photos.length} photo${photos.length === 1 ? '' : 's'}`} busy={busy} onPress={async () => {
              setBusy(true);
              try { await uploadPhotos(projectId, {}, photos); setPhotos([]); toast('Photos uploaded'); reload(); } catch (e) { toast(e.message, 'err'); }
              setBusy(false);
            }} /></View>}
          </View>
        )}
      </Card>}
    </View>
  );
}

function History({ data, admin, pm, reload, projectId }) {
  const canSnap = pm.history === 'edit' || pm.history === 'all';
  const canDeleteSnap = admin || pm.history === 'all';
  const { toast, confirm } = useUI();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(null);
  const [audit, setAudit] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadAudit = useCallback(async () => { if (admin) { try { setAudit((await api('GET', `/projects/${projectId}/audit`)).events); } catch (e) { setAudit([]); } } }, [admin, projectId]);
  useEffect(() => { loadAudit(); }, [loadAudit, data]);
  const snap = async () => {
    setBusy(true);
    try { await api('POST', `/projects/${projectId}/snapshots`, { note }); setNote(''); toast('Snapshot saved'); reload(); } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return (
    <View>
      <H>Progress history</H>
      {canSnap && (
        <Card>
          <Text style={st.label}>Take a progress snapshot (records actual, planned and variance as at today)</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Note (optional), e.g. Week 12 - slab poured" style={st.input} />
          <View style={{ alignItems: 'flex-end', marginTop: 10 }}><Btn label="Save snapshot" onPress={snap} busy={busy} /></View>
        </Card>
      )}
      {!data.snapshots.length && <Card><Empty text="No snapshots yet. A snapshot is also taken automatically each week." /></Card>}
      {data.snapshots.map((x) => (
        <Pressable key={x.id} onPress={() => setOpen(x)}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '800', color: C.navy }}>{fmtDate(x.snapshot_date)}</Text><Text style={{ fontWeight: '800', color: varColor(x.variance) }}>{sgn(x.variance)}</Text></View>
            <Muted>Actual {pct(x.actual)}  ·  Planned {pct(x.planned)}</Muted>
            {!!x.note && <Text style={{ marginTop: 4 }}>{x.note}</Text>}
          </Card>
        </Pressable>
      ))}
      <Sheet visible={!!open} title={open ? `Snapshot ${fmtDate(open.snapshot_date)}` : ''} onClose={() => setOpen(null)}>
        {open && <View>
          <SummaryStats summary={{ actual: open.actual, planned: open.planned, variance: open.variance, ahead_behind: open.variance > 0 ? 'ahead' : open.variance < 0 ? 'behind' : 'on programme', programme_status: open.variance >= -2 ? 'On programme' : open.variance >= -10 ? 'Slightly behind programme' : 'Behind programme' }} />
          {!!open.note && <Text style={{ marginBottom: 10 }}>{open.note}</Text>}
          <Text style={[st.label, { marginBottom: 6 }]}>Activity progress at the time</Text>
          {open.detail.map((d) => <View key={d.id} style={{ marginBottom: 8 }}><Text style={{ fontSize: 13, fontWeight: '600' }}>{d.name}</Text><Muted>Actual {Math.round(d.actual)}%  ·  Planned {Math.round(d.planned)}%</Muted></View>)}
          {canDeleteSnap && <View style={{ marginTop: 10 }}><Btn label="Delete snapshot" kind="danger" small onPress={async () => { if (await confirm('Delete this snapshot?', '')) { try { await api('DELETE', `/snapshots/${open.id}`); setOpen(null); reload(); } catch (e) { toast(e.message, 'err'); } } }} /></View>}
        </View>}
      </Sheet>
      {admin && (
        <View style={{ marginTop: 10 }}>
          <H>Audit history</H>
          {!audit ? <Loading /> : !audit.length ? <Card><Empty text="No events yet." /></Card> : <Card>{audit.slice(0, 100).map((e) => (
            <View key={e.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: C.light }}>
              <Text style={{ fontSize: 13, color: C.ink }}><Text style={{ fontWeight: '800' }}>{cap(e.action)} {e.entity}</Text>  {e.summary}</Text>
              <Muted style={{ fontSize: 11.5 }}>{e.user_name}  ·  {fmtTs(e.created_at)}</Muted>
            </View>))}</Card>}
        </View>
      )}
    </View>
  );
}

function Manage({ data, reload, projectId, onDeleted }) {
  const { toast, confirm } = useUI();
  const p = data.project;
  const [editing, setEditing] = useState(false);
  const [users, setUsers] = useState([]);
  const [from, setFrom] = useState(addDays(todayStr(), -6));
  const [to, setTo] = useState(todayStr());
  const [inc, setInc] = useState(['rfis', 'variations', 'delays', 'photos', 'history']);
  const [meta, setMeta] = useState(null);
  const [editMember, setEditMember] = useState(null);
  useEffect(() => { accessMeta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { api('GET', '/users').then((r) => setUsers(r.users)).catch(() => {}); }, [data]);
  const members = data.members || [];
  const addable = users.filter((u) => u.active && !members.find((m) => m.id === u.id));
  const open = async (path, params) => { try { const u = await downloadUrl(path, params); if (isWeb) window.open(u, '_blank'); else await Linking.openURL(u); } catch (e) { toast(e.message, 'err'); } };
  const toggle = (k) => setInc((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  const setStatus = async (status) => { try { await api('PATCH', `/projects/${projectId}`, { status }); toast(`Project marked ${status.toLowerCase()}`); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <View>
      <Card>
        <H style={{ fontSize: 16 }}>Client progress report (PDF)</H>
        <Muted style={{ marginBottom: 8 }}>A professional MF-branded report: summary, Gantt, work completed / current / upcoming, RFIs, variations, delays, photos and PM comments.</Muted>
        <Text style={st.label}>Reporting period</Text>
        <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}><DateInput value={from} onChange={setFrom} /></View><View style={{ flex: 1 }}><DateInput value={to} onChange={setTo} /></View>
        </View>
        <Text style={st.label}>Include</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {[['rfis', 'RFIs'], ['variations', 'Variations'], ['delays', 'Delays'], ['photos', 'Photos'], ['history', 'Progress history']].map(([k, l]) => (
            <Pressable key={k} onPress={() => toggle(k)} style={[st.chip, inc.includes(k) && { backgroundColor: C.navy, borderColor: C.navy }]}><Text style={{ color: inc.includes(k) ? '#fff' : C.ink, fontWeight: '600', fontSize: 13 }}>{inc.includes(k) ? '✓ ' : ''}{l}</Text></Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Btn label="Generate PDF report" onPress={() => open(`/projects/${projectId}/report.pdf`, { from, to, include: inc.join(',') })} />
          <Btn label="Preview in browser" kind="ghost" onPress={() => open(`/projects/${projectId}/report.pdf`, { from, to, include: inc.join(','), download: '0' })} />
        </View>
      </Card>
      <Card>
        <H style={{ fontSize: 16 }}>Project setup</H>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Btn label="Edit project details" kind="dark" onPress={() => setEditing(true)} />
          {data.summary.programme_finish && p.forecast_finish !== data.summary.programme_finish && <Btn label="Set forecast from programme" kind="ghost" onPress={async () => { try { await api('PATCH', `/projects/${projectId}`, { forecast_finish: data.summary.programme_finish }); toast('Forecast updated'); reload(); } catch (e) { toast(e.message, 'err'); } }} />}
          {p.status !== 'COMPLETED' && <Btn label="Mark completed" kind="ghost" onPress={() => setStatus('COMPLETED')} />}
          {p.status !== 'ARCHIVED' && <Btn label="Archive" kind="ghost" onPress={() => setStatus('ARCHIVED')} />}
          {p.status !== 'ACTIVE' && <Btn label="Reactivate" kind="ghost" onPress={() => setStatus('ACTIVE')} />}
        </View>
      </Card>
      <Card>
        <H style={{ fontSize: 16 }}>Who has access, and to what</H>
        <Muted style={{ marginBottom: 8 }}>Admins see and do everything on every project. Everyone else only sees projects they are assigned to, and only the parts you switch on for them.</Muted>
        {!members.length && <Muted>No one assigned yet.</Muted>}
        {members.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{m.name}</Text><Muted style={{ fontSize: 12 }}>{m.email}</Muted><View style={{ marginTop: 3 }}><Pill text={presetLabel(m.preset, meta)} color={m.preset === 'foreman' ? C.orange : m.preset === 'custom' ? C.amber : C.blue} /></View></View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
            <Btn label="Access" kind="dark" small onPress={() => setEditMember(m)} />
            <Btn label="Remove" kind="ghost" small onPress={async () => { try { await api('DELETE', `/projects/${projectId}/members/${m.id}`); toast('Access removed'); reload(); } catch (e) { toast(e.message, 'err'); } }} />
            </View>
          </View>
        ))}
        {!!addable.length && <><Text style={[st.label, { marginTop: 10 }]}>Add someone to this project</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{addable.map((u) => <Pressable key={u.id} style={st.chip} onPress={async () => { try { const r = await api('PUT', `/projects/${projectId}/members/${u.id}`, { preset: 'viewer' }); toast(`${u.name} added - choose what they can access`); reload(); setEditMember(r.member); } catch (e) { toast(e.message, 'err'); } }}><Text style={{ fontWeight: '600', fontSize: 13 }}>+ {u.name}</Text></Pressable>)}</View></>}
      </Card>
      <Card>
        <H style={{ fontSize: 16 }}>Backup / export</H>
        <Muted style={{ marginBottom: 8 }}>Download every record for this project as a JSON file (optionally with the photos embedded).</Muted>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Btn label="Export project data" kind="dark" onPress={() => open(`/projects/${projectId}/export`)} />
          <Btn label="Export with photos" kind="ghost" onPress={() => open(`/projects/${projectId}/export`, { photos: 1 })} />
          <Btn label="Full database backup" kind="ghost" onPress={() => open('/backup/database')} />
        </View>
      </Card>
      <Card style={{ borderColor: C.red }}>
        <H style={{ fontSize: 16, color: C.red }}>Delete project</H>
        <Muted style={{ marginBottom: 8 }}>Permanently deletes this project and everything in it. Export a backup first. Prefer Archive if unsure.</Muted>
        <Btn label="Delete project..." kind="danger" onPress={async () => {
          if (!(await confirm(`Delete "${p.name}"?`, 'All programme data, records, comments and photos will be permanently deleted.'))) return;
          try { await api('DELETE', `/projects/${projectId}?confirm=${encodeURIComponent(p.name)}`); toast('Project deleted'); onDeleted(); } catch (e) { toast(e.message, 'err'); }
        }} />
      </Card>
      <ProjectForm visible={editing} project={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast('Project saved'); reload(); }} />
      <AccessEditor visible={!!editMember} projectId={projectId} projectName={p.name} member={editMember} onClose={() => setEditMember(null)} onSaved={() => { setEditMember(null); reload(); }} />
    </View>
  );
}

// ---------- admin: users ----------
export function Users({ me }) {
  const { toast, confirm } = useUI();
  const [state, setState] = useState({ loading: true });
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(null); // 'new' | user
  const [secret, setSecret] = useState(null);
  const [meta, setMeta] = useState(null);
  const [access, setAccess] = useState(null); // {user, project_id}
  useEffect(() => { accessMeta().then(setMeta).catch(() => {}); }, []);
  const load = useCallback(async () => {
    try { const [u, p] = await Promise.all([api('GET', '/users'), api('GET', '/projects')]); setState({ users: u.users }); setProjects(p.projects); } catch (e) { setState({ error: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorBox message={state.error} onRetry={load} />;
  const fields = [
    { key: 'name', label: 'Full name', required: true }, { key: 'email', label: 'Email (used to sign in)', required: true, autoCapitalize: 'none', keyboard: 'email-address' },
    { key: 'role', label: 'Role', type: 'select', options: [{ value: 'VIEWER', label: 'Team member (access set per project)' }, { value: 'ADMIN', label: 'Admin (full access)' }] },
    { key: 'password', label: form && form !== 'new' ? 'New password (leave blank to keep)' : 'Password (leave blank to generate one)', secure: true, autoCapitalize: 'none' },
    { key: 'preset', label: 'Access level on newly added projects', type: 'select', hidden: (v) => v.role === 'ADMIN', hint: 'You can fine-tune each project afterwards (tap the project under the user).',
      options: meta ? Object.entries(meta.presets).map(([value, p]) => ({ value, label: p.label })) : [{ value: 'viewer', label: 'Viewer / Commenter' }] },
    { key: 'project_ids', label: 'Projects this person can open', type: 'multi', empty: 'No projects yet', options: projects.map((p) => ({ value: p.id, label: p.name })), hidden: (v) => v.role === 'ADMIN', hint: 'Admins automatically see all projects.' },
    ...(form && form !== 'new' ? [{ key: 'active', label: 'Account is active (untick to deactivate)', type: 'toggle' }] : []),
  ];
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><H style={{ marginBottom: 0 }}>Users</H><Btn label="+ Add user" onPress={() => setForm('new')} /></View>
      <Muted style={{ marginBottom: 10 }}>There is no public sign-up. Create accounts here and give each person the project access they need.</Muted>
      {state.users.map((u) => (
        <Card key={u.id} style={!u.active ? { opacity: 0.6 } : null}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: C.navy, fontSize: 15 }}>{u.name}{u.id === me.id ? ' (you)' : ''}</Text><Muted>{u.email}</Muted></View>
            <View style={{ gap: 4, alignItems: 'flex-end' }}><Pill text={u.role === 'ADMIN' ? 'Admin' : 'Team member'} color={u.role === 'ADMIN' ? C.orange : C.blue} />{!u.active && <Pill text="Deactivated" color={C.red} />}</View>
          </View>
          {u.role === 'VIEWER' && (u.access.length ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              {u.access.map((a) => { const pr = projects.find((x) => x.id === a.project_id); return pr ? (
                <Pressable key={a.project_id} onPress={() => setAccess({ user: u, access: a })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 8, borderRadius: 8, backgroundColor: C.light }}>
                  <Text style={{ fontWeight: '600', flex: 1 }}>{pr.name}</Text><Pill text={presetLabel(a.preset, meta)} color={a.preset === 'foreman' ? C.orange : a.preset === 'custom' ? C.amber : C.blue} /><Text style={{ color: C.grey }}>›</Text>
                </Pressable>) : null; })}
            </View>
          ) : <Muted style={{ marginTop: 6 }}>No projects assigned</Muted>)}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn label="Edit" kind="dark" small onPress={() => setForm(u)} />
            <Btn label="Reset password" kind="ghost" small onPress={async () => { if (await confirm(`Reset password for ${u.name}?`, 'A temporary password will be generated.', 'Reset')) { try { const r = await api('PATCH', `/users/${u.id}`, { reset_password: true }); setSecret({ name: u.name, email: u.email, pw: r.temporary_password }); } catch (e) { toast(e.message, 'err'); } } }} />
          </View>
        </Card>
      ))}
      <FormModal visible={form !== null} title={form === 'new' ? 'Add user' : 'Edit user'} fields={fields} onClose={() => setForm(null)}
        initial={form && form !== 'new' ? { ...form, password: '', active: !!form.active, preset: 'viewer' } : { role: 'VIEWER', project_ids: [], preset: 'viewer' }}
        onSubmit={async (v) => {
          if (form === 'new') {
            const r = await api('POST', '/users', { name: v.name, email: v.email, role: v.role, password: v.password || undefined, access: v.role === 'ADMIN' ? [] : (v.project_ids || []).map((project_id) => ({ project_id, preset: v.preset || 'viewer' })) });
            if (r.temporary_password) setSecret({ name: v.name, email: v.email, pw: r.temporary_password });
            toast('User created');
          } else {
            await api('PATCH', `/users/${form.id}`, { name: v.name, email: v.email, role: v.role, active: v.active ? 1 : 0, password: v.password || undefined });
            // sync project access for viewers
            const want = v.role === 'ADMIN' ? [] : v.project_ids || []; const have = form.project_ids || [];
            for (const id of want.filter((x) => !have.includes(x))) await api('PUT', `/projects/${id}/members/${form.id}`, { preset: v.preset || 'viewer' });
            for (const id of have.filter((x) => !want.includes(x))) await api('DELETE', `/projects/${id}/members/${form.id}`);
            toast('User saved');
          }
          setForm(null); load();
        }} />
      <AccessEditor visible={!!access} projectId={access && access.access.project_id} projectName={access && (projects.find((x) => x.id === access.access.project_id) || {}).name}
        member={access && { id: access.user.id, name: access.user.name, permissions: access.access.permissions }} onClose={() => setAccess(null)} onSaved={() => { setAccess(null); load(); }} />
      <Sheet visible={!!secret} title="Temporary password" onClose={() => setSecret(null)}>
        {secret && <View><Text style={{ marginBottom: 8 }}>Give these sign-in details to {secret.name}. This password is shown only once.</Text>
          <Card><Text selectable style={{ fontWeight: '700' }}>{secret.email}</Text><Text selectable style={{ fontSize: 20, fontWeight: '900', color: C.navy, marginTop: 6 }}>{secret.pw}</Text></Card>
          <Btn label="Done" onPress={() => setSecret(null)} /></View>}
      </Sheet>
    </View>
  );
}

export function Account({ user, onLogout }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <H>My account</H>
      <Card><Text style={{ fontWeight: '800', fontSize: 16 }}>{user.name}</Text><Muted>{user.email}  ·  {user.role === 'ADMIN' ? 'Administrator' : 'Team member'}</Muted></Card>
      <View style={{ flexDirection: 'row', gap: 10 }}><Btn label="Change password" kind="dark" onPress={() => setOpen(true)} /><Btn label="Sign out" kind="ghost" onPress={onLogout} /></View>
      <FormModal visible={open} title="Change password" onClose={() => setOpen(false)} submitLabel="Change password"
        fields={[{ key: 'current_password', label: 'Current password', secure: true, required: true, autoCapitalize: 'none' }, { key: 'new_password', label: 'New password (8+ characters)', secure: true, required: true, autoCapitalize: 'none' }]}
        initial={{}} onSubmit={async (v) => { await api('POST', '/auth/change-password', v); toast('Password changed'); setOpen(false); }} />
    </View>
  );
}
