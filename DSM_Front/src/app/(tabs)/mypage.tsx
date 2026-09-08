import React, { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  AppButton,
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
import {
  openLegalLink,
  type LegalLinkKind,
} from '@/config/legal-links';
import { useSession } from '@/features/auth/session-context';
import { usePrototype } from '@/features/prototype/prototype-context';
import { useProduct } from '@/features/product/product-context';

type MenuItem = {
  icon: DailyupIconName;
  label: string;
  message: string;
};

const MENU_ITEMS: MenuItem[] = [
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
    label: '도움말 · 규칙',
    message: '도움말 · 규칙은 준비 중입니다.',
  },
];

function SettingsRow({
  accessibilityRole = 'button',
  disabled = false,
  label,
  onPress,
}: {
  accessibilityRole?: 'button' | 'link';
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const palette = useDailyupPalette();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled && styles.disabled,
        pressed && { backgroundColor: palette.surface },
      ]}>
      <AppText style={styles.rowLabel} variant="label">
        {label}
      </AppText>
      <Icon color={palette.muted} name="chevron-right" size={19} />
    </Pressable>
  );
}

export default function MyPageScreen() {
  const palette = useDailyupPalette();
  const { action, deleteAccount, logout } = useSession();
  const { snapshot, store } = useProduct();
  const [deletionPending, setDeletionPending] = useState(false);
  const [openingLegalLink, setOpeningLegalLink] =
    useState<LegalLinkKind | null>(null);
  const deletionRequestInFlightRef = useRef(false);
  const legalRequestInFlightRef = useRef(false);
  const logoutRequestInFlightRef = useRef(false);
  const {
    resetPrototype,
    setTheme,
    showToast,
    theme,
  } = usePrototype();

  const logoutSession = async () => {
    if (logoutRequestInFlightRef.current) {
      return;
    }
    logoutRequestInFlightRef.current = true;
    try {
      if (await logout()) {
        resetPrototype();
      } else {
        showToast(
          '로그아웃에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
        );
      }
    } catch {
      showToast(
        '로그아웃에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
      );
    } finally {
      logoutRequestInFlightRef.current = false;
    }
  };

  const openConfiguredLegalLink = async (
    kind: LegalLinkKind,
    label: string,
  ) => {
    if (legalRequestInFlightRef.current) {
      return;
    }
    legalRequestInFlightRef.current = true;
    setOpeningLegalLink(kind);
    try {
      if (!(await openLegalLink(kind))) {
        showToast(
          kind === 'privacy'
            ? '개인정보처리방침을 열 수 없습니다. 다시 시도해 주세요.'
            : `${label}를 열 수 없습니다. 다시 시도해 주세요.`,
        );
      }
    } finally {
      legalRequestInFlightRef.current = false;
      setOpeningLegalLink(null);
    }
  };

  const deleteCurrentAccount = async () => {
    if (deletionRequestInFlightRef.current) {
      return;
    }
    deletionRequestInFlightRef.current = true;
    setDeletionPending(true);
    try {
      const deleted = await deleteAccount();
      if (deleted) {
        resetPrototype();
      } else {
        showToast(
          '계정 삭제에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
        );
      }
    } catch {
      showToast(
        '계정 삭제에 실패했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
      );
    } finally {
      deletionRequestInFlightRef.current = false;
      setDeletionPending(false);
    }
  };

  const confirmAccountDeletion = () => {
    Alert.alert(
      '계정을 영구 삭제할까요?',
      '삭제 후에는 계정과 데이터를 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계정 삭제',
          style: 'destructive',
          onPress: deleteCurrentAccount,
        },
      ],
    );
  };

  const explainAccountDeletion = () => {
    Alert.alert(
      '계정 삭제',
      '계정과 로그인 정보, 등록한 일과와 카테고리, 점수와 랭킹, 알림 정보가 영구 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '계속', onPress: confirmAccountDeletion },
      ],
    );
  };

  const accountDeletionPending =
    deletionPending || action === 'deleting-account';

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={[styles.profileAvatar, { backgroundColor: palette.surfaceRaised }]}>
            <Icon name="account" size={32} />
          </View>
          <AppText style={styles.nickname} variant="sectionTitle">
            내 계정
          </AppText>
          <View>
            <Badge tone="gold">{snapshot.summary.data?.tier ?? '—'} 티어</Badge>
          </View>
          <AppText color={palette.muted} variant="caption">
            누적 점수 {snapshot.summary.data?.totalScore.toLocaleString('ko-KR') ?? '—'}점
          </AppText>
          {snapshot.summary.error ? <AppText color={palette.danger}>{snapshot.summary.error}</AppText> : null}
          {snapshot.summary.status === 'loading' ? <AppText>계정 점수 조회 중…</AppText> : null}
          <AppButton onPress={() => { void store.loadHome(); }} variant="ghost">계정 점수 새로고침</AppButton>
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
          <SettingsRow
            accessibilityRole="link"
            disabled={openingLegalLink !== null}
            label="개인정보처리방침"
            onPress={() =>
              openConfiguredLegalLink('privacy', '개인정보처리방침')
            }
          />

          <Divider />
          <SettingsRow
            accessibilityRole="link"
            disabled={openingLegalLink !== null}
            label="계정 삭제 안내"
            onPress={() =>
              openConfiguredLegalLink('account-deletion', '계정 삭제 안내')
            }
          />

          <Divider />
          <Pressable
            accessibilityLabel="계정 삭제"
            accessibilityRole="button"
            accessibilityState={{ disabled: accountDeletionPending }}
            disabled={accountDeletionPending}
            onPress={explainAccountDeletion}
            style={({ pressed }) => [
              styles.row,
              accountDeletionPending && styles.disabled,
              pressed && { backgroundColor: palette.surface },
            ]}>
            <AppText
              color={palette.danger}
              style={styles.rowLabel}
              variant="label">
              계정 삭제
            </AppText>
          </Pressable>

          <Divider />
          <Pressable
            accessibilityLabel="로그아웃"
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                action === 'logging-out' || accountDeletionPending,
            }}
            disabled={action === 'logging-out' || accountDeletionPending}
            onPress={logoutSession}
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
  disabled: {
    opacity: 0.45,
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
