import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, ActivityIndicator, StyleSheet, Platform, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { C, isDate } from './theme';

export const useWide = () => useWindowDimensions().width >= 820;

// ---------- toast + confirm context ----------
const Ctx = createContext({ toast: () => {}, confirm: async () => false });
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const [dlg, setDlg] = useState(null);
  const timer = useRef(null);
  const toast = (text, kind = 'ok') => {
    setMsg({ text, kind }); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), kind === 'err' ? 6000 : 3000);
  };
  const confirm = (title, body, okLabel = 'Delete') => new Promise((resolve) => setDlg({ title, body, okLabel, resolve }));
  const close = (v) => { dlg.resolve(v); setDlg(null); };
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      {msg && (
        <View pointerEvents="none" style={[st.toast, { backgroundColor: msg.kind === 'err' ? C.red : C.navy }]}>
          <Text style={st.toastText}>{msg.text}</Text>
        </View>
      )}
      <Modal visible={!!dlg} transparent animationType="fade" onRequestClose={() => close(false)}>
        <View style={st.backdrop}>
          <View style={st.dialog}>
            <Text style={st.dlgTitle}>{dlg && dlg.title}</Text>
            {!!(dlg && dlg.body) && <Text style={st.dlgBody}>{dlg.body}</Text>}
            <View style={st.row}>
              <Btn label="Cancel" kind="ghost" onPress={() => close(false)} />
              <Btn label={dlg ? dlg.okLabel : 'OK'} kind={dlg && dlg.okLabel === 'Delete' ? 'danger' : 'primary'} onPress={() => close(true)} />
            </View>
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

// ---------- basics ----------
export function Btn({ label, onPress, kind = 'primary', small, disabled, busy, style }) {
  const bg = kind === 'primary' ? C.orange : kind === 'danger' ? C.red : kind === 'dark' ? C.navy : 'transparent';
  const fg = kind === 'ghost' ? C.navy : '#fff';
  const border = kind === 'ghost' ? C.line : kind === 'light' ? '#46638A' : null;
  return (
    <Pressable accessibilityRole="button" onPress={disabled || busy ? undefined : onPress}
      style={({ pressed }) => [st.btn, small && st.btnSm, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, border && { borderWidth: 1, borderColor: border }, style]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : <Text style={[st.btnText, small && { fontSize: 12.5 }, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}
export const Card = ({ children, style }) => <View style={[st.card, style]}>{children}</View>;
export const H = ({ children, style }) => <Text style={[st.h, style]}>{children}</Text>;
export const Muted = ({ children, style, ...r }) => <Text style={[{ color: C.grey, fontSize: 13 }, style]} {...r}>{children}</Text>;
export const Pill = ({ text, color = C.grey }) => (
  <View style={{ backgroundColor: color + '22', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
    <Text style={{ color, fontSize: 11.5, fontWeight: '700' }}>{text}</Text>
  </View>
);
export const Empty = ({ text }) => <View style={{ padding: 28, alignItems: 'center' }}><Muted>{text}</Muted></View>;
export function Loading() { return <View style={{ padding: 40 }}><ActivityIndicator size="large" color={C.orange} /></View>; }
export function ErrorBox({ message, onRetry }) {
  return <Card style={{ borderColor: C.red, borderWidth: 1 }}><Text style={{ color: C.red, marginBottom: 8 }}>{message}</Text>{onRetry && <Btn label="Try again" kind="dark" small onPress={onRetry} />}</Card>;
}
export function Bar({ value, color = C.blue, height = 8 }) {
  return <View style={{ height, backgroundColor: C.line, borderRadius: height / 2, overflow: 'hidden' }}><View style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, height, backgroundColor: color }} /></View>;
}
export function Stat({ label, value, color = C.ink, sub }) {
  return (
    <View style={st.stat}>
      <Text style={{ color: C.grey, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ color, fontSize: 20, fontWeight: '800', marginTop: 2 }} numberOfLines={2}>{value}</Text>
      {!!sub && <Muted style={{ fontSize: 11.5 }}>{sub}</Muted>}
    </View>
  );
}
export function Chips({ options, value, onChange, scroll }) {
  const body = options.map((o) => {
    const on = value === o.value;
    return <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[st.chip, on && { backgroundColor: C.navy, borderColor: C.navy }]}><Text style={{ color: on ? '#fff' : C.ink, fontSize: 13, fontWeight: '600' }}>{o.label}</Text></Pressable>;
  });
  return scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={st.chipRow}>{body}</View></ScrollView> : <View style={[st.chipRow, { flexWrap: 'wrap' }]}>{body}</View>;
}

// ---------- form inputs ----------
export function DateInput({ value, onChange, placeholder = 'YYYY-MM-DD' }) {
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'date', value: value || '', onChange: (e) => onChange(e.target.value),
      style: { border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', color: C.ink, backgroundColor: '#fff', width: '100%', boxSizing: 'border-box', minHeight: 42 },
    });
  }
  const bad = value && !isDate(value);
  return <TextInput value={value || ''} onChangeText={onChange} placeholder={placeholder} keyboardType="numbers-and-punctuation" maxLength={10} style={[st.input, bad && { borderColor: C.red }]} />;
}

// fields: [{key, label, type: text|multiline|number|date|select|toggle|multi, options, required, hint}]
export function FormModal({ visible, title, fields, initial, onSubmit, onClose, onDelete, submitLabel = 'Save', extra }) {
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { confirm } = useUI();
  useEffect(() => { if (visible) { setVals({ ...(initial || {}) }); setErr(''); setBusy(false); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setVals((p) => {
    const n = { ...p, [k]: v };
    const f = fields.find((x) => x.key === k);
    if (f && f.onChange) Object.assign(n, f.onChange(v, n));
    return n;
  });
  const submit = async () => {
    for (const f of fields) {
      if (f.hidden && f.hidden(vals)) continue;
      const v = vals[f.key];
      if (f.required && (v === undefined || v === null || String(v).trim() === '')) { setErr(`${f.label} is required`); return; }
      if (f.type === 'date' && v && !isDate(v)) { setErr(`${f.label} must be a date (YYYY-MM-DD)`); return; }
      if (f.type === 'number' && v !== '' && v != null && !Number.isFinite(Number(v))) { setErr(`${f.label} must be a number`); return; }
    }
    setBusy(true); setErr('');
    try { await onSubmit(vals); } catch (e) { setErr(e.message); setBusy(false); return; }
    setBusy(false);
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.sheetHead}>
            <Text style={st.sheetTitle} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 24, color: C.grey }}>×</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            {fields.map((f) => {
              if (f.hidden && f.hidden(vals)) return null;
              const v = vals[f.key];
              return (
                <View key={f.key} style={{ marginBottom: 14 }}>
                  {f.type !== 'toggle' && <Text style={st.label}>{f.label}{f.required ? ' *' : ''}</Text>}
                  {f.type === 'date' && <DateInput value={v} onChange={(x) => set(f.key, x)} />}
                  {(f.type === 'text' || f.type === 'multiline' || f.type === 'number' || !f.type) && (
                    <TextInput value={v == null ? '' : String(v)} onChangeText={(x) => set(f.key, x)} multiline={f.type === 'multiline'}
                      keyboardType={f.type === 'number' ? 'decimal-pad' : f.keyboard || 'default'} secureTextEntry={f.secure} autoCapitalize={f.autoCapitalize || 'sentences'}
                      placeholder={f.placeholder} style={[st.input, f.type === 'multiline' && { minHeight: 90, textAlignVertical: 'top' }]} />
                  )}
                  {f.type === 'select' && <Chips options={f.options} value={v} onChange={(x) => set(f.key, x)} />}
                  {f.type === 'toggle' && (
                    <Pressable onPress={() => set(f.key, !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[st.check, !!v && { backgroundColor: C.orange, borderColor: C.orange }]}>{!!v && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}</View>
                      <Text style={{ color: C.ink, fontSize: 15 }}>{f.label}</Text>
                    </Pressable>
                  )}
                  {f.type === 'multi' && (
                    f.options.length ? (
                      <View style={st.chipRow}>
                        {f.options.map((o) => {
                          const on = (v || []).includes(o.value);
                          return <Pressable key={o.value} onPress={() => set(f.key, on ? v.filter((x) => x !== o.value) : [...(v || []), o.value])} style={[st.chip, on && { backgroundColor: C.navy, borderColor: C.navy }]}><Text style={{ color: on ? '#fff' : C.ink, fontSize: 13 }}>{o.label}</Text></Pressable>;
                        })}
                      </View>
                    ) : <Muted>{f.empty || 'Nothing to choose from'}</Muted>
                  )}
                  {!!f.hint && <Muted style={{ marginTop: 4, fontSize: 12 }}>{f.hint}</Muted>}
                </View>
              );
            })}
            {extra && extra(vals, setVals)}
            {!!err && <Text style={{ color: C.red, marginBottom: 10 }}>{err}</Text>}
            <View style={st.row}>
              <Btn label={submitLabel} onPress={submit} busy={busy} style={{ flex: 1 }} />
              {onDelete && <Btn label="Delete" kind="danger" onPress={async () => { if (await confirm('Delete this item?', 'This cannot be undone.')) { try { setBusy(true); await onDelete(); } catch (e) { setErr(e.message); setBusy(false); } } }} />}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Sheet({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.sheetHead}><Text style={st.sheetTitle} numberOfLines={1}>{title}</Text><Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 24, color: C.grey }}>×</Text></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const st = StyleSheet.create({
  btn: { minHeight: 42, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnSm: { minHeight: 34, paddingHorizontal: 12 },
  btnText: { fontWeight: '700', fontSize: 14.5 },
  card: { backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  h: { fontSize: 18, fontWeight: '800', color: C.navy, marginBottom: 10 },
  stat: { flexGrow: 1, flexBasis: 140, backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.line },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink, backgroundColor: '#fff', minHeight: 42 },
  label: { fontSize: 12.5, fontWeight: '700', color: C.grey, marginBottom: 5 },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: C.grey, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,20,35,0.55)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: '#fff', width: '100%', maxWidth: 640, maxHeight: '92%', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden', flexShrink: 1 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: C.line },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: C.navy, flex: 1 },
  dialog: { backgroundColor: '#fff', margin: 20, padding: 20, borderRadius: 12, width: '90%', maxWidth: 420, alignSelf: 'center', marginBottom: 'auto', marginTop: 'auto' },
  dlgTitle: { fontSize: 17, fontWeight: '800', color: C.navy, marginBottom: 6 },
  dlgBody: { color: C.grey, marginBottom: 16 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 24, padding: 14, borderRadius: 10, maxWidth: 560, alignSelf: 'center', zIndex: 99 },
  toastText: { color: '#fff', fontWeight: '600' },
});
