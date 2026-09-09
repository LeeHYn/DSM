import React, { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppButton,
  AppText,
  Icon,
  SurfaceCard,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  dailyupFonts,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import { usePrototype } from '@/features/prototype/prototype-context';
import type { PrototypeScreenState } from '@/features/prototype/prototype-data';

const STATE_OPTIONS: { label: string; value: PrototypeScreenState }[] = [
  { label: '정상', value: 'normal' },
  { label: '로딩', value: 'loading' },
  { label: '빈 상태', value: 'empty' },
  { label: '오류', value: 'error' },
  { label: '오프라인', value: 'offline' },
];

function SkeletonBlock({ height, width = '100%' }: { height: number; width?: number | `${number}%` }) {
  const palette = useDailyupPalette();
  const opacity = useRef(new Animated.Value(0.38)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {
      setReduceMotion(false);
    });
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.5);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 720,
          toValue: 0.75,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          duration: 720,
          toValue: 0.38,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { backgroundColor: palette.surfaceRaised, height, opacity, width },
      ]}
    />
  );
}

function LoadingState() {
  return (
    <View accessibilityLabel="일과를 불러오는 중" style={styles.loadingWrap}>
      <SurfaceCard style={styles.scoreSkeleton}>
        <SkeletonBlock height={13} width="34%" />
        <SkeletonBlock height={34} width="52%" />
        <SkeletonBlock height={8} />
        <View style={styles.skeletonRow}>
          <SkeletonBlock height={18} width="28%" />
          <SkeletonBlock height={18} width="28%" />
          <SkeletonBlock height={18} width="28%" />
        </View>
      </SurfaceCard>
      <SkeletonBlock height={22} width="35%" />
      <SurfaceCard style={styles.taskSkeleton}>
        <SkeletonBlock height={18} width="42%" />
        <SkeletonBlock height={13} width="58%" />
      </SurfaceCard>
      <SurfaceCard style={styles.taskSkeleton}>
        <SkeletonBlock height={18} width="46%" />
        <SkeletonBlock height={13} width="62%" />
      </SurfaceCard>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const palette = useDailyupPalette();
  return (
    <View
      style={[
        styles.empty,
        { borderColor: palette.border, backgroundColor: `${palette.surface}A8` },
      ]}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.surfaceRaised }]}>
        <Icon color={palette.lime} name="calendar-plus" size={28} />
      </View>
      <AppText style={styles.emptyTitle} variant="sectionTitle">
        오늘 등록된 일과가 없어요
      </AppText>
      <AppText color={palette.muted} style={styles.emptyCopy} variant="muted">
        첫 일과를 등록하고 점수를 쌓아보세요.
      </AppText>
      <AppButton icon="plus" onPress={onAdd} style={styles.emptyButton}>
        새 일과 추가
      </AppButton>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const palette = useDailyupPalette();
  return (
    <SurfaceCard
      accessibilityRole="alert"
      style={[styles.error, { borderColor: `${palette.danger}66` }]}>
      <View style={[styles.errorIcon, { backgroundColor: `${palette.danger}18` }]}>
        <Icon color={palette.danger} name="alert-circle-outline" size={24} />
      </View>
      <View style={styles.errorCopy}>
        <AppText style={styles.errorTitle} variant="label">
          일과를 불러오지 못했어요
        </AppText>
        <AppText color={palette.muted} variant="caption">
          잠시 후 다시 시도해 주세요.
        </AppText>
      </View>
      <AppButton onPress={onRetry} style={styles.retryButton} variant="danger">
        다시 시도
      </AppButton>
    </SurfaceCard>
  );
}

export function OfflineBanner() {
  const palette = useDailyupPalette();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.offline, { backgroundColor: palette.surfaceRaised }]}>
      <Icon color={palette.muted} name="wifi-off" size={16} />
      <AppText color={palette.muted} variant="caption">
        오프라인 상태입니다. 일과 변경이 잠시 제한돼요.
      </AppText>
    </View>
  );
}

export function HomeState({
  children,
  onAdd,
}: PropsWithChildren<{ onAdd: () => void }>) {
  const { screenState, setScreenState } = usePrototype();

  if (screenState === 'loading') {
    return <LoadingState />;
  }
  if (screenState === 'empty') {
    return <EmptyState onAdd={onAdd} />;
  }
  if (screenState === 'error') {
    return <ErrorState onRetry={() => setScreenState('normal')} />;
  }

  return (
    <>
      {screenState === 'offline' ? <OfflineBanner /> : null}
      {children}
    </>
  );
}

export function StateDeveloperBar() {
  const { screenState, setScreenState } = usePrototype();
  const palette = useDailyupPalette();

  return (
    <View
      accessibilityLabel="화면 상태 개발 도구"
      style={[styles.devBar, { backgroundColor: palette.statusBar, borderColor: palette.border }]}>
      {STATE_OPTIONS.map((option) => {
        const selected = option.value === screenState;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => setScreenState(option.value)}
            style={({ pressed }) => [
              styles.devOption,
              selected && { backgroundColor: palette.lime },
              pressed && { opacity: 0.72 },
            ]}>
            <AppText
              color={selected ? palette.textOnLime : palette.muted}
              style={styles.devText}
              variant="caption">
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  devBar: {
    alignItems: 'center',
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'space-between',
    marginHorizontal: dailyupSpacing.five,
    marginTop: dailyupSpacing.three,
    padding: 3,
  },
  devOption: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  devText: {
    fontFamily: dailyupFonts.bold,
    fontSize: 9,
  },
  empty: {
    alignItems: 'center',
    borderRadius: dailyupRadius.large,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: dailyupSpacing.five,
    minHeight: 250,
    padding: dailyupSpacing.six,
  },
  emptyButton: {
    marginTop: dailyupSpacing.five,
    minWidth: 152,
  },
  emptyCopy: {
    marginTop: dailyupSpacing.one,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: dailyupRadius.round,
    height: 54,
    justifyContent: 'center',
    marginBottom: dailyupSpacing.four,
    width: 54,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  error: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: dailyupSpacing.three,
    marginTop: dailyupSpacing.five,
    padding: dailyupSpacing.four,
  },
  errorCopy: {
    flex: 1,
    gap: 2,
  },
  errorIcon: {
    alignItems: 'center',
    borderRadius: dailyupRadius.round,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  errorTitle: {
    fontFamily: dailyupFonts.bold,
  },
  loadingWrap: {
    gap: dailyupSpacing.three,
    paddingTop: dailyupSpacing.one,
  },
  offline: {
    alignItems: 'center',
    borderRadius: dailyupRadius.small,
    flexDirection: 'row',
    gap: dailyupSpacing.two,
    marginBottom: dailyupSpacing.three,
    minHeight: 34,
    paddingHorizontal: dailyupSpacing.three,
  },
  retryButton: {
    minHeight: 36,
    paddingHorizontal: dailyupSpacing.three,
  },
  scoreSkeleton: {
    gap: dailyupSpacing.four,
    minHeight: 178,
    padding: dailyupSpacing.five,
  },
  skeleton: {
    borderRadius: dailyupRadius.small,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taskSkeleton: {
    gap: dailyupSpacing.two,
    minHeight: 72,
    padding: dailyupSpacing.four,
  },
});
