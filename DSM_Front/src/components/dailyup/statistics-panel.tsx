import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton, AppText, SurfaceCard, useDailyupPalette } from './primitives';
import { useAuthenticatedClient } from '@/features/auth/session-context';
import { createAnalyticsApi, shiftDay, type CalendarDay, type CategoryStatistics } from '@/features/product/analytics-api';

export function StatisticsPanel({ userId, date, refreshKey }: { userId: string; date: string; refreshKey?: unknown }) {
  const client = useAuthenticatedClient();
  const palette = useDailyupPalette();
  const api = useMemo(() => createAnalyticsApi(client, userId), [client, userId]);
  const from = shiftDay(date, -6);
  const scope = `${userId}:${from}:${date}`;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ scope: string; data: [CalendarDay[], CategoryStatistics[]] | null; error: boolean }>({ scope: '', data: null, error: false });
  useEffect(() => {
    let active = true;
    setResult({ scope, data: null, error: false });
    void Promise.all([api.calendar(from, date), api.categories(from, date)]).then(
      data => { if (active) setResult({ scope, data, error: false }); },
      () => { if (active) setResult({ scope, data: null, error: true }); },
    );
    return () => { active = false; };
  }, [api, from, date, scope, retry, refreshKey]);
  const current = result.scope === scope ? result : null;
  return <SurfaceCard>
    <AppText variant="sectionTitle">나의 통계</AppText>
    <AppText color={palette.muted}>{from} ~ {date} · UTC 최근 7일</AppText>
    {!current || (!current.data && !current.error) ? <AppText>통계 조회 중…</AppText> : null}
    {current?.error ? <View><AppText>통계를 불러오지 못했습니다.</AppText><AppButton onPress={() => setRetry(value => value + 1)}>통계 다시 시도</AppButton></View> : null}
    {current?.data ? <>
      <AppText variant="label">일별 획득 점수</AppText>
      {current.data[0].map(day => <View key={day.date} accessible accessibilityLabel={`${day.date}, ${day.cappedScore}점, 달성률 ${day.achievementRate}%`} style={styles.item}>
        <AppText>{day.date.slice(5)} · {day.cappedScore}점 · {day.achievementRate}%</AppText>
        <View style={[styles.track, { backgroundColor: palette.border }]}><View style={[styles.bar, { backgroundColor: palette.lime, width: `${day.cappedScore / 9}%` }]} /></View>
      </View>)}
      <AppText variant="label">카테고리별 통계</AppText>
      <AppText color={palette.muted} variant="caption">기본 점수는 난이도 합계이며, 달성률 보정·일일 상한 적용 전입니다.</AppText>
      {current.data[1].length === 0 ? <AppText>이 기간에 등록한 일과가 없습니다.</AppText> : current.data[1].map(category => <View key={category.categoryId ?? 'uncategorized'} style={styles.item}>
        <AppText>{category.name}</AppText>
        <AppText>등록 {category.registeredTaskCount}개 · 완료 {category.completedTaskCount}개</AppText>
        <AppText>기본 점수 {category.rawScore}점 · 달성률 {category.achievementRate}%</AppText>
      </View>)}
    </> : null}
  </SurfaceCard>;
}
const styles = StyleSheet.create({
  item: { gap: 4, paddingVertical: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6 },
});
