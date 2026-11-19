/**
 * Minimal stand-in for expo-router, used only by the hosted web demo.
 * Supplies the three things the screens use: useRouter, useLocalSearchParams
 * and <Stack.Screen options>. The real app keeps using expo-router.
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';

type Href = string | { pathname: string; params?: Record<string, string> };
export interface NavApi {
  push(href: Href): void;
  back(): void;
  setOptions(entryKey: string, options: ScreenOptions): void;
}
export interface ScreenOptions { title?: string; headerRight?: () => ReactNode }
export const NavContext = createContext<NavApi | null>(null);
export const ScreenContext = createContext<{ key: string; params: Record<string, string>; active: boolean }>({
  key: '', params: {}, active: false,
});

export function useRouter() {
  const nav = useContext(NavContext)!;
  return { push: nav.push, back: nav.back };
}

export function useLocalSearchParams<T extends Record<string, string | undefined>>(): T {
  return useContext(ScreenContext).params as T;
}

function Screen({ options }: { name?: string; options?: ScreenOptions }) {
  const nav = useContext(NavContext)!;
  const screen = useContext(ScreenContext);
  useEffect(() => {
    if (screen.active && options) nav.setOptions(screen.key, options);
  });
  return null;
}

export const Stack = Object.assign(() => null, { Screen });
