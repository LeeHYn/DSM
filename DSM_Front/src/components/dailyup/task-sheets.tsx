import React, {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  AppButton,
  AppText,
  AppToggle,
  Badge,
  Divider,
  Icon,
  IconButton,
  useDailyupPalette,
} from '@/components/dailyup/primitives';
import {
  dailyupFonts,
  dailyupMotion,
  dailyupRadius,
  dailyupSpacing,
} from '@/constants/dailyup-theme';
import {
  useProduct,
  difficultyLabels,
} from '@/features/product/product-context';
import {
  utcTimestamp,
  type TaskInput,
  type Difficulty,
} from '@/features/product/product-contracts';

const DIFFICULTIES: Difficulty[] = ['LOW', 'MEDIUM', 'HIGH'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeToMinutes(value: string) {
  if (!TIME_PATTERN.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function BottomSheet({
  children,
  onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
  const palette = useDailyupPalette();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: dailyupMotion.normal,
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        duration: dailyupMotion.normal,
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: palette.overlay, opacity },
        ]}>
        <Pressable
          accessibilityLabel="시트 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
            transform: [{ translateY }],
          },
        ]}>
        <View style={[styles.handle, { backgroundColor: palette.border }]} />
        {children}
      </Animated.View>
    </View>
  );
}

function FieldLabel({ children }: PropsWithChildren) {
  return (
    <AppText style={styles.fieldLabel} variant="label">
      {children}
    </AppText>
  );
}

function FormInput({
  error,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  error?: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={styles.inputGroup}>
      <TextInput
        accessibilityLabel={placeholder}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            backgroundColor: palette.surface,
            borderColor: error ? palette.danger : palette.border,
            color: palette.text,
          },
        ]}
        value={value}
      />
      {error ? (
        <AppText color={palette.danger} variant="caption">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function ChoiceRow<T extends string>({
  onChange,
  options,
  value,
  label = (option: T) => option,
}: {
  onChange: (value: T) => void;
  options: T[];
  value: T;
  label?: (option: T) => string;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.choice,
              {
                backgroundColor: selected ? palette.lime : palette.surface,
                borderColor: selected ? palette.lime : palette.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}>
            <AppText
              color={selected ? palette.textOnLime : palette.muted}
              style={styles.choiceText}
              variant="label">
              {label(option)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function NewTaskSheet() {
  const { store, snapshot, closeNewTask, editingTask } = useProduct();
  const palette = useDailyupPalette();
  const [title, setTitle] = useState(editingTask?.title ?? '');
  const [description, setDescription] = useState(
    editingTask?.description ?? '',
  );
  const [startTime, setStartTime] = useState(editingTask?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(editingTask?.endTime ?? '10:00');
  const [startDate, setStartDate] = useState(
    editingTask?.startAt.slice(0, 10) ?? snapshot.date,
  );
  const [endDate, setEndDate] = useState(
    editingTask?.endAt.slice(0, 10) ?? snapshot.date,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    editingTask?.difficulty ?? 'MEDIUM',
  );
  const [category, setCategory] = useState(editingTask?.categoryId ?? '');
  const [notificationEnabled, setNotificationEnabled] = useState(
    editingTask?.notificationEnabled ?? false,
  );
  const [errors, setErrors] = useState<{
    endTime?: string;
    startTime?: string;
    title?: string;
    date?: string;
  }>({});

  const resetAndClose = () => {
    closeNewTask();
  };

  const submit = async () => {
    if (store.getSnapshot().mutating) return;
    const nextErrors: typeof errors = {};
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    if (!title.trim()) {
      nextErrors.title = '제목을 입력해 주세요.';
    }
    if (start === null) {
      nextErrors.startTime = '시간을 HH:MM 형식으로 입력해 주세요.';
    }
    if (end === null) {
      nextErrors.endTime = '시간을 HH:MM 형식으로 입력해 주세요.';
    } else if (startDate === endDate && start !== null && end <= start) {
      nextErrors.endTime = '종료 시간은 시작 시간보다 뒤여야 해요.';
    }

    let startAt = '';
    let endAt = '';
    try {
      startAt = utcTimestamp(startDate, startTime);
      endAt = utcTimestamp(endDate, endTime);
      if (endAt <= startAt)
        nextErrors.endTime = '종료 일시는 시작 일시보다 뒤여야 해요.';
    } catch {
      nextErrors.date = '실제 날짜 YYYY-MM-DD와 시간 HH:MM을 입력해 주세요.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const input: TaskInput = {
      ...(category ? { categoryId: category } : {}),
      description: description.trim(),
      difficulty,
      endAt,
      notificationEnabled,
      startAt,
      title: title.trim(),
    };
    const saved = editingTask
      ? await store.update(editingTask.id, input)
      : await store.create(input);
    if (saved) closeNewTask();
  };

  return (
    <BottomSheet onClose={resetAndClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetHeader}>
          <View>
            <AppText variant="sectionTitle">
              {editingTask ? '일과 수정' : '새 일과 추가'}
            </AppText>
            <AppText color={palette.muted} variant="caption">
              날짜와 시간은 UTC 기준입니다.
            </AppText>
          </View>
          <IconButton
            accessibilityLabel="새 일과 닫기"
            name="close"
            onPress={resetAndClose}
          />
        </View>
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <FormInput
            placeholder="시작 날짜 YYYY-MM-DD"
            value={startDate}
            onChangeText={setStartDate}
            error={errors.date}
          />
          <FormInput
            placeholder="종료 날짜 YYYY-MM-DD"
            value={endDate}
            onChangeText={setEndDate}
          />
          <View>
            <FieldLabel>제목</FieldLabel>
            <FormInput
              error={errors.title}
              onChangeText={setTitle}
              placeholder="일과 제목"
              value={title}
            />
          </View>
          <View>
            <FieldLabel>설명</FieldLabel>
            <FormInput
              multiline
              onChangeText={setDescription}
              placeholder="일과에 대한 설명"
              value={description}
            />
          </View>
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <FieldLabel>시작 시간</FieldLabel>
              <FormInput
                error={errors.startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                value={startTime}
              />
            </View>
            <View style={styles.timeField}>
              <FieldLabel>종료 시간</FieldLabel>
              <FormInput
                error={errors.endTime}
                onChangeText={setEndTime}
                placeholder="10:00"
                value={endTime}
              />
            </View>
          </View>
          <View>
            <FieldLabel>난이도</FieldLabel>
            <ChoiceRow
              onChange={setDifficulty}
              options={DIFFICULTIES}
              value={difficulty}
              label={(value) => difficultyLabels[value]}
            />
          </View>
          <View>
            <FieldLabel>카테고리</FieldLabel>
            <ChoiceRow
              onChange={setCategory}
              options={[
                ...(editingTask?.categoryId ? [editingTask.categoryId] : ['']),
                ...(snapshot.categories.data ?? []).map((item) => item.id),
              ].filter((id, index, all) => all.indexOf(id) === index)}
              value={category}
              label={(id) =>
                snapshot.categories.data?.find((item) => item.id === id)
                  ?.name ?? (id ? '기존 카테고리 유지' : '미분류')
              }
            />
            {snapshot.categories.error ? (
              <AppText color={palette.danger}>
                {snapshot.categories.error}
              </AppText>
            ) : null}
            {snapshot.categories.status === 'loading' ? (
              <AppText>카테고리 조회 중…</AppText>
            ) : null}
            {editingTask?.categoryId ? (
              <AppText variant="caption">
                기존 카테고리를 다른 카테고리로 변경할 수 있습니다.
              </AppText>
            ) : null}
          </View>
          <View style={[styles.toggleRow, { borderColor: palette.border }]}>
            <View style={styles.toggleCopy}>
              <AppText variant="label">시작 알림</AppText>
              <AppText color={palette.muted} variant="caption">
                시작 시각 알림 설정을 저장합니다. 실제 수신 기능은 준비
                중입니다.
              </AppText>
            </View>
            <AppToggle
              accessibilityLabel="시작 알림"
              onValueChange={setNotificationEnabled}
              value={notificationEnabled}
            />
          </View>
          {snapshot.mutationError ? (
            <AppText color={palette.danger}>{snapshot.mutationError}</AppText>
          ) : null}
          <AppButton
            disabled={snapshot.mutating}
            icon="check"
            onPress={() => {
              void submit();
            }}>
            {snapshot.mutating ? '저장 중…' : '저장'}
          </AppButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: 'calendar-clock' | 'folder-outline' | 'signal';
  label: string;
  value: string;
}) {
  const palette = useDailyupPalette();
  return (
    <View style={styles.detailRow}>
      <View
        style={[styles.detailIcon, { backgroundColor: palette.surfaceRaised }]}>
        <Icon color={palette.muted} name={icon} size={17} />
      </View>
      <View style={styles.detailCopy}>
        <AppText color={palette.muted} variant="caption">
          {label}
        </AppText>
        <AppText variant="label">{value}</AppText>
      </View>
    </View>
  );
}

function TaskDetailSheet() {
  const { closeTaskDetail, editTask, snapshot, store, selectedTask } =
    useProduct();
  const palette = useDailyupPalette();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!selectedTask) {
      setConfirmDelete(false);
    }
  }, [selectedTask]);

  const statusText = useMemo(
    () => (selectedTask?.completed ? '완료됨' : '진행 전'),
    [selectedTask?.completed],
  );

  if (!selectedTask) {
    return null;
  }

  const interactionDisabled = snapshot.mutating;

  return (
    <BottomSheet onClose={closeTaskDetail}>
      <View style={styles.sheetHeader}>
        <View style={styles.detailHeading}>
          <Badge tone={selectedTask.completed ? 'lime' : 'neutral'}>
            {statusText}
          </Badge>
          <AppText variant="sectionTitle">{selectedTask.title}</AppText>
        </View>
        <IconButton
          accessibilityLabel="일과 상세 닫기"
          name="close"
          onPress={closeTaskDetail}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.detailBody}
        showsVerticalScrollIndicator={false}>
        <View style={styles.detailRows}>
          <DetailRow
            icon="calendar-clock"
            label="시간"
            value={`${selectedTask.startAt.slice(0, 10)} ${selectedTask.startTime} - ${selectedTask.endAt.slice(0, 10)} ${selectedTask.endTime} UTC`}
          />
          <DetailRow
            icon="folder-outline"
            label="카테고리"
            value={selectedTask.category}
          />
          <DetailRow
            icon="signal"
            label="난이도"
            value={selectedTask.difficultyLabel}
          />
        </View>
        <Divider />
        <View style={styles.description}>
          <AppText color={palette.muted} variant="caption">
            설명
          </AppText>
          <AppText>
            {selectedTask.description || '등록된 설명이 없습니다.'}
          </AppText>
        </View>
        <View style={styles.detailActions}>
          {snapshot.mutationError ? (
            <AppText color={palette.danger}>{snapshot.mutationError}</AppText>
          ) : null}
          <AppButton
            disabled={interactionDisabled}
            onPress={() => editTask(selectedTask.id)}
            variant="secondary">
            수정
          </AppButton>
          <AppButton
            disabled={interactionDisabled}
            icon={selectedTask.completed ? 'undo' : 'check'}
            onPress={() => {
              void store.toggle(selectedTask.id);
            }}>
            {selectedTask.completed ? '완료 취소' : '완료 처리'}
          </AppButton>
          {confirmDelete ? (
            <View
              style={[
                styles.confirmBox,
                { borderColor: `${palette.danger}66` },
              ]}>
              <AppText style={styles.confirmText} variant="label">
                이 일과를 삭제할까요?
              </AppText>
              <View style={styles.confirmActions}>
                <AppButton
                  onPress={() => setConfirmDelete(false)}
                  style={styles.confirmButton}
                  variant="ghost">
                  취소
                </AppButton>
                <AppButton
                  disabled={interactionDisabled}
                  onPress={() => {
                    void store.remove(selectedTask.id).then((saved) => {
                      if (saved) closeTaskDetail();
                    });
                  }}
                  style={styles.confirmButton}
                  variant="danger">
                  삭제
                </AppButton>
              </View>
            </View>
          ) : (
            <AppButton
              disabled={interactionDisabled}
              icon="trash-can-outline"
              onPress={() => setConfirmDelete(true)}
              variant="danger">
              삭제
            </AppButton>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export function TaskSheets() {
  const { isNewTaskOpen, editingTask, snapshot } = useProduct();
  return (
    <>
      {isNewTaskOpen ? (
        <NewTaskSheet key={`${editingTask?.id ?? 'new'}:${snapshot.date}`} />
      ) : null}
      <TaskDetailSheet />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  choice: {
    alignItems: 'center',
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: dailyupSpacing.two,
    marginTop: dailyupSpacing.two,
  },
  choiceText: {
    fontFamily: dailyupFonts.bold,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: dailyupSpacing.two,
  },
  confirmBox: {
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    gap: dailyupSpacing.three,
    padding: dailyupSpacing.three,
  },
  confirmButton: {
    flex: 1,
    minHeight: 40,
  },
  confirmText: {
    textAlign: 'center',
  },
  description: {
    gap: dailyupSpacing.two,
  },
  detailActions: {
    gap: dailyupSpacing.three,
  },
  detailBody: {
    gap: dailyupSpacing.five,
    paddingBottom: dailyupSpacing.six,
    paddingHorizontal: dailyupSpacing.five,
  },
  detailCopy: {
    flex: 1,
    gap: 2,
  },
  detailHeading: {
    flex: 1,
    gap: dailyupSpacing.two,
  },
  detailIcon: {
    alignItems: 'center',
    borderRadius: dailyupRadius.small,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: dailyupSpacing.three,
  },
  detailRows: {
    gap: dailyupSpacing.four,
  },
  fieldLabel: {
    fontFamily: dailyupFonts.bold,
  },
  form: {
    gap: dailyupSpacing.four,
    paddingBottom: dailyupSpacing.six,
    paddingHorizontal: dailyupSpacing.five,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: dailyupRadius.round,
    height: 4,
    marginBottom: dailyupSpacing.three,
    marginTop: dailyupSpacing.two,
    width: 38,
  },
  input: {
    borderRadius: dailyupRadius.medium,
    borderWidth: 1,
    fontFamily: dailyupFonts.medium,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: dailyupSpacing.three,
    paddingVertical: dailyupSpacing.two,
  },
  inputGroup: {
    gap: dailyupSpacing.one,
    marginTop: dailyupSpacing.two,
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  sheet: {
    borderTopLeftRadius: dailyupRadius.sheet,
    borderTopRightRadius: dailyupRadius.sheet,
    borderTopWidth: 1,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: dailyupSpacing.three,
    justifyContent: 'space-between',
    paddingBottom: dailyupSpacing.four,
    paddingHorizontal: dailyupSpacing.five,
  },
  timeField: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    gap: dailyupSpacing.three,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: dailyupSpacing.four,
  },
});
