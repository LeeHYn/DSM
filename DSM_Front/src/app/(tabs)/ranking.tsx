import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  AppButton,
  SurfaceCard,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  dailyupFonts,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import { useProduct } from '@/features/product/product-context';
import type { Leader as RankingEntry, Period as RankingPeriod } from '@/features/product/product-contracts';

const PERIODS: RankingPeriod[] = ['DAILY', 'WEEKLY', 'TOTAL'];
const PERIOD_LABELS = { DAILY: '일간', WEEKLY: '주간', TOTAL: '누적' };

function PeriodSegment({
  onChange,
  value,
}: {
  onChange: (period: RankingPeriod) => void;
  value: RankingPeriod;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={[styles.segment, { backgroundColor: palette.surface }]}>
      {PERIODS.map((period) => {
        const selected = period === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={period}
            onPress={() => onChange(period)}
            style={({ pressed }) => [
              styles.segmentButton,
              selected && { backgroundColor: palette.lime },
              pressed && { opacity: 0.74 },
            ]}>
            <AppText
              color={selected ? palette.textOnLime : palette.muted}
              style={styles.segmentText}
              variant="label">
              {PERIOD_LABELS[period]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function MyRankCard() {
  const palette = useDailyupPalette();
  const { snapshot } = useProduct();
  const rank = snapshot.ranking.data;
  return (
    <SurfaceCard
      style={[
        styles.myRank,
        { backgroundColor: palette.limeTint, borderColor: `${palette.lime}26` },
      ]}>
      <View>
        <AppText color={palette.muted} variant="caption">
          내 순위
        </AppText>
        <AppText style={styles.myRankValue} variant="metric">
          {rank && rank.totalUsers > 0 ? `${rank.rank}위` : '—'}
        </AppText>
      </View>
      <View style={styles.myRankRight}>
        <AppText color={palette.muted} variant="caption">
          상위
        </AppText>
        <AppText style={styles.percentile} variant="sectionTitle">
          {rank && rank.totalUsers > 0 ? `${rank.percentile}%` : '—'}
        </AppText>
      </View>
    </SurfaceCard>
  );
}

function RankingRow({ entry }: { entry: RankingEntry }) {
  const palette = useDailyupPalette();
  const rankColor = entry.rank <= 3 ? palette.gold : palette.muted;
  const tierColor =
    entry.tier === 'MASTER' || entry.tier === 'GOLD' ? palette.gold : palette.muted;

  return (
    <SurfaceCard style={styles.rankingRow}>
      <AppText color={rankColor} style={styles.rankNumber} variant="sectionTitle">
        {entry.rank}
      </AppText>
      <View style={[styles.avatar, { backgroundColor: palette.surfaceRaised }]}>
        <AppText style={styles.avatarText} variant="label">
          {entry.nickname.slice(0, 1)}
        </AppText>
      </View>
      <View style={styles.person}>
        <AppText style={styles.nickname} variant="label">
          {entry.nickname}
        </AppText>
        <AppText color={tierColor} style={styles.tier} variant="caption">
          {entry.tier}
        </AppText>
      </View>
      <AppText style={styles.rowScore} variant="label">
        {entry.score.toLocaleString('ko-KR')}점
      </AppText>
    </SurfaceCard>
  );
}

export default function RankingScreen() {
  const palette = useDailyupPalette();
  const { snapshot, store } = useProduct();
  const { period } = snapshot;
  const entries = snapshot.leaderboard.data ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <AppText style={styles.title} variant="screenTitle">
          랭킹
        </AppText>
        <PeriodSegment onChange={next => { void store.setPeriod(next); }} value={period} />
        <MyRankCard />
        {snapshot.ranking.error ? <AppText color={palette.danger}>{snapshot.ranking.error}</AppText> : null}
        {snapshot.leaderboard.error ? <AppText color={palette.danger}>{snapshot.leaderboard.error}</AppText> : null}
        {snapshot.ranking.status === 'loading' || snapshot.leaderboard.status === 'loading' ? <AppText>랭킹 조회 중…</AppText> : null}
        <AppButton disabled={snapshot.mutating} onPress={() => { void store.loadRanking(); }} variant="ghost">랭킹 새로고침</AppButton>
        <AppText color={palette.muted} style={styles.realtimeCopy} variant="caption">
          실시간 갱신은 준비 중입니다 · 새로고침으로 최신 순위를 확인하세요
        </AppText>
        <View style={styles.list}>
          {snapshot.leaderboard.status === 'ready' && entries.length === 0 ? <AppText>표시할 순위가 없습니다.</AppText> : null}
          {entries.map((entry) => (
            <RankingRow entry={entry} key={`${period}-${entry.userId}`} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: dailyupRadius.round,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  avatarText: {
    fontFamily: dailyupFonts.bold,
  },
  content: {
    paddingBottom: dailyupSpacing.six,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  list: {
    gap: dailyupSpacing.two,
  },
  myRank: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    minHeight: 70,
    paddingHorizontal: dailyupSpacing.four,
  },
  myRankRight: {
    alignItems: 'flex-end',
  },
  myRankValue: {
    fontSize: 19,
    lineHeight: 25,
  },
  nickname: {
    fontFamily: dailyupFonts.bold,
    fontSize: 14,
  },
  percentile: {
    fontSize: 14,
  },
  person: {
    flex: 1,
    gap: 1,
    marginLeft: dailyupSpacing.one,
  },
  rankNumber: {
    fontSize: 16,
    textAlign: 'center',
    width: 20,
  },
  rankingRow: {
    alignItems: 'center',
    borderRadius: dailyupRadius.medium,
    flexDirection: 'row',
    gap: dailyupSpacing.two,
    minHeight: 51,
    paddingHorizontal: dailyupSpacing.three,
  },
  realtimeCopy: {
    marginBottom: dailyupSpacing.two,
    marginTop: dailyupSpacing.two,
  },
  rowScore: {
    fontFamily: dailyupFonts.bold,
  },
  screen: {
    flex: 1,
  },
  segment: {
    borderRadius: dailyupRadius.medium,
    flexDirection: 'row',
    marginTop: dailyupSpacing.three,
    padding: 2,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  segmentText: {
    fontFamily: dailyupFonts.bold,
  },
  tier: {
    fontFamily: dailyupFonts.medium,
    fontSize: 10,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
  },
});
