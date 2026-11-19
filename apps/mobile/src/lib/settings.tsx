import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncWidget } from './widgetSync';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface SavedStation { crs: string; name: string }
export type Direction = 'toWork' | 'toHome';

interface Settings {
  loaded: boolean;
  home: SavedStation | null;
  work: SavedStation | null;
  setHome: (s: SavedStation) => void;
  setWork: (s: SavedStation) => void;
}

const KEY = 'platform.stations.v1';
const Ctx = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ home: SavedStation | null; work: SavedStation | null }>({ home: null, work: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setState(JSON.parse(v)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Keep the home-screen widget in step with the saved stations (also on app start).
  useEffect(() => {
    if (loaded) syncWidget(state.home, state.work);
  }, [loaded, state.home, state.work]);

  const save = useCallback((next: typeof state) => {
    setState(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo<Settings>(
    () => ({
      loaded,
      ...state,
      setHome: (home) => save({ ...state, home }),
      setWork: (work) => save({ ...state, work }),
    }),
    [loaded, state, save],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const v = useContext(Ctx);
  if (!v) throw new Error('SettingsProvider missing');
  return v;
}

/** Sensible default: heading to work in the morning, home after midday. */
export const defaultDirection = (): Direction => (new Date().getHours() < 12 ? 'toWork' : 'toHome');
