import { XMLParser } from 'fast-xml-parser';
import type {
  DarwinEvent,
  FcTime,
  ForecastLoc,
  LocForecast,
  LocKind,
  Platform,
  SchedLoc,
  ServiceBase,
} from './types';

/**
 * Parser for Darwin Push Port XML (schema v16): <Pport> messages carrying
 * <uR>/<sR> blocks of <schedule>, <TS>, <deactivated>. Also handles the
 * <Journey> elements of the daily timetable file, which share the schedule
 * structure. Namespace prefixes (ns3:, ns5:, ...) are stripped. Element order
 * is preserved because the running order of locations matters.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  preserveOrder: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XNode = Record<string, any>;
const ATTR = ':@';
const LOC_KINDS = new Set<string>(['OR', 'OPOR', 'IP', 'OPIP', 'PP', 'DT', 'OPDT']);

function tag(n: XNode): string {
  for (const k in n) if (k !== ATTR) return k;
  return '';
}
function kids(n: XNode): XNode[] {
  const v = n[tag(n)];
  return Array.isArray(v) ? v : [];
}
function attrs(n: XNode): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = n[ATTR] as Record<string, string> | undefined;
  if (raw) for (const k in raw) out[k.slice(2)] = raw[k]!;
  return out;
}
function text(n: XNode): string | undefined {
  for (const k of kids(n)) if ('#text' in k) return String(k['#text']);
  return undefined;
}

function parseFcTime(n: XNode): FcTime {
  const a = attrs(n);
  const t: FcTime = {};
  if (a.et) t.et = a.et;
  if (a.wet) t.wet = a.wet;
  if (a.at && a.atRemoved !== 'true') t.at = a.at;
  if (a.delayed === 'true') t.delayed = true;
  return t;
}

function parsePlatform(n: XNode): Platform | undefined {
  const name = text(n);
  if (!name) return undefined;
  const a = attrs(n);
  return {
    name,
    suppressed: a.platsup === 'true' || a.cisPlatsup === 'true',
    confirmed: a.conf === 'true',
  };
}

export function parseSchedule(n: XNode): ServiceBase | { deleted: string } | null {
  const a = attrs(n);
  if (!a.rid) return null;
  if (a.deleted === 'true') return { deleted: a.rid };
  const locations: SchedLoc[] = [];
  let cancelReasonCode: string | undefined;
  for (const k of kids(n)) {
    const t = tag(k);
    if (LOC_KINDS.has(t)) {
      const l = attrs(k);
      if (!l.tpl) continue;
      locations.push({
        kind: t as LocKind,
        tpl: l.tpl,
        cancelled: l.can === 'true',
        pta: l.pta,
        ptd: l.ptd,
        wta: l.wta,
        wtd: l.wtd,
        wtp: l.wtp,
      });
    } else if (t === 'cancelReason') {
      cancelReasonCode = text(k);
    }
  }
  return {
    rid: a.rid,
    uid: a.uid ?? '',
    trainId: a.trainId ?? '',
    ssd: a.ssd ?? '',
    toc: a.toc ?? '',
    isPassengerSvc: a.isPassengerSvc !== 'false',
    cancelReasonCode,
    locations,
  };
}

function parseTS(n: XNode): { rid: string; locations: ForecastLoc[] } | null {
  const a = attrs(n);
  if (!a.rid) return null;
  const locations: ForecastLoc[] = [];
  for (const k of kids(n)) {
    if (tag(k) !== 'Location') continue;
    const l = attrs(k);
    if (!l.tpl) continue;
    const forecast: LocForecast = {};
    for (const c of kids(k)) {
      switch (tag(c)) {
        case 'arr': forecast.arr = parseFcTime(c); break;
        case 'dep': forecast.dep = parseFcTime(c); break;
        case 'pass': forecast.pass = parseFcTime(c); break;
        case 'plat': forecast.plat = parsePlatform(c); break;
      }
    }
    locations.push({
      tpl: l.tpl, pta: l.pta, ptd: l.ptd, wta: l.wta, wtd: l.wtd, wtp: l.wtp, forecast,
    });
  }
  return { rid: a.rid, locations };
}

function eventsFromScheduleNode(n: XNode, out: DarwinEvent[]): void {
  const s = parseSchedule(n);
  if (!s) return;
  if ('deleted' in s) out.push({ type: 'deleted', rid: s.deleted });
  else out.push({ type: 'schedule', service: s });
}

export function parsePport(xml: string): DarwinEvent[] {
  const out: DarwinEvent[] = [];
  const doc = parser.parse(xml) as XNode[];
  for (const root of doc) {
    const rootTag = tag(root);
    if (rootTag === 'Journey') {
      eventsFromScheduleNode(root, out);
      continue;
    }
    if (rootTag !== 'Pport') continue;
    for (const block of kids(root)) {
      const bt = tag(block);
      if (bt !== 'uR' && bt !== 'sR') continue;
      for (const item of kids(block)) {
        switch (tag(item)) {
          case 'schedule':
            eventsFromScheduleNode(item, out);
            break;
          case 'TS': {
            const ts = parseTS(item);
            if (ts) out.push({ type: 'forecast', ...ts });
            break;
          }
          case 'deactivated': {
            const rid = attrs(item).rid;
            if (rid) out.push({ type: 'deactivated', rid });
            break;
          }
        }
      }
    }
  }
  return out;
}

/** Parses a chunk of a timetable file containing complete <Journey> elements. */
export function parseJourneys(xml: string): DarwinEvent[] {
  const out: DarwinEvent[] = [];
  for (const root of parser.parse(xml) as XNode[]) {
    if (tag(root) === 'Journey') eventsFromScheduleNode(root, out);
  }
  return out;
}
