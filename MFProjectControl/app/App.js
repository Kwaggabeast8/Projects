import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { api, loadSession, setOnAuthLost, setToken, subscribeRealtime } from './src/api';
import { C } from './src/theme';
import { UIProvider, Loading, useUI } from './src/ui';
import { Login, Header, Page, Projects, ProjectScreen, Users, Account } from './src/screens';

function Shell() {
  const { toast } = useUI();
  const [boot, setBoot] = useState(true);
  const [user, setUser] = useState(null);
  const [nav, setNavState] = useState({ screen: 'projects' });
  const [rt, setRt] = useState(0); // bumps on realtime events so screens refetch
  const [title, setTitle] = useState('');
  const navRef = useRef(nav);

  const setNav = useCallback((n) => {
    navRef.current = n; setNavState(n);
    AsyncStorage.setItem('mf_nav', JSON.stringify(n)).catch(() => {});
  }, []);

  const logout = useCallback(async () => { await setToken(null); setUser(null); setNav({ screen: 'projects' }); }, [setNav]);

  useEffect(() => {
    setOnAuthLost(() => { setToken(null); setUser(null); toast('Your session has ended. Please sign in again.', 'err'); });
    (async () => {
      const { token } = await loadSession();
      try { const saved = JSON.parse((await AsyncStorage.getItem('mf_nav')) || 'null'); if (saved && saved.screen) { navRef.current = saved; setNavState(saved); } } catch (_) { /* ignore */ }
      if (token) { try { setUser((await api('GET', '/auth/me')).user); } catch (_) { /* token invalid -> login */ } }
      setBoot(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // realtime updates + refresh when the app returns to the foreground
  useEffect(() => {
    if (!user) return undefined;
    let t = null;
    const bump = () => { clearTimeout(t); t = setTimeout(() => setRt((x) => x + 1), 250); };
    const off = subscribeRealtime((e) => {
      const n = navRef.current;
      if (e.projectId == null || n.screen === 'projects' || (n.screen === 'project' && e.projectId === n.projectId)) bump();
    });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') bump(); });
    return () => { off(); sub.remove(); clearTimeout(t); };
  }, [user]);

  if (boot) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><Loading /></View>;
  if (!user) return <Login onLoggedIn={(u) => { setUser(u); setNav({ screen: 'projects' }); }} />;

  const home = () => setNav({ screen: 'projects' });
  const goUsers = () => setNav({ screen: 'users' });
  const goAccount = () => setNav({ screen: 'account' });
  const projectId = nav.projectId;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header user={user} title={nav.screen === 'users' ? 'Users' : nav.screen === 'account' ? 'My account' : undefined} onBack={nav.screen !== 'projects' ? home : undefined} onHome={home} onUsers={goUsers} onAccount={goAccount} />
      <Page>
        {nav.screen === 'projects' && <Projects user={user} rt={rt} onOpen={(id) => setNav({ screen: 'project', projectId: id })} />}
        {nav.screen === 'project' && <ProjectScreen key={projectId} user={user} projectId={projectId} tab={nav.tab} rt={rt} setTab={(tab) => setNav({ ...nav, tab })} onBack={home} />}
        {nav.screen === 'users' && user.role === 'ADMIN' && <Users me={user} />}
        {nav.screen === 'account' && <Account user={user} onLogout={logout} />}
      </Page>
    </View>
  );
}

export default function App() {
  return (
    <UIProvider>
      <StatusBar style="light" />
      <Shell />
    </UIProvider>
  );
}
