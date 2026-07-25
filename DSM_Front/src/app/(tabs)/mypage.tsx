import { useRouter } from 'expo-router';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  AppToggle,
  Badge,
  Divider,
  Icon,
  type DailyupIconName,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  dailyupFonts,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import { usePrototype } from '@/features/prototype/prototype-context';

type MenuItem = {
  icon: DailyupIconName;
  label: string;
  message: string;
};

const MENU_ITEMS: MenuItem[] = [
  {
    icon: 'account-cog-outline',
    label: '프로필 · 계정 관리',
    message: '프로필 · 계정 관리는 준비 중입니다.',
  },
  {
    icon: 'bell-outline',
    label: '알림 설정',
    message: '알림 설정은 준비 중입니다.',
  },
  {
    icon: 'chart-box-outline',
    label: '나의 통계',
    message: '나의 통계는 준비 중입니다.',
  },
  {
    icon: 'help-circle-outline',
    label: '도움말 · 규칙 · 법적 정보',
    message: '도움말 · 규칙 · 법적 정보는 준비 중입니다.',
  },
];

function SettingsRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const palette = useDailyupPalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surface }]}>
      <AppText style={styles.rowLabel} variant="label">
        {label}
      </AppText>
      <Icon color={palette.muted} name="chevron-right" size={19} />
    </Pressable>
  );
}

export default function MyPageScreen() {
  const router = useRouter();
  const palette = useDailyupPalette();
  const {
    resetPrototype,
    setTheme,
    showToast,
    theme,
  } = usePrototype();

  const logout = () => {
    resetPrototype();
    router.replace('/explore');
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={[styles.profileAvatar, { backgroundColor: palette.surfaceRaised }]}>
            <AppText style={styles.profileInitial}>지</AppText>
          </View>
          <AppText style={styles.nickname} variant="sectionTitle">
            지민
          </AppText>
          <View>
            <Badge tone="gold">GOLD 티어</Badge>
          </View>
          <AppText color={palette.muted} variant="caption">
            누적 점수 12,450점
          </AppText>
        </View>

        <Divider />

        <View style={styles.settings}>
          <View style={styles.themeRow}>
            <View style={styles.themeLabel}>
              <AppText style={styles.rowLabel} variant="label">
                화면 테마
              </AppText>
            </View>
            <View style={styles.themeControl}>
              <AppText color={palette.muted} variant="caption">
                {theme === 'dark' ? '다크' : '라이트'}
              </AppText>
              <AppToggle
                accessibilityLabel="화면 테마"
                onValueChange={(enabled) => setTheme(enabled ? 'light' : 'dark')}
                value={theme === 'light'}
              />
            </View>
          </View>

          {MENU_ITEMS.map((item) => (
            <React.Fragment key={item.label}>
              <Divider />
              <SettingsRow
                label={item.label}
                onPress={() => showToast(item.message)}
              />
            </React.Fragment>
          ))}

          <Divider />
          <Pressable
            accessibilityRole="button"
            onPress={logout}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surface }]}>
            <AppText color={palette.danger} style={styles.rowLabel} variant="label">
              로그아웃
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: dailyupSpacing.six,
  },
  nickname: {
    fontFamily: dailyupFonts.bold,
    marginTop: 7,
  },
  profile: {
    alignItems: 'center',
    gap: dailyupSpacing.two,
    paddingBottom: 14,
    paddingTop: dailyupSpacing.four,
  },
  profileAvatar: {
    alignItems: 'center',
    borderRadius: dailyupRadius.round,
    height: 63,
    justifyContent: 'center',
    width: 63,
  },
  profileInitial: {
    fontFamily: dailyupFonts.bold,
    fontSize: 24,
    lineHeight: 31,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 45,
    paddingLeft: 12,
    paddingRight: 18,
  },
  rowLabel: {
    flex: 1,
    fontFamily: dailyupFonts.semiBold,
  },
  screen: {
    flex: 1,
  },
  settings: {
    paddingHorizontal: dailyupSpacing.two,
  },
  themeControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: dailyupSpacing.two,
  },
  themeLabel: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  themeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 57,
    paddingLeft: 12,
    paddingRight: 18,
  },
});
