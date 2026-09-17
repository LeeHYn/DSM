import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, AppText, SurfaceCard, useDailyupPalette } from './primitives';
import { useAuthenticatedClient } from '@/features/auth/session-context';
import { calendarRange, createAnalyticsApi, shiftDay, type CalendarDay } from '@/features/product/analytics-api';
import { utcDay } from '@/features/product/product-contracts';

type Props = { date: string; userId: string; onSelect: (date: string) => void; disabled?: boolean; refreshKey?: unknown };
export function CalendarPanel({ date, userId, onSelect, disabled = false, refreshKey }: Props) {
  const client = useAuthenticatedClient();
  const api = useMemo(() => createAnalyticsApi(client, userId), [client, userId]);
  const palette = useDailyupPalette();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ scope: string; days: CalendarDay[] | null; error: boolean }>({ scope: '', days: null, error: false });
  const { from, to } = calendarRange(date, mode);
  const scope = `${userId}:${from}:${to}`;
  useEffect(() => {
    let active = true;
    setResult({ scope, days: null, error: false });
    void api.calendar(from, to).then(
      days => { if (active) setResult({ scope, days, error: false }); },
      () => { if (active) setResult({ scope, days: null, error: true }); },
    );
    return () => { active = false; };
  }, [api, from, to, scope, retry, refreshKey]);
  const current = result.scope === scope ? result : null;
  const days = current?.days;
  const offset = new Date(`${from}T00:00:00Z`).getUTCDay();
  return <SurfaceCard>
    <View style={styles.controls}>
      <AppText variant="sectionTitle">달력 · UTC</AppText>
      <AppButton variant="ghost" onPress={() => setMode('week')}>주간</AppButton>
      <AppButton variant="ghost" onPress={() => setMode('month')}>월간</AppButton>
    </View>
    <View style={styles.controls}>
      <AppButton accessibilityLabel={mode === 'week' ? '이전 주' : '이전 달'} disabled={disabled} variant="ghost" onPress={() => onSelect(shiftDay(from, mode === 'week' ? -7 : -1))}>이전</AppButton>
      <AppText>{mode === 'month' ? from.slice(0, 7) : `${from.slice(5)} ~ ${to.slice(5)}`}</AppText>
      <AppButton accessibilityLabel={mode === 'week' ? '다음 주' : '다음 달'} disabled={disabled} variant="ghost" onPress={() => onSelect(shiftDay(to, 1))}>다음</AppButton>
    </View>
    {!current || (!days && !current.error) ? <AppText>달력 조회 중…</AppText> : null}
    {current?.error ? <View><AppText>달력을 불러오지 못했습니다.</AppText><AppButton onPress={() => setRetry(value => value + 1)}>달력 다시 시도</AppButton></View> : null}
    {days ? <ScrollView horizontal contentContainerStyle={styles.scroll}>
      <View style={styles.grid}>
        {['일', '월', '화', '수', '목', '금', '토'].map(label => <View key={label} style={styles.weekday}><AppText color={palette.muted}>{label}</AppText></View>)}
        {Array.from({ length: offset }, (_, index) => <View key={`blank-${index}`} style={styles.cell} />)}
        {days.map(day => <Pressable key={day.date} accessibilityRole="button"
          accessibilityLabel={`${day.date}, 등록 ${day.registeredTaskCount}개, 달성률 ${day.achievementRate}%`}
          accessibilityState={{ selected: day.date === date, disabled }} disabled={disabled}
          onPress={() => onSelect(day.date)}
          style={[styles.cell, { backgroundColor: day.date === date ? palette.surfaceRaised : 'transparent', borderColor: day.date === date ? palette.lime : 'transparent' }]}>
          <AppText>{Number(day.date.slice(8))}</AppText>
          <AppText variant="caption" color={day.registeredTaskCount ? palette.lime : palette.muted}>{day.registeredTaskCount ? `${day.achievementRate}%` : '—'}</AppText>
        </Pressable>)}
      </View>
    </ScrollView> : null}
    <AppButton disabled={disabled} variant="ghost" onPress={() => onSelect(utcDay())}>달력 오늘</AppButton>
  </SurfaceCard>;
}
const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  scroll: { flexGrow: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', minWidth: 308 },
  weekday: { width: '14.285714%', alignItems: 'center', paddingVertical: 6 },
  cell: { width: '14.285714%', minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8 },
});
