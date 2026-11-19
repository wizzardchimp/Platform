import { Platform } from 'react-native';
import { API_BASE } from './api';

/** Must match ios.entitlements in app.json and appGroup in targets/widget/Models.swift. */
export const APP_GROUP = 'group.com.platform.trains';

interface Station { crs: string; name: string }

/**
 * Shares the saved stations (and which API to call) with the iOS widget through
 * the App Group, then asks iOS to refresh the widget. No-op everywhere but iOS,
 * and when the native module is missing (Expo Go, web).
 */
export function syncWidget(home: Station | null, work: Station | null): void {
  if (Platform.OS !== 'ios' || !home || !work) return;
  try {
    // Loaded lazily: the module only exists in a native build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    new ExtensionStorage(APP_GROUP).set('widgetConfig', JSON.stringify({ home, work, apiBase: API_BASE }));
    ExtensionStorage.reloadWidget();
  } catch {
    // Widget sync must never break the app.
  }
}
