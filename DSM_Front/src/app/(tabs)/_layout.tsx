import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  type DailyupIconName,
  Icon,
  PrototypeFrame,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import { TaskSheets } from '@/components/dailyup/task-sheets';
import { ProductProvider } from '@/features/product/product-context';
import {
  dailyupFonts,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import HomeScreen from './index';
import MyPageScreen from './mypage';
import RankingScreen from './ranking';

type AppTabParamList = {
  Home: undefined;
  Ranking: undefined;
  MyPage: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

const tabMetadata: Record<
  keyof AppTabParamList,
  { icon: DailyupIconName; label: string }
> = {
  Home: { icon: 'home-variant', label: '홈' },
  Ranking: { icon: 'trophy', label: '랭킹' },
  MyPage: { icon: 'account', label: '마이' },
};

function TabButton({
  icon,
  isFocused,
  label,
  onPress,
}: {
  icon: DailyupIconName;
  isFocused: boolean;
  label: string;
  onPress: () => void;
}) {
  const palette = useDailyupPalette();
  const color = isFocused ? palette.lime : palette.muted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      onPress={onPress}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <Icon color={color} name={icon} size={22} />
      <AppText color={color} style={styles.tabLabel} variant="caption">
        {label}
      </AppText>
    </Pressable>
  );
}

function DailyupTabBar({ navigation, state }: BottomTabBarProps) {
  const palette = useDailyupPalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: palette.statusBar,
          borderColor: palette.border,
          paddingBottom: Math.max(insets.bottom, 7),
        },
      ]}>
      {state.routes.map((route, index) => {
        const metadata = tabMetadata[route.name as keyof AppTabParamList];
        const isFocused = state.index === index;
        return (
          <TabButton
            icon={metadata.icon}
            isFocused={isFocused}
            key={route.key}
            label={metadata.label}
            onPress={() => {
              const event = navigation.emit({
                canPreventDefault: true,
                target: route.key,
                type: 'tabPress',
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
          />
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <ProductProvider>
    <PrototypeFrame>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <DailyupTabBar {...props} />}>
        <Tab.Screen component={HomeScreen} name="Home" />
        <Tab.Screen component={RankingScreen} name="Ranking" />
        <Tab.Screen component={MyPageScreen} name="MyPage" />
      </Tab.Navigator>
      <TaskSheets />
    </PrototypeFrame>
    </ProductProvider>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.68,
  },
  tabBar: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: dailyupSpacing.five,
    paddingTop: 7,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 48,
  },
  tabLabel: {
    fontFamily: dailyupFonts.bold,
    fontSize: 10,
  },
});
