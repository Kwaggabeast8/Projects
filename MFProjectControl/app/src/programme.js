import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { api } from './api';
import { C, fmtDate, pct, sgn, varColor, statusColor, addDays, diffDays, todayStr, isDate } from './theme';
import { Btn, Card, Chips, FormModal, Muted, Pill, Stat, Bar, Empty, useUI, useWide } from './ui';

export function SummaryStats({ summary }) {
  const s = summary;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
      <Stat label="Actual" value={pct(s.actual)} color={C.blue} />
      <Stat label="Planned" value={pct(s.planned)} color={C.grey} />
      <Stat label="Variance" value={sgn(s.variance)} color={varColor(s.variance)} sub={s.ahead_behind === 'on programme' ? 'On programme' : `${Math.abs(s.variance).toFixed(1)}% ${s.ahead_behind}`} />
      <Stat label="Status" value={s.programme_status} color={statusColor(s.programme_status)} />
    </View>
  );
}

function ActivityForm({ visible, onClose, activity, acts, projectId, onSaved }) {
  const { toast } = useUI();
  const edit = !!activity;
  const initial = activity
    ? { ...activity, predecessors: activity.predecessors, duration: String(activity.duration || 1), weight: String(activity.weight), actual_progress: String(activity.actual_progress) }
    : { name: '', start_date: todayStr(), finish_date: todayStr(), duration: '1', weight: '1', actual_progress: '0', is_milestone: false, predecessors: [], notes: '' };
  const fields = [
    { key: 'name', label: 'Activity name', required: true },
    { key: 'is_milestone', label: 'This is a milestone (zero duration)', type: 'toggle' },
    { key: 'start_date', label: 'Start date', type: 'date', required: true,
      onChange: (v, n) => (isDate(v) && Number(n.duration) >= 1 ? { finish_date: addDays(v, Number(n.duration) - 1) } : {}) },
    { key: 'finish_date', label: 'Finish date', type: 'date', hidden: (v) => v.is_milestone,
      onChange: (v, n) => (isDate(v) && isDate(n.start_date) && v >= n.start_date ? { duration: String(diffDays(n.start_date, v) + 1) } : {}) },
    { key: 'duration', label: 'Duration (days)', type: 'number', hidden: (v) => v.is_milestone,
      onChange: (v, n) => (isDate(n.start_date) && Number.isInteger(Number(v)) && Number(v) >= 1 ? { finish_date: addDays(n.start_date, Number(v) - 1) } : {}) },
    { key: 'weight', label: 'Weight (relative value of this activity)', type: 'number', hint: 'Overall progress is the weighted average of activity progress. Use e.g. the cost or labour share.' },
    { key: 'actual_progress', label: 'Actual progress %', type: 'number' },
    { key: 'predecessors', label: 'Predecessors (this activity follows)', type: 'multi', empty: 'Add other activities first.', options: acts.filter((a) => !activity || a.id !== activity.id).map((a) => ({ value: a.id, label: `${acts.indexOf(a) + 1}. ${a.name}` })) },
    { key: 'notes', label: 'Notes', type: 'multiline' },
  ];
  return (
    <FormModal visible={visible} title={edit ? 'Edit activity' : 'Add activity'} fields={fields} initial={initial} onClose={onClose}
      onDelete={edit ? async () => { await api('DELETE', `/activities/${activity.id}`); toast('Activity deleted'); onSaved(); } : undefined}
      onSubmit={async (v) => {
        const body = { name: v.name, start_date: v.start_date, weight: Number(v.weight), actual_progress: Number(v.actual_progress), is_milestone: !!v.is_milestone, predecessors: v.predecessors || [], notes: v.notes || '' };
        if (!v.is_milestone) { body.finish_date = v.finish_date; }
        const r = edit ? await api('PATCH', `/activities/${activity.id}`, body) : await api('POST', `/projects/${projectId}/activities`, body);
        const shifted = (r.shifted_activity_ids || []).filter((i) => !edit || i !== activity.id);
        toast(shifted.length ? `Saved. ${shifted.length} dependent activit${shifted.length === 1 ? 'y was' : 'ies were'} moved to follow it.` : 'Activity saved');
        onSaved();
      }} />
  );
}

export function ProgrammeTab({ data, pm, reload, projectId }) {
  const { toast } = useUI();
  const has = (k, ...lv) => lv.includes(pm[k]);
  const canFull = has('programme', 'edit');          // dates, structure, add/delete, reorder
  const canProgress = has('programme', 'progress', 'edit'); // update % complete
  const showList = has('programme', 'view', 'progress', 'edit');
  const showGantt = has('gantt', 'view');
  const admin = canFull;
  const [mode, setMode] = useState(showList ? 'table' : 'gantt');
  const [editing, setEditing] = useState(null); // null | 'new' | activity
  const acts = data.activities;
  const done = () => { setEditing(null); reload(); };
  const move = async (i, dir) => {
    const ids = acts.map((a) => a.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api('POST', `/projects/${projectId}/activities/reorder`, { ids }); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const setProgress = async (a, v) => { try { await api('PATCH', `/activities/${a.id}`, { actual_progress: v }); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <View>
      <SummaryStats summary={data.summary} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        {showList && showGantt ? <Chips options={[{ value: 'table', label: 'Activity list' }, { value: 'gantt', label: 'Gantt chart' }]} value={mode} onChange={setMode} /> : <View />}
        {admin && <Btn label="+ Add activity" small onPress={() => setEditing('new')} />}
      </View>
      {!acts.length && <Card><Empty text={admin ? 'No activities yet. Tap "+ Add activity" to start building the programme.' : 'No programme has been captured for this project yet.'} /></Card>}
      {!!acts.length && showGantt && (mode === 'gantt' || !showList) && <Gantt data={data} onEdit={admin ? (a) => setEditing(a) : null} />}
      {!!acts.length && showList && (mode === 'table' || !showGantt) && acts.map((a, i) => (
        <Card key={a.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontWeight: '800', color: C.navy, fontSize: 15, flex: 1 }}>{i + 1}. {a.is_milestone ? '◆ ' : ''}{a.name}</Text>
            {admin && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable accessibilityLabel="Move up" onPress={() => move(i, -1)} style={s.mv}><Text style={s.mvT}>▲</Text></Pressable>
                <Pressable accessibilityLabel="Move down" onPress={() => move(i, 1)} style={s.mv}><Text style={s.mvT}>▼</Text></Pressable>
              </View>
            )}
          </View>
          <Muted style={{ marginTop: 4 }}>
            {a.is_milestone ? fmtDate(a.start_date) : `${fmtDate(a.start_date)} → ${fmtDate(a.finish_date)}  ·  ${a.duration} day${a.duration === 1 ? '' : 's'}`}  ·  Weight {a.weight}
          </Muted>
          {!!a.predecessors.length && <Muted>Follows: {a.predecessors.map((p) => acts.findIndex((x) => x.id === p) + 1).join(', ')}</Muted>}
          <View style={{ marginTop: 8, gap: 5 }}>
            <View style={s.line}><Text style={s.lbl}>Actual</Text><View style={{ flex: 1 }}><Bar value={a.actual_progress} color={a.actual_progress >= 100 ? C.green : C.blue} /></View><Text style={s.val}>{Math.round(a.actual_progress)}%</Text></View>
            <View style={s.line}><Text style={s.lbl}>Planned</Text><View style={{ flex: 1 }}><Bar value={a.planned_progress} color={C.grey} /></View><Text style={s.val}>{Math.round(a.planned_progress)}%</Text></View>
          </View>
          {!!a.notes && <Muted style={{ marginTop: 6 }}>{a.notes}</Muted>}
          {canProgress && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
              {[0, 25, 50, 75, 100].map((v) => <Pressable key={v} onPress={() => setProgress(a, v)} style={[s.q, Math.round(a.actual_progress) === v && { backgroundColor: C.navy }]}><Text style={{ fontSize: 12, fontWeight: '700', color: Math.round(a.actual_progress) === v ? '#fff' : C.ink }}>{v}%</Text></Pressable>)}
              <View style={{ flex: 1 }} />
              {canFull && <Btn label="Edit" kind="dark" small onPress={() => setEditing(a)} />}
            </View>
          )}
        </Card>
      ))}
      {admin && <ActivityForm visible={editing !== null} activity={editing && editing !== 'new' ? editing : null} acts={acts} projectId={projectId} onClose={() => setEditing(null)} onSaved={done} />}
    </View>
  );
}

// ---------- Gantt ----------
const ROW = 36, HEAD = 44;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function Gantt({ data, onEdit }) {
  const wide = useWide();
  const [zoom, setZoom] = useState(8);
  const acts = data.activities, p = data.project;
  const today = todayStr();
  const labelW = wide ? 220 : 120;
  const scroller = useRef(null);
  const g = useMemo(() => {
    const dates = [...acts.map((a) => a.start_date), ...acts.map((a) => a.finish_date), today, p.baseline_start, p.baseline_finish, p.forecast_finish].filter(Boolean);
    const lo = addDays(dates.reduce((m, d) => (d < m ? d : m)), -3);
    const hi = addDays(dates.reduce((m, d) => (d > m ? d : m)), 5);
    return { lo, hi, days: diffDays(lo, hi) + 1 };
  }, [acts, p, today]);
  const x = (d) => diffDays(g.lo, d) * zoom;
  const width = g.days * zoom;
  const idx = new Map(acts.map((a, i) => [a.id, i]));
  // header ticks
  const months = []; const ticks = [];
  { const d = new Date(g.lo + 'T00:00:00Z'); let cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    while (cur.toISOString().slice(0, 10) <= g.hi) {
      const ds = cur.toISOString().slice(0, 10);
      months.push({ left: Math.max(0, x(ds)), label: `${MONTHS[cur.getUTCMonth()]} ${cur.getUTCFullYear()}` });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    } }
  if (zoom >= 8) for (let i = 0; i < g.days; i++) { const ds = addDays(g.lo, i); const dow = new Date(ds + 'T00:00:00Z').getUTCDay(); if (zoom >= 22 || dow === 1) ticks.push({ left: i * zoom, label: ds.slice(8) }); }
  const bar = (a) => (a.is_milestone ? { l: x(a.start_date) + zoom / 2, r: x(a.start_date) + zoom / 2 } : { l: x(a.start_date), r: x(a.finish_date) + zoom });
  const links = [];
  acts.forEach((a, i) => a.predecessors.forEach((pid) => { const pi = idx.get(pid); if (pi !== undefined) links.push({ from: pi, to: i }); }));
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Muted>Zoom</Muted>
        <Chips options={[{ value: 3, label: 'Months' }, { value: 8, label: 'Weeks' }, { value: 22, label: 'Days' }]} value={zoom} onChange={setZoom} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: labelW, borderRightWidth: 1, borderColor: C.line }}>
          <View style={{ height: HEAD, backgroundColor: C.navy, justifyContent: 'center', paddingLeft: 8 }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Activity</Text></View>
          {acts.map((a, i) => (
            <Pressable key={a.id} disabled={!onEdit} onPress={() => onEdit && onEdit(a)} style={{ height: ROW, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: i % 2 ? '#fff' : '#F6F8FA' }}>
              <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink, fontWeight: a.is_milestone ? '800' : '500' }}>{i + 1}. {a.name}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator style={{ flex: 1 }} onContentSizeChange={() => { if (!scroller.current._done) { scroller.current._done = true; scroller.current.scrollTo({ x: Math.max(0, diffDays(g.lo, today) * zoom - 80), animated: false }); } }}>
          <View style={{ width, height: HEAD + ROW * acts.length }}>
            <View style={{ height: HEAD, backgroundColor: C.navy }}>
              {months.map((m, i) => <Text key={i} style={[s.mon, { left: m.left + 3 }]}>{m.label}</Text>)}
              {ticks.map((t, i) => <Text key={i} style={[s.tick, { left: t.left + 1 }]}>{t.label}</Text>)}
            </View>
            {acts.map((a, i) => <View key={a.id} style={{ position: 'absolute', top: HEAD + i * ROW, height: ROW, left: 0, right: 0, backgroundColor: i % 2 ? '#fff' : '#F6F8FA' }} />)}
            {months.map((m, i) => <View key={i} style={{ position: 'absolute', left: m.left, top: HEAD, bottom: 0, width: 1, backgroundColor: '#E3E8EE' }} />)}
            {/* dependency connectors */}
            {links.map((l, i) => {
              const A = acts[l.from], B = acts[l.to]; const a = bar(A), b = bar(B);
              const y1 = HEAD + l.from * ROW + ROW / 2, y2 = HEAD + l.to * ROW + ROW / 2;
              const mid = Math.max(a.r + 6, Math.min(b.l - 6, a.r + 6));
              const col = '#5B6B80';
              return (
                <React.Fragment key={i}>
                  <View style={{ position: 'absolute', left: a.r, width: Math.max(mid - a.r, 1), top: y1, height: 1.5, backgroundColor: col }} />
                  <View style={{ position: 'absolute', left: mid, top: Math.min(y1, y2), height: Math.abs(y2 - y1) + 1.5, width: 1.5, backgroundColor: col }} />
                  <View style={{ position: 'absolute', left: Math.min(mid, b.l - 1), width: Math.max(Math.abs(b.l - mid), 4), top: y2, height: 1.5, backgroundColor: col }} />
                  <View style={{ position: 'absolute', left: b.l - 5, top: y2 - 3.5, width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: col }} />
                </React.Fragment>
              );
            })}
            {acts.map((a, i) => {
              const top = HEAD + i * ROW;
              if (a.is_milestone) {
                const cx = x(a.start_date) + zoom / 2;
                return <Pressable key={a.id} disabled={!onEdit} onPress={() => onEdit(a)} style={{ position: 'absolute', left: cx - 9, top: top + ROW / 2 - 9, width: 18, height: 18 }}><View style={{ width: 13, height: 13, margin: 2.5, transform: [{ rotate: '45deg' }], backgroundColor: a.actual_progress >= 100 ? C.green : C.navy }} /></Pressable>;
              }
              const l = x(a.start_date), w = Math.max((diffDays(a.start_date, a.finish_date) + 1) * zoom, 4);
              return (
                <Pressable key={a.id} disabled={!onEdit} onPress={() => onEdit(a)} style={{ position: 'absolute', left: l, top: top + 7, width: w, height: ROW - 14 }}>
                  <View style={{ flex: 1, backgroundColor: '#C9D3E0', borderRadius: 3, borderWidth: 1, borderColor: '#8896A9', overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(a.actual_progress, 100)}%`, height: '100%', backgroundColor: a.actual_progress >= 100 ? C.green : C.blue }} />
                    <View style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${a.planned_progress}%`, backgroundColor: C.grey }} />
                  </View>
                  {w > 34 && <Text style={s.barText}>{Math.round(a.actual_progress)}%</Text>}
                </Pressable>
              );
            })}
            {today >= g.lo && today <= g.hi && <View style={{ position: 'absolute', left: x(today) + zoom / 2, top: HEAD, bottom: 0, width: 2, backgroundColor: C.red, opacity: 0.8 }} />}
            {p.baseline_finish && <View style={{ position: 'absolute', left: x(p.baseline_finish) + zoom, top: HEAD, bottom: 0, width: 0, borderLeftWidth: 1.5, borderLeftColor: C.orange, borderStyle: 'dashed' }} />}
          </View>
        </ScrollView>
      </View>
      <View style={{ padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {[[C.blue, 'Actual'], ['#C9D3E0', 'Planned duration'], [C.grey, 'Planned progress'], [C.navy, 'Milestone'], [C.red, 'Today'], [C.orange, 'Baseline finish']].map(([c, t]) => <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 10, height: 10, backgroundColor: c }} /><Muted style={{ fontSize: 11.5 }}>{t}</Muted></View>)}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  mv: { width: 32, height: 32, borderRadius: 6, backgroundColor: C.light, alignItems: 'center', justifyContent: 'center' },
  mvT: { color: C.navy, fontSize: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lbl: { width: 52, fontSize: 12, color: C.grey, fontWeight: '600' },
  val: { width: 38, textAlign: 'right', fontSize: 12, fontWeight: '700', color: C.ink },
  q: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: C.light },
  mon: { position: 'absolute', top: 5, color: '#fff', fontSize: 11, fontWeight: '700' },
  tick: { position: 'absolute', top: 26, color: '#B8C4D4', fontSize: 9.5 },
  barText: { position: 'absolute', left: 0, right: 0, textAlign: 'center', top: 3, fontSize: 10, fontWeight: '800', color: '#0b1b2e', pointerEvents: 'none' },
});
