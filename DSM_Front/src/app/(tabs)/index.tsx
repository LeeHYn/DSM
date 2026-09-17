import React from 'react';
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
import { LoadingState } from '@/components/dailyup/screen-state';
import { CalendarPanel } from '@/components/dailyup/calendar-panel';
import { OfflineStatus } from '@/components/dailyup/offline-status';
import { useSession } from '@/features/auth/session-context';
import { useProduct, type TaskView } from '@/features/product/product-context';
import { utcDay } from '@/features/product/product-contracts';

function ScoreCard() {
  const { snapshot } = useProduct();
  const score = snapshot.score.data?.cappedScore ?? (
    snapshot.score.status === 'ready' ? 0 : null
  );
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
  const { openTaskDetail, rememberTaskSheetReturnFocus, snapshot, store } =
    useProduct();
  const palette = useDailyupPalette();
  const detailButtonRef = React.useRef<View>(null);
  const cancelled = task.status === 'CANCELLED';
  const disabled = snapshot.mutating || cancelled;

  return (
    <View
      style={[
        styles.taskRow,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}>
      <Pressable
        accessibilityLabel={`${task.title} ${cancelled ? '취소된 일과' : task.completed ? '완료 취소' : '완료'}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.completed, disabled }}
        disabled={disabled}
        onPress={() => { void store.toggle(task.id); }}
        style={styles.checkboxTarget}>
        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: task.completed ? `${palette.lime}A8` : 'transparent',
              borderColor: task.completed ? palette.lime : palette.muted,
            },
          ]}>
          {task.completed ? <Icon color={palette.textOnLime} name="check" size={15} /> : null}
          {cancelled ? <Icon color={palette.muted} name="minus" size={15} /> : null}
        </View>
      </Pressable>
      <Pressable
        ref={detailButtonRef}
        accessibilityLabel={`${task.title} 상세 보기`}
        accessibilityRole="button"
        onPress={() => {
          rememberTaskSheetReturnFocus(detailButtonRef);
          openTaskDetail(task.id);
        }}
        style={({ pressed }) => [styles.taskDetail, { opacity: pressed ? 0.76 : 1 }]}>
        <View style={styles.taskCopy}>
          <AppText
            color={task.completed || cancelled ? palette.muted : palette.text}
            style={[styles.taskTitle, task.completed && styles.taskCompleted]}
            variant="label">
            {task.title}
          </AppText>
          {cancelled ? <AppText color={palette.muted} variant="caption">취소됨</AppText> : null}
          <AppText color={palette.muted} variant="caption">
            {task.startTime} - {task.endTime} UTC · {task.category} · {task.difficultyLabel}
          </AppText>
        </View>
        <View
          accessibilityLabel={cancelled ? '취소 상태' : task.completed ? '완료 상태' : '미완료 상태'}
          style={[
            styles.taskStatus,
            { backgroundColor: cancelled ? palette.muted : task.completed ? palette.success : palette.danger },
          ]}
        />
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const offline = useSession().state.status === 'offline-workspace';
  const { openNewTask, rememberTaskSheetReturnFocus, snapshot, store, tasks } =
    useProduct();
  const palette = useDailyupPalette();
  const addTaskButtonRef = React.useRef<View>(null);
  const initialLoading = snapshot.tasks.data === null && (
    snapshot.tasks.status === 'idle' || snapshot.tasks.status === 'loading'
  );
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
        <OfflineStatus />
        {snapshot.sync.pendingCount > 0 || snapshot.sync.error ? <SurfaceCard>
          {snapshot.sync.pendingCount > 0 ? <>
            <AppText variant="label">동기화 대기 {snapshot.sync.pendingCount}건</AppText>
            <AppText color={palette.muted}>변경사항은 기기에 저장됐습니다. 점수와 랭킹은 서버 반영 후 갱신됩니다.</AppText>
          </> : null}
          {snapshot.sync.error ? <AppText color={palette.danger}>{snapshot.sync.error}</AppText> : null}
          {store.blockedTasks().map(blocked => <AppButton key={blocked.taskId}
            accessibilityLabel={`${blocked.title}의 미전송 변경 취소`}
            disabled={snapshot.mutating || snapshot.sync.draining} variant="ghost"
            onPress={() => Alert.alert('이 기기의 변경을 취소할까요?',
              `“${blocked.title}”의 거절된 변경과 그 뒤에 저장한 변경을 이 기기에서 취소합니다. 서버의 일과는 삭제하지 않습니다. 필요한 내용은 취소 전에 복사해 주세요.`,
              [{ text: '계속 보관', style: 'cancel' }, { text: '변경 취소', style: 'destructive',
                onPress: () => { void store.discardBlocked(blocked.taskId); } }])}>
            {blocked.title} · 미전송 변경 취소
          </AppButton>)}
          <AppButton disabled={snapshot.mutating || snapshot.sync.draining}
            onPress={() => { void store.retrySync(); }} variant="ghost">
            {snapshot.sync.draining ? '동기화 중' : '동기화 다시 시도'}
          </AppButton>
        </SurfaceCard> : null}
        {!offline ? <CalendarPanel date={snapshot.date} userId={store.userId} disabled={snapshot.mutating}
          refreshKey={snapshot.score.data} onSelect={day => { void store.setDate(day); }} /> : null}
        {initialLoading ? <LoadingState /> : <>
          <ScoreCard />
          {snapshot.summary.error ? <AppText color={palette.danger}>{snapshot.summary.error}</AppText> : null}
          {snapshot.mutationError ? <AppText color={palette.danger}>{snapshot.mutationError}</AppText> : null}
          <View style={styles.taskSection}>
            <AppText variant="sectionTitle">선택일 일과</AppText>
            {snapshot.tasks.status === 'loading' ? <AppText>일과 조회 중…</AppText> : null}
            {snapshot.tasks.error ? <AppText color={palette.danger}>{snapshot.tasks.error}</AppText> : null}
            {snapshot.tasks.data !== null && tasks.length === 0 ? <AppText>등록된 일과가 없습니다.</AppText> : null}
            <View style={styles.taskList}>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </View>
          </View>
        </>}
      </ScrollView>

      <Pressable
        ref={addTaskButtonRef}
        accessibilityLabel="새 일과 추가"
        accessibilityRole="button"
        disabled={snapshot.mutating}
        onPress={() => {
          rememberTaskSheetReturnFocus(addTaskButtonRef);
          openNewTask();
        }}
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
  checkboxTarget: {
    alignItems: 'center',
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    width: 44,
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
  taskDetail: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: dailyupSpacing.three,
    minHeight: 44,
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
