import type { WidgetData } from '@platform/shared';
import { getDepartures, type Ctx } from './board';

/** Compact next-trains payload for home-screen widgets (used by the API and the web demo). */
export function getWidget(ctx: Ctx, from: string, to: string, now: number): WidgetData {
  const deps = getDepartures(ctx, from, { to, limit: 3, windowMin: 180, now });
  const name = (crs: string) => ({ crs, name: ctx.ref.station(crs)!.name });
  return {
    updatedAt: new Date(now).toISOString(),
    from: name(from),
    to: name(to),
    next: deps.map((d) => ({
      rid: d.rid,
      departs: d.scheduled,
      expected: d.expected,
      status: d.status,
      delayMinutes: d.delayMinutes,
      platform: d.platform?.name ?? null,
      arrives: d.arrivalAtDestination?.scheduled ?? null,
      arrivesExpected: d.arrivalAtDestination?.expected ?? null,
    })),
  };
}
