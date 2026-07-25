import {
  Tabs,
  TabList,
  TabSlot,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
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
import {
  dailyupFonts,
  dailyupSpacing,
} from '@/constants/dailyup-theme';

function TabButton({
  children,
  icon,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: DailyupIconName }) {
  const palette = useDailyupPalette();
  const color = isFocused ? palette.lime : palette.muted;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <Icon color={color} name={icon} size={22} />
      <AppText color={color} style={styles.tabLabel} variant="caption">
        {children}
      </AppText>
    </Pressable>
  );
}

function DailyupTabBar({ children, style, ...props }: TabListProps) {
  const palette = useDailyupPalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      style={[
        styles.tabBar,
        {
          backgroundColor: palette.statusBar,
          borderColor: palette.border,
          paddingBottom: Math.max(insets.bottom, 7),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export default function TabLayout() {
  return (
    <PrototypeFrame>
      <Tabs>
        <TabSlot style={styles.slot} />
        <TabList asChild>
          <DailyupTabBar>
            <TabTrigger asChild href="/(tabs)" name="home">
              <TabButton icon="home-variant">홈</TabButton>
            </TabTrigger>
            <TabTrigger asChild href="/ranking" name="ranking">
              <TabButton icon="trophy">랭킹</TabButton>
            </TabTrigger>
            <TabTrigger asChild href="/mypage" name="mypage">
              <TabButton icon="account">마이</TabButton>
            </TabTrigger>
          </DailyupTabBar>
        </TabList>
        <TaskSheets />
      </Tabs>
    </PrototypeFrame>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.68,
  },
  slot: {
    flex: 1,
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
