import { DateTime } from 'luxon';
import { parsePport } from '../darwin/parse';
import { Reference } from '../darwin/reference';
import type { DarwinStore } from '../darwin/store';
import { ZONE } from '../darwin/time';

/**
 * Synthetic "Darwin" feed for development without RDM credentials.
 * Generates real Push Port XML (namespaced, like the live feed) for a
 * Paddington <-> Reading line, relative to the current time, and pushes it
 * through the production parser/store path. Includes on-time, delayed and
 * cancelled services, a passing point, and platforms.
 */
const LINE = [
  { tpl: 'PADTON', crs: 'PAD', name: 'London Paddington', min: 0, plat: '3' },
  { tpl: 'EALINGB', crs: 'EAL', name: 'Ealing Broadway', min: 12, plat: '1' },
  { tpl: 'STHALL', crs: null, name: 'Southall', min: 18, pass: true },
  { tpl: 'SLOUGH', crs: 'SLO', name: 'Slough', min: 28, plat: '4' },
  { tpl: 'MDNHEAD', crs: 'MAI', name: 'Maidenhead', min: 36, plat: '2' },
  { tpl: 'TWYFORD', crs: 'TWY', name: 'Twyford', min: 44, plat: '1' },
  { tpl: 'RDNGSTN', crs: 'RDG', name: 'Reading', min: 52, plat: '9' },
] as const;

const HEADWAY_MIN = 10;

export function syntheticReference(): Reference {
  const ref = new Reference();
  for (const s of LINE) ref.add(s.tpl, s.crs, s.name);
  return ref;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const fmt = (ms: number, secs = false) =>
  DateTime.fromMillis(ms, { zone: ZONE }).toFormat(secs ? 'HH:mm:ss' : 'HH:mm');

export function syntheticXml(now: number): string[] {
  const out: string[] = [];
  const base = Math.floor(now / (HEADWAY_MIN * 60_000)) * HEADWAY_MIN * 60_000;
  const NS =
    'xmlns="http://www.thalesgroup.com/rtti/PushPort/v16" ' +
    'xmlns:ns3="http://www.thalesgroup.com/rtti/PushPort/Forecasts/v3" ' +
    'xmlns:ns5="http://www.thalesgroup.com/rtti/PushPort/Schedules/v3"';

  for (const dir of ['U', 'D'] as const) {
    const stops = dir === 'U' ? [...LINE] : [...LINE].reverse();
    const total = LINE[LINE.length - 1]!.min;
    for (let k = -6; k <= 18; k++) {
      const depart = base + k * HEADWAY_MIN * 60_000 + (dir === 'D' ? 5 * 60_000 : 0);
      const dt = DateTime.fromMillis(depart, { zone: ZONE });
      const rid = `SYN${dir}${dt.toFormat('yyyyLLddHHmm')}`;
      const h = hash(rid) % 7;
      const cancelled = h === 6;
      const perStopDelay = h === 5 ? 1.5 : 0; // slowly slipping train
      const baseDelay = h === 4 ? 3 : h === 5 ? 2 : 0;

      let sched = '';
      let fc = '';
      stops.forEach((s, i) => {
        const offset = dir === 'U' ? s.min : total - s.min;
        const sMs = depart + offset * 60_000;
        const first = i === 0;
        const last = i === stops.length - 1;
        const pass = 'pass' in s && s.pass;
        const can = cancelled ? ' can="true"' : '';
        const wt = (ms: number) => fmt(ms, true);
        const dwellMs = first || last || pass ? 0 : 60_000;

        const kind = first ? 'OR' : last ? 'DT' : pass ? 'PP' : 'IP';
        let a = ` tpl="${s.tpl}"${can}`;
        if (pass) a += ` wtp="${wt(sMs)}"`;
        else {
          if (!first) a += ` pta="${fmt(sMs)}" wta="${wt(sMs)}"`;
          if (!last) a += ` ptd="${fmt(sMs + dwellMs)}" wtd="${wt(sMs + dwellMs)}"`;
        }
        sched += `<ns5:${kind}${a}/>`;

        if (cancelled) return;
        const delayMs = Math.round((baseDelay + perStopDelay * i) * 60_000);
        const times = (sch: number, tag: 'arr' | 'dep' | 'pass') => {
          const est = sch + delayMs;
          return est <= now
            ? `<ns3:${tag} at="${fmt(est, true)}" src="Darwin"/>`
            : `<ns3:${tag} et="${fmt(est, true)}" src="Darwin"/>`;
        };
        let loc = `<ns3:Location tpl="${s.tpl}"`;
        if (pass) loc += ` wtp="${wt(sMs)}">${times(sMs, 'pass')}`;
        else {
          if (!first) loc += ` pta="${fmt(sMs)}" wta="${wt(sMs)}"`;
          if (!last) loc += ` ptd="${fmt(sMs + dwellMs)}" wtd="${wt(sMs + dwellMs)}"`;
          loc += '>';
          if (!first) loc += times(sMs, 'arr');
          if (!last) loc += times(sMs + dwellMs, 'dep');
          loc += `<ns3:plat conf="${depart - now < 20 * 60_000}">${'plat' in s ? s.plat : ''}</ns3:plat>`;
        }
        fc += loc + '</ns3:Location>';
      });

      const reason = cancelled ? '<ns5:cancelReason>104</ns5:cancelReason>' : '';
      const uid = `S${hash(rid) % 90000 + 10000}`;
      out.push(
        `<Pport ${NS} ts="${dt.toISO()}" version="16.0"><uR updateOrigin="Synthetic">` +
          `<schedule rid="${rid}" uid="${uid}" trainId="1P${hash(rid) % 90 + 10}" ssd="${dt.toISODate()}" toc="GW">` +
          sched + reason + `</schedule>` +
          (fc ? `<TS rid="${rid}" ssd="${dt.toISODate()}" uid="${uid}">${fc}</TS>` : '') +
          `</uR></Pport>`,
      );
    }
  }
  return out;
}

export function pushSynthetic(store: DarwinStore, now = Date.now()): void {
  for (const xml of syntheticXml(now)) for (const ev of parsePport(xml)) store.apply(ev, now);
  store.prune(now);
}
