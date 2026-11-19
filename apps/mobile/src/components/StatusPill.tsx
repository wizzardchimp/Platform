import { StyleSheet, Text, View } from 'react-native';
import type { ServiceStatus } from '@platform/shared';
import { useTheme } from '@/lib/theme';

export function StatusPill({ status, delay }: { status: ServiceStatus; delay: number }) {
  const t = useTheme();
  const map = {
    on_time: { label: 'On time', fg: t.ok, bg: t.okBg },
    delayed: { label: `${delay} min late`, fg: t.warn, bg: t.warnBg },
    cancelled: { label: 'Cancelled', fg: t.bad, bg: t.badBg },
    departed: { label: 'Departed', fg: t.sub, bg: t.neutralBg },
  }[status];
  return (
    <View style={[s.pill, { backgroundColor: map.bg }]}>
      <Text style={[s.text, { color: map.fg }]}>{map.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '700' },
});
