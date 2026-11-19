import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { AppRegistry, Pressable, StyleSheet, Text, View } from 'react-native';
import Home from '../src/app/index';
import ServiceScreen from '../src/app/service/[rid]';
import Settings from '../src/app/settings';
import { SettingsProvider } from '../src/lib/settings';
import { useTheme } from '../src/lib/theme';
import { installBrowserApi } from './browser-api';
import { NavContext, ScreenContext, type NavApi, type ScreenOptions } from './shims/expo-router';

installBrowserApi();

type RouteName = 'index' | 'service' | 'settings';
interface Entry { key: string; name: RouteName; params: Record<string, string> }

const SCREENS: Record<RouteName, { Comp: () => ReactElement | null; title: string }> = {
  index: { Comp: Home, title: 'Trains' },
  service: { Comp: ServiceScreen, title: 'Journey' },
  settings: { Comp: Settings, title: 'My stations' },
};

let counter = 0;
const entry = (name: RouteName, params: Record<string, string> = {}): Entry => ({ key: `${name}-${counter++}`, name, params });

function Shell() {
  const t = useTheme();
  const [stack, setStack] = useState<Entry[]>(() => [entry('index')]);
  const options = useRef<Record<string, ScreenOptions>>({});
  const [, rerender] = useState(0);
  const top = stack[stack.length - 1]!;

  const push = useCallback<NavApi['push']>((href) => {
    const pathname = typeof href === 'string' ? href : href.pathname;
    const params = typeof href === 'string' ? {} : (href.params ?? {});
    const name: RouteName = pathname.startsWith('/service') ? 'service' : pathname.startsWith('/settings') ? 'settings' : 'index';
    setStack((s) => [...s, entry(name, params)]);
  }, []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const setOptions = useCallback<NavApi['setOptions']>((key, o) => {
    const prev = options.current[key];
    options.current[key] = o;
    // Re-render the header only when something visible changed (avoids a render loop).
    if (prev?.title !== o.title || !!prev?.headerRight !== !!o.headerRight) rerender((n) => n + 1);
  }, []);
  const nav = useMemo<NavApi>(() => ({ push, back, setOptions }), [push, back, setOptions]);

  const opts = options.current[top.key];
  return (
    <NavContext.Provider value={nav}>
      <View style={[s.frame, { backgroundColor: t.bg, borderColor: t.line }]}>
        <View style={[s.header, { backgroundColor: t.bg }]}>
          <View style={s.side}>
            {stack.length > 1 && (
              <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
                <Text style={{ color: t.accent, fontSize: 17, fontWeight: '600' }}>‹ Back</Text>
              </Pressable>
            )}
          </View>
          <Text numberOfLines={1} style={[s.title, { color: t.text }]}>{opts?.title ?? SCREENS[top.name].title}</Text>
          <View style={[s.side, { alignItems: 'flex-end' }]}>{opts?.headerRight?.()}</View>
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>
          {stack.map((e) => {
            const { Comp } = SCREENS[e.name];
            const active = e.key === top.key;
            return (
              <View key={e.key} style={[StyleSheet.absoluteFill, !active && { display: 'none' }]}>
                <ScreenContext.Provider value={{ key: e.key, params: e.params, active }}>
                  <Comp />
                </ScreenContext.Provider>
              </View>
            );
          })}
        </View>
      </View>
    </NavContext.Provider>
  );
}

function DemoApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } }));
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </QueryClientProvider>
  );
}

const s = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', borderWidth: 1, borderRadius: 24, overflow: 'hidden' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  side: { width: 76, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
});

AppRegistry.registerComponent('Demo', () => DemoApp);
AppRegistry.runApplication('Demo', { rootTag: document.getElementById('root'), initialProps: {} } as never);
