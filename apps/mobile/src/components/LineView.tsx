import { StyleSheet, Text, View } from 'react-native';
import type { CallingPoint, TrainPosition } from '@platform/shared';
import { hhmm } from '@/lib/api';
import { useTheme } from '@/lib/theme';

const ROW = 60;
const PASS_ROW = 34;
const GUTTER = 36;

function timeOf(cp: CallingPoint) {
  const t = cp.arrival ?? cp.departure;
  return { sched: t?.scheduled ?? null, live: t?.actual ?? t?.expected ?? null, done: !!t?.actual };
}

/**
 * Vertical line of calling points with a live train marker placed between
 * the last passed point and the next, by the time-interpolated fraction.
 */
export function LineView({
  points, position, highlight,
}: { points: CallingPoint[]; position: TrainPosition; highlight?: string[] }) {
  const t = useTheme();
  const height = (cp: CallingPoint) => (cp.passing ? PASS_ROW : ROW);

  return (
    <View>
      {points.map((cp, i) => {
        const h = height(cp);
        const { sched, live, done } = timeOf(cp);
        const late = live && sched && live.slice(11, 16) !== sched.slice(11, 16);
        const last = i === points.length - 1;
        const passed =
          position.state === 'terminated' ||
          (position.state === 'at_station' && i <= position.stopIndex) ||
          (position.state === 'between' && i <= position.fromIndex);
        const lineColor = passed ? t.accent : t.line;
        const marker =
          position.state === 'between' && position.fromIndex === i
            ? 10 + (position.fraction ?? 0.5) * (h - 10)
            : null;
        const isMine = !!cp.station.crs && !!highlight?.includes(cp.station.crs);
        const dot = cp.passing ? 8 : 14;

        return (
          <View key={cp.index} style={{ height: h, flexDirection: 'row' }}>
            <View style={{ width: GUTTER, alignItems: 'center' }}>
              {!last && <View style={[s.seg, { backgroundColor: lineColor, top: 10 }]} />}
              <View
                style={{
                  width: dot, height: dot, borderRadius: dot / 2, marginTop: cp.passing ? 3 : 0,
                  backgroundColor: passed || done ? t.accent : t.card,
                  borderWidth: 2, borderColor: passed || done ? t.accent : t.sub,
                }}
              />
              {position.state === 'at_station' && position.stopIndex === i && (
                <Text style={[s.train, { top: -3 }]}>🚆</Text>
              )}
              {marker !== null && <Text style={[s.train, { top: marker - 10 }]}>🚆</Text>}
            </View>
            <View style={s.body}>
              <Text
                style={{
                  color: cp.cancelled ? t.bad : cp.passing ? t.sub : t.text,
                  fontSize: cp.passing ? 13 : 16,
                  fontWeight: isMine ? '800' : cp.passing ? '400' : '600',
                  textDecorationLine: cp.cancelled ? 'line-through' : 'none',
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {cp.station.name}{isMine ? '  •' : ''}
              </Text>
              {!cp.passing && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: late ? t.sub : t.text, fontVariant: ['tabular-nums'], fontSize: 15, textDecorationLine: late ? 'line-through' : 'none' }}>
                    {hhmm(sched)}
                  </Text>
                  {late && <Text style={{ color: t.warn, fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 13 }}>{hhmm(live)}</Text>}
                  {cp.platform && <Text style={{ color: t.sub, fontSize: 11 }}>Plat {cp.platform.name}</Text>}
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  seg: { position: 'absolute', width: 3, bottom: -10 },
  // Centred on the line (gutter is GUTTER wide) so it never collides with labels.
  train: { position: 'absolute', fontSize: 16, left: GUTTER / 2 - 11, width: 22, textAlign: 'center', zIndex: 2 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 8 },
});
