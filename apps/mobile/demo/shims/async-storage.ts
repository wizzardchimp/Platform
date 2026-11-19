// localStorage can throw or be empty inside a sandboxed frame, so fall back to memory.
const DEMO_DEFAULT = JSON.stringify({
  home: { crs: 'SLO', name: 'Slough' },
  work: { crs: 'PAD', name: 'London Paddington' },
});
const mem = new Map<string, string>([['platform.stations.v1', DEMO_DEFAULT]]);

function ls(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

const AsyncStorage = {
  async getItem(k: string): Promise<string | null> {
    try { const v = ls()?.getItem(k); if (v != null) return v; } catch { /* use memory */ }
    return mem.get(k) ?? null;
  },
  async setItem(k: string, v: string): Promise<void> {
    mem.set(k, v);
    try { ls()?.setItem(k, v); } catch { /* memory only */ }
  },
  async removeItem(k: string): Promise<void> {
    mem.delete(k);
    try { ls()?.removeItem(k); } catch { /* ignore */ }
  },
};
export default AsyncStorage;
