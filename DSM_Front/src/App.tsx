import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import React, { useMemo } from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { dailyupColors } from '@/constants/dailyup-theme';
import { SessionProvider } from '@/features/auth/session-context';
import { SessionStack } from '@/features/auth/session-routing';
import {
  PrototypeProvider,
  usePrototype,
} from '@/features/prototype/prototype-context';

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
    <NavigationContainer theme={navigationTheme}>
      <StatusBar
        backgroundColor={palette.statusBar}
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <SessionStack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: palette.background },
          headerShown: false,
        }}
      />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrototypeProvider>
          <SessionProvider>
            <DailyupNavigator />
          </SessionProvider>
        </PrototypeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
