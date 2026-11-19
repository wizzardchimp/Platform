export type LocKind = 'OR' | 'OPOR' | 'IP' | 'OPIP' | 'PP' | 'DT' | 'OPDT';

export interface Platform {
  name: string;
  suppressed: boolean;
  confirmed: boolean;
}

/** Times are Darwin clock strings: "HH:MM" or "HH:MM:SS", UK local time. */
export interface FcTime {
  /** Estimated time. */
  et?: string;
  /** Working (operational) estimate; used when no public estimate exists. */
  wet?: string;
  /** Actual time. */
  at?: string;
  delayed?: boolean;
}

export interface LocForecast {
  arr?: FcTime;
  dep?: FcTime;
  pass?: FcTime;
  plat?: Platform;
}

export interface SchedLoc {
  kind: LocKind;
  tpl: string;
  cancelled: boolean;
  pta?: string;
  ptd?: string;
  wta?: string;
  wtd?: string;
  wtp?: string;
  fc?: LocForecast;
}

export interface ServiceBase {
  rid: string;
  uid: string;
  trainId: string;
  /** Scheduled start date, YYYY-MM-DD. */
  ssd: string;
  toc: string;
  isPassengerSvc: boolean;
  cancelReasonCode?: string;
  locations: SchedLoc[];
}

export interface Service extends ServiceBase {
  updatedAt: number;
  /** Epoch ms after which the service can be dropped from memory. */
  expiresAt: number;
}

export interface ForecastLoc {
  tpl: string;
  pta?: string;
  ptd?: string;
  wta?: string;
  wtd?: string;
  wtp?: string;
  forecast: LocForecast;
}

export type DarwinEvent =
  | { type: 'schedule'; service: ServiceBase }
  | { type: 'forecast'; rid: string; locations: ForecastLoc[] }
  | { type: 'deactivated'; rid: string }
  | { type: 'deleted'; rid: string };
