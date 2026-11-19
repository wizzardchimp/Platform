import type {
  Approaching,
  CallingPoint,
  Departure,
  ServiceDetail,
  ServiceStatus,
  TimeInfo,
} from '@platform/shared';
import type { Reference } from '../darwin/reference';
import type { DarwinStore } from '../darwin/store';
import { iso } from '../darwin/time';
import { computePosition } from './position';
import { delayMinutes, resolveService, type RService, type RTime } from './resolve';

export interface Ctx {
  store: DarwinStore;
  ref: Reference;
}

export class NotFoundError extends Error {}

const ms = (n?: number) => (n === undefined ? null : iso(n));
const timeInfo = (t: RTime): TimeInfo => ({
  scheduled: ms(t.sched),
  expected: ms(t.est),
  actual: ms(t.act),
});

function tiplocsOf(ctx: Ctx, crs: string): Set<string> {
  const st = ctx.ref.station(crs);
  if (!st) throw new NotFoundError(`Unknown station ${crs}`);
  return new Set(st.tiplocs);
}

export function getDepartures(
  ctx: Ctx,
  crs: string,
  opts: { to?: string; limit: number; windowMin: number; now: number },
): Departure[] {
  const here = tiplocsOf(ctx, crs);
  const dest = opts.to ? tiplocsOf(ctx, opts.to) : null;
  const seen = new Set<string>();
  const out: Array<{ at: number; d: Departure }> = [];

  for (const tpl of here) {
    for (const rid of ctx.store.ridsAt(tpl)) {
      if (seen.has(rid)) continue;
      seen.add(rid);
      const svc = ctx.store.get(rid);
      if (!svc || !svc.isPassengerSvc) continue;
      const rs = resolveService(svc, ctx.ref);

      for (const stop of rs.stops) {
        if (stop.passing || !here.has(stop.tpl) || stop.dep.sched === undefined) continue;

        let arrivalAtDestination: Departure['arrivalAtDestination'] = null;
        if (dest) {
          const later = rs.stops
            .slice(stop.idx + 1)
            .find((s) => !s.passing && dest.has(s.tpl) && s.arr.sched !== undefined);
          if (!later) continue;
          arrivalAtDestination = { scheduled: ms(later.arr.sched), expected: ms(later.arr.act ?? later.arr.est) };
        }

        const shown = stop.dep.act ?? stop.dep.est ?? stop.dep.sched;
        if (shown < opts.now - 60_000 || shown > opts.now + opts.windowMin * 60_000) continue;

        const delay = delayMinutes(stop.dep);
        const status: ServiceStatus = stop.cancelled
          ? 'cancelled'
          : stop.dep.act !== undefined
            ? 'departed'
            : delay >= 1
              ? 'delayed'
              : 'on_time';

        out.push({
          at: shown,
          d: {
            rid,
            trainId: svc.trainId,
            toc: svc.toc,
            origin: rs.origin,
            destination: rs.destination,
            scheduled: iso(stop.dep.sched),
            expected: ms(stop.dep.est),
            actual: ms(stop.dep.act),
            delayMinutes: stop.cancelled ? 0 : delay,
            status,
            platform: stop.plat ? { name: stop.plat.name, confirmed: stop.plat.confirmed } : null,
            cancelReasonCode: stop.cancelled ? (svc.cancelReasonCode ?? null) : null,
            arrivalAtDestination,
          },
        });
      }
    }
  }
  return out
    .sort((a, b) => a.at - b.at)
    .slice(0, opts.limit)
    .map((x) => x.d);
}

export function getService(ctx: Ctx, rid: string, now: number): ServiceDetail {
  const svc = ctx.store.get(rid);
  if (!svc) throw new NotFoundError(`Unknown service ${rid}`);
  const rs = resolveService(svc, ctx.ref);
  const position = computePosition(rs, now);

  // Overall delay = delay at the latest point with live data.
  let delay = 0;
  for (let i = rs.stops.length - 1; i >= 0; i--) {
    const s = rs.stops[i]!;
    const t = s.dep.act ?? s.dep.est ?? s.arr.act ?? s.arr.est;
    if (t !== undefined) {
      delay = delayMinutes(s.dep.sched !== undefined && (s.dep.act ?? s.dep.est) !== undefined ? s.dep : s.arr);
      break;
    }
  }

  const callingPoints: CallingPoint[] = rs.stops.map((s) => ({
    index: s.idx,
    station: s.station,
    passing: s.passing,
    cancelled: s.cancelled,
    arrival: s.passing || s.arr.sched === undefined ? null : timeInfo(s.arr),
    departure: s.dep.sched === undefined ? null : timeInfo(s.dep),
    platform: s.plat ? { name: s.plat.name, confirmed: s.plat.confirmed } : null,
  }));

  const status: ServiceStatus = rs.cancelled
    ? 'cancelled'
    : position.state === 'between' || position.state === 'at_station'
      ? delay >= 1 ? 'delayed' : 'on_time'
      : position.state === 'terminated'
        ? 'departed'
        : delay >= 1 ? 'delayed' : 'on_time';

  return {
    rid,
    trainId: svc.trainId,
    toc: svc.toc,
    origin: rs.origin,
    destination: rs.destination,
    status,
    delayMinutes: rs.cancelled ? 0 : delay,
    cancelReasonCode: rs.cancelled ? (svc.cancelReasonCode ?? null) : null,
    callingPoints,
    position,
    generatedAt: iso(now),
  };
}

/** Trains already under way that will reach this station next (live "coming towards you"). */
export function getApproaching(ctx: Ctx, crs: string, opts: { limit: number; now: number }): Approaching[] {
  const here = tiplocsOf(ctx, crs);
  const seen = new Set<string>();
  const out: Array<{ eta: number; a: Approaching }> = [];

  for (const tpl of here) {
    for (const rid of ctx.store.ridsAt(tpl)) {
      if (seen.has(rid)) continue;
      seen.add(rid);
      const svc = ctx.store.get(rid);
      if (!svc || !svc.isPassengerSvc) continue;
      const rs: RService = resolveService(svc, ctx.ref);
      const pos = computePosition(rs, opts.now);
      if (pos.state !== 'between' && pos.state !== 'at_station') continue;

      const nextIdx = pos.state === 'between' ? pos.toIndex : pos.stopIndex + 1;
      const target = rs.stops.find((s) => s.idx >= nextIdx && !s.passing && here.has(s.tpl) && s.arr.sched !== undefined);
      if (!target || target.cancelled) continue;
      if (target.arr.act !== undefined) continue;

      const stopsAway = rs.stops
        .slice(nextIdx, target.idx)
        .filter((s) => !s.passing && !s.cancelled).length;
      const next = rs.stops[nextIdx]!;
      const prev = pos.state === 'between' ? rs.stops[pos.fromIndex]! : rs.stops[pos.stopIndex]!;
      const eta = target.arr.est ?? target.arr.sched!;
      out.push({
        eta,
        a: {
          rid,
          trainId: svc.trainId,
          toc: svc.toc,
          origin: rs.origin,
          destination: rs.destination,
          scheduledArrival: ms(target.arr.sched),
          expectedArrival: ms(target.arr.est),
          delayMinutes: delayMinutes(target.arr),
          stopsAway,
          previousStop: prev.station,
          nextStop: next.station,
          fraction: pos.state === 'between' ? pos.fraction : 0,
          state: pos.state,
        },
      });
    }
  }
  return out.sort((x, y) => x.eta - y.eta).slice(0, opts.limit).map((x) => x.a);
}
