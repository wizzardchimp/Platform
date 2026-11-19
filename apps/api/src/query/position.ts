import type { TrainPosition } from '@platform/shared';
import type { RService, RStop, RTime } from './resolve';

function lastActual(s: RStop): { kind: 'arr' | 'dep'; at: number } | null {
  if (s.dep.act !== undefined) return { kind: 'dep', at: s.dep.act };
  if (s.arr.act !== undefined) return { kind: 'arr', at: s.arr.act };
  return null;
}

/** Best time the train reaches this point (actual > estimate > schedule). */
function reach(s: RStop): number | undefined {
  const t: RTime = s.passing ? s.dep : s.arr.sched !== undefined ? s.arr : s.dep;
  return t.act ?? t.est ?? t.sched;
}

/**
 * Derives where the train is from the reported actuals, interpolating
 * progress between the last departed/passed point and the next one by time.
 * This is a forecast-based estimate, not GPS; accuracy depends on how often
 * Darwin reports. (Berth-level TD data can refine this later.)
 */
export function computePosition(rs: RService, now: number): TrainPosition {
  if (rs.cancelled) return { state: 'cancelled' };
  const { stops } = rs;

  let idx = -1;
  let info: ReturnType<typeof lastActual> = null;
  for (let i = stops.length - 1; i >= 0; i--) {
    const a = lastActual(stops[i]!);
    if (a) {
      idx = i;
      info = a;
      break;
    }
  }
  if (idx < 0 || !info) return { state: 'not_departed' };

  if (info.kind === 'arr') {
    return idx === stops.length - 1
      ? { state: 'terminated' }
      : { state: 'at_station', stopIndex: idx };
  }
  if (idx === stops.length - 1) return { state: 'terminated' };

  const t1 = reach(stops[idx + 1]!);
  let fraction: number | null = null;
  if (t1 !== undefined && t1 > info.at) {
    fraction = Math.min(1, Math.max(0, (now - info.at) / (t1 - info.at)));
  }
  return { state: 'between', fromIndex: idx, toIndex: idx + 1, fraction };
}
