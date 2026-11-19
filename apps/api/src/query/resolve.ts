import type { StationRef } from '@platform/shared';
import { ServiceClock } from '../darwin/time';
import type { Reference } from '../darwin/reference';
import type { FcTime, Platform, Service } from '../darwin/types';

export interface RTime {
  sched?: number;
  est?: number;
  act?: number;
}

export interface RStop {
  idx: number;
  tpl: string;
  station: StationRef;
  passing: boolean;
  cancelled: boolean;
  arr: RTime;
  dep: RTime;
  plat?: Platform;
}

export interface RService {
  svc: Service;
  stops: RStop[];
  origin: StationRef;
  destination: StationRef;
  cancelled: boolean;
}

export function stationRef(ref: Reference, tpl: string): StationRef {
  const l = ref.location(tpl);
  return { tiploc: l.tiploc, crs: l.crs, name: l.name };
}

/**
 * Turns a stored service into customer-facing stops with absolute times.
 * Operational-only locations (OPOR/OPIP/OPDT) are dropped; passing points
 * are kept (flagged) because they refine the live position.
 */
export function resolveService(svc: Service, ref: Reference): RService {
  const clock = new ServiceClock(svc.ssd);
  const stops: RStop[] = [];

  for (const l of svc.locations) {
    const w = l.wta ?? l.wtp ?? l.wtd;
    if (!w) continue;
    const anchor = clock.anchor(w);
    if (l.kind === 'OPOR' || l.kind === 'OPIP' || l.kind === 'OPDT') continue;

    const passing = l.kind === 'PP';
    const t = (s?: string) => (s ? clock.near(s, anchor) : undefined);
    const fcT = (f: FcTime | undefined, sched?: number): RTime => ({
      sched,
      est: f ? t(f.et ?? f.wet) : undefined,
      act: f ? t(f.at) : undefined,
    });

    let arr: RTime = {};
    let dep: RTime = {};
    if (passing) {
      dep = fcT(l.fc?.pass, t(l.wtp));
    } else {
      if (l.pta) arr = fcT(l.fc?.arr, t(l.pta));
      if (l.ptd) dep = fcT(l.fc?.dep, t(l.ptd));
    }
    if (!passing && arr.sched === undefined && dep.sched === undefined) continue;

    const plat = l.fc?.plat && !l.fc.plat.suppressed ? l.fc.plat : undefined;
    stops.push({
      idx: stops.length,
      tpl: l.tpl,
      station: stationRef(ref, l.tpl),
      passing,
      cancelled: l.cancelled,
      arr,
      dep,
      plat,
    });
  }

  const calling = stops.filter((s) => !s.passing);
  const first = calling[0] ?? stops[0];
  const last = calling[calling.length - 1] ?? stops[stops.length - 1];
  const unknown: StationRef = { tiploc: '', crs: null, name: 'Unknown' };
  return {
    svc,
    stops,
    origin: first?.station ?? unknown,
    destination: last?.station ?? unknown,
    cancelled: calling.length > 0 && calling.every((s) => s.cancelled),
  };
}

export function delayMinutes(t: RTime): number {
  const live = t.act ?? t.est;
  if (live === undefined || t.sched === undefined) return 0;
  return Math.round((live - t.sched) / 60_000);
}
