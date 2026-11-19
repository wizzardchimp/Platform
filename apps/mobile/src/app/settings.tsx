import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { useSettings, type SavedStation } from '@/lib/settings';
import { useTheme } from '@/lib/theme';

function Picker({ label, value, onPick }: { label: string; value: SavedStation | null; onPick: (s: SavedStation) => void }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const res = useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.trim().length >= 2 });
  return (
    <View style={[s.card, { backgroundColor: t.card }]}>
      <Text style={{ color: t.sub, fontWeight: '700', fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '700', marginVertical: 6 }}>{value?.name ?? 'Not set'}</Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search station name or code"
        placeholderTextColor={t.sub}
        autoCapitalize="none"
        autoCorrect={false}
        style={[s.input, { color: t.text, borderColor: t.line }]}
      />
      {res.data?.map((st) => (
        <Pressable key={st.crs} onPress={() => { onPick(st); setQ(''); }} style={[s.result, { borderBottomColor: t.line }]}>
          <Text style={{ color: t.text, fontSize: 16 }}>{st.name}</Text>
          <Text style={{ color: t.sub }}>{st.crs}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const { home, work, setHome, setWork } = useSettings();
  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Picker label="HOME STATION" value={home} onPick={setHome} />
      <Picker label="WORK STATION" value={work} onPick={setWork} />
      <Pressable onPress={() => router.back()} style={[s.done, { backgroundColor: t.accent }]}>
        <Text style={{ color: t.accentText, fontWeight: '700' }}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  card: { padding: 16, borderRadius: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  result: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  done: { alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
});
