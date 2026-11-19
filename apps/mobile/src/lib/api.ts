import { Platform } from 'react-native';
import type {
  Approaching, Departure, ServiceDetail, StationSearchResult,
} from '@platform/shared';

// Android emulators reach the host machine at 10.0.2.2. On a physical phone
// set EXPO_PUBLIC_API_URL to your computer's LAN address.
const BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  departures: (from: string, to: string) =>
    get<Departure[]>(`/v1/stations/${from}/departures?to=${to}&limit=8`),
  approaching: (crs: string) => get<Approaching[]>(`/v1/stations/${crs}/approaching?limit=10`),
  service: (rid: string) => get<ServiceDetail>(`/v1/services/${rid}`),
  search: (q: string) => get<StationSearchResult[]>(`/v1/stations?q=${encodeURIComponent(q)}`),
};

/** Server times are ISO strings in UK local time, so the clock is chars 11-16. */
export const hhmm = (iso: string | null | undefined): string => (iso ? iso.slice(11, 16) : '--:--');
