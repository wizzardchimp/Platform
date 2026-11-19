import { DateTime } from 'luxon';

export const ZONE = 'Europe/London';

export function ukDate(ms: number): string {
  return DateTime.fromMillis(ms, { zone: ZONE }).toISODate()!;
}

export function iso(ms: number): string {
  return DateTime.fromMillis(ms, { zone: ZONE }).toISO({ suppressMilliseconds: true })!;
}

/**
 * Resolves Darwin clock strings ("HH:MM[:SS]") to epoch ms for one service.
 *
 * Darwin gives no dates on times, so services that run past midnight need
 * care. `anchor()` is called once per location, in running order, with that
 * location's working time; it advances the day whenever time would go
 * backwards. Every other time at the location (public, forecast, actual) is
 * resolved with `near()`: the candidate day closest to the anchor.
 */
export class ServiceClock {
  private readonly day: DateTime;
  private offset = 0;
  private prev = -Infinity;

  constructor(ssd: string) {
    this.day = DateTime.fromISO(ssd, { zone: ZONE }).startOf('day');
  }

  private at(clock: string, offset: number): number {
    const [h = 0, m = 0, s = 0] = clock.split(':').map(Number);
    return this.day
      .plus({ days: offset })
      .set({ hour: h, minute: m, second: s, millisecond: 0 })
      .toMillis();
  }

  anchor(clock: string): number {
    let t = this.at(clock, this.offset);
    for (let i = 0; i < 3 && t < this.prev; i++) {
      this.offset++;
      t = this.at(clock, this.offset);
    }
    this.prev = t;
    return t;
  }

  near(clock: string, anchor: number): number {
    let best = this.at(clock, this.offset);
    for (const d of [-1, 1]) {
      const t = this.at(clock, this.offset + d);
      if (Math.abs(t - anchor) < Math.abs(best - anchor)) best = t;
    }
    return best;
  }
}
