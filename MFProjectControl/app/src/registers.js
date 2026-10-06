import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { api, uploadPhotos } from './api';
import { C, fmtDate, fmtTs, rand, todayStr, cap } from './theme';
import { Btn, Card, Empty, FormModal, Muted, Pill, useUI, Chips, st } from './ui';
import { PhotoGrid, PhotoPicker } from './photos';

const opts = (arr) => arr.map((v) => ({ value: v, label: cap(v) }));

function Register({ title, addLabel, admin, items, renderItem, fields, blank, route, itemRoute, onSaved, projectId, emptyText, summary, filter }) {
  const { toast } = useUI();
  const [editing, setEditing] = useState(null);
  const [filt, setFilt] = useState('all');
  const shown = filter ? items.filter((i) => filter.test(filt, i)) : items;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>{title}</Text>
        {admin && <Btn label={addLabel} small onPress={() => setEditing('new')} />}
      </View>
      {summary}
      {filter && <View style={{ marginBottom: 10 }}><Chips scroll options={filter.options} value={filt} onChange={setFilt} /></View>}
      {!shown.length && <Card><Empty text={emptyText} /></Card>}
      {shown.map((it) => (
        <Pressable key={it.id} disabled={!admin} onPress={() => setEditing(it)}>
          <Card>{renderItem(it)}{admin && <Muted style={{ marginTop: 8, fontSize: 12 }}>Tap to edit</Muted>}</Card>
        </Pressable>
      ))}
      {admin && (
        <FormModal visible={editing !== null} title={editing === 'new' ? addLabel.replace('+ ', '') : `Edit ${title.replace(/s$/, '')}`} fields={fields}
          initial={editing && editing !== 'new' ? { ...editing, amount: editing.amount != null ? String(editing.amount) : undefined } : blank()} onClose={() => setEditing(null)}
          onDelete={editing && editing !== 'new' ? async () => { await api('DELETE', `/${itemRoute}/${editing.id}`); toast('Deleted'); setEditing(null); onSaved(); } : undefined}
          onSubmit={async (v) => {
            const body = {}; fields.forEach((f) => { if (v[f.key] !== undefined && v[f.key] !== '') body[f.key] = v[f.key]; else if (editing !== 'new') body[f.key] = ''; });
            if (editing === 'new') await api('POST', `/projects/${projectId}/${route}`, body); else await api('PATCH', `/${itemRoute}/${editing.id}`, body);
            toast('Saved'); setEditing(null); onSaved();
          }} />
      )}
    </View>
  );
}

const RFI_COLOR = { OPEN: C.amber, RESPONDED: C.blue, CLOSED: C.green };
export function RfiTab({ data, admin, reload, projectId }) {
  const today = todayStr();
  return (
    <Register title="RFIs" addLabel="+ New RFI" admin={admin} items={data.rfis} route="rfis" itemRoute="rfis" projectId={projectId} onSaved={reload}
      emptyText="No RFIs recorded." filter={{ options: [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }], test: (f, i) => f === 'all' || (f === 'open' ? i.status !== 'CLOSED' : i.status === 'CLOSED') }}
      blank={() => ({ reference: '', subject: '', question: '', date_raised: today, due_date: '', status: 'OPEN', response: '', date_closed: '' })}
      fields={[
        { key: 'reference', label: 'RFI number / reference', hint: 'Leave blank to number automatically (RFI-001, RFI-002 ...)' },
        { key: 'subject', label: 'Subject', required: true }, { key: 'question', label: 'Question', type: 'multiline' },
        { key: 'date_raised', label: 'Date raised', type: 'date', required: true }, { key: 'due_date', label: 'Due date', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: opts(['OPEN', 'RESPONDED', 'CLOSED']) },
        { key: 'response', label: 'Response', type: 'multiline' }, { key: 'date_closed', label: 'Date closed (set automatically when closed)', type: 'date' },
      ]}
      renderItem={(r) => {
        const overdue = r.status !== 'CLOSED' && r.due_date && r.due_date < today;
        return (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ fontWeight: '800', color: C.navy, flex: 1 }}>{r.reference}  {r.subject}</Text><Pill text={cap(r.status)} color={RFI_COLOR[r.status]} /></View>
            {!!r.question && <Text style={{ color: C.ink, marginTop: 6 }}>{r.question}</Text>}
            <Muted style={{ marginTop: 6 }}>Raised {fmtDate(r.date_raised)}  ·  Due {fmtDate(r.due_date)}{overdue ? '  ·  OVERDUE' : ''}{r.date_closed ? `  ·  Closed ${fmtDate(r.date_closed)}` : ''}</Muted>
            {!!r.response && <Text style={{ marginTop: 6, color: C.ink }}><Text style={{ fontWeight: '700' }}>Response: </Text>{r.response}</Text>}
          </View>
        );
      }} />
  );
}

export function VariationTab({ data, admin, reload, projectId }) {
  const v = data.variations.filter((x) => x.status !== 'CANCELLED');
  const sum = (arr, k) => arr.reduce((t, x) => t + (Number(x[k]) || 0), 0);
  const appr = v.filter((x) => x.approval_status === 'APPROVED'), pend = v.filter((x) => x.approval_status === 'PENDING');
  return (
    <Register title="Variations" addLabel="+ New variation" admin={admin} items={data.variations} route="variations" itemRoute="variations" projectId={projectId} onSaved={reload} emptyText="No variations recorded."
      summary={<View style={{ flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <Card style={{ flexGrow: 1, flexBasis: 150, marginBottom: 0 }}><Muted>Approved</Muted><Text style={{ fontWeight: '800', fontSize: 17, color: C.green }}>{rand(sum(appr, 'amount'))}</Text><Muted>{sum(appr, 'time_impact_days')} days</Muted></Card>
        <Card style={{ flexGrow: 1, flexBasis: 150, marginBottom: 0 }}><Muted>Pending approval</Muted><Text style={{ fontWeight: '800', fontSize: 17, color: C.amber }}>{rand(sum(pend, 'amount'))}</Text><Muted>{sum(pend, 'time_impact_days')} days</Muted></Card>
      </View>}
      blank={() => ({ reference: '', description: '', amount: '0', time_impact_days: '0', status: 'DRAFT', approval_status: 'PENDING', date_created: todayStr() })}
      fields={[
        { key: 'reference', label: 'Reference', hint: 'Leave blank to number automatically (VO-001 ...)' },
        { key: 'description', label: 'Description', type: 'multiline', required: true },
        { key: 'amount', label: 'Value (Rand)', type: 'number' }, { key: 'time_impact_days', label: 'Time impact (days)', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', options: opts(['DRAFT', 'SUBMITTED', 'IMPLEMENTED', 'CANCELLED']) },
        { key: 'approval_status', label: 'Approval status', type: 'select', options: opts(['PENDING', 'APPROVED', 'REJECTED']) },
        { key: 'date_created', label: 'Date created', type: 'date', required: true },
      ]}
      renderItem={(x) => (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ fontWeight: '800', color: C.navy, flex: 1 }}>{x.reference}  {x.description}</Text><Pill text={cap(x.approval_status)} color={x.approval_status === 'APPROVED' ? C.green : x.approval_status === 'REJECTED' ? C.red : C.amber} /></View>
          <Text style={{ marginTop: 6, fontWeight: '700' }}>{rand(x.amount)}  <Text style={{ fontWeight: '400', color: C.grey }}>·  {x.time_impact_days} day{x.time_impact_days === 1 ? '' : 's'}  ·  {cap(x.status)}  ·  {fmtDate(x.date_created)}</Text></Text>
        </View>
      )} />
  );
}

export function DelayTab({ data, admin, reload, projectId }) {
  const open = data.delays.filter((d) => d.status === 'OPEN');
  return (
    <Register title="Delays" addLabel="+ Record delay" admin={admin} items={data.delays} route="delays" itemRoute="delays" projectId={projectId} onSaved={reload} emptyText="No delays recorded."
      summary={<Card><Muted>Open delays</Muted><Text style={{ fontWeight: '800', fontSize: 17, color: open.length ? C.red : C.green }}>{open.length} open  ·  {open.reduce((t, d) => t + d.days_impact, 0)} days</Text><Muted>{data.delays.reduce((t, d) => t + d.days_impact, 0)} days recorded in total</Muted></Card>}
      blank={() => ({ description: '', category: 'weather', date_recorded: todayStr(), days_impact: '0', status: 'OPEN' })}
      fields={[
        { key: 'description', label: 'Description', type: 'multiline', required: true },
        { key: 'category', label: 'Category', type: 'select', options: opts(['weather', 'client', 'material', 'subcontractor', 'other']) },
        { key: 'date_recorded', label: 'Date recorded', type: 'date', required: true }, { key: 'days_impact', label: 'Days impact', type: 'number' },
        { key: 'status', label: 'Status', type: 'select', options: opts(['OPEN', 'RESOLVED']) },
      ]}
      renderItem={(d) => (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ fontWeight: '800', color: C.navy, flex: 1 }}>{cap(d.category)}  ·  {d.days_impact} day{d.days_impact === 1 ? '' : 's'}</Text><Pill text={cap(d.status)} color={d.status === 'OPEN' ? C.red : C.green} /></View>
          <Text style={{ marginTop: 6, color: C.ink }}>{d.description}</Text><Muted style={{ marginTop: 4 }}>Recorded {fmtDate(d.date_recorded)}</Muted>
        </View>
      )} />
  );
}

// ---------- site updates (with photos) ----------
const SU_FIELDS = [
  { key: 'update_date', label: 'Date', type: 'date', required: true },
  { key: 'type', label: 'Update type', type: 'select', options: [{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }] },
  { key: 'progress_notes', label: 'Progress notes', type: 'multiline' }, { key: 'labour_count', label: 'Labour count (workers on site)', type: 'number' },
  { key: 'material_deliveries', label: 'Material deliveries', type: 'multiline' }, { key: 'work_completed', label: 'Work completed', type: 'multiline' },
  { key: 'current_work', label: 'Current work', type: 'multiline' }, { key: 'upcoming_work', label: 'Upcoming work', type: 'multiline' },
  { key: 'problems_risks', label: 'Problems / risks', type: 'multiline' }, { key: 'pm_comments', label: 'Project manager comments', type: 'multiline' },
];
export function SiteUpdatesTab({ data, admin, reload, projectId }) {
  const { toast } = useUI();
  const [editing, setEditing] = useState(null);
  const [photos, setPhotos] = useState([]);
  const open = (v) => { setPhotos([]); setEditing(v); };
  const sections = [['progress_notes', 'Progress notes'], ['work_completed', 'Work completed'], ['current_work', 'Current work'], ['upcoming_work', 'Upcoming work'], ['material_deliveries', 'Material deliveries'], ['problems_risks', 'Problems / risks'], ['pm_comments', 'PM comments']];
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>Site updates</Text>
        {admin && <Btn label="+ New update" small onPress={() => open('new')} />}
      </View>
      {!data.site_updates.length && <Card><Empty text="No site updates recorded." /></Card>}
      {data.site_updates.map((u) => (
        <Card key={u.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontWeight: '800', color: C.navy }}>{fmtDate(u.update_date)}  ·  {cap(u.type)} update</Text>
            {admin && <Btn label="Edit" kind="dark" small onPress={() => open(u)} />}
          </View>
          <Muted>{u.labour_count} on site{u.created_by_name ? `  ·  by ${u.created_by_name}` : ''}</Muted>
          {sections.map(([k, label]) => !!(u[k] || '').trim() && <Text key={k} style={{ marginTop: 6, color: C.ink }}><Text style={{ fontWeight: '700' }}>{label}: </Text>{u[k]}</Text>)}
          <PhotoGrid files={u.files} admin={admin} onChanged={reload} />
        </Card>
      ))}
      {admin && (
        <FormModal visible={editing !== null} title={editing === 'new' ? 'New site update' : 'Edit site update'} fields={SU_FIELDS} onClose={() => setEditing(null)}
          initial={editing && editing !== 'new' ? { ...editing, labour_count: String(editing.labour_count) } : { update_date: todayStr(), type: 'DAILY', labour_count: '0' }}
          onDelete={editing && editing !== 'new' ? async () => { await api('DELETE', `/site-updates/${editing.id}`); toast('Site update deleted'); setEditing(null); reload(); } : undefined}
          extra={() => (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.grey, marginBottom: 6 }}>Photos</Text>
              <PhotoPicker value={photos} onChange={setPhotos} />
              {editing && editing !== 'new' && <PhotoGrid files={editing.files} admin onChanged={() => { reload(); setEditing(null); }} />}
            </View>
          )}
          onSubmit={async (v) => {
            const body = {}; SU_FIELDS.forEach((f) => { if (v[f.key] !== undefined) body[f.key] = v[f.key]; });
            const r = editing === 'new' ? await api('POST', `/projects/${projectId}/site-updates`, body) : await api('PATCH', `/site-updates/${editing.id}`, body);
            const id = r.item.id;
            try { await uploadPhotos(projectId, { site_update_id: id }, photos); } catch (e) { toast(`Update saved, but photo upload failed: ${e.message}`, 'err'); setEditing(null); reload(); return; }
            toast(photos.length ? `Saved with ${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'Site update saved'); setEditing(null); reload();
          }} />
      )}
    </View>
  );
}

// ---------- comments ----------
export function CommentsTab({ data, admin, reload, projectId }) {
  const { toast, confirm } = useUI();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const post = async () => {
    if (!text.trim()) { toast('Write a comment first', 'err'); return; }
    setBusy(true);
    try {
      const r = await api('POST', `/projects/${projectId}/comments`, { body: text.trim() });
      if (photos.length) { try { await uploadPhotos(projectId, { comment_id: r.comment.id }, photos); } catch (e) { toast(`Comment posted, but photo upload failed: ${e.message}`, 'err'); } }
      setText(''); setPhotos([]); reload(); toast('Comment posted');
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy, marginBottom: 10 }}>Comments</Text>
      <Card>
        <TextInput value={text} onChangeText={setText} multiline placeholder="Add a comment..." style={[st.input, { minHeight: 80, textAlignVertical: 'top' }]} />
        <View style={{ marginTop: 10 }}><PhotoPicker value={photos} onChange={setPhotos} /></View>
        <View style={{ alignItems: 'flex-end', marginTop: 10 }}><Btn label="Post comment" onPress={post} busy={busy} /></View>
      </Card>
      {!data.comments.length && <Card><Empty text="No comments yet." /></Card>}
      {data.comments.map((c) => (
        <Card key={c.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: C.navy }}>{c.user_name}</Text><Muted style={{ fontSize: 12 }}>{fmtTs(c.created_at)}</Muted></View>
            {admin && <Btn label="Delete" kind="danger" small onPress={async () => { if (await confirm('Delete this comment?', 'The comment and its photos will be removed.')) { try { await api('DELETE', `/comments/${c.id}`); reload(); toast('Comment deleted'); } catch (e) { toast(e.message, 'err'); } } }} />}
          </View>
          <Text style={{ marginTop: 8, color: C.ink }}>{c.body}</Text>
          <PhotoGrid files={c.files} admin={admin} onChanged={reload} />
        </Card>
      ))}
    </View>
  );
}
