import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Departure } from '@platform/shared';
import { hhmm } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { StatusPill } from './StatusPill';

export function DepartureRow({ d, fromCrs, toCrs }: { d: Departure; fromCrs: string; toCrs: string }) {
  const t = useTheme();
  const router = useRouter();
  const shown = d.status === 'delayed' ? hhmm(d.expected) : hhmm(d.scheduled);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/service/[rid]', params: { rid: d.rid, from: fromCrs, to: toCrs } })}
      style={[s.row, { borderBottomColor: t.line }]}
      accessibilityRole="button"
    >
        <View style={s.timeCol}>
          <Text style={[s.time, { color: d.status === 'cancelled' ? t.bad : t.text }, d.status === 'cancelled' && s.strike]}>
            {hhmm(d.scheduled)}
          </Text>
          {d.status === 'delayed' && <Text style={{ color: t.warn, fontSize: 12 }}>exp {shown}</Text>}
        </View>
        <View style={s.mid}>
          <Text style={[s.dest, { color: t.text }]} numberOfLines={1}>{d.destination.name}</Text>
          <Text style={{ color: t.sub, fontSize: 13 }}>
            Arrives {hhmm(d.arrivalAtDestination?.expected ?? d.arrivalAtDestination?.scheduled)}
          </Text>
        </View>
        <View style={s.right}>
          <StatusPill status={d.status} delay={d.delayMinutes} />
          <Text style={{ color: t.sub, fontSize: 12, marginTop: 4 }}>
            {d.platform ? `Platform ${d.platform.name}${d.platform.confirmed ? '' : '?'}` : ' '}
          </Text>
        </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  timeCol: { width: 62 },
  time: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  strike: { textDecorationLine: 'line-through' },
  mid: { flex: 1 },
  dest: { fontSize: 16, fontWeight: '600' },
  right: { alignItems: 'flex-end' },
});
