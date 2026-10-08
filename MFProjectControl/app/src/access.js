import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { api } from './api';
import { C } from './theme';
import { Btn, Chips, Muted, Sheet, st, useUI } from './ui';

// Friendly names for each level (they differ a little per section).
const LEVEL = {
  none: 'No access', view: 'View', progress: 'Update progress %', edit: 'Add / edit',
};
const EDIT_LABEL = { updates: 'Add & edit own', photos: 'Upload & manage own', comments: 'Can post', history: 'Take snapshots', programme: 'Full edit', gantt: 'Edit dates & progress', delays: 'Add / edit', rfis: 'Add / edit', variations: 'Add / edit' };
const ALL_LABEL = { updates: 'Edit everyone\'s', photos: 'Manage everyone\'s', comments: 'Post + delete any', history: 'Snapshots + delete' };

let metaCache = null;
export async function accessMeta() {
  if (!metaCache) metaCache = await api('GET', '/access-meta');
  return metaCache;
}
export const presetLabel = (preset, meta) => (preset === 'custom' ? 'Custom' : (meta && meta.presets[preset] ? meta.presets[preset].label : preset));

// Edit what one person can see / do on one project.
export function AccessEditor({ visible, projectId, projectName, member, onClose, onSaved }) {
  const { toast } = useUI();
  const [meta, setMeta] = useState(null);
  const [perms, setPerms] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { accessMeta().then(setMeta).catch((e) => toast(e.message, 'err')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (visible && member) setPerms({ ...member.permissions }); }, [visible, member]);
  if (!meta || !perms || !member) return <Sheet visible={false} onClose={onClose} />;
  const matches = (p) => meta.sections.every((s) => meta.presets[p].permissions[s.key] === perms[s.key]);
  const current = Object.keys(meta.presets).find(matches) || 'custom';
  const save = async () => {
    setBusy(true);
    try { await api('PUT', `/projects/${projectId}/members/${member.id}`, { permissions: perms }); toast(`Access saved for ${member.name}`); onSaved && onSaved(); } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return (
    <Sheet visible={visible} title={`${member.name} - access`} onClose={onClose}>
      {!!projectName && <Muted style={{ marginBottom: 10 }}>Project: {projectName}</Muted>}
      <Text style={st.label}>Quick setup</Text>
      <Chips value={current} onChange={(k) => k !== 'custom' && setPerms({ ...meta.presets[k].permissions })}
        options={[...Object.entries(meta.presets).map(([value, p]) => ({ value, label: p.label })), { value: 'custom', label: 'Custom' }]} />
      <Muted style={{ marginTop: 6, marginBottom: 14, fontSize: 12 }}>Pick a starting point, then adjust any section below.</Muted>
      {meta.sections.map((s) => (
        <View key={s.key} style={{ marginBottom: 14 }}>
          <Text style={{ fontWeight: '800', color: C.navy, marginBottom: 6 }}>{s.label}</Text>
          <Chips value={perms[s.key]} onChange={(v) => setPerms({ ...perms, [s.key]: v })}
            options={s.levels.map((v) => ({ value: v, label: v === 'all' ? ALL_LABEL[s.key] : v === 'edit' ? EDIT_LABEL[s.key] || LEVEL.edit : LEVEL[v] }))} />
          {!!s.hint && <Muted style={{ fontSize: 12, marginTop: 4 }}>{s.hint}</Muted>}
        </View>
      ))}
      <Btn label="Save access" onPress={save} busy={busy} />
    </Sheet>
  );
}
