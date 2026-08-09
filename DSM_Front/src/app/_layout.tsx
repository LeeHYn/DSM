import {
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_600SemiBold,
  NotoSansKR_700Bold,
  NotoSansKR_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/noto-sans-kr';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '@/global.css';

import { dailyupColors } from '@/constants/dailyup-theme';
import {
  PrototypeProvider,
  usePrototype,
} from '@/features/prototype/prototype-context';
import { SessionProvider, useSession } from '@/features/auth/session-context';
import { SessionStack } from '@/features/auth/session-routing';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash screen may already be hidden during fast refresh.
});

function DailyupNavigator() {
  const { theme } = usePrototype();
  const { state } = useSession();
  const palette = dailyupColors[theme];
  const navigationTheme = useMemo<Theme>(() => {
    const base = theme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: theme === 'dark',
      colors: {
        ...base.colors,
        background: palette.background,
        border: palette.border,
        card: palette.surface,
        notification: palette.lime,
        primary: palette.lime,
        text: palette.text,
      },
    };
  }, [palette, theme]);

  useEffect(() => {
    if (state.status !== 'bootstrapping') {
      void SplashScreen.hideAsync();
    }
  }, [state.status]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar
        backgroundColor={palette.statusBar}
        style={theme === 'dark' ? 'light' : 'dark'}
      />
      <SessionStack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: palette.background },
          headerShown: false,
        }}
      />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_600SemiBold,
    NotoSansKR_700Bold,
    NotoSansKR_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PrototypeProvider>
        <SessionProvider>
          <DailyupNavigator />
        </SessionProvider>
      </PrototypeProvider>
    </GestureHandlerRootView>
  );
}
