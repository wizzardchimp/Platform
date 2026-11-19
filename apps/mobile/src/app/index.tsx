import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CogIcon } from '@/components/CogIcon';
import { DepartureRow } from '@/components/DepartureRow';
import { StatusPill } from '@/components/StatusPill';
import { api, hhmm } from '@/lib/api';
import { defaultDirection, useSettings, type Direction } from '@/lib/settings';
import { useTheme } from '@/lib/theme';

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const { loaded, home, work } = useSettings();
  const [dir, setDir] = useState<Direction>(defaultDirection);

  const from = dir === 'toWork' ? home : work;
  const to = dir === 'toWork' ? work : home;
  const ready = !!from && !!to;

  const deps = useQuery({
    queryKey: ['departures', from?.crs, to?.crs],
    queryFn: () => api.departures(from!.crs, to!.crs),
    enabled: ready,
    refetchInterval: 15_000,
  });
  const near = useQuery({
    queryKey: ['approaching', from?.crs],
    queryFn: () => api.approaching(from!.crs),
    enabled: ready,
    refetchInterval: 10_000,
  });

  // Only trains on *this* journey: approaching trains must also be on the board.
  const approaching = useMemo(() => {
    const rids = new Set((deps.data ?? []).map((d) => d.rid));
    return (near.data ?? []).filter((a) => rids.has(a.rid))[0];
  }, [deps.data, near.data]);

  // Hero = next train that actually runs; cancellations stay visible in the list.
  const upcoming = (deps.data ?? []).filter((d) => d.status !== 'departed');
  const next = upcoming.find((d) => d.status !== 'cancelled');
  const rest = upcoming.filter((d) => d !== next);

  if (!loaded) return <ActivityIndicator style={{ marginTop: 80 }} />;

  if (!ready) {
    return (
      <View style={s.empty}>
        <Stack.Screen options={{ headerRight: () => <SettingsLink /> }} />
        <Text style={[s.emptyTitle, { color: t.text }]}>Set up your journey</Text>
        <Text style={{ color: t.sub, textAlign: 'center', marginBottom: 20 }}>
          Choose your home and work stations to see your next trains at a glance.
        </Text>
        <Pressable onPress={() => router.push('/settings')} style={[s.btn, { backgroundColor: t.accent }]}>
          <Text style={{ color: t.accentText, fontWeight: '700' }}>Choose stations</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={deps.isRefetching} onRefresh={() => { deps.refetch(); near.refetch(); }} />}
    >
      <Stack.Screen options={{ headerRight: () => <SettingsLink /> }} />

      <View style={[s.seg, { backgroundColor: t.neutralBg }]}>
        {(['toWork', 'toHome'] as const).map((d) => (
          <Pressable key={d} onPress={() => setDir(d)} style={[s.segItem, dir === d && { backgroundColor: t.card }]}>
            <Text style={{ color: dir === d ? t.text : t.sub, fontWeight: '700' }}>{d === 'toWork' ? 'To work' : 'To home'}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: t.sub, marginTop: 14 }}>{from.name} → {to.name}</Text>

      {deps.isLoading && <ActivityIndicator style={{ marginTop: 40 }} />}
      {deps.isError && (
        <Text style={{ color: t.bad, marginTop: 20 }}>Can't reach the train data service. Pull down to retry.</Text>
      )}
      {deps.data && !next && <Text style={{ color: t.sub, marginTop: 24 }}>No trains in the next two hours.</Text>}

      {next && (
          <Pressable
            onPress={() => router.push({ pathname: '/service/[rid]', params: { rid: next.rid, from: from.crs, to: to.crs } })}
            style={[s.hero, { backgroundColor: t.card }]}
          >
            <Text style={{ color: t.sub, fontWeight: '600' }}>NEXT TRAIN</Text>
            <View style={s.heroRow}>
              <Text style={[s.heroTime, { color: next.status === 'cancelled' ? t.bad : t.text }]}>
                {hhmm(next.status === 'delayed' ? next.expected : next.scheduled)}
              </Text>
              <StatusPill status={next.status} delay={next.delayMinutes} />
            </View>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>to {next.destination.name}</Text>
            <Text style={{ color: t.sub, marginTop: 2 }}>
              Arrives {to.name} {hhmm(next.arrivalAtDestination?.expected ?? next.arrivalAtDestination?.scheduled)}
              {next.platform ? `  ·  Platform ${next.platform.name}` : ''}
            </Text>
            {approaching && approaching.rid === next.rid && (
              <View style={{ marginTop: 14 }}>
                <View style={[s.track, { backgroundColor: t.line }]}>
                  <View style={[s.fill, { backgroundColor: t.accent, width: `${Math.round((approaching.fraction ?? 0) * 100)}%` }]} />
                </View>
                <Text style={{ color: t.sub, fontSize: 13, marginTop: 6 }}>
                  🚆 {approaching.previousStop?.name} → {approaching.nextStop.name}
                  {approaching.stopsAway === 0 ? ' · next stop is yours' : ` · ${approaching.stopsAway} stop${approaching.stopsAway > 1 ? 's' : ''} away`}
                </Text>
              </View>
            )}
          </Pressable>
      )}

      {rest.length > 0 && <Text style={[s.sectionTitle, { color: t.sub }]}>OTHER TRAINS</Text>}
      {rest.map((d) => <DepartureRow key={d.rid} d={d} fromCrs={from.crs} toCrs={to.crs} />)}
    </ScrollView>
  );
}

function SettingsLink() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      hitSlop={12}
      onPress={() => router.push('/settings')}
      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
      accessibilityRole="button"
      accessibilityLabel="Choose home and work stations"
    >
      <CogIcon size={24} color={t.accent} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  btn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  hero: { marginTop: 14, padding: 18, borderRadius: 18, gap: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTime: { fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  sectionTitle: { marginTop: 24, marginBottom: 2, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});
