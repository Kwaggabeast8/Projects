import React, { useState } from 'react';
import { View, Text, Image, Pressable, TextInput, Modal, ScrollView, StyleSheet, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, fileUrl } from './api';
import { C } from './theme';
import { Btn, Muted, st, useUI } from './ui';

// Pick photos from the library or take one with the camera. value = [{uri,name,mimeType,caption}]
export function PhotoPicker({ value, onChange, multiple = true }) {
  const { toast } = useUI();
  const add = (assets) => onChange([...(value || []), ...assets.map((a) => ({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', caption: '' }))]);
  const library = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: multiple, quality: 0.7 });
      if (!r.canceled) add(r.assets);
    } catch (e) { toast(e.message, 'err'); }
  };
  const camera = async () => {
    try {
      if (Platform.OS !== 'web') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) { toast('Camera permission was denied. Enable it in your phone settings.', 'err'); return; }
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!r.canceled) add(r.assets);
    } catch (e) { toast(e.message, 'err'); }
  };
  const list = value || [];
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Btn label="Take photo" kind="dark" small onPress={camera} />
        <Btn label="Choose from gallery" kind="ghost" small onPress={library} />
      </View>
      {list.map((p, i) => (
        <View key={i} style={s.pending}>
          <Image source={{ uri: p.uri }} style={s.thumb} />
          <View style={{ flex: 1 }}>
            <TextInput value={p.caption} placeholder="Caption" onChangeText={(t) => onChange(list.map((x, j) => (j === i ? { ...x, caption: t } : x)))} style={[st.input, { minHeight: 36, paddingVertical: 6 }]} />
          </View>
          <Pressable onPress={() => onChange(list.filter((_, j) => j !== i))} hitSlop={10}><Text style={{ color: C.red, fontWeight: '700' }}>Remove</Text></Pressable>
        </View>
      ))}
    </View>
  );
}

// Thumbnails of stored photos; tap for a large view (admin can edit caption / delete).
export function PhotoGrid({ files, admin, onChanged }) {
  const [open, setOpen] = useState(null);
  const [caption, setCaption] = useState('');
  const { toast, confirm } = useUI();
  if (!files || !files.length) return null;
  const f = open != null ? files.find((x) => x.id === open) : null;
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {files.map((x) => (
          <Pressable key={x.id} onPress={() => { setOpen(x.id); setCaption(x.caption || ''); }} style={{ width: 96 }}>
            <Image source={{ uri: fileUrl(x.id) }} style={s.grid} resizeMode="cover" />
            {!!x.caption && <Text numberOfLines={1} style={{ fontSize: 11, color: C.grey, marginTop: 2 }}>{x.caption}</Text>}
          </Pressable>
        ))}
      </View>
      <Modal visible={!!f} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 12 }}>
          {f && <Image source={{ uri: fileUrl(f.id) }} resizeMode="contain" style={{ width: '100%', height: '65%' }} />}
          {f && admin ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <TextInput value={caption} onChangeText={setCaption} placeholder="Caption" placeholderTextColor="#999" style={[st.input, { backgroundColor: '#fff' }]} />
              <View style={st.row}>
                <Btn label="Save caption" small onPress={async () => { try { await api('PATCH', `/files/${f.id}`, { caption }); toast('Caption saved'); onChanged && onChanged(); } catch (e) { toast(e.message, 'err'); } }} />
                <Btn label="Delete photo" kind="danger" small onPress={async () => { if (await confirm('Delete this photo?', 'It will be removed permanently.')) { try { await api('DELETE', `/files/${f.id}`); setOpen(null); onChanged && onChanged(); } catch (e) { toast(e.message, 'err'); } } }} />
                <Btn label="Close" kind="ghost" small style={{ backgroundColor: '#fff' }} onPress={() => setOpen(null)} />
              </View>
            </View>
          ) : f ? (
            <View style={{ marginTop: 12, alignItems: 'center', gap: 10 }}>
              {!!f.caption && <Text style={{ color: '#fff' }}>{f.caption}</Text>}
              <Btn label="Close" kind="ghost" small style={{ backgroundColor: '#fff' }} onPress={() => setOpen(null)} />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  pending: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 6, backgroundColor: C.light },
  grid: { width: 96, height: 72, borderRadius: 6, backgroundColor: C.light },
});
