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
  Badge,
  Icon,
  ScreenHeader,
  SurfaceCard,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  dailyupFonts,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import { useProduct, type TaskView } from '@/features/product/product-context';
import { utcDay } from '@/features/product/product-contracts';

function ScoreCard() {
  const { snapshot } = useProduct();
  const score = snapshot.score.status === 'ready' ? snapshot.score.data?.cappedScore ?? 0 : null;
  const palette = useDailyupPalette();
  const progress = `${Math.min(100, ((score ?? 0) / 900) * 100)}%` as `${number}%`;
  const cumulative = snapshot.summary.data?.totalScore;

  return (
    <SurfaceCard style={styles.scoreCard}>
      <View style={styles.scoreTop}>
        <View>
          <AppText color={palette.muted} variant="caption">
            선택일 점수
          </AppText>
          <View style={styles.scoreValueRow}>
            <AppText color={palette.lime} variant="metric">
              {score ?? '—'}
            </AppText>
            <AppText color={palette.muted} style={styles.scoreMax} variant="label">
              /
            </AppText>
          </View>
        </View>
        <View style={styles.rankSummary}>
          <Badge tone="gold">{snapshot.summary.data?.tier ?? '—'} 티어</Badge>
          <AppText color={palette.muted} variant="caption">
            {snapshot.score.status === 'loading' ? '점수 조회 중' : snapshot.score.error ?? '서버 집계 기준'}
          </AppText>
        </View>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
        <View style={[styles.progressFill, { backgroundColor: palette.lime, width: progress }]} />
      </View>
      <View style={styles.scoreBottom}>
        <AppText color={palette.muted} variant="caption">
          900
        </AppText>
        <AppText color={palette.muted} variant="caption">
          누적 점수 {cumulative?.toLocaleString('ko-KR') ?? '—'}점
        </AppText>
      </View>
    </SurfaceCard>
  );
}

function TaskRow({ task }: { task: TaskView }) {
  const { openTaskDetail, snapshot, store } = useProduct();
  const palette = useDailyupPalette();
  const disabled = snapshot.mutating;

  return (
    <Pressable
      accessibilityLabel={`${task.title} 상세 보기`}
      accessibilityRole="button"
      onPress={() => openTaskDetail(task.id)}
      style={({ pressed }) => [
        styles.taskRow,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: pressed ? 0.76 : 1,
        },
      ]}>
      <Pressable
        accessibilityLabel={`${task.title} ${task.completed ? '완료 취소' : '완료'}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.completed, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => { void store.toggle(task.id); }}
        style={[
          styles.checkbox,
          {
            backgroundColor: task.completed ? `${palette.lime}A8` : 'transparent',
            borderColor: task.completed ? palette.lime : palette.muted,
          },
        ]}>
        {task.completed ? <Icon color={palette.textOnLime} name="check" size={15} /> : null}
      </Pressable>
      <View style={styles.taskCopy}>
        <AppText
          color={task.completed ? palette.muted : palette.text}
          style={[styles.taskTitle, task.completed && styles.taskCompleted]}
          variant="label">
          {task.title}
        </AppText>
        <AppText color={palette.muted} variant="caption">
          {task.startTime} - {task.endTime} UTC · {task.category} · {task.difficultyLabel}
        </AppText>
      </View>
      <View
        accessibilityLabel={task.completed ? '완료 상태' : '미완료 상태'}
        style={[
          styles.taskStatus,
          { backgroundColor: task.completed ? palette.success : palette.danger },
        ]}
      />
    </Pressable>
  );
}

export default function HomeScreen() {
  const { openNewTask, snapshot, store, tasks } = useProduct();
  const palette = useDailyupPalette();
  const refresh = () => { void store.refresh(); };
  const moveDate = (days: number) => {
    const date = new Date(`${snapshot.date}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    void store.setDate(utcDay(date));
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          action={
            <Pressable
              accessibilityLabel="새로고침"
              accessibilityRole="button"
              disabled={snapshot.mutating || snapshot.tasks.status === 'loading'}
              onPress={refresh}
              style={({ pressed }) => [
                styles.refresh,
                {
                  backgroundColor: palette.background,
                  borderColor: palette.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <AppText style={styles.refreshText} variant="caption">
                새로고{'\n'}침
              </AppText>
            </Pressable>
          }
          eyebrow={`${snapshot.date} · UTC 기준`}
          title="안녕하세요"
        />
        <View style={styles.dateNavigation}>
          <AppButton disabled={snapshot.mutating} onPress={() => moveDate(-1)} variant="ghost">이전 날짜</AppButton>
          <AppButton disabled={snapshot.mutating} onPress={() => { void store.setDate(utcDay()); }} variant="ghost">오늘</AppButton>
          <AppButton disabled={snapshot.mutating} onPress={() => moveDate(1)} variant="ghost">다음 날짜</AppButton>
        </View>
          <ScoreCard />
          {snapshot.summary.error ? <AppText color={palette.danger}>{snapshot.summary.error}</AppText> : null}
          {snapshot.mutationError ? <AppText color={palette.danger}>{snapshot.mutationError}</AppText> : null}
          <View style={styles.taskSection}>
            <AppText variant="sectionTitle">선택일 일과</AppText>
            {snapshot.tasks.status === 'loading' ? <AppText>일과 조회 중…</AppText> : null}
            {snapshot.tasks.error ? <AppText color={palette.danger}>{snapshot.tasks.error}</AppText> : null}
            {snapshot.tasks.status === 'ready' && tasks.length === 0 ? <AppText>등록된 일과가 없습니다.</AppText> : null}
            <View style={styles.taskList}>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </View>
          </View>
      </ScrollView>

      <Pressable
        accessibilityLabel="새 일과 추가"
        accessibilityRole="button"
        disabled={snapshot.mutating}
        onPress={openNewTask}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: palette.lime,
            opacity: pressed ? 0.74 : snapshot.mutating ? 0.42 : 1,
          },
        ]}>
        <Icon color={palette.textOnLime} name="plus" size={27} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dateNavigation: { flexDirection: 'row', justifyContent: 'space-between' },
  checkbox: {
    alignItems: 'center',
    borderRadius: dailyupRadius.round,
    borderWidth: 1,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  content: {
    paddingBottom: 90,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  fab: {
    alignItems: 'center',
    borderRadius: dailyupRadius.round,
    bottom: 18,
    elevation: 8,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    width: 52,
  },
  progressFill: {
    borderRadius: dailyupRadius.round,
    height: '100%',
    minWidth: 9,
  },
  progressTrack: {
    borderRadius: dailyupRadius.round,
    height: 8,
    overflow: 'hidden',
  },
  rankSummary: {
    alignItems: 'flex-end',
    gap: dailyupSpacing.two,
  },
  refresh: {
    alignItems: 'center',
    borderRadius: dailyupRadius.small,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    marginTop: -8,
    width: 64,
  },
  refreshText: {
    fontFamily: dailyupFonts.bold,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  scoreBottom: {
    alignItems: 'flex-start',
    gap: 2,
    transform: [{ translateY: -14 }],
  },
  scoreCard: {
    gap: dailyupSpacing.two,
    height: 128,
    paddingHorizontal: dailyupSpacing.five,
    paddingTop: dailyupSpacing.five,
  },
  scoreMax: {
    marginBottom: 3,
  },
  scoreTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreValueRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
  },
  screen: {
    flex: 1,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
  },
  taskCopy: {
    flex: 1,
    gap: 3,
  },
  taskList: {
    gap: dailyupSpacing.two,
  },
  taskRow: {
    alignItems: 'center',
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: dailyupSpacing.three,
    minHeight: 58,
    paddingHorizontal: dailyupSpacing.three,
    paddingVertical: dailyupSpacing.two,
  },
  taskSection: {
    gap: dailyupSpacing.one,
    marginTop: 14,
  },
  taskStatus: {
    borderRadius: dailyupRadius.round,
    height: 8,
    width: 8,
  },
  taskTitle: {
    fontFamily: dailyupFonts.bold,
    fontSize: 13,
  },
});
