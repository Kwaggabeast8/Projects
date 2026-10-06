import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// On the web the app is served by the same server as the API. On phones (Expo Go / native build)
// the server address is entered on the sign-in screen, or set with EXPO_PUBLIC_API_URL.
let base = process.env.EXPO_PUBLIC_API_URL || '';
let token = null;
let onAuthLost = () => {};

export const isWeb = Platform.OS === 'web';
export const setOnAuthLost = (fn) => { onAuthLost = fn; };
export const getBase = () => base;
export async function loadSession() {
  const [t, b] = await Promise.all([AsyncStorage.getItem('mf_token'), AsyncStorage.getItem('mf_server')]);
  if (b) base = b;
  token = t;
  return { token: t, server: base };
}
export async function setServer(url) {
  base = (url || '').trim().replace(/\/+$/, '');
  await AsyncStorage.setItem('mf_server', base);
}
export async function setToken(t) {
  token = t;
  if (t) await AsyncStorage.setItem('mf_token', t); else await AsyncStorage.removeItem('mf_token');
}
export const getToken = () => token;

const url = (p) => `${base}/api${p}`;

export async function api(method, path, body) {
  let res;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  try {
    res = await fetch(url(path), {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (e) {
    throw new Error('Cannot reach the MF server. Check your internet connection and server address.');
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401 && token && path !== '/auth/login') { onAuthLost(); }
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

// image URL for <Image>; uses the session token as a query parameter (images cannot send headers on the web)
export const fileUrl = (id) => `${url(`/files/${id}`)}?t=${encodeURIComponent(token || '')}`;

// Downloads (PDF report / backups) use a 10 minute link token instead of the long session token.
export async function downloadUrl(path, params = {}) {
  const { token: lt } = await api('POST', '/auth/link-token');
  const q = Object.entries({ ...params, t: lt }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${url(path)}?${q}`;
}

// Upload local photos. items: [{uri, name, mimeType, caption}]
export async function uploadPhotos(projectId, ids, items) {
  if (!items.length) return [];
  const form = new FormData();
  Object.entries(ids).forEach(([k, v]) => v != null && form.append(k, String(v)));
  for (const it of items) {
    const name = it.name || `photo-${Date.now()}.jpg`;
    const type = it.mimeType || 'image/jpeg';
    if (isWeb) form.append('photos', await (await fetch(it.uri)).blob(), name);
    else form.append('photos', { uri: it.uri, name, type });
    form.append('captions', it.caption || '');
  }
  return (await api('POST', `/projects/${projectId}/files`, form)).files;
}

// Realtime: Server-Sent Events on the web, light polling on native.
export function subscribeRealtime(onEvent) {
  if (typeof EventSource !== 'undefined' && token) {
    const es = new EventSource(`${url('/events')}?t=${encodeURIComponent(token)}`);
    es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch (_) { /* ignore */ } };
    return () => es.close();
  }
  const id = setInterval(() => onEvent({ projectId: null, kind: 'poll' }), 12000);
  return () => clearInterval(id);
}
