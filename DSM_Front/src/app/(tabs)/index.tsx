import React, { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  Badge,
  Icon,
  ScreenHeader,
  SurfaceCard,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  HomeState,
  StateDeveloperBar,
} from '@/components/dailyup/screen-state';
import {
  dailyupFonts,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import { usePrototype } from '@/features/prototype/prototype-context';
import {
  HOME_DATE,
  type PrototypeTask,
} from '@/features/prototype/prototype-data';

const DIFFICULTY_SCORE: Record<PrototypeTask['difficulty'], number> = {
  낮음: 10,
  보통: 20,
  높음: 30,
};

function ScoreCard({ score }: { score: number }) {
  const palette = useDailyupPalette();
  const progress = `${Math.min(100, (score / 900) * 100)}%` as `${number}%`;
  const cumulative = 12450 + score - 100;

  return (
    <SurfaceCard style={styles.scoreCard}>
      <View style={styles.scoreTop}>
        <View>
          <AppText color={palette.muted} variant="caption">
            오늘 점수
          </AppText>
          <View style={styles.scoreValueRow}>
            <AppText color={palette.lime} variant="metric">
              {score}
            </AppText>
            <AppText color={palette.muted} style={styles.scoreMax} variant="label">
              /
            </AppText>
          </View>
        </View>
        <View style={styles.rankSummary}>
          <Badge tone="gold">GOLD 티어</Badge>
          <AppText color={palette.muted} variant="caption">
            오늘 12위 · 상위 8%
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
          누적 점수 {cumulative.toLocaleString('ko-KR')}점
        </AppText>
      </View>
    </SurfaceCard>
  );
}

function TaskRow({ task }: { task: PrototypeTask }) {
  const { openTaskDetail, screenState, toggleTask } = usePrototype();
  const palette = useDailyupPalette();
  const disabled = screenState === 'offline';

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
        onPress={() => toggleTask(task.id)}
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
          {task.startTime} - {task.endTime} · {task.category} · {task.difficulty}
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
  const {
    openNewTask,
    screenState,
    setScreenState,
    showToast,
    tasks,
  } = usePrototype();
  const palette = useDailyupPalette();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    },
    [],
  );

  const score = useMemo(
    () =>
      90 +
      tasks.reduce(
        (total, task) => total + (task.completed ? DIFFICULTY_SCORE[task.difficulty] : 0),
        0,
      ),
    [tasks],
  );

  const refresh = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    setScreenState('loading');
    refreshTimerRef.current = setTimeout(() => {
      setScreenState('normal');
      showToast('오늘의 일과를 새로고침했어요.');
      refreshTimerRef.current = null;
    }, 620);
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
              disabled={screenState === 'loading'}
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
          eyebrow={HOME_DATE}
          title="안녕하세요, 지민님"
        />

        <HomeState onAdd={openNewTask}>
          <ScoreCard score={score} />
          <View style={styles.taskSection}>
            <AppText variant="sectionTitle">오늘의 일과</AppText>
            <View style={styles.taskList}>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </View>
          </View>
        </HomeState>
        <StateDeveloperBar />
      </ScrollView>

      <Pressable
        accessibilityLabel="새 일과 추가"
        accessibilityRole="button"
        onPress={openNewTask}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: palette.lime,
            opacity: pressed ? 0.74 : screenState === 'offline' ? 0.42 : 1,
          },
        ]}>
        <Icon color={palette.textOnLime} name="plus" size={27} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
