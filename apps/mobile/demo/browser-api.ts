/**
 * Runs the real Darwin store + query layer inside the page and answers the
 * app's fetch() calls to http://demo.local, fed by the synthetic feed.
 * Same code the server uses; only the HTTP transport is replaced.
 */
import { DarwinStore } from '../../api/src/darwin/store';
import { pushSynthetic, syntheticReference } from '../../api/src/dev/synthetic';
import { getApproaching, getDepartures, getService, NotFoundError } from '../../api/src/query/board';

export const DEMO_ORIGIN = 'http://demo.local';

export function installBrowserApi(): void {
  const store = new DarwinStore();
  const ref = syntheticReference();
  const ctx = { store, ref };
  pushSynthetic(store);
  setInterval(() => pushSynthetic(store), 20_000);

  const route = (url: URL): unknown => {
    const now = Date.now();
    const p = url.pathname;
    const num = (k: string, d: number) => Number(url.searchParams.get(k) ?? d);
    if (p === '/v1/stations') {
      return ref.search(url.searchParams.get('q') ?? '').map((s) => ({ crs: s.crs, name: s.name }));
    }
    let m = p.match(/^\/v1\/stations\/([A-Za-z]{3})\/departures$/);
    if (m) {
      const to = url.searchParams.get('to')?.toUpperCase();
      return getDepartures(ctx, m[1]!.toUpperCase(), { to, limit: num('limit', 8), windowMin: num('window', 120), now });
    }
    m = p.match(/^\/v1\/stations\/([A-Za-z]{3})\/approaching$/);
    if (m) return getApproaching(ctx, m[1]!.toUpperCase(), { limit: num('limit', 5), now });
    m = p.match(/^\/v1\/services\/([^/]+)$/);
    if (m) return getService(ctx, decodeURIComponent(m[1]!), now);
    throw new NotFoundError(`No route ${p}`);
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!href.startsWith(DEMO_ORIGIN)) return realFetch(input, init);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    try {
      return json(200, route(new URL(href)));
    } catch (e) {
      return e instanceof NotFoundError ? json(404, { error: e.message }) : json(500, { error: 'Internal error' });
    }
  };
}
