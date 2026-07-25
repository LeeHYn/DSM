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
import { Stack } from 'expo-router';
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

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash screen may already be hidden during fast refresh.
});

function DailyupNavigator() {
  const { theme } = usePrototype();
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

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar
        backgroundColor={palette.statusBar}
        style={theme === 'dark' ? 'light' : 'dark'}
      />
      <Stack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: palette.background },
          headerShown: false,
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="tutorial" />
        <Stack.Screen name="(tabs)" />
      </Stack>
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PrototypeProvider>
        <DailyupNavigator />
      </PrototypeProvider>
    </GestureHandlerRootView>
  );
}
