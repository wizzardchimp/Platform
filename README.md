# Platform

UK train-times app: home/work stations, live departures, trains approaching your
station, and a home-screen widget. Information only, no ticketing.

```
apps/api         Darwin Push Port ingest + REST API (TypeScript, Fastify)
packages/shared  API types shared with the mobile app
apps/mobile      Expo (SDK 58) / React Native app, Expo Router
```

## Run the API

```bash
npm install
npm run api          # synthetic Paddington <-> Reading feed, http://localhost:3000
npm test
```

Try: `/health`, `/v1/stations?q=read`, `/v1/stations/RDG/departures?to=PAD`,
`/v1/stations/SLO/approaching`, `/v1/services/{rid}`.

## Run the app

```bash
npm run api                       # terminal 1: synthetic API on :3000
npm run app                       # terminal 2: Expo dev server (press i for iOS simulator)
```

- iOS simulator uses `http://localhost:3000`; on a physical phone set
  `EXPO_PUBLIC_API_URL=http://<your-mac-LAN-ip>:3000` (see `apps/mobile/.env.example`).
- With the synthetic feed, pick **Slough** as home and **London Paddington** as
  work to see a train approaching (Paddington <-> Reading line only).
- Verified so far: typecheck, web bundle and browser render against the live API.
  **Not yet run on a native iOS/Android simulator.**

## Hosted web demo

`apps/mobile/demo` bundles the real screens plus the real Darwin query code into
one script (`npm run demo:build -w @platform/mobile`). Small shims replace the
router, storage and network, and the synthetic feed runs inside the page, so it
needs no server. `demo/index.html` is the page that loads `dist/app.js`.

## iOS widget

A WidgetKit widget lives in `apps/mobile/targets/widget` (Swift), linked into the
Xcode project by `@bacons/apple-targets`. Sizes: small, medium, lock-screen
rectangular and inline. It shows the next trains for home to work before midday
and work to home after, calls `GET /v1/widget/:from/:to`, and opens the app on tap.
The app shares the saved stations with it through the App Group
`group.com.platform.trains` (`src/lib/widgetSync.ts`).

**Status: written and wired, prebuild verified, never compiled or run.**
Needs a Mac with Xcode 16 and a development build (Expo Go cannot run widgets):

```bash
cd apps/mobile
# 1. set ios.appleTeamId in app.json (Xcode > Signing & Capabilities), and change
#    bundleIdentifier / App Group (app.json, widgetSync.ts, Models.swift) to your own
npx expo prebuild -p ios --clean
npx expo run:ios            # or: xed ios, then run the Platform scheme
```

Then long-press the home screen, tap +, and add "Next trains". On a physical phone
the widget needs a reachable API: set `EXPO_PUBLIC_API_URL` to a deployed HTTPS URL
(a LAN address works for the app, and for the widget only if ATS allows it).

## Going live (Darwin)

> Note: National Rail's legacy NRDP portal (STOMP/FTP/S3 feeds) is being shut down
> in favour of the Rail Data Marketplace. Build only against RDM.

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
