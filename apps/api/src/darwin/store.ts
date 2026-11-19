import { ServiceClock } from './time';
import type { DarwinEvent, ForecastLoc, SchedLoc, Service } from './types';

const KEEP_AFTER_END_MS = 30 * 60_000;
const KEEP_AFTER_DEACTIVATE_MS = 10 * 60_000;

function matchLoc(locs: SchedLoc[], f: ForecastLoc): SchedLoc | undefined {
  const cands = locs.filter((l) => l.tpl === f.tpl);
  if (cands.length <= 1) return cands[0];
  // Same location visited twice (loops/reversals): disambiguate by working times.
  return (
    cands.find(
      (l) =>
        (!f.wta || l.wta === f.wta) &&
        (!f.wtd || l.wtd === f.wtd) &&
        (!f.wtp || l.wtp === f.wtp),
    ) ?? cands[0]
  );
}

export class DarwinStore {
  private services = new Map<string, Service>();
  private byTiploc = new Map<string, Set<string>>();

  stats = { messages: 0, orphanForecasts: 0, lastMessageAt: 0 };

  get size(): number {
    return this.services.size;
  }

  get(rid: string): Service | undefined {
    return this.services.get(rid);
  }

  ridsAt(tiploc: string): Iterable<string> {
    return this.byTiploc.get(tiploc) ?? [];
  }

  apply(ev: DarwinEvent, now = Date.now()): void {
    this.stats.messages++;
    this.stats.lastMessageAt = now;
    switch (ev.type) {
      case 'schedule': {
        const prev = this.services.get(ev.service.rid);
        if (prev) this.unindex(prev);
        let expiresAt = now + 24 * 3600_000;
        try {
          const clock = new ServiceClock(ev.service.ssd);
          let end = 0;
          for (const l of ev.service.locations) {
            const w = l.wta ?? l.wtp ?? l.wtd;
            if (w) end = clock.anchor(w);
          }
          if (end) expiresAt = end + KEEP_AFTER_END_MS;
        } catch {
          /* malformed ssd: keep default */
        }
        const svc: Service = { ...ev.service, updatedAt: now, expiresAt };
        this.services.set(svc.rid, svc);
        this.index(svc);
        break;
      }
      case 'forecast': {
        const svc = this.services.get(ev.rid);
        if (!svc) {
          this.stats.orphanForecasts++;
          return;
        }
        for (const f of ev.locations) {
          const loc = matchLoc(svc.locations, f);
          if (!loc) continue;
          const fc = (loc.fc ??= {});
          if (f.forecast.arr) fc.arr = f.forecast.arr;
          if (f.forecast.dep) fc.dep = f.forecast.dep;
          if (f.forecast.pass) fc.pass = f.forecast.pass;
          if (f.forecast.plat) fc.plat = f.forecast.plat;
        }
        svc.updatedAt = now;
        break;
      }
      case 'deactivated': {
        const svc = this.services.get(ev.rid);
        if (svc) svc.expiresAt = Math.min(svc.expiresAt, now + KEEP_AFTER_DEACTIVATE_MS);
        break;
      }
      case 'deleted': {
        const svc = this.services.get(ev.rid);
        if (svc) {
          this.unindex(svc);
          this.services.delete(ev.rid);
        }
        break;
      }
    }
  }

  prune(now = Date.now()): number {
    let n = 0;
    for (const svc of this.services.values()) {
      if (svc.expiresAt < now) {
        this.unindex(svc);
        this.services.delete(svc.rid);
        n++;
      }
    }
    return n;
  }

  private index(svc: Service): void {
    for (const l of svc.locations) {
      let set = this.byTiploc.get(l.tpl);
      if (!set) this.byTiploc.set(l.tpl, (set = new Set()));
      set.add(svc.rid);
    }
  }

  private unindex(svc: Service): void {
    for (const l of svc.locations) {
      const set = this.byTiploc.get(l.tpl);
      if (set) {
        set.delete(svc.rid);
        if (set.size === 0) this.byTiploc.delete(l.tpl);
      }
    }
  }
}
