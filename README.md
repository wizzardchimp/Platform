# Platform

UK train-times app: home/work stations, live departures, trains approaching your
station, and a home-screen widget. Information only, no ticketing.

```
apps/api         Darwin Push Port ingest + REST API (TypeScript, Fastify)
packages/shared  API types shared with the mobile app
apps/mobile      (next) Expo / React Native app + native widgets
```

## Run the API

```bash
npm install
npm run api          # synthetic Paddington <-> Reading feed, http://localhost:3000
npm test
```

Try: `/health`, `/v1/stations?q=read`, `/v1/stations/RDG/departures?to=PAD`,
`/v1/stations/SLO/approaching`, `/v1/services/{rid}`.

## Going live (Darwin)

1. Register at the Rail Data Marketplace and subscribe to the Darwin Push Port
   (plus the reference and timetable files).
2. Copy `apps/api/.env.example` to `.env`, set `DATA_SOURCE=kafka` and the Kafka details.
3. The live path (`src/darwin/ingest.ts`) has **not** been exercised against the
   real feed yet; the parser is tested on hand-written schema-v16 XML and the
   synthetic generator. Expect to adjust message decoding on first contact.

## Known gaps before launch

- **Data licence**: confirm the RDM/Darwin terms permit an ad-funded or paid
  public app, and the attribution they require. Do this before building more.
- Cancel/delay reason text (codes only for now), station coordinates (NaPTAN),
  Redis/persistence + restart bootstrap from the snapshot API, per-station
  caching/rate limiting, push notifications, TD/TRUST berth-level positions.
