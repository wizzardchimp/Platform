import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SettingsProvider } from '@/lib/settings';
import { useTheme } from '@/lib/theme';

export default function RootLayout() {
  const t = useTheme();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } }));
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.bg },
            headerTintColor: t.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Trains' }} />
          <Stack.Screen name="service/[rid]" options={{ title: 'Journey' }} />
          <Stack.Screen name="settings" options={{ title: 'My stations', presentation: 'modal' }} />
        </Stack>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
