import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineView } from '@/components/LineView';
import { StatusPill } from '@/components/StatusPill';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';

export default function ServiceScreen() {
  const t = useTheme();
  const { rid, from, to } = useLocalSearchParams<{ rid: string; from?: string; to?: string }>();
  const q = useQuery({
    queryKey: ['service', rid],
    queryFn: () => api.service(rid),
    refetchInterval: 10_000,
  });

  if (q.isLoading) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (q.isError || !q.data) return <Text style={{ color: t.bad, padding: 24 }}>This journey is no longer available.</Text>;

  const d = q.data;
  const p = d.position;
  const where =
    p.state === 'between'
      ? `Between ${d.callingPoints[p.fromIndex]?.station.name} and ${d.callingPoints[p.toIndex]?.station.name}`
      : p.state === 'at_station'
        ? `At ${d.callingPoints[p.stopIndex]?.station.name}`
        : p.state === 'terminated' ? 'Journey complete'
        : p.state === 'cancelled' ? 'Cancelled'
        : 'Not yet departed';

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Stack.Screen options={{ title: `To ${d.destination.name}` }} />
      <View style={[s.head, { backgroundColor: t.card }]}>
        <StatusPill status={d.status} delay={d.delayMinutes} />
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginTop: 8 }}>{where}</Text>
        <Text style={{ color: t.sub, marginTop: 2 }}>{d.origin.name} → {d.destination.name}</Text>
        {d.cancelReasonCode && <Text style={{ color: t.bad, marginTop: 6 }}>Reason code {d.cancelReasonCode}</Text>}
      </View>
      <View style={[s.line, { backgroundColor: t.card }]}>
        <LineView points={d.callingPoints} position={p} highlight={[from, to].filter((x): x is string => !!x)} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48, gap: 14 },
  head: { padding: 16, borderRadius: 16 },
  line: { padding: 16, borderRadius: 16 },
});
