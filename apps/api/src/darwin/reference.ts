import { XMLParser } from 'fast-xml-parser';

export interface LocationInfo {
  tiploc: string;
  crs: string | null;
  name: string;
}

export interface StationInfo {
  crs: string;
  name: string;
  tiplocs: string[];
}

/**
 * Location reference data: TIPLOC <-> CRS <-> name.
 * Loaded from the Darwin reference file (<LocationRef tpl crs locname/>).
 * Coordinates are not in that file; add them from NaPTAN later for
 * "nearest station" features.
 */
export class Reference {
  private byTiploc = new Map<string, LocationInfo>();
  private byCrs = new Map<string, StationInfo>();

  add(tiploc: string, crs: string | null, name: string): void {
    this.byTiploc.set(tiploc, { tiploc, crs, name });
    if (crs) {
      const st = this.byCrs.get(crs);
      if (st) {
        if (!st.tiplocs.includes(tiploc)) st.tiplocs.push(tiploc);
      } else {
        this.byCrs.set(crs, { crs, name, tiplocs: [tiploc] });
      }
    }
  }

  loadRefXml(xml: string): number {
    const p = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      removeNSPrefix: true,
      isArray: (name) => name === 'LocationRef',
    });
    const doc = p.parse(xml);
    const refs: Array<{ tpl: string; crs?: string; locname?: string }> =
      doc?.PportTimetableRef?.LocationRef ?? [];
    for (const r of refs) this.add(r.tpl, r.crs ?? null, r.locname ?? r.tpl);
    return refs.length;
  }

  location(tiploc: string): LocationInfo {
    return this.byTiploc.get(tiploc) ?? { tiploc, crs: null, name: tiploc };
  }

  station(crs: string): StationInfo | undefined {
    return this.byCrs.get(crs.toUpperCase());
  }

  search(q: string, limit = 10): StationInfo[] {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const exact: StationInfo[] = [];
    const prefix: StationInfo[] = [];
    const contains: StationInfo[] = [];
    for (const st of this.byCrs.values()) {
      const name = st.name.toLowerCase();
      if (st.crs.toLowerCase() === s) exact.push(st);
      else if (name.startsWith(s)) prefix.push(st);
      else if (name.includes(s)) contains.push(st);
    }
    return [...exact, ...prefix, ...contains].slice(0, limit);
  }
}
