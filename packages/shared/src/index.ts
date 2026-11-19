/**
 * API contract shared by the backend and the mobile app.
 * All timestamps are ISO-8601 strings with a UK offset (Europe/London).
 */

export interface StationRef {
  tiploc: string;
  /** 3-letter National Rail code; null if the location has no public CRS. */
  crs: string | null;
  name: string;
}

export type ServiceStatus = 'on_time' | 'delayed' | 'cancelled' | 'departed';

export interface Platform {
  name: string;
  /** false = provisional/predicted, true = confirmed by the operator. */
  confirmed: boolean;
}

export interface TimeInfo {
  scheduled: string | null;
  /** Forecast; null when Darwin has sent no live data for this point. */
  expected: string | null;
  /** Set once the train has actually arrived/departed/passed. */
  actual: string | null;
}

/** One row of a station departure board. */
export interface Departure {
  rid: string;
  trainId: string;
  toc: string;
  origin: StationRef;
  destination: StationRef;
  scheduled: string;
  expected: string | null;
  actual: string | null;
  delayMinutes: number;
  status: ServiceStatus;
  platform: Platform | null;
  cancelReasonCode: string | null;
  /** Only present when the board was requested with ?to=CRS. */
  arrivalAtDestination: { scheduled: string | null; expected: string | null } | null;
}

export interface CallingPoint {
  index: number;
  station: StationRef;
  /** true = train passes without stopping (still useful for the line view). */
  passing: boolean;
  cancelled: boolean;
  arrival: TimeInfo | null;
  /** For passing points this holds the pass time. */
  departure: TimeInfo | null;
  platform: Platform | null;
}

export type TrainPosition =
  | { state: 'not_departed' }
  | { state: 'cancelled' }
  | { state: 'terminated' }
  | { state: 'at_station'; stopIndex: number }
  | {
      state: 'between';
      fromIndex: number;
      toIndex: number;
      /** 0..1 progress between the two points, time-interpolated; null if unknown. */
      fraction: number | null;
    };

export interface ServiceDetail {
  rid: string;
  trainId: string;
  toc: string;
  origin: StationRef;
  destination: StationRef;
  status: ServiceStatus;
  delayMinutes: number;
  cancelReasonCode: string | null;
  callingPoints: CallingPoint[];
  position: TrainPosition;
  generatedAt: string;
}

/** A train currently on its way to a given station. */
export interface Approaching {
  rid: string;
  trainId: string;
  toc: string;
  origin: StationRef;
  destination: StationRef;
  scheduledArrival: string | null;
  expectedArrival: string | null;
  delayMinutes: number;
  /** Stops still to be made before this station (0 = next stop). */
  stopsAway: number;
  previousStop: StationRef | null;
  nextStop: StationRef;
  /** Progress along previousStop -> nextStop, 0..1. */
  fraction: number | null;
  state: 'between' | 'at_station';
}

export interface StationSearchResult {
  crs: string;
  name: string;
}
