import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { parsePport } from '../src/darwin/parse';
import { Reference } from '../src/darwin/reference';
import { DarwinStore } from '../src/darwin/store';
import { ServiceClock, ZONE } from '../src/darwin/time';
import { pushSynthetic, syntheticReference } from '../src/dev/synthetic';
import { getApproaching, getDepartures, getService } from '../src/query/board';
import { buildServer } from '../src/server';

const NS =
  'xmlns="http://www.thalesgroup.com/rtti/PushPort/v16" ' +
  'xmlns:ns3="http://www.thalesgroup.com/rtti/PushPort/Forecasts/v3" ' +
  'xmlns:ns5="http://www.thalesgroup.com/rtti/PushPort/Schedules/v3"';

// Hand-written in the shape of the real feed (not produced by our generator).
const SCHEDULE = `<?xml version="1.0"?>
<Pport ${NS} ts="2026-11-19T10:00:00.000+00:00" version="16.0"><uR updateOrigin="CIS">
 <schedule rid="202611191234567" uid="C12345" trainId="1A23" ssd="2026-11-19" toc="GW">
  <ns5:OR tpl="PADTON" act="TB" ptd="10:00" wtd="10:00"/>
  <ns5:OPIP tpl="WESTBPK" act="OP" wta="10:03" wtd="10:03"/>
  <ns5:IP tpl="RDNGSTN" act="T " pta="10:25" wta="10:24:30" ptd="10:27" wtd="10:27"/>
  <ns5:PP tpl="TWYFORD" wtp="10:35"/>
  <ns5:DT tpl="DIDCOTP" act="TF" pta="10:45" wta="10:44"/>
 </schedule>
</uR></Pport>`;

const FORECAST = `<Pport ${NS} ts="2026-11-19T10:00:05.000+00:00" version="16.0"><uR updateOrigin="Darwin">
 <TS rid="202611191234567" ssd="2026-11-19" uid="C12345">
  <ns3:Location tpl="PADTON" ptd="10:00" wtd="10:00">
   <ns3:dep at="10:02" src="Darwin"/><ns3:plat conf="true">9</ns3:plat>
  </ns3:Location>
  <ns3:Location tpl="RDNGSTN" pta="10:25" wta="10:24:30" ptd="10:27" wtd="10:27">
   <ns3:arr et="10:29" src="Darwin" delayed="true"/><ns3:dep et="10:31"/>
   <ns3:plat platsup="true">5</ns3:plat>
  </ns3:Location>
 </TS>
 <deactivated rid="000000000000001"/>
</uR></Pport>`;

function dayMs(clock: string) {
  return new ServiceClock('2026-11-19').anchor(clock);
}

function loaded() {
  const store = new DarwinStore();
  const ref = new Reference();
  ref.add('PADTON', 'PAD', 'London Paddington');
  ref.add('RDNGSTN', 'RDG', 'Reading');
  ref.add('TWYFORD', 'TWY', 'Twyford');
  ref.add('DIDCOTP', 'DID', 'Didcot Parkway');
  for (const x of [SCHEDULE, FORECAST]) for (const ev of parsePport(x)) store.apply(ev, dayMs('10:00'));
  return { store, ref };
}

describe('parsePport', () => {
  it('parses schedules in order, strips namespaces, keeps all location kinds', () => {
    const [ev] = parsePport(SCHEDULE);
    expect(ev?.type).toBe('schedule');
    if (ev?.type !== 'schedule') return;
    expect(ev.service).toMatchObject({ rid: '202611191234567', trainId: '1A23', toc: 'GW', isPassengerSvc: true });
    expect(ev.service.locations.map((l) => `${l.kind}:${l.tpl}`)).toEqual([
      'OR:PADTON', 'OPIP:WESTBPK', 'IP:RDNGSTN', 'PP:TWYFORD', 'DT:DIDCOTP',
    ]);
    expect(ev.service.locations[2]).toMatchObject({ pta: '10:25', wta: '10:24:30', ptd: '10:27' });
  });

  it('parses forecasts, platform suppression and deactivations', () => {
    const evs = parsePport(FORECAST);
    const ts = evs.find((e) => e.type === 'forecast');
    expect(ts && ts.type === 'forecast' && ts.locations[1]?.forecast.arr).toMatchObject({ et: '10:29', delayed: true });
    expect(ts && ts.type === 'forecast' && ts.locations[0]?.forecast.dep).toMatchObject({ at: '10:02' });
    expect(ts && ts.type === 'forecast' && ts.locations[1]?.forecast.plat).toMatchObject({ name: '5', suppressed: true });
    expect(evs.find((e) => e.type === 'deactivated')).toEqual({ type: 'deactivated', rid: '000000000000001' });
  });
});

describe('ServiceClock', () => {
  it('rolls past midnight and resolves nearby times to the right day', () => {
    const c = new ServiceClock('2026-11-19');
    const a = c.anchor('23:50');
    const b = c.anchor('00:10');
    expect(b - a).toBe(20 * 60_000);
    // forecast of 00:12 at the post-midnight stop is the next day, not the first day
    expect(c.near('00:12', b) - b).toBe(2 * 60_000);
    // a time just before midnight at the first stop stays on day one
    expect(a - c.near('23:55', a)).toBe(-5 * 60_000);
  });

  it('handles the autumn clock change (UK 25h day)', () => {
    const c = new ServiceClock('2026-10-25');
    const a = c.anchor('00:30');
    const b = c.anchor('03:00');
    expect(b - a).toBe(3.5 * 3600_000); // 1h gained overnight
  });
});

describe('boards', () => {
  const NOW = new ServiceClock('2026-11-19').anchor('10:20');

  it('builds a departure board with delay, platform and destination arrival', () => {
    const { store, ref } = loaded();
    const [d] = getDepartures({ store, ref }, 'RDG', {
      to: 'DID', limit: 5, windowMin: 60, now: NOW,
    });
    expect(d).toMatchObject({
      rid: '202611191234567', status: 'delayed', delayMinutes: 4,
      origin: { crs: 'PAD' }, destination: { crs: 'DID' },
      platform: null, // suppressed platform must not be exposed
    });
    expect(d?.arrivalAtDestination?.scheduled).toContain('T10:45:00');
  });

  it('excludes services not calling at the destination and trains that already left', () => {
    const { store, ref } = loaded();
    expect(getDepartures({ store, ref }, 'RDG', { to: 'PAD', limit: 5, windowMin: 60, now: NOW })).toHaveLength(0);
    const late = new ServiceClock('2026-11-19').anchor('11:30');
    expect(getDepartures({ store, ref }, 'RDG', { limit: 5, windowMin: 60, now: late })).toHaveLength(0);
  });

  it('reports position between stops, interpolated by time, plus approaching trains', () => {
    const { store, ref } = loaded();
    const detail = getService({ store, ref }, '202611191234567', NOW);
    // departed Paddington 10:02, next point (Reading) est 10:29 -> at 10:20 (18/27)
    expect(detail.position).toMatchObject({ state: 'between', fromIndex: 0, toIndex: 1 });
    const pos = detail.position as { fraction: number };
    expect(pos.fraction).toBeCloseTo(18 / 27, 2);
    expect(detail.callingPoints.map((c) => [c.station.name, c.passing])).toEqual([
      ['London Paddington', false], ['Reading', false], ['Twyford', true], ['Didcot Parkway', false],
    ]);

    const [a] = getApproaching({ store, ref }, 'RDG', { limit: 3, now: NOW });
    expect(a).toMatchObject({ stopsAway: 0, previousStop: { crs: 'PAD' }, nextStop: { crs: 'RDG' }, delayMinutes: 4 });
  });
});

describe('synthetic feed + HTTP API', () => {
  it('serves boards, approaching trains and service detail end to end', async () => {
    const store = new DarwinStore();
    const now = DateTime.fromISO('2026-11-19T12:03:00', { zone: ZONE }).toMillis();
    pushSynthetic(store, now);
    const app = buildServer({ store, ref: syntheticReference() }, { source: 'test', clock: () => now });

    const dep = await app.inject('/v1/stations/RDG/departures?to=PAD&limit=4');
    expect(dep.statusCode).toBe(200);
    const board = dep.json();
    expect(board.length).toBeGreaterThan(0);
    expect(board[0].destination.crs).toBe('PAD');

    const near = (await app.inject('/v1/stations/RDG/approaching')).json();
    expect(near.length).toBeGreaterThan(0);
    expect(near[0].stopsAway).toBeGreaterThanOrEqual(0);

    const svc = (await app.inject(`/v1/services/${board[0].rid}`)).json();
    expect(svc.callingPoints.length).toBe(7);

    const w = (await app.inject('/v1/widget/RDG/PAD')).json();
    expect(w.from.crs).toBe('RDG');
    expect(w.next.length).toBeGreaterThan(0);
    expect(w.next[0].arrives).toBeTruthy();

    expect((await app.inject('/v1/stations/ZZZ/departures')).statusCode).toBe(404);
    expect((await app.inject('/v1/stations/RDGX/departures')).statusCode).toBe(400);
    expect((await app.inject('/v1/stations?q=pad')).json()[0].crs).toBe('PAD');
  });
});
